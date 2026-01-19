/**
 * STOCK MOVEMENT SERVICE (MongoDB)
 * Servicio de movimientos de inventario
 */

import { StockMovement } from '../models/index.js'
import { Product } from '../models/index.js'

/**
 * Registrar movimiento de stock
 */
export async function recordStockMovement(movementData) {
  try {
    // Obtener stock actual del producto
    const product = await Product.findOne({ sku: movementData.sku.toUpperCase() })
    
    if (!product) {
      throw new Error(`Producto con SKU ${movementData.sku} no encontrado`)
    }

    const previousStock = product.stock
    const quantity = parseInt(movementData.quantity)
    const newStock = previousStock + quantity

    if (newStock < 0) {
      throw new Error(`Stock insuficiente. Disponible: ${previousStock}, Solicitado: ${Math.abs(quantity)}`)
    }

    // Registrar movimiento
    const movement = await StockMovement.create({
      product_id: product._id.toString(),
      sku: movementData.sku.toUpperCase(),
      movement_type: movementData.movementType,
      quantity: quantity,
      previous_stock: previousStock,
      new_stock: newStock,
      reference_type: movementData.referenceType || null,
      reference_id: movementData.referenceId || null,
      reason: movementData.reason || null,
      notes: movementData.notes || null,
      created_by: movementData.createdBy || 'system'
    })

    // Actualizar stock del producto
    await Product.findByIdAndUpdate(
      product._id,
      {
        $set: {
          stock: newStock,
          updatedAt: new Date()
        }
      }
    )

    return {
      id: movement._id.toString(),
      sku: movementData.sku,
      movementType: movementData.movementType,
      quantity,
      previousStock,
      newStock,
      createdAt: movement.createdAt
    }

  } catch (error) {
    console.error('[STOCK_MOVEMENT] Error recording movement:', error)
    throw error
  }
}

/**
 * Obtener movimientos de stock
 */
export async function getStockMovements(filters = {}) {
  try {
    const query = {}

    if (filters.sku) {
      query.sku = filters.sku.toUpperCase()
    }

    if (filters.movementType) {
      query.movement_type = filters.movementType
    }

    if (filters.dateFrom || filters.dateTo) {
      query.createdAt = {}
      if (filters.dateFrom) {
        query.createdAt.$gte = new Date(filters.dateFrom)
      }
      if (filters.dateTo) {
        query.createdAt.$lte = new Date(filters.dateTo)
      }
    }

    const movements = await StockMovement.find(query)
      .sort({ createdAt: -1 })
      .limit(1000)
      .lean()

    // Obtener nombres de productos
    const skus = [...new Set(movements.map(m => m.sku))]
    const products = await Product.find({ sku: { $in: skus } })
      .select('sku name')
      .lean()
    
    const productMap = {}
    products.forEach(p => {
      productMap[p.sku] = p.name
    })

    return movements.map(movement => ({
      id: movement._id.toString(),
      sku: movement.sku,
      productName: productMap[movement.sku] || movement.sku,
      movementType: movement.movement_type,
      quantity: movement.quantity,
      previousStock: movement.previous_stock,
      newStock: movement.new_stock,
      referenceType: movement.reference_type,
      referenceId: movement.reference_id,
      reason: movement.reason,
      createdAt: movement.createdAt
    }))
  } catch (error) {
    console.error('[STOCK_MOVEMENT] Error getting movements:', error)
    return []
  }
}

/**
 * Obtener productos con stock bajo
 */
export async function getLowStockProducts(threshold = 10) {
  try {
    const products = await Product.find({
      stock: { $lte: threshold, $gte: 0 }
    })
      .sort({ stock: 1 })
      .lean()

    return products.map(product => ({
      id: product._id.toString(),
      sku: product.sku,
      name: product.name,
      stock: product.stock,
      price: parseFloat(product.price) || 0,
      needsRestock: product.stock <= threshold
    }))
  } catch (error) {
    console.error('[STOCK_MOVEMENT] Error getting low stock products:', error)
    return []
  }
}

export default {
  recordStockMovement,
  getStockMovements,
  getLowStockProducts
}
