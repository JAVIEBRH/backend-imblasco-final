/**
 * REPORT SERVICE
 * Servicio de reportes y analytics
 */

import { query } from '../config/database.js'

/**
 * Reporte de ventas por período
 */
export async function getSalesReport(dateFrom, dateTo) {
  const result = await query(
    `SELECT 
      DATE(created_at) as date,
      COUNT(*) as order_count,
      SUM(total) as total_sales,
      AVG(total) as avg_order_value
     FROM orders
     WHERE status = 'confirmed' 
       AND created_at >= $1 
       AND created_at <= $2
     GROUP BY DATE(created_at)
     ORDER BY date ASC`,
    [dateFrom, dateTo]
  )

  return result.rows.map(row => ({
    date: row.date,
    orderCount: parseInt(row.order_count),
    totalSales: parseFloat(row.total_sales),
    avgOrderValue: parseFloat(row.avg_order_value)
  }))
}

/**
 * Reporte de productos más vendidos
 */
export async function getTopProducts(limit = 10, dateFrom, dateTo) {
  let sql = `SELECT 
      oi.sku,
      oi.product_name,
      SUM(oi.quantity) as total_quantity,
      SUM(oi.subtotal) as total_revenue,
      COUNT(DISTINCT oi.order_id) as order_count
     FROM order_items oi
     JOIN orders o ON oi.order_id = o.id
     WHERE o.status = 'confirmed'`
  
  const params = []
  let paramCount = 1

  if (dateFrom) {
    sql += ` AND o.created_at >= $${paramCount}`
    params.push(dateFrom)
    paramCount++
  }

  if (dateTo) {
    sql += ` AND o.created_at <= $${paramCount}`
    params.push(dateTo)
    paramCount++
  }

  sql += ` GROUP BY oi.sku, oi.product_name
           ORDER BY total_quantity DESC
           LIMIT $${paramCount}`

  params.push(limit)

  const result = await query(sql, params)
  return result.rows.map(row => ({
    sku: row.sku,
    productName: row.product_name,
    totalQuantity: parseInt(row.total_quantity),
    totalRevenue: parseFloat(row.total_revenue),
    orderCount: parseInt(row.order_count)
  }))
}

/**
 * Reporte de clientes
 */
export async function getClientsReport(limit = 10) {
  const result = await query(
    `SELECT 
      o.user_id,
      COUNT(DISTINCT o.id) as order_count,
      SUM(o.total) as total_spent,
      AVG(o.total) as avg_order_value,
      MAX(o.created_at) as last_order_date
     FROM orders o
     WHERE o.status = 'confirmed'
     GROUP BY o.user_id
     ORDER BY total_spent DESC
     LIMIT $1`,
    [limit]
  )

  return result.rows.map(row => ({
    userId: row.user_id,
    orderCount: parseInt(row.order_count),
    totalSpent: parseFloat(row.total_spent),
    avgOrderValue: parseFloat(row.avg_order_value),
    lastOrderDate: row.last_order_date
  }))
}

/**
 * Dashboard - Estadísticas generales
 */
export async function getDashboardStats(dateFrom, dateTo) {
  // Ventas del período
  const salesResult = await query(
    `SELECT 
      COUNT(*) as total_orders,
      SUM(total) as total_revenue,
      AVG(total) as avg_order_value
     FROM orders
     WHERE status = 'confirmed'
       AND created_at >= $1 
       AND created_at <= $2`,
    [dateFrom, dateTo]
  )

  // Facturas emitidas
  const invoicesResult = await query(
    `SELECT 
      COUNT(*) as total_invoices,
      SUM(total_amount) as total_invoiced
     FROM invoices
     WHERE status = 'issued'
       AND issue_date >= $1 
       AND issue_date <= $2`,
    [dateFrom, dateTo]
  )

  // Pagos recibidos
  const paymentsResult = await query(
    `SELECT 
      COUNT(*) as total_payments,
      SUM(amount) as total_paid
     FROM payments
     WHERE status = 'confirmed'
       AND payment_date >= $1 
       AND payment_date <= $2`,
    [dateFrom, dateTo]
  )

  // Cuentas por cobrar pendientes
  const arResult = await query(
    `SELECT 
      COUNT(*) as pending_accounts,
      SUM(balance) as total_balance
     FROM accounts_receivable
     WHERE status IN ('pending', 'partial')`
  )

  // Productos con stock bajo
  const lowStockResult = await query(
    `SELECT COUNT(*) as low_stock_count
     FROM products
     WHERE stock <= 10 AND stock >= 0`
  )

  return {
    sales: {
      totalOrders: parseInt(salesResult.rows[0]?.total_orders || 0),
      totalRevenue: parseFloat(salesResult.rows[0]?.total_revenue || 0),
      avgOrderValue: parseFloat(salesResult.rows[0]?.avg_order_value || 0)
    },
    invoices: {
      totalInvoices: parseInt(invoicesResult.rows[0]?.total_invoices || 0),
      totalInvoiced: parseFloat(invoicesResult.rows[0]?.total_invoiced || 0)
    },
    payments: {
      totalPayments: parseInt(paymentsResult.rows[0]?.total_payments || 0),
      totalPaid: parseFloat(paymentsResult.rows[0]?.total_paid || 0)
    },
    accountsReceivable: {
      pendingAccounts: parseInt(arResult.rows[0]?.pending_accounts || 0),
      totalBalance: parseFloat(arResult.rows[0]?.total_balance || 0)
    },
    inventory: {
      lowStockCount: parseInt(lowStockResult.rows[0]?.low_stock_count || 0)
    }
  }
}

/**
 * Reporte de inventario
 */
export async function getInventoryReport() {
  const result = await query(
    `SELECT 
      p.*,
      COALESCE(SUM(CASE WHEN sm.movement_type = 'entrada' THEN sm.quantity ELSE 0 END), 0) as total_entradas,
      COALESCE(SUM(CASE WHEN sm.movement_type = 'salida' THEN ABS(sm.quantity) ELSE 0 END), 0) as total_salidas
     FROM products p
     LEFT JOIN stock_movements sm ON p.id = sm.product_id
     GROUP BY p.id
     ORDER BY p.stock ASC`
  )

  return result.rows.map(row => ({
    id: row.id,
    sku: row.sku,
    name: row.name,
    stock: row.stock,
    price: parseFloat(row.price),
    totalEntradas: parseInt(row.total_entradas),
    totalSalidas: parseInt(row.total_salidas),
    valorizacion: row.stock * parseFloat(row.price)
  }))
}

export default {
  getSalesReport,
  getTopProducts,
  getClientsReport,
  getDashboardStats,
  getInventoryReport
}


