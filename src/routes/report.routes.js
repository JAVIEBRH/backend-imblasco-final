/**
 * REPORT ROUTES
 * Rutas para reportes y analytics
 */

import { Router } from 'express'
import * as reportService from '../services/report.service.js'

export const reportRouter = Router()

/**
 * GET /api/report/dashboard
 * Estadísticas del dashboard
 */
reportRouter.get('/dashboard', async (req, res, next) => {
  try {
    const dateFrom = req.query.dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const dateTo = req.query.dateTo || new Date().toISOString()

    const stats = await reportService.getDashboardStats(dateFrom, dateTo)
    res.json(stats)
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/report/sales
 * Reporte de ventas
 */
reportRouter.get('/sales', async (req, res, next) => {
  try {
    const dateFrom = req.query.dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const dateTo = req.query.dateTo || new Date().toISOString()

    const report = await reportService.getSalesReport(dateFrom, dateTo)
    res.json({
      dateFrom,
      dateTo,
      data: report
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/report/top-products
 * Productos más vendidos
 */
reportRouter.get('/top-products', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10
    const dateFrom = req.query.dateFrom
    const dateTo = req.query.dateTo

    const products = await reportService.getTopProducts(limit, dateFrom, dateTo)
    res.json({
      products,
      count: products.length
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/report/clients
 * Reporte de clientes
 */
reportRouter.get('/clients', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10
    const clients = await reportService.getClientsReport(limit)
    res.json({
      clients,
      count: clients.length
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/report/inventory
 * Reporte de inventario
 */
reportRouter.get('/inventory', async (req, res, next) => {
  try {
    const report = await reportService.getInventoryReport()
    res.json({
      products: report,
      totalProducts: report.length,
      totalValue: report.reduce((sum, p) => sum + p.valorizacion, 0)
    })
  } catch (error) {
    next(error)
  }
})

export default reportRouter


