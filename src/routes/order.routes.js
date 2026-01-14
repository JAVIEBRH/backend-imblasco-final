/**
 * ORDER ROUTES
 * Endpoints para gestión de pedidos
 */

import { Router } from 'express'
import * as orderService from '../services/order.service.js'
import * as cartService from '../services/cart.service.js'
import * as invoicingService from '../services/order-invoicing.service.js'
import { validateUserId, validateOrderStatus } from '../middleware/validation.js'

export const orderRouter = Router()

/**
 * POST /api/order/confirm
 * Confirmar pedido desde el carrito
 * 
 * Body: { userId }
 */
orderRouter.post('/confirm', async (req, res, next) => {
  try {
    const { userId } = req.body

    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      return res.status(400).json({
        error: true,
        message: 'userId debe ser un string no vacío'
      })
    }

    const cart = await cartService.getCart(userId)
    
    if (!cart.items || Object.keys(cart.items).length === 0) {
      return res.status(400).json({
        error: true,
        message: 'El carrito está vacío'
      })
    }

    // Obtener items para el pedido
    const items = await cartService.getItemsForOrder(userId)

    // Crear pedido
    const order = await orderService.createOrder(userId, items)

    // Limpiar carrito
    await cartService.clearCart(userId)

    res.json({
      success: true,
      message: 'Pedido confirmado exitosamente',
      order
    })

  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/order/:orderId
 * Obtener pedido por ID (numérico de BD)
 */
orderRouter.get('/:orderId', async (req, res, next) => {
  try {
    const { orderId } = req.params
    const orderIdNum = parseInt(orderId, 10)
    
    if (isNaN(orderIdNum)) {
      return res.status(400).json({
        error: true,
        message: 'Order ID debe ser un número'
      })
    }

    const order = await orderService.getOrder(orderIdNum)

    if (!order) {
      return res.status(404).json({
        error: true,
        message: `Pedido ${orderId} no encontrado`
      })
    }

    res.json(order)
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/order/user/:userId
 * Obtener pedidos de un usuario
 */
orderRouter.get('/user/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params
    const orders = await orderService.getOrdersByUser(userId)

    res.json({
      userId,
      orders,
      count: orders.length
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/order
 * Obtener todos los pedidos (admin)
 */
orderRouter.get('/', async (req, res, next) => {
  try {
    const orders = await orderService.getAllOrders()
    res.json({
      orders,
      count: orders.length
    })
  } catch (error) {
    next(error)
  }
})

/**
 * PATCH /api/order/:orderId/status
 * Actualizar estado del pedido
 * 
 * Body: { status } o { estado }
 */
orderRouter.patch('/:orderId/status', async (req, res, next) => {
  try {
    const { orderId } = req.params
    const status = req.body.status || req.body.estado

    if (!status || typeof status !== 'string') {
      return res.status(400).json({
        error: true,
        message: 'status es requerido y debe ser un string'
      })
    }

    const validStatuses = [
      'draft', 'confirmed', 'sent_to_erp', 'invoiced', 
      'error', 'cancelled', 'rejected'
    ]
    
    if (!validStatuses.includes(status.toLowerCase())) {
      return res.status(400).json({
        error: true,
        message: `status inválido. Válidos: ${validStatuses.join(', ')}`
      })
    }

    const orderIdNum = parseInt(orderId, 10)
    if (isNaN(orderIdNum)) {
      return res.status(400).json({
        error: true,
        message: 'Order ID debe ser un número'
      })
    }

    const order = await orderService.updateOrderStatus(orderIdNum, status)

    if (!order) {
      return res.status(404).json({
        error: true,
        message: `Pedido ${orderId} no encontrado`
      })
    }

    res.json({
      success: true,
      message: 'Estado actualizado',
      order
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/order/config/email
 * Obtener configuración de email
 */
orderRouter.get('/config/email', (req, res) => {
  const config = orderService.getEmailConfig()
  res.json(config)
})

/**
 * PUT /api/order/config/email
 * Actualizar configuración de email
 * 
 * Body: { destinatario, copia, enabled }
 */
orderRouter.put('/config/email', (req, res) => {
  const { destinatario, copia, enabled } = req.body
  const config = orderService.configureEmail({ destinatario, copia, enabled })

  res.json({
    success: true,
    message: 'Configuración actualizada',
    config
  })
})

/**
 * POST /api/order/:orderId/send-to-erp
 * Enviar pedido al ERP para facturación
 * 
 * NUEVO ENDPOINT - No modifica endpoints existentes
 */
orderRouter.post('/:orderId/send-to-erp', async (req, res, next) => {
  try {
    const { orderId } = req.params
    const orderIdNum = parseInt(orderId, 10)
    
    if (isNaN(orderIdNum)) {
      return res.status(400).json({
        error: true,
        message: 'Order ID debe ser un número'
      })
    }

    // Verificar que el pedido existe
    const order = await orderService.getOrder(orderIdNum)
    if (!order) {
      return res.status(404).json({
        error: true,
        message: `Pedido ${orderId} no encontrado`
      })
    }

    // Enviar al ERP
    const result = await invoicingService.sendOrderToErp(orderIdNum)

    res.json({
      success: true,
      message: 'Pedido enviado al ERP exitosamente',
      ...result
    })

  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/order/:orderId/mark-invoiced
 * Marcar pedido como facturado (llamado por webhook del ERP)
 * 
 * Body: { erpReference? } (opcional, para validar)
 */
orderRouter.post('/:orderId/mark-invoiced', async (req, res, next) => {
  try {
    const { orderId } = req.params
    const { erpReference } = req.body
    const orderIdNum = parseInt(orderId, 10)
    
    if (isNaN(orderIdNum)) {
      return res.status(400).json({
        error: true,
        message: 'Order ID debe ser un número'
      })
    }

    const order = await invoicingService.markOrderAsInvoiced(orderIdNum, erpReference)

    res.json({
      success: true,
      message: 'Pedido marcado como facturado',
      order
    })

  } catch (error) {
    next(error)
  }
})

export default orderRouter

