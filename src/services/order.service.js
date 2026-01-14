/**
 * ORDER SERVICE (PostgreSQL)
 * Gestión de pedidos usando PostgreSQL
 * 
 * Características:
 * - Generación de pedidos estructurados
 * - Persistencia en PostgreSQL (tablas orders, order_items)
 * - Mock de envío de email (configurable)
 */

import { query, getClient } from '../config/database.js'
import * as stockService from './stock.service.js'
import * as invoicingService from './order-invoicing.service.js'

// Configuración de email (mock)
const emailConfig = {
  enabled: true,
  destinatario: process.env.ORDER_EMAIL || 'ventas@imblasco.cl',
  copia: process.env.ORDER_EMAIL_CC || '',
  asunto_template: 'Nuevo Pedido #{orderId} - ImBlasco B2B'
}

/**
 * Generar ID de pedido único
 * Formato: PED-YYYYMMDD-XXXX
 */
function generateOrderId() {
  const date = new Date()
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '')
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `PED-${dateStr}-${random}`
}

/**
 * Crear nuevo pedido
 * @param {string} userId - ID del usuario
 * @param {Array} items - Items del carrito [{codigo, nombre, cantidad}]
 * @returns {Promise<Object>} Pedido creado
 */
export async function createOrder(userId, items) {
  const client = await getClient()
  
  try {
    await client.query('BEGIN')

    // Validar items y obtener precios
    const orderItems = []
    let totalAmount = 0

    for (const item of items) {
      const product = await stockService.getProductBySKU(item.codigo)
      if (!product) {
        throw new Error(`Producto ${item.codigo} no encontrado`)
      }

      // Validar stock
      if (product.stock < item.cantidad) {
        throw new Error(`Stock insuficiente para ${item.codigo}. Disponible: ${product.stock}`)
      }

      const unitPrice = product.price || 0
      const subtotal = unitPrice * item.cantidad
      totalAmount += subtotal

      orderItems.push({
        sku: item.codigo,
        productName: item.nombre || product.name,
        quantity: item.cantidad,
        unitPrice,
        subtotal
      })
    }

    // Crear pedido
    const orderResult = await client.query(
      `INSERT INTO orders (user_id, status, total)
       VALUES ($1, 'confirmed', $2)
       RETURNING id, user_id, status, total, created_at, updated_at`,
      [userId, totalAmount]
    )

    const order = orderResult.rows[0]

    // Insertar items del pedido
    for (const item of orderItems) {
      await client.query(
        `INSERT INTO order_items (order_id, sku, product_name, quantity, unit_price, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [order.id, item.sku, item.productName, item.quantity, item.unitPrice, item.subtotal]
      )

      // Reservar stock (disminuir)
      await stockService.reserveStock(item.sku, item.quantity)
    }

    await client.query('COMMIT')

    // EXTENSIÓN: Enriquecer pedido con datos de facturación
    // Esto se hace DESPUÉS del commit para no afectar la creación del pedido
    try {
      await invoicingService.enrichOrderWithInvoicingData(
        order.id,
        userId,
        orderItems.map(item => ({
          codigo: item.sku,
          nombre: item.productName,
          cantidad: item.quantity,
          precioUnitario: item.unitPrice,
          subtotal: item.subtotal
        }))
      )
    } catch (invoicingError) {
      // Log error pero no fallar la creación del pedido
      console.warn('[ORDER] Error enriqueciendo pedido con datos de facturación:', invoicingError.message)
    }

    // Formatear respuesta
    const orderId = `PED-${order.id.toString().padStart(6, '0')}`
    const formattedOrder = {
      orderId,
      id: order.id,
      userId: order.user_id,
      status: order.status,
      total: parseFloat(order.total),
      totalItems: orderItems.length,
      totalUnidades: orderItems.reduce((sum, item) => sum + item.quantity, 0),
      items: orderItems.map(item => ({
        codigo: item.sku,
        nombre: item.productName,
        cantidad: item.quantity,
        precioUnitario: item.unitPrice,
        subtotal: item.subtotal
      })),
      fecha: order.created_at,
      createdAt: order.created_at,
      updatedAt: order.updated_at
    }

    // Enviar email (mock)
    sendOrderEmail(formattedOrder)

    console.log(`[ORDER] Pedido creado: ${orderId} (DB ID: ${order.id})`)

    return formattedOrder

  } catch (error) {
    await client.query('ROLLBACK')
    console.error('[ORDER] Error creating order:', error)
    throw error
  } finally {
    client.release()
  }
}

/**
 * Obtener pedido por ID
 * @param {number} orderId - ID numérico del pedido
 * @returns {Promise<Object|null>}
 */
export async function getOrder(orderId) {
  const result = await query(
    `SELECT o.*, 
            COALESCE(json_agg(oi.* ORDER BY oi.id) FILTER (WHERE oi.id IS NOT NULL), '[]') as items
     FROM orders o
     LEFT JOIN order_items oi ON o.id = oi.order_id
     WHERE o.id = $1
     GROUP BY o.id`,
    [orderId]
  )

  if (result.rows.length === 0) return null

  const row = result.rows[0]
  return formatOrderResponse(row)
}

/**
 * Obtener pedidos de un usuario
 * @param {string} userId 
 * @returns {Promise<Array>}
 */
export async function getOrdersByUser(userId) {
  const result = await query(
    `SELECT o.*, 
            COALESCE(json_agg(oi.* ORDER BY oi.id) FILTER (WHERE oi.id IS NOT NULL), '[]') as items
     FROM orders o
     LEFT JOIN order_items oi ON o.id = oi.order_id
     WHERE o.user_id = $1
     GROUP BY o.id
     ORDER BY o.created_at DESC`,
    [userId]
  )

  return result.rows.map(formatOrderResponse)
}

/**
 * Obtener todos los pedidos
 * @returns {Promise<Array>}
 */
export async function getAllOrders() {
  const result = await query(
    `SELECT o.*, 
            COALESCE(json_agg(oi.* ORDER BY oi.id) FILTER (WHERE oi.id IS NOT NULL), '[]') as items
     FROM orders o
     LEFT JOIN order_items oi ON o.id = oi.order_id
     GROUP BY o.id
     ORDER BY o.created_at DESC`
  )

  return result.rows.map(formatOrderResponse)
}

/**
 * Actualizar estado del pedido
 * @param {number} orderId 
 * @param {string} status - 'draft' | 'confirmed' | 'rejected' | 'cancelled' | 'sent_to_erp' | 'invoiced' | 'error'
 * @returns {Promise<Object|null>}
 */
export async function updateOrderStatus(orderId, status) {
  // EXTENSIÓN: Validar transición de estado usando el servicio de facturación
  const currentOrder = await getOrder(orderId)
  if (currentOrder && !invoicingService.validateStatusTransition(currentOrder.status, status)) {
    throw new Error(`Transición de estado inválida: ${currentOrder.status} → ${status}`)
  }

  const result = await query(
    `UPDATE orders 
     SET status = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
     RETURNING *`,
    [status, orderId]
  )

  if (result.rows.length === 0) return null

  return formatOrderResponse(result.rows[0])
}

/**
 * Formatear respuesta de pedido
 * @param {Object} row - Fila de BD
 * @returns {Object} Pedido formateado
 */
function formatOrderResponse(row) {
  const orderId = `PED-${row.id.toString().padStart(6, '0')}`
  const items = Array.isArray(row.items) ? row.items : (row.items ? [row.items] : [])

  // EXTENSIÓN: Incluir datos de facturación si existen
  const response = {
    orderId,
    id: row.id,
    userId: row.user_id,
    status: row.status,
    total: parseFloat(row.total || 0),
    totalItems: items.length,
    totalUnidades: items.reduce((sum, item) => sum + (item.quantity || 0), 0),
    items: items.map(item => ({
      codigo: item.sku,
      nombre: item.product_name,
      cantidad: item.quantity,
      precioUnitario: parseFloat(item.unit_price || 0),
      subtotal: parseFloat(item.subtotal || 0)
    })),
    fecha: row.created_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }

  // Agregar campos de facturación si existen
  if (row.net_amount !== null && row.net_amount !== undefined) {
    response.netAmount = parseFloat(row.net_amount)
  }
  if (row.iva_amount !== null && row.iva_amount !== undefined) {
    response.ivaAmount = parseFloat(row.iva_amount)
  }
  if (row.total_amount !== null && row.total_amount !== undefined) {
    response.totalAmount = parseFloat(row.total_amount)
  }
  if (row.client_snapshot) {
    response.clientSnapshot = typeof row.client_snapshot === 'string' 
      ? JSON.parse(row.client_snapshot) 
      : row.client_snapshot
  }
  if (row.erp_reference) {
    response.erpReference = row.erp_reference
  }
  if (row.invoiced_at) {
    response.invoicedAt = row.invoiced_at
  }

  return response
}

/**
 * Enviar email de confirmación (MOCK)
 * @param {Object} order 
 */
function sendOrderEmail(order) {
  if (!emailConfig.enabled) {
    console.log('[EMAIL] Envío de email deshabilitado')
    return
  }

  const emailContent = generateEmailContent(order)

  console.log('\n' + '═'.repeat(60))
  console.log('📧 [EMAIL MOCK] - SIMULACIÓN DE ENVÍO')
  console.log('═'.repeat(60))
  console.log(`Para: ${emailConfig.destinatario}`)
  if (emailConfig.copia) {
    console.log(`CC: ${emailConfig.copia}`)
  }
  console.log(`Asunto: ${emailConfig.asunto_template.replace('{orderId}', order.orderId)}`)
  console.log('─'.repeat(60))
  console.log(emailContent)
  console.log('═'.repeat(60) + '\n')
}

/**
 * Generar contenido del email
 * @param {Object} order 
 * @returns {string}
 */
function generateEmailContent(order) {
  let content = `
╔══════════════════════════════════════════════════════════╗
║            NUEVO PEDIDO - IMBLASCO B2B                   ║
╠══════════════════════════════════════════════════════════╣
║  Número de Pedido: ${order.orderId.padEnd(37)}║
║  Fecha: ${new Date(order.fecha).toLocaleString('es-CL').padEnd(47)}║
║  Cliente ID: ${order.userId.padEnd(43)}║
╠══════════════════════════════════════════════════════════╣
║  DETALLE DEL PEDIDO                                      ║
╠══════════════════════════════════════════════════════════╣
`

  for (const item of order.items) {
    content += `║  • ${item.codigo.padEnd(15)} ${item.cantidad.toLocaleString().padStart(10)} unidades   ║\n`
    content += `║    ${(item.nombre || '').substring(0, 50).padEnd(52)}║\n`
  }

  content += `╠══════════════════════════════════════════════════════════╣
║  TOTAL: ${order.totalItems} producto(s) - ${order.totalUnidades.toLocaleString()} unidades${' '.repeat(20 - order.totalUnidades.toLocaleString().length)}║
║  Monto Total: $${order.total.toLocaleString('es-CL', { minimumFractionDigits: 2 })}${' '.repeat(30 - order.total.toLocaleString('es-CL', { minimumFractionDigits: 2 }).length)}║
╠══════════════════════════════════════════════════════════╣
║  Estado: ${order.status.toUpperCase().padEnd(47)}║
╚══════════════════════════════════════════════════════════╝

Este pedido fue generado automáticamente por el sistema B2B de ImBlasco.
Para consultas: ventas@imblasco.cl | 225443327
`

  return content
}

/**
 * Configurar email destino
 * @param {Object} config 
 */
export function configureEmail(config) {
  if (config.destinatario) emailConfig.destinatario = config.destinatario
  if (config.copia) emailConfig.copia = config.copia
  if (typeof config.enabled === 'boolean') emailConfig.enabled = config.enabled
  return emailConfig
}

/**
 * Obtener configuración actual de email
 */
export function getEmailConfig() {
  return { ...emailConfig }
}

export default {
  createOrder,
  getOrder,
  getOrdersByUser,
  getAllOrders,
  updateOrderStatus,
  configureEmail,
  getEmailConfig
}
