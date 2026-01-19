/**
 * ORDER SERVICE (MongoDB)
 * Gestión de pedidos usando MongoDB
 * 
 * Características:
 * - Generación de pedidos estructurados
 * - Persistencia en MongoDB (colección orders)
 * - Mock de envío de email (configurable)
 */

import { Order } from '../models/index.js'
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
  try {
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
        codigo: item.codigo,
        nombre: item.nombre || product.name,
        cantidad: item.cantidad,
        precio: unitPrice,
        subtotal: subtotal
      })
    }

    // Generar order_id único
    const orderId = generateOrderId()

    // Crear pedido en MongoDB
    const order = await Order.create({
      order_id: orderId,
      user_id: userId,
      items: orderItems,
      total_amount: totalAmount,
      status: 'confirmed'
    })

    // Reservar stock (disminuir) para cada item
    for (const item of orderItems) {
      await stockService.reserveStock(item.codigo, item.cantidad)
    }

    // EXTENSIÓN: Enriquecer pedido con datos de facturación
    try {
      await invoicingService.enrichOrderWithInvoicingData(
        order._id.toString(),
        userId,
        orderItems.map(item => ({
          codigo: item.codigo,
          nombre: item.nombre,
          cantidad: item.cantidad,
          precioUnitario: item.precio,
          subtotal: item.subtotal
        }))
      )
    } catch (invoicingError) {
      // Log error pero no fallar la creación del pedido
      console.warn('[ORDER] Error enriqueciendo pedido con datos de facturación:', invoicingError.message)
    }

    // Formatear respuesta
    const formattedOrder = {
      orderId: order.order_id,
      id: order._id.toString(),
      userId: order.user_id,
      status: order.status,
      total: parseFloat(order.total_amount),
      totalItems: orderItems.length,
      totalUnidades: orderItems.reduce((sum, item) => sum + item.cantidad, 0),
      items: orderItems.map(item => ({
        codigo: item.codigo,
        nombre: item.nombre,
        cantidad: item.cantidad,
        precioUnitario: item.precio,
        subtotal: item.subtotal
      })),
      fecha: order.createdAt,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt
    }

    // Enviar email (mock)
    sendOrderEmail(formattedOrder)

    console.log(`[ORDER] Pedido creado: ${orderId} (DB ID: ${order._id})`)

    return formattedOrder

  } catch (error) {
    console.error('[ORDER] Error creating order:', error)
    throw error
  }
}

/**
 * Obtener pedido por ID
 * @param {string|number} orderId - ID del pedido (puede ser _id de MongoDB o order_id)
 * @returns {Promise<Object|null>}
 */
export async function getOrder(orderId) {
  try {
    // Intentar buscar por _id primero (ObjectId de MongoDB)
    let order = null
    
    // Si es un número, buscar por order_id con formato PED-XXXXXX
    if (typeof orderId === 'number' || /^\d+$/.test(orderId.toString())) {
      // Buscar por _id si parece un ObjectId
      try {
        const mongoose = (await import('../config/database.js')).default
        if (mongoose.Types.ObjectId.isValid(orderId)) {
          order = await Order.findById(orderId)
        }
      } catch (e) {
        // Ignorar error
      }
    }
    
    // Si no se encontró, buscar por order_id
    if (!order) {
      order = await Order.findOne({ order_id: orderId.toString() })
    }
    
    // Si aún no se encontró y parece un número, buscar por _id numérico
    if (!order && /^\d+$/.test(orderId.toString())) {
      const mongoose = (await import('../config/database.js')).default
      if (mongoose.Types.ObjectId.isValid(orderId)) {
        order = await Order.findById(orderId)
      }
    }

    if (!order) return null

    return formatOrderResponse(order)
  } catch (error) {
    console.error('[ORDER] Error getting order:', error)
    return null
  }
}

/**
 * Obtener pedidos de un usuario
 * @param {string} userId 
 * @returns {Promise<Array>}
 */
export async function getOrdersByUser(userId) {
  try {
    const orders = await Order.find({ user_id: userId })
      .sort({ createdAt: -1 })
      .lean()
    
    return orders.map(formatOrderResponse)
  } catch (error) {
    console.error('[ORDER] Error getting orders by user:', error)
    return []
  }
}

/**
 * Obtener todos los pedidos
 * @returns {Promise<Array>}
 */
export async function getAllOrders() {
  try {
    const orders = await Order.find()
      .sort({ createdAt: -1 })
      .lean()
    
    return orders.map(formatOrderResponse)
  } catch (error) {
    console.error('[ORDER] Error getting all orders:', error)
    return []
  }
}

/**
 * Actualizar estado del pedido
 * @param {string|number} orderId 
 * @param {string} status - 'draft' | 'confirmed' | 'rejected' | 'cancelled' | 'sent_to_erp' | 'invoiced' | 'error'
 * @returns {Promise<Object|null>}
 */
export async function updateOrderStatus(orderId, status) {
  try {
    // EXTENSIÓN: Validar transición de estado usando el servicio de facturación
    const currentOrder = await getOrder(orderId)
    if (currentOrder && !invoicingService.validateStatusTransition(currentOrder.status, status)) {
      throw new Error(`Transición de estado inválida: ${currentOrder.status} → ${status}`)
    }

    // Buscar pedido
    let order = null
    
    // Intentar por _id
    const mongoose = (await import('../config/database.js')).default
    if (mongoose.Types.ObjectId.isValid(orderId)) {
      order = await Order.findByIdAndUpdate(
        orderId,
        { status, updatedAt: new Date() },
        { new: true }
      )
    }
    
    // Si no se encontró, buscar por order_id
    if (!order) {
      order = await Order.findOneAndUpdate(
        { order_id: orderId.toString() },
        { status, updatedAt: new Date() },
        { new: true }
      )
    }

    if (!order) return null

    return formatOrderResponse(order)
  } catch (error) {
    console.error('[ORDER] Error updating order status:', error)
    throw error
  }
}

/**
 * Formatear respuesta de pedido
 * @param {Object} order - Documento de MongoDB
 * @returns {Object} Pedido formateado
 */
function formatOrderResponse(order) {
  const orderId = order.order_id || `PED-${order._id.toString().slice(-6)}`
  const items = order.items || []

  const response = {
    orderId,
    id: order._id.toString(),
    userId: order.user_id,
    status: order.status,
    total: parseFloat(order.total_amount || 0),
    totalItems: items.length,
    totalUnidades: items.reduce((sum, item) => sum + (item.cantidad || 0), 0),
    items: items.map(item => ({
      codigo: item.codigo,
      nombre: item.nombre,
      cantidad: item.cantidad,
      precioUnitario: parseFloat(item.precio || 0),
      subtotal: parseFloat(item.subtotal || 0)
    })),
    fecha: order.createdAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt
  }

  // Agregar campos adicionales si existen
  if (order.erp_reference) {
    response.erpReference = order.erp_reference
  }
  if (order.invoice_number) {
    response.invoiceNumber = order.invoice_number
  }
  if (order.notes) {
    response.notes = order.notes
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
