/**
 * AUTH ROUTES
 * Endpoints de autenticación
 */

import { Router } from 'express'
import * as authService from '../services/auth.service.js'

export const authRouter = Router()

/**
 * POST /api/auth/login
 * Autenticar usuario
 * 
 * Body: { email, password }
 */
authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body

    if (!email || typeof email !== 'string' || email.trim().length === 0) {
      return res.status(400).json({
        error: true,
        message: 'email es requerido y debe ser un string válido'
      })
    }

    if (!password || typeof password !== 'string' || password.length === 0) {
      return res.status(400).json({
        error: true,
        message: 'password es requerido'
      })
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({
        error: true,
        message: 'email tiene formato inválido'
      })
    }

    const user = await authService.authenticateUser(email, password)

    if (!user) {
      return res.status(401).json({
        error: true,
        message: 'Credenciales inválidas'
      })
    }

    res.json({
      success: true,
      message: 'Autenticación exitosa',
      user
    })

  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/auth/user/:userId
 * Obtener datos de usuario por userId
 */
authRouter.get('/user/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params
    const user = await authService.getUserByUserId(userId)

    if (!user) {
      return res.status(404).json({
        error: true,
        message: 'Usuario no encontrado'
      })
    }

    res.json(user)
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/auth/users
 * Obtener todos los usuarios (admin)
 */
authRouter.get('/users', async (req, res, next) => {
  try {
    const users = await authService.getAllUsers()
    res.json({
      users,
      count: users.length
    })
  } catch (error) {
    next(error)
  }
})

export default authRouter


