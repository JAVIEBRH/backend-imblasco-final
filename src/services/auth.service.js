/**
 * AUTH SERVICE (MongoDB)
 * Servicio de autenticación simple para usuarios B2B
 * 
 * NOTA: Para producción, implementar bcrypt real y JWT
 */

import { User } from '../models/index.js'

/**
 * Autenticar usuario
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise<Object|null>} Usuario autenticado o null
 */
export async function authenticateUser(email, password) {
  try {
    // Buscar usuario por email
    const user = await User.findOne({ 
      email: email.toLowerCase().trim(), 
      activo: true 
    }).lean()

    if (!user) {
      return null
    }

    // Validar contraseña (simplificado para demo)
    // En producción usar bcrypt.compare()
    // Por ahora aceptamos cualquier contraseña si el email existe
    // Para demo, password debe ser "demo123"
    const validPassword = password === 'demo123' || password === 'test123' || password === 'b2b123'

    if (!validPassword) {
      return null
    }

    // Retornar datos del usuario (sin password)
    return {
      id: user._id.toString(),
      userId: user.user_id,
      email: user.email,
      nombre: user.nombre,
      razonSocial: user.razon_social,
      rut: user.rut,
      giro: user.giro,
      direccion: user.direccion,
      comuna: user.comuna,
      emailFacturacion: user.email_facturacion
    }
  } catch (error) {
    console.error('[AUTH] Error authenticating user:', error)
    return null
  }
}

/**
 * Obtener usuario por userId
 * @param {string} userId 
 * @returns {Promise<Object|null>}
 */
export async function getUserByUserId(userId) {
  try {
    const user = await User.findOne({ 
      user_id: userId, 
      activo: true 
    }).lean()

    if (!user) {
      return null
    }

    return {
      id: user._id.toString(),
      userId: user.user_id,
      email: user.email,
      nombre: user.nombre,
      razonSocial: user.razon_social,
      rut: user.rut,
      giro: user.giro,
      direccion: user.direccion,
      comuna: user.comuna,
      emailFacturacion: user.email_facturacion
    }
  } catch (error) {
    console.error('[AUTH] Error getting user by userId:', error)
    return null
  }
}

/**
 * Obtener todos los usuarios (admin)
 * @returns {Promise<Array>}
 */
export async function getAllUsers() {
  try {
    const users = await User.find({ activo: true })
      .sort({ createdAt: -1 })
      .select('_id user_id email nombre razon_social rut activo createdAt')
      .lean()

    return users.map(user => ({
      id: user._id.toString(),
      user_id: user.user_id,
      email: user.email,
      nombre: user.nombre,
      razon_social: user.razon_social,
      rut: user.rut,
      activo: user.activo,
      created_at: user.createdAt
    }))
  } catch (error) {
    console.error('[AUTH] Error getting all users:', error)
    return []
  }
}

export default {
  authenticateUser,
  getUserByUserId,
  getAllUsers
}
