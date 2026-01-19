/**
 * CLIENT SERVICE (MongoDB)
 * Servicio completo de gestión de clientes
 */

import { User } from '../models/index.js'
import { Order } from '../models/index.js'

/**
 * Obtener todos los clientes
 */
export async function getAllClients(filters = {}) {
  try {
    const query = { activo: true }
    
    if (filters.search) {
      const searchRegex = new RegExp(filters.search, 'i')
      query.$or = [
        { razon_social: searchRegex },
        { email: searchRegex },
        { rut: searchRegex }
      ]
    }
    
    const clients = await User.find(query)
      .sort({ razon_social: 1 })
      .lean()
    
    return clients.map(formatClient)
  } catch (error) {
    console.error('[CLIENT] Error getting all clients:', error)
    return []
  }
}

/**
 * Obtener cliente por ID
 */
export async function getClientById(userId) {
  try {
    const client = await User.findOne({ user_id: userId, activo: true }).lean()
    if (!client) return null
    return formatClient(client)
  } catch (error) {
    console.error('[CLIENT] Error getting client by ID:', error)
    return null
  }
}

/**
 * Crear cliente
 */
export async function createClient(clientData) {
  try {
    const client = await User.create({
      user_id: clientData.userId || `client-${Date.now()}`,
      email: clientData.email,
      password_hash: clientData.passwordHash || '$2b$10$rOzJ8K8K8K8K8K8K8K8K8e', // Mock hash
      nombre: clientData.nombre,
      razon_social: clientData.razonSocial,
      rut: clientData.rut,
      giro: clientData.giro || 'Comercio',
      direccion: clientData.direccion,
      comuna: clientData.comuna,
      email_facturacion: clientData.emailFacturacion || clientData.email,
      activo: true
    })
    
    return formatClient(client.toObject())
  } catch (error) {
    console.error('[CLIENT] Error creating client:', error)
    throw error
  }
}

/**
 * Actualizar cliente
 */
export async function updateClient(userId, clientData) {
  try {
    const updates = {}
    
    if (clientData.email) updates.email = clientData.email
    if (clientData.nombre) updates.nombre = clientData.nombre
    if (clientData.razonSocial) updates.razon_social = clientData.razonSocial
    if (clientData.rut) updates.rut = clientData.rut
    if (clientData.giro) updates.giro = clientData.giro
    if (clientData.direccion) updates.direccion = clientData.direccion
    if (clientData.comuna) updates.comuna = clientData.comuna
    if (clientData.emailFacturacion) updates.email_facturacion = clientData.emailFacturacion
    
    if (Object.keys(updates).length === 0) {
      return await getClientById(userId)
    }
    
    updates.updatedAt = new Date()
    
    const client = await User.findOneAndUpdate(
      { user_id: userId },
      { $set: updates },
      { new: true }
    ).lean()
    
    if (!client) return null
    return formatClient(client)
  } catch (error) {
    console.error('[CLIENT] Error updating client:', error)
    throw error
  }
}

/**
 * Desactivar cliente
 */
export async function deactivateClient(userId) {
  try {
    const client = await User.findOneAndUpdate(
      { user_id: userId },
      { $set: { activo: false, updatedAt: new Date() } },
      { new: true }
    ).lean()
    
    if (!client) return null
    return formatClient(client)
  } catch (error) {
    console.error('[CLIENT] Error deactivating client:', error)
    return null
  }
}

/**
 * Obtener historial de compras del cliente
 */
export async function getClientPurchaseHistory(userId) {
  try {
    const orders = await Order.find({ user_id: userId })
      .sort({ createdAt: -1 })
      .lean()
    
    return orders.map(order => ({
      id: order._id.toString(),
      orderId: order.order_id,
      status: order.status,
      total: parseFloat(order.total_amount || 0),
      createdAt: order.createdAt,
      items: order.items || []
    }))
  } catch (error) {
    console.error('[CLIENT] Error getting purchase history:', error)
    return []
  }
}

/**
 * Obtener cuentas por cobrar del cliente
 * (Simplificado para MongoDB - puede necesitar modelo Invoice)
 */
export async function getClientAccountsReceivable(userId) {
  // Por ahora retornar array vacío - se puede implementar cuando tengamos modelo Invoice
  return []
}

/**
 * Formatear cliente
 */
function formatClient(doc) {
  return {
    id: doc._id?.toString() || doc.id,
    userId: doc.user_id,
    email: doc.email,
    nombre: doc.nombre,
    razonSocial: doc.razon_social,
    rut: doc.rut,
    giro: doc.giro,
    direccion: doc.direccion,
    comuna: doc.comuna,
    emailFacturacion: doc.email_facturacion,
    activo: doc.activo,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
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
