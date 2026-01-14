/**
 * CART SERVICE (PostgreSQL)
 * Gestión de carritos de compra usando PostgreSQL
 * 
 * Características:
 * - Un carrito por usuario autenticado
 * - Consolidación automática por SKU
 * - Persistencia en PostgreSQL (tabla carts)
 */

import { query, getClient } from '../config/database.js'

/**
 * Obtener o crear carrito de usuario
 * @param {string} userId 
 * @returns {Promise<Object>} Carrito del usuario
 */
export async function getCart(userId) {
  try {
    // Buscar carrito existente
    let result = await query(
      'SELECT id, user_id, items, created_at, updated_at FROM carts WHERE user_id = $1',
      [userId]
    )

    if (result.rows.length > 0) {
      const row = result.rows[0]
      return {
        cartId: row.id,
        userId: row.user_id,
        items: row.items || {},
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    }

    // Crear nuevo carrito
    const insertResult = await query(
      `INSERT INTO carts (user_id, items)
       VALUES ($1, '{}'::jsonb)
       RETURNING id, user_id, items, created_at, updated_at`,
      [userId]
    )

    const row = insertResult.rows[0]
    return {
      cartId: row.id,
      userId: row.user_id,
      items: row.items || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  } catch (error) {
    console.error('[CART] Error getting cart:', error)
    throw error
  }
}

/**
 * Agregar producto al carrito
 * Consolida automáticamente si el SKU ya existe
 * 
 * @param {string} userId 
 * @param {string} sku 
 * @param {string} nombre 
 * @param {number} cantidad 
 * @returns {Promise<Object>} Carrito actualizado
 */
export async function addToCart(userId, sku, nombre, cantidad) {
  // Validaciones
  if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
    throw new Error('userId debe ser un string no vacío')
  }
  if (!sku || typeof sku !== 'string' || sku.trim().length === 0) {
    throw new Error('sku debe ser un string no vacío')
  }
  if (!cantidad || cantidad <= 0 || !Number.isInteger(cantidad)) {
    throw new Error('cantidad debe ser un número entero mayor a 0')
  }

  const normalizedSKU = sku.trim().toUpperCase()
  const client = await getClient()

  try {
    await client.query('BEGIN')

    // Obtener carrito actual (sin usar getCart que puede crear otro cliente)
    let cartResult = await client.query(
      'SELECT id, user_id, items, created_at, updated_at FROM carts WHERE user_id = $1',
      [userId.trim()]
    )

    let cart
    if (cartResult.rows.length > 0) {
      const row = cartResult.rows[0]
      cart = {
        cartId: row.id,
        userId: row.user_id,
        items: row.items || {},
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    } else {
      // Crear nuevo carrito
      const insertResult = await client.query(
        `INSERT INTO carts (user_id, items)
         VALUES ($1, '{}'::jsonb)
         RETURNING id, user_id, items, created_at, updated_at`,
        [userId.trim()]
      )
      const row = insertResult.rows[0]
      cart = {
        cartId: row.id,
        userId: row.user_id,
        items: row.items || {},
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    }
    const items = cart.items || {}

    // Consolidar cantidad si ya existe
    if (items[normalizedSKU]) {
      items[normalizedSKU].cantidad += cantidad
      items[normalizedSKU].updatedAt = new Date().toISOString()
    } else {
      items[normalizedSKU] = {
        codigo: normalizedSKU,
        nombre,
        cantidad,
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    }

    // Actualizar en BD
    await client.query(
      `UPDATE carts 
       SET items = $1::jsonb, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $2
       RETURNING id, user_id, items, updated_at`,
      [JSON.stringify(items), userId]
    )

    await client.query('COMMIT')

    // Retornar carrito actualizado sin crear nueva conexión
    const updatedResult = await client.query(
      'SELECT id, user_id, items, created_at, updated_at FROM carts WHERE user_id = $1',
      [userId.trim()]
    )
    const updatedRow = updatedResult.rows[0]
    return {
      cartId: updatedRow.id,
      userId: updatedRow.user_id,
      items: updatedRow.items || {},
      createdAt: updatedRow.created_at,
      updatedAt: updatedRow.updated_at
    }
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('[CART] Error adding to cart:', error)
    throw error
  } finally {
    client.release()
  }
}

/**
 * Actualizar cantidad de un item
 * @param {string} userId 
 * @param {string} sku 
 * @param {number} cantidad 
 * @returns {Promise<Object|null>} Carrito actualizado o null si no existe
 */
export async function updateCartItem(userId, sku, cantidad) {
  // Validaciones
  if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
    throw new Error('userId debe ser un string no vacío')
  }
  if (!sku || typeof sku !== 'string' || sku.trim().length === 0) {
    throw new Error('sku debe ser un string no vacío')
  }
  if (cantidad < 0 || !Number.isInteger(cantidad)) {
    throw new Error('cantidad debe ser un número entero mayor o igual a 0')
  }

  const normalizedSKU = sku.trim().toUpperCase()
  const client = await getClient()

  try {
    await client.query('BEGIN')

    // Obtener carrito sin crear nueva conexión
    const cartResult = await client.query(
      'SELECT id, user_id, items, created_at, updated_at FROM carts WHERE user_id = $1',
      [userId.trim()]
    )

    if (cartResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return null
    }

    const row = cartResult.rows[0]
    const cart = {
      cartId: row.id,
      userId: row.user_id,
      items: row.items || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
    const items = cart.items || {}

    if (!items[normalizedSKU]) {
      await client.query('ROLLBACK')
      return null
    }

    if (cantidad <= 0) {
      // Eliminar item si cantidad es 0 o negativa
      delete items[normalizedSKU]
    } else {
      items[normalizedSKU].cantidad = cantidad
      items[normalizedSKU].updatedAt = new Date().toISOString()
    }

    await client.query(
      `UPDATE carts 
       SET items = $1::jsonb, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $2`,
      [JSON.stringify(items), userId]
    )

    await client.query('COMMIT')
    
    // Retornar carrito actualizado
    const updatedResult = await client.query(
      'SELECT id, user_id, items, created_at, updated_at FROM carts WHERE user_id = $1',
      [userId.trim()]
    )
    const updatedRow = updatedResult.rows[0]
    return {
      cartId: updatedRow.id,
      userId: updatedRow.user_id,
      items: updatedRow.items || {},
      createdAt: updatedRow.created_at,
      updatedAt: updatedRow.updated_at
    }
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('[CART] Error updating cart item:', error)
    throw error
  } finally {
    client.release()
  }
}

/**
 * Eliminar item del carrito
 * @param {string} userId 
 * @param {string} sku 
 * @returns {Promise<boolean>} true si se eliminó, false si no existía
 */
export async function removeFromCart(userId, sku) {
  // Validaciones
  if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
    throw new Error('userId debe ser un string no vacío')
  }
  if (!sku || typeof sku !== 'string' || sku.trim().length === 0) {
    throw new Error('sku debe ser un string no vacío')
  }

  const normalizedSKU = sku.trim().toUpperCase()
  const client = await getClient()

  try {
    await client.query('BEGIN')

    // Obtener carrito sin crear nueva conexión
    const cartResult = await client.query(
      'SELECT id, user_id, items, created_at, updated_at FROM carts WHERE user_id = $1',
      [userId.trim()]
    )

    if (cartResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return false
    }

    const row = cartResult.rows[0]
    const cart = {
      cartId: row.id,
      userId: row.user_id,
      items: row.items || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
    const items = cart.items || {}

    if (!items[normalizedSKU]) {
      await client.query('ROLLBACK')
      return false
    }

    delete items[normalizedSKU]

    await client.query(
      `UPDATE carts 
       SET items = $1::jsonb, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $2`,
      [JSON.stringify(items), userId]
    )

    await client.query('COMMIT')
    return true
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('[CART] Error removing from cart:', error)
    throw error
  } finally {
    client.release()
  }
}

/**
 * Limpiar carrito completamente
 * @param {string} userId 
 * @returns {Promise<Object>} Carrito vacío
 */
export async function clearCart(userId) {
  await query(
    `UPDATE carts 
     SET items = '{}'::jsonb, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1`,
    [userId]
  )
  return await getCart(userId)
}

/**
 * Obtener resumen del carrito
 * @param {string} userId 
 * @returns {Promise<Object>} Resumen con totales
 */
export async function getCartSummary(userId) {
  const cart = await getCart(userId)
  const items = Object.values(cart.items || {})
  
  return {
    cartId: cart.cartId,
    userId: cart.userId,
    itemCount: items.length,
    totalUnits: items.reduce((sum, item) => sum + (item.cantidad || 0), 0),
    items: items.map(item => ({
      codigo: item.codigo,
      nombre: item.nombre,
      cantidad: item.cantidad
    })),
    updatedAt: cart.updatedAt
  }
}

/**
 * Verificar si el carrito tiene items
 * @param {string} userId 
 * @returns {Promise<boolean>}
 */
export async function hasItems(userId) {
  const cart = await getCart(userId)
  return Object.keys(cart.items || {}).length > 0
}

/**
 * Obtener items como array para pedido
 * @param {string} userId 
 * @returns {Promise<Array>} Array de items
 */
export async function getItemsForOrder(userId) {
  const cart = await getCart(userId)
  return Object.values(cart.items || {}).map(item => ({
    codigo: item.codigo,
    nombre: item.nombre,
    cantidad: item.cantidad
  }))
}

export default {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  getCartSummary,
  hasItems,
  getItemsForOrder
}
