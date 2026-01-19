/**
 * ORDER INVOICING SERVICE (EXTENSIÓN) - MongoDB
 * Servicios adicionales para facturación
 * 
 * Este módulo EXTENDEN order.service.js sin modificarlo.
 * Agrega funcionalidades de facturación de forma desacoplada.
 */

import { Order } from '../models/index.js'
import * as clientService from './client.service.js'
import { erpAdapter } from '../erp/index.js'
import mongoose from '../config/database.js'

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
 * @param {string} orderId - ID del pedido (puede ser _id o order_id)
 * @param {string} userId - ID del usuario
 * @param {Array} items - Items del pedido
 * @returns {Promise<Object>} Pedido actualizado
 */
export async function enrichOrderWithInvoicingData(orderId, userId, items) {
  try {
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
    
    // 4. Buscar pedido (puede ser por _id o order_id)
    let order = null
    if (mongoose.Types.ObjectId.isValid(orderId)) {
      order = await Order.findByIdAndUpdate(
        orderId,
        {
          $set: {
            net_amount: netAmount,
            iva_amount: ivaAmount,
            total_amount: totalAmount,
            client_snapshot: clientSnapshot,
            items_snapshot: itemsSnapshot,
            updatedAt: new Date()
          }
        },
        { new: true }
      )
    } else {
      order = await Order.findOneAndUpdate(
        { order_id: orderId },
        {
          $set: {
            net_amount: netAmount,
            iva_amount: ivaAmount,
            total_amount: totalAmount,
            client_snapshot: clientSnapshot,
            items_snapshot: itemsSnapshot,
            updatedAt: new Date()
          }
        },
        { new: true }
      )
    }
    
    if (!order) {
      throw new Error(`Pedido ${orderId} no encontrado`)
    }
    
    console.log(`[INVOICING] Pedido ${orderId} enriquecido con datos de facturación`)
    console.log(`  Neto: $${netAmount.toLocaleString()}, IVA: $${ivaAmount.toLocaleString()}, Total: $${totalAmount.toLocaleString()}`)
    
    return order.toObject()
    
  } catch (error) {
    console.error('[INVOICING] Error enriqueciendo pedido:', error)
    throw error
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
 * @param {string|number} orderId - ID del pedido
 * @returns {Promise<Object>} Resultado del envío
 */
export async function sendOrderToErp(orderId) {
  try {
    // 1. Buscar pedido
    let order = null
    if (mongoose.Types.ObjectId.isValid(orderId)) {
      order = await Order.findById(orderId).lean()
    } else {
      order = await Order.findOne({ order_id: orderId.toString() }).lean()
    }
    
    if (!order) {
      throw new Error(`Pedido ${orderId} no encontrado`)
    }
    
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
      const orderIdToUpdate = order._id || orderId
      await Order.findByIdAndUpdate(
        orderIdToUpdate,
        {
          $set: {
            status: 'error',
            updatedAt: new Date()
          }
        }
      )
      
      throw new Error(`Error enviando al ERP: ${erpResult.message || 'Error desconocido'}`)
    }
    
    // 5. Actualizar pedido con referencia ERP y nuevo estado
    const orderIdToUpdate = order._id || orderId
    await Order.findByIdAndUpdate(
      orderIdToUpdate,
      {
        $set: {
          status: 'sent_to_erp',
          erp_reference: erpResult.erpReference,
          updatedAt: new Date()
        }
      }
    )
    
    console.log(`[ERP] Pedido ${orderId} enviado al ERP. Referencia: ${erpResult.erpReference}`)
    
    return {
      success: true,
      orderId: order._id?.toString() || orderId,
      erpReference: erpResult.erpReference,
      status: 'sent_to_erp'
    }
    
  } catch (error) {
    console.error('[ERP] Error enviando pedido al ERP:', error)
    throw error
  }
}

/**
 * Construir documento facturable para el ERP
 * @param {Object} order - Pedido de MongoDB
 * @returns {Object} Documento facturable
 */
function buildInvoiceDocument(order) {
  const items = order.items || []
  
  return {
    orderId: order.order_id || `PED-${order._id?.toString().slice(-6)}`,
    dbId: order._id?.toString() || order.id,
    userId: order.user_id,
    client: order.client_snapshot || {},
    items: items.map(item => ({
      sku: item.codigo,
      nombre: item.nombre,
      cantidad: item.cantidad,
      precioUnitario: parseFloat(item.precio || 0),
      subtotal: parseFloat(item.subtotal || 0)
    })),
    amounts: {
      netAmount: parseFloat(order.net_amount || order.total_amount || 0),
      ivaAmount: parseFloat(order.iva_amount || 0),
      totalAmount: parseFloat(order.total_amount || order.total_amount || 0)
    },
    createdAt: order.createdAt,
    itemsSnapshot: order.items_snapshot || null
  }
}

/**
 * Marcar pedido como facturado (llamado por webhook del ERP)
 * @param {string|number} orderId - ID del pedido
 * @param {string} erpReference - Referencia del ERP (opcional, para validar)
 * @returns {Promise<Object>} Pedido actualizado
 */
export async function markOrderAsInvoiced(orderId, erpReference = null) {
  try {
    // Buscar pedido
    let order = null
    if (mongoose.Types.ObjectId.isValid(orderId)) {
      order = await Order.findById(orderId).lean()
    } else {
      order = await Order.findOne({ order_id: orderId.toString() }).lean()
    }
    
    if (!order) {
      throw new Error(`Pedido ${orderId} no encontrado`)
    }
    
    if (order.status !== 'sent_to_erp') {
      throw new Error(`Pedido debe estar en estado 'sent_to_erp'. Estado actual: ${order.status}`)
    }
    
    if (erpReference && order.erp_reference !== erpReference) {
      throw new Error(`Referencia ERP no coincide`)
    }
    
    // Actualizar estado
    const orderIdToUpdate = order._id || orderId
    const updatedOrder = await Order.findByIdAndUpdate(
      orderIdToUpdate,
      {
        $set: {
          status: 'invoiced',
          invoiced_at: new Date(),
          updatedAt: new Date()
        }
      },
      { new: true }
    ).lean()
    
    console.log(`[INVOICING] Pedido ${orderId} marcado como facturado`)
    
    // Hook: Notificar cambio de estado (email, webhook, etc.)
    await notifyOrderInvoiced(updatedOrder)
    
    return updatedOrder
    
  } catch (error) {
    console.error('[INVOICING] Error marcando pedido como facturado:', error)
    throw error
  }
}

/**
 * Hook: Notificar que un pedido fue facturado
 * @param {Object} order 
 */
async function notifyOrderInvoiced(order) {
  // TODO: Implementar notificación real (email, webhook, etc.)
  console.log(`[HOOK] Pedido ${order._id || order.id} facturado. Hook de notificación llamado.`)
  
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
