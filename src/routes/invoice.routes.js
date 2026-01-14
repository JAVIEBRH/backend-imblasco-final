/**
 * INVOICE ROUTES
 * Rutas para gestión de facturación
 */

import { Router } from 'express'
import * as invoiceService from '../services/invoice.service.js'

export const invoiceRouter = Router()

/**
 * POST /api/invoice/create-from-order/:orderId
 * Crear factura desde un pedido
 */
invoiceRouter.post('/create-from-order/:orderId', async (req, res, next) => {
  try {
    const { orderId } = req.params
    const { invoiceType, dueDate } = req.body

    const invoice = await invoiceService.createInvoiceFromOrder(
      parseInt(orderId),
      invoiceType || 'factura',
      { dueDate, createdBy: req.user?.userId || 'system' }
    )

    res.json({
      success: true,
      message: 'Factura creada exitosamente',
      invoice
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/invoice/:invoiceId
 * Obtener factura por ID
 */
invoiceRouter.get('/:invoiceId', async (req, res, next) => {
  try {
    const invoice = await invoiceService.getInvoice(parseInt(req.params.invoiceId))
    
    if (!invoice) {
      return res.status(404).json({
        error: true,
        message: 'Factura no encontrada'
      })
    }

    res.json(invoice)
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/invoice
 * Obtener todas las facturas con filtros
 */
invoiceRouter.get('/', async (req, res, next) => {
  try {
    const filters = {
      status: req.query.status,
      clientId: req.query.clientId,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo
    }

    const invoices = await invoiceService.getAllInvoices(filters)
    res.json({
      invoices,
      count: invoices.length
    })
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/invoice/:invoiceId/cancel
 * Cancelar factura
 */
invoiceRouter.post('/:invoiceId/cancel', async (req, res, next) => {
  try {
    const { invoiceId } = req.params
    const { reason } = req.body

    const invoice = await invoiceService.cancelInvoice(parseInt(invoiceId), reason)

    res.json({
      success: true,
      message: 'Factura cancelada exitosamente',
      invoice
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/invoice/:invoiceId/pdf
 * Generar PDF de factura (retorna datos para generar PDF)
 */
invoiceRouter.get('/:invoiceId/pdf', async (req, res, next) => {
  try {
    const pdfData = await invoiceService.generateInvoicePDF(parseInt(req.params.invoiceId))
    res.json(pdfData)
  } catch (error) {
    next(error)
  }
})

export default invoiceRouter


