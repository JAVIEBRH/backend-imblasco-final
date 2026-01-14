/**
 * CART ROUTES
 * Endpoints para gestión de carrito
 */

import { Router } from 'express'
import * as cartService from '../services/cart.service.js'
import { validateUserId, validateSKU, validateQuantity } from '../middleware/validation.js'

export const cartRouter = Router()

/**
 * GET /api/cart/:userId
 * Obtener carrito del usuario
 */
cartRouter.get('/:userId', validateUserId, async (req, res, next) => {
  try {
    const { userId } = req.params
    const cart = await cartService.getCartSummary(userId)
    res.json(cart)
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/cart/:userId/add
 * Agregar item al carrito
 * 
 * Body: { sku, nombre, cantidad }
 */
cartRouter.post('/:userId/add', validateUserId, async (req, res, next) => {
  try {
    const { userId } = req.params
    const { sku, nombre, cantidad } = req.body

    if (!sku || typeof sku !== 'string' || sku.trim().length === 0) {
      return res.status(400).json({
        error: true,
        message: 'sku debe ser un string no vacío'
      })
    }

    if (!cantidad) {
      return res.status(400).json({
        error: true,
        message: 'cantidad es requerida'
      })
    }

    const cantidadNum = parseInt(cantidad, 10)
    if (isNaN(cantidadNum) || cantidadNum <= 0) {
      return res.status(400).json({
        error: true,
        message: 'cantidad debe ser un número mayor a 0'
      })
    }

    const sanitizedSKU = sku.trim().toUpperCase().replace(/[^A-Z0-9\-]/g, '')
    if (sanitizedSKU.length === 0) {
      return res.status(400).json({
        error: true,
        message: 'sku contiene caracteres inválidos'
      })
    }

    await cartService.addToCart(userId, sanitizedSKU, nombre || sanitizedSKU, cantidadNum)
    const cart = await cartService.getCartSummary(userId)
    res.json({
      success: true,
      message: 'Producto agregado',
      cart
    })
  } catch (error) {
    next(error)
  }
})

/**
 * PUT /api/cart/:userId/update
 * Actualizar cantidad de item
 * 
 * Body: { sku, cantidad }
 */
cartRouter.put('/:userId/update', validateUserId, async (req, res, next) => {
  try {
    const { userId } = req.params
    const { sku, cantidad } = req.body

    if (!sku || typeof sku !== 'string' || sku.trim().length === 0) {
      return res.status(400).json({
        error: true,
        message: 'sku debe ser un string no vacío'
      })
    }

    if (cantidad === undefined || cantidad === null) {
      return res.status(400).json({
        error: true,
        message: 'cantidad es requerida'
      })
    }

    const cantidadNum = parseInt(cantidad, 10)
    if (isNaN(cantidadNum) || cantidadNum < 0) {
      return res.status(400).json({
        error: true,
        message: 'cantidad debe ser un número mayor o igual a 0'
      })
    }

    const sanitizedSKU = sku.trim().toUpperCase().replace(/[^A-Z0-9\-]/g, '')
    if (sanitizedSKU.length === 0) {
      return res.status(400).json({
        error: true,
        message: 'sku contiene caracteres inválidos'
      })
    }

    const result = await cartService.updateCartItem(userId, sanitizedSKU, cantidadNum)
    
    if (!result) {
      return res.status(404).json({
        error: true,
        message: `Producto ${sku} no encontrado en el carrito`
      })
    }

    const cart = await cartService.getCartSummary(userId)
    res.json({
      success: true,
      message: 'Carrito actualizado',
      cart
    })
  } catch (error) {
    next(error)
  }
})

/**
 * DELETE /api/cart/:userId/remove/:sku
 * Eliminar item del carrito
 */
cartRouter.delete('/:userId/remove/:sku', validateUserId, async (req, res, next) => {
  try {
    const { userId, sku } = req.params
    
    const sanitizedSKU = sku.trim().toUpperCase().replace(/[^A-Z0-9\-]/g, '')
    if (sanitizedSKU.length === 0) {
      return res.status(400).json({
        error: true,
        message: 'sku contiene caracteres inválidos'
      })
    }
    
    const removed = await cartService.removeFromCart(userId, sanitizedSKU)

    if (!removed) {
      return res.status(404).json({
        error: true,
        message: `Producto ${sku} no encontrado en el carrito`
      })
    }

    const cart = await cartService.getCartSummary(userId)
    res.json({
      success: true,
      message: 'Producto eliminado',
      cart
    })
  } catch (error) {
    next(error)
  }
})

/**
 * DELETE /api/cart/:userId/clear
 * Vaciar carrito
 */
cartRouter.delete('/:userId/clear', validateUserId, async (req, res, next) => {
  try {
    const { userId } = req.params
    await cartService.clearCart(userId)
    const cart = await cartService.getCartSummary(userId)

    res.json({
      success: true,
      message: 'Carrito vaciado',
      cart
    })
  } catch (error) {
    next(error)
  }
})

export default cartRouter

