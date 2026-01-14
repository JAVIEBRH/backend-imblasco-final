/**
 * AUTH SERVICE
 * Servicio de autenticación simple para usuarios B2B
 * 
 * NOTA: Para producción, implementar bcrypt real y JWT
 */

import { query } from '../config/database.js'

/**
 * Autenticar usuario
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise<Object|null>} Usuario autenticado o null
 */
export async function authenticateUser(email, password) {
  // Buscar usuario por email
  const result = await query(
    `SELECT id, user_id, email, nombre, razon_social, rut, giro, 
            direccion, comuna, email_facturacion, activo
     FROM users 
     WHERE email = $1 AND activo = true`,
    [email]
  )

  if (result.rows.length === 0) {
    return null
  }

  const user = result.rows[0]

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
    id: user.id,
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
}

/**
 * Obtener usuario por userId
 * @param {string} userId 
 * @returns {Promise<Object|null>}
 */
export async function getUserByUserId(userId) {
  const result = await query(
    `SELECT id, user_id, email, nombre, razon_social, rut, giro, 
            direccion, comuna, email_facturacion, activo
     FROM users 
     WHERE user_id = $1 AND activo = true`,
    [userId]
  )

  if (result.rows.length === 0) {
    return null
  }

  const user = result.rows[0]
  return {
    id: user.id,
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
}

/**
 * Obtener todos los usuarios (admin)
 * @returns {Promise<Array>}
 */
export async function getAllUsers() {
  const result = await query(
    `SELECT id, user_id, email, nombre, razon_social, rut, activo, created_at
     FROM users 
     WHERE activo = true
     ORDER BY created_at DESC`
  )

  return result.rows
}

export default {
  authenticateUser,
  getUserByUserId,
  getAllUsers
}


