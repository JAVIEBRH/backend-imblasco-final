/**
 * CART SERVICE (MongoDB)
 * Gestión de carritos de compra usando MongoDB
 * 
 * Características:
 * - Un carrito por usuario autenticado
 * - Consolidación automática por SKU
 * - Persistencia en MongoDB (colección carts)
 */

import { Cart } from '../models/index.js'

/**
 * Obtener o crear carrito de usuario
 * @param {string} userId 
 * @returns {Promise<Object>} Carrito del usuario
 */
export async function getCart(userId) {
  try {
    let cart = await Cart.findOne({ user_id: userId.trim() })
    
    if (!cart) {
      // Crear nuevo carrito
      cart = await Cart.create({
        user_id: userId.trim(),
        items: {}
      })
    }
    
    return cart.toJSON()
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

  try {
    // Obtener o crear carrito
    let cart = await Cart.findOne({ user_id: userId.trim() })
    
    if (!cart) {
      cart = await Cart.create({
        user_id: userId.trim(),
        items: new Map()
      })
    }

    // Inicializar items si no existe
    if (!cart.items) {
      cart.items = new Map()
    }

    // Convertir Map a objeto si es necesario para manipulación
    const items = cart.items instanceof Map ? Object.fromEntries(cart.items) : (cart.items || {})

    // Consolidar cantidad si ya existe
    if (items[normalizedSKU]) {
      items[normalizedSKU].cantidad += cantidad
    } else {
      items[normalizedSKU] = {
        sku: normalizedSKU,
        nombre: nombre || normalizedSKU,
        cantidad: cantidad,
        precio: 0
      }
    }

    // Actualizar en MongoDB (Mongoose convierte el objeto a Map automáticamente)
    cart.items = items
    await cart.save()

    // Retornar carrito actualizado
    return cart.toJSON()
  } catch (error) {
    console.error('[CART] Error adding to cart:', error)
    throw error
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

  try {
    const cart = await Cart.findOne({ user_id: userId.trim() })

    if (!cart) {
      return null
    }

    // Convertir Map a objeto si es necesario
    const items = cart.items instanceof Map ? Object.fromEntries(cart.items) : (cart.items || {})

    if (!items[normalizedSKU]) {
      return null
    }

    if (cantidad <= 0) {
      // Eliminar item si cantidad es 0 o negativa
      delete items[normalizedSKU]
    } else {
      items[normalizedSKU].cantidad = cantidad
    }

    cart.items = items
    await cart.save()

    return cart.toJSON()
  } catch (error) {
    console.error('[CART] Error updating cart item:', error)
    throw error
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

  try {
    const cart = await Cart.findOne({ user_id: userId.trim() })

    if (!cart) {
      return false
    }

    // Convertir Map a objeto si es necesario
    const items = cart.items instanceof Map ? Object.fromEntries(cart.items) : (cart.items || {})

    if (!items[normalizedSKU]) {
      return false
    }

    delete items[normalizedSKU]

    cart.items = items
    await cart.save()

    return true
  } catch (error) {
    console.error('[CART] Error removing from cart:', error)
    throw error
  }
}

/**
 * Limpiar carrito completamente
 * @param {string} userId 
 * @returns {Promise<Object>} Carrito vacío
 */
export async function clearCart(userId) {
  const cart = await Cart.findOne({ user_id: userId.trim() })
  
  if (cart) {
    cart.items = {}
    await cart.save()
  }
  
  return await getCart(userId)
}

/**
 * Obtener resumen del carrito
 * @param {string} userId 
 * @returns {Promise<Object>} Resumen con totales
 */
export async function getCartSummary(userId) {
  const cart = await getCart(userId)
  
  // Convertir items a array si es Map
  let itemsArray
  if (cart.items instanceof Map) {
    itemsArray = Array.from(cart.items.values())
  } else {
    itemsArray = Object.values(cart.items || {})
  }
  
  return {
    cartId: cart.cartId,
    userId: cart.userId,
    items: cart.items || {}, // Mantener formato original para compatibilidad
    itemCount: itemsArray.length,
    totalUnits: itemsArray.reduce((sum, item) => sum + (item.cantidad || 0), 0),
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
  
  // Convertir items a objeto para contar
  const items = cart.items instanceof Map ? Object.fromEntries(cart.items) : (cart.items || {})
  return Object.keys(items).length > 0
}

/**
 * Obtener items como array para pedido
 * @param {string} userId 
 * @returns {Promise<Array>} Array de items
 */
export async function getItemsForOrder(userId) {
  const cart = await getCart(userId)
  
  // Convertir items a array si es Map
  let itemsArray
  if (cart.items instanceof Map) {
    itemsArray = Array.from(cart.items.values())
  } else {
    itemsArray = Object.values(cart.items || {})
  }
  
  return itemsArray.map(item => ({
    codigo: item.sku || item.codigo,
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
