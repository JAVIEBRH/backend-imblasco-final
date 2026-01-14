/**
 * CLIENT SERVICE (COMPLETO)
 * Servicio completo de gestión de clientes
 */

import { query, getClient } from '../config/database.js'

/**
 * Obtener todos los clientes
 */
export async function getAllClients(filters = {}) {
  let sql = 'SELECT * FROM users WHERE activo = true'
  const params = []
  let paramCount = 1

  if (filters.search) {
    sql += ` AND (razon_social ILIKE $${paramCount} OR email ILIKE $${paramCount} OR rut ILIKE $${paramCount})`
    params.push(`%${filters.search}%`)
    paramCount++
  }

  sql += ' ORDER BY razon_social ASC'

  const result = await query(sql, params)
  return result.rows.map(formatClient)
}

/**
 * Obtener cliente por ID
 */
export async function getClientById(userId) {
  const result = await query(
    'SELECT * FROM users WHERE user_id = $1 AND activo = true',
    [userId]
  )

  if (result.rows.length === 0) return null
  return formatClient(result.rows[0])
}

/**
 * Crear cliente
 */
export async function createClient(clientData) {
  const result = await query(
    `INSERT INTO users (
      user_id, email, password_hash, nombre, razon_social, rut, giro,
      direccion, comuna, email_facturacion
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [
      clientData.userId || `client-${Date.now()}`,
      clientData.email,
      clientData.passwordHash || '$2b$10$rOzJ8K8K8K8K8K8K8K8K8e', // Mock hash
      clientData.nombre,
      clientData.razonSocial,
      clientData.rut,
      clientData.giro || 'Comercio',
      clientData.direccion,
      clientData.comuna,
      clientData.emailFacturacion || clientData.email
    ]
  )

  return formatClient(result.rows[0])
}

/**
 * Actualizar cliente
 */
export async function updateClient(userId, clientData) {
  const updates = []
  const params = []
  let paramCount = 1

  if (clientData.email) {
    updates.push(`email = $${paramCount}`)
    params.push(clientData.email)
    paramCount++
  }

  if (clientData.nombre) {
    updates.push(`nombre = $${paramCount}`)
    params.push(clientData.nombre)
    paramCount++
  }

  if (clientData.razonSocial) {
    updates.push(`razon_social = $${paramCount}`)
    params.push(clientData.razonSocial)
    paramCount++
  }

  if (clientData.rut) {
    updates.push(`rut = $${paramCount}`)
    params.push(clientData.rut)
    paramCount++
  }

  if (clientData.giro) {
    updates.push(`giro = $${paramCount}`)
    params.push(clientData.giro)
    paramCount++
  }

  if (clientData.direccion) {
    updates.push(`direccion = $${paramCount}`)
    params.push(clientData.direccion)
    paramCount++
  }

  if (clientData.comuna) {
    updates.push(`comuna = $${paramCount}`)
    params.push(clientData.comuna)
    paramCount++
  }

  if (clientData.emailFacturacion) {
    updates.push(`email_facturacion = $${paramCount}`)
    params.push(clientData.emailFacturacion)
    paramCount++
  }

  if (updates.length === 0) {
    return await getClientById(userId)
  }

  params.push(userId)
  const sql = `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE user_id = $${paramCount} RETURNING *`

  const result = await query(sql, params)
  return formatClient(result.rows[0])
}

/**
 * Desactivar cliente
 */
export async function deactivateClient(userId) {
  const result = await query(
    'UPDATE users SET activo = false, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 RETURNING *',
    [userId]
  )

  if (result.rows.length === 0) return null
  return formatClient(result.rows[0])
}

/**
 * Obtener historial de compras del cliente
 */
export async function getClientPurchaseHistory(userId) {
  const result = await query(
    `SELECT o.*, 
            COALESCE(json_agg(oi.* ORDER BY oi.id) FILTER (WHERE oi.id IS NOT NULL), '[]') as items
     FROM orders o
     LEFT JOIN order_items oi ON o.id = oi.order_id
     WHERE o.user_id = $1
     GROUP BY o.id
     ORDER BY o.created_at DESC`,
    [userId]
  )

  return result.rows.map(row => ({
    id: row.id,
    orderId: `PED-${row.id.toString().padStart(6, '0')}`,
    status: row.status,
    total: parseFloat(row.total),
    createdAt: row.created_at,
    items: Array.isArray(row.items) ? row.items : (row.items ? [row.items] : [])
  }))
}

/**
 * Obtener cuentas por cobrar del cliente
 */
export async function getClientAccountsReceivable(userId) {
  const result = await query(
    `SELECT ar.*, i.invoice_number, i.issue_date, i.total_amount
     FROM accounts_receivable ar
     LEFT JOIN invoices i ON ar.invoice_id = i.id
     WHERE ar.client_id = $1 AND ar.status != 'paid'
     ORDER BY ar.due_date ASC`,
    [userId]
  )

  return result.rows.map(row => ({
    id: row.id,
    invoiceId: row.invoice_id,
    invoiceNumber: row.invoice_number,
    originalAmount: parseFloat(row.original_amount),
    paidAmount: parseFloat(row.paid_amount),
    balance: parseFloat(row.balance),
    dueDate: row.due_date,
    daysOverdue: row.days_overdue,
    status: row.status,
    issueDate: row.issue_date
  }))
}

/**
 * Formatear cliente
 */
function formatClient(row) {
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    nombre: row.nombre,
    razonSocial: row.razon_social,
    rut: row.rut,
    giro: row.giro,
    direccion: row.direccion,
    comuna: row.comuna,
    emailFacturacion: row.email_facturacion,
    activo: row.activo,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

// Mantener funciones legacy para compatibilidad
export async function getClientData(userId) {
  const client = await getClientById(userId)
  if (client) {
    return {
      rut: client.rut,
      razon_social: client.razonSocial,
      giro: client.giro || 'Comercio',
      direccion: client.direccion || 'Sin dirección',
      comuna: client.comuna || 'Santiago',
      email_facturacion: client.emailFacturacion || `${userId}@cliente.cl`
    }
  }

  // Fallback a mock si no existe
  return {
    rut: '76.123.456-7',
    razon_social: `Cliente ${userId}`,
    giro: 'Comercio',
    direccion: 'Av. Principal 123',
    comuna: 'Santiago',
    email_facturacion: `${userId}@cliente.cl`
  }
}

export async function validateClientForInvoicing(userId) {
  const client = await getClientById(userId)
  
  if (!client) {
    return {
      valid: false,
      missing: ['rut', 'razon_social', 'giro', 'direccion', 'comuna', 'email_facturacion'],
      clientData: null
    }
  }

  const required = ['rut', 'razonSocial', 'giro', 'direccion', 'comuna', 'emailFacturacion']
  const missing = required.filter(field => !client[field])

  return {
    valid: missing.length === 0,
    missing,
    clientData: missing.length === 0 ? {
      rut: client.rut,
      razon_social: client.razonSocial,
      giro: client.giro,
      direccion: client.direccion,
      comuna: client.comuna,
      email_facturacion: client.emailFacturacion
    } : null
  }
}

export async function createClientSnapshot(userId) {
  const client = await getClientById(userId)
  
  if (!client) {
    return {
      rut: '76.123.456-7',
      razon_social: `Cliente ${userId}`,
      giro: 'Comercio',
      direccion: 'Av. Principal 123',
      comuna: 'Santiago',
      email_facturacion: `${userId}@cliente.cl`,
      snapshot_at: new Date().toISOString()
    }
  }

  return {
    rut: client.rut,
    razon_social: client.razonSocial,
    giro: client.giro,
    direccion: client.direccion,
    comuna: client.comuna,
    email_facturacion: client.emailFacturacion,
    snapshot_at: new Date().toISOString()
  }
}

export default {
  getAllClients,
  getClientById,
  createClient,
  updateClient,
  deactivateClient,
  getClientPurchaseHistory,
  getClientAccountsReceivable,
  getClientData,
  validateClientForInvoicing,
  createClientSnapshot
}
