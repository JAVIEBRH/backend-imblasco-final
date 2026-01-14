/**
 * STOCK SERVICE (PostgreSQL)
 * Gestión de inventario usando PostgreSQL
 * 
 * Reemplaza el servicio anterior que usaba Map en memoria
 */

import { query } from '../config/database.js'

/**
 * Obtener producto por SKU
 * @param {string} sku - Código del producto
 * @returns {Promise<Object|null>} - Producto o null
 */
export async function getProductBySKU(sku) {
  const normalizedSKU = sku?.trim().toUpperCase()
  const result = await query(
    'SELECT id, sku, name, stock, price, updated_at FROM products WHERE sku = $1',
    [normalizedSKU]
  )
  
  if (result.rows.length === 0) return null
  
  const row = result.rows[0]
  return {
    id: row.id,
    codigo: row.sku,
    sku: row.sku,
    nombre: row.name,
    name: row.name,
    stock: parseInt(row.stock, 10),
    precio: parseFloat(row.price),
    price: parseFloat(row.price),
    disponible: row.stock > 0,
    updated_at: row.updated_at
  }
}

/**
 * Obtener todos los productos
 * @param {Object} options - Opciones de filtrado
 * @returns {Promise<Object>} - Lista de productos y metadata
 */
export async function getAllStock(options = {}) {
  const { limit = 1000, offset = 0, availableOnly = false } = options
  
  let sql = 'SELECT id, sku, name, stock, price, updated_at FROM products'
  const params = []
  
  if (availableOnly) {
    sql += ' WHERE stock > 0'
  }
  
  sql += ' ORDER BY sku ASC LIMIT $1 OFFSET $2'
  params.push(limit, offset)
  
  const result = await query(sql, params)
  
  const products = result.rows.map(row => ({
    id: row.id,
    codigo: row.sku,
    sku: row.sku,
    nombre: row.name,
    name: row.name,
    stock: parseInt(row.stock, 10),
    precio: parseFloat(row.price),
    price: parseFloat(row.price),
    disponible: row.stock > 0,
    updated_at: row.updated_at
  }))
  
  // Contar total
  const countResult = await query(
    availableOnly 
      ? 'SELECT COUNT(*) as total FROM products WHERE stock > 0'
      : 'SELECT COUNT(*) as total FROM products'
  )
  const total = parseInt(countResult.rows[0].total, 10)
  
  return {
    products,
    count: products.length,
    total,
    limit,
    offset
  }
}

/**
 * Buscar productos por término
 * @param {string} term - Término de búsqueda
 * @param {number} limit - Límite de resultados
 * @returns {Promise<Array>} - Productos encontrados
 */
export async function searchProducts(term, limit = 10) {
  const normalizedTerm = term?.toLowerCase().trim()
  if (!normalizedTerm) return []
  
  const searchTerm = `%${normalizedTerm}%`
  const result = await query(
    `SELECT id, sku, name, stock, price 
     FROM products 
     WHERE LOWER(sku) LIKE $1 OR LOWER(name) LIKE $1
     ORDER BY 
       CASE WHEN LOWER(sku) = $2 THEN 1 ELSE 2 END,
       name ASC
     LIMIT $3`,
    [searchTerm, normalizedTerm, limit]
  )
  
  return result.rows.map(row => ({
    id: row.id,
    codigo: row.sku,
    sku: row.sku,
    nombre: row.name,
    name: row.name,
    stock: parseInt(row.stock, 10),
    precio: parseFloat(row.price),
    price: parseFloat(row.price),
    disponible: row.stock > 0
  }))
}

/**
 * Validar disponibilidad de stock
 * @param {string} sku - Código del producto
 * @param {number} cantidad - Cantidad solicitada
 * @returns {Promise<Object>} - Resultado de validación
 */
export async function validateStock(sku, cantidad) {
  const product = await getProductBySKU(sku)
  
  if (!product) {
    return {
      valid: false,
      error: 'PRODUCT_NOT_FOUND',
      message: `Producto ${sku} no encontrado`
    }
  }
  
  if (cantidad <= 0) {
    return {
      valid: false,
      error: 'INVALID_QUANTITY',
      message: 'La cantidad debe ser mayor a 0'
    }
  }
  
  if (cantidad > product.stock) {
    return {
      valid: false,
      error: 'INSUFFICIENT_STOCK',
      message: `Stock insuficiente. Disponible: ${product.stock} unidades`,
      available: product.stock,
      requested: cantidad
    }
  }
  
  return {
    valid: true,
    product,
    cantidad
  }
}

/**
 * Verificar stock disponible
 * @param {string} sku - Código del producto
 * @param {number} cantidad - Cantidad solicitada
 * @returns {Promise<Object>} - Resultado de verificación
 */
export async function checkStock(sku, cantidad) {
  const product = await getProductBySKU(sku)
  
  if (!product) {
    return {
      available: false,
      reason: 'PRODUCT_NOT_FOUND',
      message: `Producto ${sku} no encontrado`,
      currentStock: 0
    }
  }
  
  if (product.stock < cantidad) {
    return {
      available: false,
      reason: 'INSUFFICIENT_STOCK',
      message: `Stock insuficiente. Disponible: ${product.stock.toLocaleString()}`,
      currentStock: product.stock,
      stockDisponible: product.stock
    }
  }
  
  return {
    available: true,
    product,
    currentStock: product.stock,
    stockDisponible: product.stock
  }
}

/**
 * Obtener productos disponibles (stock > 0)
 * @param {number} limit - Límite de resultados
 * @returns {Promise<Array>} - Productos disponibles
 */
export async function getAvailableProducts(limit = 1000) {
  const result = await getAllStock({ availableOnly: true, limit })
  return result.products
}

/**
 * Verificar si hay stock cargado
 * @returns {Promise<boolean>}
 */
export async function isStockLoaded() {
  const result = await query('SELECT COUNT(*) as total FROM products')
  return parseInt(result.rows[0].total, 10) > 0
}

/**
 * Reservar stock (disminuir stock disponible)
 * @param {string} sku - Código del producto
 * @param {number} cantidad - Cantidad a reservar
 * @returns {Promise<boolean>} - true si se reservó, false si no hay stock
 */
export async function reserveStock(sku, cantidad) {
  const normalizedSKU = sku?.trim().toUpperCase()
  
  const result = await query(
    `UPDATE products 
     SET stock = stock - $1, updated_at = CURRENT_TIMESTAMP
     WHERE sku = $2 AND stock >= $1
     RETURNING id`,
    [cantidad, normalizedSKU]
  )
  
  return result.rows.length > 0
}

// Aliases para compatibilidad con código existente
export const getAllProducts = () => getAllStock().then(r => r.products)
export const getProduct = getProductBySKU

export default {
  getProductBySKU,
  getAllStock,
  searchProducts,
  validateStock,
  checkStock,
  getAvailableProducts,
  isStockLoaded,
  reserveStock,
  getAllProducts,
  getProduct
}
