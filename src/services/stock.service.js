/**
 * STOCK SERVICE (MongoDB)
 * Gestión de inventario usando MongoDB
 */

import { Product } from '../models/index.js'

/**
 * Obtener producto por SKU
 * @param {string} sku - Código del producto
 * @returns {Promise<Object|null>} - Producto o null
 */
export async function getProductBySKU(sku) {
  const normalizedSKU = sku?.trim().toUpperCase()
  const product = await Product.findOne({ sku: normalizedSKU })
  return product ? product.toJSON() : null
}

/**
 * Obtener todos los productos
 * @param {Object} options - Opciones de filtrado
 * @returns {Promise<Object>} - Lista de productos y metadata
 */
export async function getAllStock(options = {}) {
  const { limit = 1000, offset = 0, availableOnly = false } = options
  
  const query = availableOnly ? { stock: { $gt: 0 } } : {}
  
  const [products, total] = await Promise.all([
    Product.find(query)
      .sort({ sku: 1 })
      .limit(limit)
      .skip(offset)
      .lean(),
    Product.countDocuments(query)
  ])
  
  return {
    products: products.map(p => ({
      id: p._id.toString(),
      codigo: p.sku,
      sku: p.sku,
      nombre: p.name,
      name: p.name,
      stock: parseInt(p.stock, 10),
      precio: parseFloat(p.price) || 0,
      price: parseFloat(p.price) || 0,
      disponible: p.stock > 0,
      updated_at: p.updatedAt
    })),
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
  
  // Búsqueda por SKU exacto primero, luego por nombre
  const exactMatch = await Product.findOne({ sku: normalizedTerm.toUpperCase() }).lean()
  
  const regex = new RegExp(normalizedTerm, 'i')
  const products = await Product.find({
    $or: [
      { sku: { $regex: regex } },
      { name: { $regex: regex } }
    ]
  })
    .sort({ 
      sku: exactMatch ? -1 : 1, // Priorizar SKU exacto
      name: 1 
    })
    .limit(limit)
    .lean()
  
  // Si hay match exacto, ponerlo primero
  if (exactMatch) {
    const exactIndex = products.findIndex(p => p._id.toString() === exactMatch._id.toString())
    if (exactIndex > 0) {
      products.splice(exactIndex, 1)
      products.unshift(exactMatch)
    }
  }
  
  return products.map(p => ({
    id: p._id.toString(),
    codigo: p.sku,
    sku: p.sku,
    nombre: p.name,
    name: p.name,
    stock: parseInt(p.stock, 10),
    precio: parseFloat(p.price) || 0,
    price: parseFloat(p.price) || 0,
    disponible: p.stock > 0
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
  const count = await Product.countDocuments()
  return count > 0
}

/**
 * Reservar stock (disminuir stock disponible)
 * @param {string} sku - Código del producto
 * @param {number} cantidad - Cantidad a reservar
 * @returns {Promise<boolean>} - true si se reservó, false si no hay stock
 */
export async function reserveStock(sku, cantidad) {
  const normalizedSKU = sku?.trim().toUpperCase()
  
  const result = await Product.updateOne(
    { 
      sku: normalizedSKU,
      stock: { $gte: cantidad } // Solo actualizar si hay stock suficiente
    },
    {
      $inc: { stock: -cantidad },
      $set: { updatedAt: new Date() }
    }
  )
  
  return result.modifiedCount > 0
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
