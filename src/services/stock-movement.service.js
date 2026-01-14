/**
 * STOCK MOVEMENT SERVICE
 * Servicio de movimientos de inventario
 */

import { query, getClient } from '../config/database.js'

/**
 * Registrar movimiento de stock
 */
export async function recordStockMovement(movementData) {
  const client = await getClient()
  
  try {
    await client.query('BEGIN')

    // Obtener stock actual del producto
    const productResult = await query(
      'SELECT id, stock FROM products WHERE sku = $1',
      [movementData.sku]
    )

    if (productResult.rows.length === 0) {
      throw new Error(`Producto con SKU ${movementData.sku} no encontrado`)
    }

    const product = productResult.rows[0]
    const previousStock = product.stock
    const quantity = parseInt(movementData.quantity)
    const newStock = previousStock + quantity

    if (newStock < 0) {
      throw new Error(`Stock insuficiente. Disponible: ${previousStock}, Solicitado: ${Math.abs(quantity)}`)
    }

    // Registrar movimiento
    const movementResult = await client.query(
      `INSERT INTO stock_movements (
        product_id, sku, movement_type, quantity,
        previous_stock, new_stock,
        reference_type, reference_id, reason, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        product.id,
        movementData.sku,
        movementData.movementType,
        quantity,
        previousStock,
        newStock,
        movementData.referenceType || null,
        movementData.referenceId || null,
        movementData.reason || null,
        movementData.notes || null,
        movementData.createdBy || 'system'
      ]
    )

    // Actualizar stock del producto
    await query(
      'UPDATE products SET stock = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newStock, product.id]
    )

    await client.query('COMMIT')

    return {
      id: movementResult.rows[0].id,
      sku: movementData.sku,
      movementType: movementData.movementType,
      quantity,
      previousStock,
      newStock,
      createdAt: movementResult.rows[0].created_at
    }

  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

/**
 * Obtener movimientos de stock
 */
export async function getStockMovements(filters = {}) {
  let sql = `SELECT sm.*, p.name as product_name
             FROM stock_movements sm
             LEFT JOIN products p ON sm.product_id = p.id
             WHERE 1=1`
  
  const params = []
  let paramCount = 1

  if (filters.sku) {
    sql += ` AND sm.sku = $${paramCount}`
    params.push(filters.sku)
    paramCount++
  }

  if (filters.movementType) {
    sql += ` AND sm.movement_type = $${paramCount}`
    params.push(filters.movementType)
    paramCount++
  }

  if (filters.dateFrom) {
    sql += ` AND sm.created_at >= $${paramCount}`
    params.push(filters.dateFrom)
    paramCount++
  }

  if (filters.dateTo) {
    sql += ` AND sm.created_at <= $${paramCount}`
    params.push(filters.dateTo)
    paramCount++
  }

  sql += ' ORDER BY sm.created_at DESC LIMIT 1000'

  const result = await query(sql, params)
  return result.rows.map(row => ({
    id: row.id,
    sku: row.sku,
    productName: row.product_name,
    movementType: row.movement_type,
    quantity: row.quantity,
    previousStock: row.previous_stock,
    newStock: row.new_stock,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    reason: row.reason,
    createdAt: row.created_at
  }))
}

/**
 * Obtener productos con stock bajo
 */
export async function getLowStockProducts(threshold = 10) {
  const result = await query(
    'SELECT * FROM products WHERE stock <= $1 AND stock >= 0 ORDER BY stock ASC',
    [threshold]
  )

  return result.rows.map(row => ({
    id: row.id,
    sku: row.sku,
    name: row.name,
    stock: row.stock,
    price: parseFloat(row.price),
    needsRestock: row.stock <= threshold
  }))
}

export default {
  recordStockMovement,
  getStockMovements,
  getLowStockProducts
}


