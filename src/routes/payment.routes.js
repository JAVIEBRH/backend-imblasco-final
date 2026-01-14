/**
 * PAYMENT ROUTES
 * Rutas para gestión de pagos
 */

import { Router } from 'express'
import * as paymentService from '../services/payment.service.js'

export const paymentRouter = Router()

/**
 * POST /api/payment
 * Registrar pago
 */
paymentRouter.post('/', async (req, res, next) => {
  try {
    const payment = await paymentService.registerPayment({
      ...req.body,
      createdBy: req.user?.userId || 'system'
    })

    res.json({
      success: true,
      message: 'Pago registrado exitosamente',
      payment
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/payment/:paymentId
 * Obtener pago por ID
 */
paymentRouter.get('/:paymentId', async (req, res, next) => {
  try {
    const payment = await paymentService.getPayment(parseInt(req.params.paymentId))
    
    if (!payment) {
      return res.status(404).json({
        error: true,
        message: 'Pago no encontrado'
      })
    }

    res.json(payment)
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/payment
 * Obtener pagos con filtros
 */
paymentRouter.get('/', async (req, res, next) => {
  try {
    const filters = {
      invoiceId: req.query.invoiceId,
      clientId: req.query.clientId,
      status: req.query.status,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo
    }

    const payments = await paymentService.getPayments(filters)
    res.json({
      payments,
      count: payments.length
    })
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/payment/:paymentId/confirm
 * Confirmar pago
 */
paymentRouter.post('/:paymentId/confirm', async (req, res, next) => {
  try {
    const payment = await paymentService.confirmPayment(parseInt(req.params.paymentId))

    res.json({
      success: true,
      message: 'Pago confirmado exitosamente',
      payment
    })
  } catch (error) {
    next(error)
  }
})

export default paymentRouter


