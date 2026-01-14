/**
 * CLIENT ROUTES
 * Rutas para gestión de clientes
 */

import { Router } from 'express'
import * as clientService from '../services/client.service.js'

export const clientRouter = Router()

/**
 * GET /api/client
 * Obtener todos los clientes
 */
clientRouter.get('/', async (req, res, next) => {
  try {
    const filters = {
      search: req.query.search
    }

    const clients = await clientService.getAllClients(filters)
    res.json({
      clients,
      count: clients.length
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/client/:userId
 * Obtener cliente por ID
 */
clientRouter.get('/:userId', async (req, res, next) => {
  try {
    const client = await clientService.getClientById(req.params.userId)
    
    if (!client) {
      return res.status(404).json({
        error: true,
        message: 'Cliente no encontrado'
      })
    }

    res.json(client)
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/client
 * Crear cliente
 */
clientRouter.post('/', async (req, res, next) => {
  try {
    const client = await clientService.createClient(req.body)

    res.json({
      success: true,
      message: 'Cliente creado exitosamente',
      client
    })
  } catch (error) {
    next(error)
  }
})

/**
 * PUT /api/client/:userId
 * Actualizar cliente
 */
clientRouter.put('/:userId', async (req, res, next) => {
  try {
    const client = await clientService.updateClient(req.params.userId, req.body)

    res.json({
      success: true,
      message: 'Cliente actualizado exitosamente',
      client
    })
  } catch (error) {
    next(error)
  }
})

/**
 * DELETE /api/client/:userId
 * Desactivar cliente
 */
clientRouter.delete('/:userId', async (req, res, next) => {
  try {
    const client = await clientService.deactivateClient(req.params.userId)

    res.json({
      success: true,
      message: 'Cliente desactivado exitosamente',
      client
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/client/:userId/history
 * Obtener historial de compras del cliente
 */
clientRouter.get('/:userId/history', async (req, res, next) => {
  try {
    const history = await clientService.getClientPurchaseHistory(req.params.userId)
    res.json({
      userId: req.params.userId,
      orders: history,
      count: history.length
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/client/:userId/accounts-receivable
 * Obtener cuentas por cobrar del cliente
 */
clientRouter.get('/:userId/accounts-receivable', async (req, res, next) => {
  try {
    const accounts = await clientService.getClientAccountsReceivable(req.params.userId)
    res.json({
      userId: req.params.userId,
      accounts,
      totalBalance: accounts.reduce((sum, acc) => sum + acc.balance, 0),
      count: accounts.length
    })
  } catch (error) {
    next(error)
  }
})

export default clientRouter


