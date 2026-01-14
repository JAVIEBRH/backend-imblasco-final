/**
 * ORDER INVOICING SERVICE (EXTENSIÓN)
 * Servicios adicionales para facturación
 * 
 * Este módulo EXTENDEN order.service.js sin modificarlo.
 * Agrega funcionalidades de facturación de forma desacoplada.
 */

import { query, getClient } from '../config/database.js'
import * as clientService from './client.service.js'
import { erpAdapter } from '../erp/index.js'

// IVA en Chile
const IVA_RATE = 0.19

/**
 * Calcular montos de facturación
 * @param {number} netAmount - Monto neto
 * @returns {Object} { netAmount, ivaAmount, totalAmount }
 */
export function calculateInvoiceAmounts(netAmount) {
  const ivaAmount = Math.round(netAmount * IVA_RATE * 100) / 100
  const totalAmount = netAmount + ivaAmount
  
  return {
    netAmount: Math.round(netAmount * 100) / 100,
    ivaAmount: Math.round(ivaAmount * 100) / 100,
    totalAmount: Math.round(totalAmount * 100) / 100
  }
}

/**
 * Actualizar pedido con datos de facturación
 * Se llama DESPUÉS de crear el pedido para agregar datos de facturación
 * @param {number} orderId - ID numérico del pedido
 * @param {string} userId - ID del usuario
 * @param {Array} items - Items del pedido
 * @returns {Promise<Object>} Pedido actualizado
 */
export async function enrichOrderWithInvoicingData(orderId, userId, items) {
  const client = await getClient()
  
  try {
    await client.query('BEGIN')
    
    // 1. Obtener snapshot del cliente
    const clientSnapshot = await clientService.createClientSnapshot(userId)
    
    // 2. Crear snapshot de items
    const itemsSnapshot = items.map(item => ({
      codigo: item.codigo,
      nombre: item.nombre || item.productName,
      cantidad: item.cantidad || item.quantity,
      precioUnitario: item.precioUnitario || item.unitPrice || 0,
      subtotal: item.subtotal || (item.precioUnitario || item.unitPrice || 0) * (item.cantidad || item.quantity)
    }))
    
    // 3. Calcular montos
    const netAmount = itemsSnapshot.reduce((sum, item) => sum + item.subtotal, 0)
    const { ivaAmount, totalAmount } = calculateInvoiceAmounts(netAmount)
    
    // 4. Actualizar pedido con datos de facturación
    const result = await client.query(
      `UPDATE orders 
       SET net_amount = $1,
           iva_amount = $2,
           total_amount = $3,
           client_snapshot = $4,
           items_snapshot = $5,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [
        netAmount,
        ivaAmount,
        totalAmount,
        JSON.stringify(clientSnapshot),
        JSON.stringify(itemsSnapshot),
        orderId
      ]
    )
    
    if (result.rows.length === 0) {
      throw new Error(`Pedido ${orderId} no encontrado`)
    }
    
    await client.query('COMMIT')
    
    console.log(`[INVOICING] Pedido ${orderId} enriquecido con datos de facturación`)
    console.log(`  Neto: $${netAmount.toLocaleString()}, IVA: $${ivaAmount.toLocaleString()}, Total: $${totalAmount.toLocaleString()}`)
    
    return result.rows[0]
    
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('[INVOICING] Error enriqueciendo pedido:', error)
    throw error
  } finally {
    client.release()
  }
}

/**
 * Validar transición de estado
 * @param {string} currentStatus - Estado actual
 * @param {string} newStatus - Nuevo estado
 * @returns {boolean} Si la transición es válida
 */
export function validateStatusTransition(currentStatus, newStatus) {
  const validTransitions = {
    'draft': ['confirmed', 'cancelled'],
    'confirmed': ['sent_to_erp', 'cancelled', 'rejected'],
    'sent_to_erp': ['invoiced', 'error'],
    'invoiced': [], // Estado final
    'error': ['sent_to_erp'], // Puede reintentar
    'cancelled': [], // Estado final
    'rejected': [] // Estado final
  }
  
  const allowed = validTransitions[currentStatus] || []
  return allowed.includes(newStatus)
}

/**
 * Enviar pedido al ERP
 * @param {number} orderId - ID numérico del pedido
 * @returns {Promise<Object>} Resultado del envío
 */
export async function sendOrderToErp(orderId) {
  const client = await getClient()
  
  try {
    await client.query('BEGIN')
    
    // 1. Obtener pedido completo
    const orderResult = await client.query(
      `SELECT o.*, 
              COALESCE(json_agg(oi.* ORDER BY oi.id) FILTER (WHERE oi.id IS NOT NULL), '[]') as items
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE o.id = $1
       GROUP BY o.id`,
      [orderId]
    )
    
    if (orderResult.rows.length === 0) {
      throw new Error(`Pedido ${orderId} no encontrado`)
    }
    
    const order = orderResult.rows[0]
    
    // 2. Validar estado
    if (order.status !== 'confirmed') {
      throw new Error(`Pedido debe estar en estado 'confirmed'. Estado actual: ${order.status}`)
    }
    
    // 3. Construir documento facturable
    const invoiceDocument = buildInvoiceDocument(order)
    
    // 4. Enviar al ERP usando el adapter
    const erpResult = await erpAdapter.sendInvoice(invoiceDocument)
    
    if (!erpResult.success) {
      // Si falla, cambiar a error
      await client.query(
        `UPDATE orders 
         SET status = 'error', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [orderId]
      )
      await client.query('COMMIT')
      
      throw new Error(`Error enviando al ERP: ${erpResult.message || 'Error desconocido'}`)
    }
    
    // 5. Actualizar pedido con referencia ERP y nuevo estado
    await client.query(
      `UPDATE orders 
       SET status = 'sent_to_erp',
           erp_reference = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [erpResult.erpReference, orderId]
    )
    
    await client.query('COMMIT')
    
    console.log(`[ERP] Pedido ${orderId} enviado al ERP. Referencia: ${erpResult.erpReference}`)
    
    return {
      success: true,
      orderId,
      erpReference: erpResult.erpReference,
      status: 'sent_to_erp'
    }
    
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('[ERP] Error enviando pedido al ERP:', error)
    throw error
  } finally {
    client.release()
  }
}

/**
 * Construir documento facturable para el ERP
 * @param {Object} order - Pedido de BD
 * @returns {Object} Documento facturable
 */
function buildInvoiceDocument(order) {
  const items = Array.isArray(order.items) ? order.items : (order.items ? [order.items] : [])
  
  return {
    orderId: `PED-${order.id.toString().padStart(6, '0')}`,
    dbId: order.id,
    userId: order.user_id,
    client: order.client_snapshot || {},
    items: items.map(item => ({
      sku: item.sku,
      nombre: item.product_name,
      cantidad: item.quantity,
      precioUnitario: parseFloat(item.unit_price || 0),
      subtotal: parseFloat(item.subtotal || 0)
    })),
    amounts: {
      netAmount: parseFloat(order.net_amount || order.total || 0),
      ivaAmount: parseFloat(order.iva_amount || 0),
      totalAmount: parseFloat(order.total_amount || order.total || 0)
    },
    createdAt: order.created_at,
    itemsSnapshot: order.items_snapshot || null
  }
}

/**
 * Marcar pedido como facturado (llamado por webhook del ERP)
 * @param {number} orderId - ID numérico del pedido
 * @param {string} erpReference - Referencia del ERP (opcional, para validar)
 * @returns {Promise<Object>} Pedido actualizado
 */
export async function markOrderAsInvoiced(orderId, erpReference = null) {
  const client = await getClient()
  
  try {
    await client.query('BEGIN')
    
    // Validar que el pedido existe y está en estado correcto
    const orderResult = await client.query(
      `SELECT * FROM orders WHERE id = $1`,
      [orderId]
    )
    
    if (orderResult.rows.length === 0) {
      throw new Error(`Pedido ${orderId} no encontrado`)
    }
    
    const order = orderResult.rows[0]
    
    if (order.status !== 'sent_to_erp') {
      throw new Error(`Pedido debe estar en estado 'sent_to_erp'. Estado actual: ${order.status}`)
    }
    
    if (erpReference && order.erp_reference !== erpReference) {
      throw new Error(`Referencia ERP no coincide`)
    }
    
    // Actualizar estado
    const result = await client.query(
      `UPDATE orders 
       SET status = 'invoiced',
           invoiced_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [orderId]
    )
    
    await client.query('COMMIT')
    
    console.log(`[INVOICING] Pedido ${orderId} marcado como facturado`)
    
    // Hook: Notificar cambio de estado (email, webhook, etc.)
    await notifyOrderInvoiced(result.rows[0])
    
    return result.rows[0]
    
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('[INVOICING] Error marcando pedido como facturado:', error)
    throw error
  } finally {
    client.release()
  }
}

/**
 * Hook: Notificar que un pedido fue facturado
 * @param {Object} order 
 */
async function notifyOrderInvoiced(order) {
  // TODO: Implementar notificación real (email, webhook, etc.)
  console.log(`[HOOK] Pedido ${order.id} facturado. Hook de notificación llamado.`)
  
  // Por ahora solo log
  // En producción: llamar a EmailService, WebhookService, etc.
}

export default {
  calculateInvoiceAmounts,
  enrichOrderWithInvoicingData,
  validateStatusTransition,
  sendOrderToErp,
  markOrderAsInvoiced
}


