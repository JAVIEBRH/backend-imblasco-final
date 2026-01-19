/**
 * REPORT SERVICE (MongoDB)
 * Servicio de reportes y analytics
 */

import { Order } from '../models/index.js'
import { Invoice } from '../models/index.js'
import { Payment } from '../models/index.js'
import { Product } from '../models/index.js'

/**
 * Reporte de ventas por período
 */
export async function getSalesReport(dateFrom, dateTo) {
  try {
    const orders = await Order.aggregate([
      {
        $match: {
          status: 'confirmed',
          createdAt: {
            $gte: new Date(dateFrom),
            $lte: new Date(dateTo)
          }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          order_count: { $sum: 1 },
          total_sales: { $sum: '$total_amount' },
          avg_order_value: { $avg: '$total_amount' }
        }
      },
      {
        $sort: { _id: 1 }
      },
      {
        $project: {
          _id: 0,
          date: '$_id',
          order_count: 1,
          total_sales: 1,
          avg_order_value: 1
        }
      }
    ])

    return orders.map(row => ({
      date: row.date,
      orderCount: parseInt(row.order_count),
      totalSales: parseFloat(row.total_sales || 0),
      avgOrderValue: parseFloat(row.avg_order_value || 0)
    }))
  } catch (error) {
    console.error('[REPORT] Error getting sales report:', error)
    return []
  }
}

/**
 * Reporte de productos más vendidos
 */
export async function getTopProducts(limit = 10, dateFrom, dateTo) {
  try {
    const matchStage = {
      status: 'confirmed'
    }

    if (dateFrom || dateTo) {
      matchStage.createdAt = {}
      if (dateFrom) matchStage.createdAt.$gte = new Date(dateFrom)
      if (dateTo) matchStage.createdAt.$lte = new Date(dateTo)
    }

    const orders = await Order.find(matchStage).lean()

    // Agregar productos manualmente
    const productStats = {}
    
    orders.forEach(order => {
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach(item => {
          const sku = item.codigo || item.sku
          if (!productStats[sku]) {
            productStats[sku] = {
              sku,
              productName: item.nombre || item.productName || sku,
              totalQuantity: 0,
              totalRevenue: 0,
              orderCount: new Set()
            }
          }
          productStats[sku].totalQuantity += item.cantidad || item.quantity || 0
          productStats[sku].totalRevenue += item.subtotal || (item.precio || 0) * (item.cantidad || 0)
          productStats[sku].orderCount.add(order._id.toString())
        })
      }
    })

    // Convertir a array y ordenar
    const products = Object.values(productStats).map(stat => ({
      sku: stat.sku,
      productName: stat.productName,
      totalQuantity: stat.totalQuantity,
      totalRevenue: stat.totalRevenue,
      orderCount: stat.orderCount.size
    }))

    products.sort((a, b) => b.totalQuantity - a.totalQuantity)
    
    return products.slice(0, limit)
  } catch (error) {
    console.error('[REPORT] Error getting top products:', error)
    return []
  }
}

/**
 * Reporte de clientes
 */
export async function getClientsReport(limit = 10) {
  try {
    const orders = await Order.aggregate([
      {
        $match: { status: 'confirmed' }
      },
      {
        $group: {
          _id: '$user_id',
          order_count: { $sum: 1 },
          total_spent: { $sum: '$total_amount' },
          avg_order_value: { $avg: '$total_amount' },
          last_order_date: { $max: '$createdAt' }
        }
      },
      {
        $sort: { total_spent: -1 }
      },
      {
        $limit: limit
      },
      {
        $project: {
          _id: 0,
          userId: '$_id',
          order_count: 1,
          total_spent: 1,
          avg_order_value: 1,
          last_order_date: 1
        }
      }
    ])

    return orders.map(row => ({
      userId: row.userId,
      orderCount: parseInt(row.order_count),
      totalSpent: parseFloat(row.total_spent || 0),
      avgOrderValue: parseFloat(row.avg_order_value || 0),
      lastOrderDate: row.last_order_date
    }))
  } catch (error) {
    console.error('[REPORT] Error getting clients report:', error)
    return []
  }
}

/**
 * Dashboard - Estadísticas generales
 */
export async function getDashboardStats(dateFrom, dateTo) {
  try {
    const dateFilter = {}
    if (dateFrom) dateFilter.$gte = new Date(dateFrom)
    if (dateTo) dateFilter.$lte = new Date(dateTo)

    // Ventas del período
    const salesAgg = await Order.aggregate([
      {
        $match: {
          status: 'confirmed',
          ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter })
        }
      },
      {
        $group: {
          _id: null,
          total_orders: { $sum: 1 },
          total_revenue: { $sum: '$total_amount' },
          avg_order_value: { $avg: '$total_amount' }
        }
      }
    ])

    // Facturas emitidas
    const invoiceDateFilter = {}
    if (dateFrom) invoiceDateFilter.$gte = new Date(dateFrom)
    if (dateTo) invoiceDateFilter.$lte = new Date(dateTo)

    const invoicesAgg = await Invoice.aggregate([
      {
        $match: {
          status: 'issued',
          ...(Object.keys(invoiceDateFilter).length > 0 && { issue_date: invoiceDateFilter })
        }
      },
      {
        $group: {
          _id: null,
          total_invoices: { $sum: 1 },
          total_invoiced: { $sum: '$total_amount' }
        }
      }
    ])

    // Pagos recibidos
    const paymentDateFilter = {}
    if (dateFrom) paymentDateFilter.$gte = new Date(dateFrom)
    if (dateTo) paymentDateFilter.$lte = new Date(dateTo)

    const paymentsAgg = await Payment.aggregate([
      {
        $match: {
          status: 'confirmed',
          ...(Object.keys(paymentDateFilter).length > 0 && { payment_date: paymentDateFilter })
        }
      },
      {
        $group: {
          _id: null,
          total_payments: { $sum: 1 },
          total_paid: { $sum: '$amount' }
        }
      }
    ])

    // Productos con stock bajo
    const lowStockCount = await Product.countDocuments({
      stock: { $lte: 10, $gte: 0 }
    })

    return {
      sales: {
        totalOrders: parseInt(salesAgg[0]?.total_orders || 0),
        totalRevenue: parseFloat(salesAgg[0]?.total_revenue || 0),
        avgOrderValue: parseFloat(salesAgg[0]?.avg_order_value || 0)
      },
      invoices: {
        totalInvoices: parseInt(invoicesAgg[0]?.total_invoices || 0),
        totalInvoiced: parseFloat(invoicesAgg[0]?.total_invoiced || 0)
      },
      payments: {
        totalPayments: parseInt(paymentsAgg[0]?.total_payments || 0),
        totalPaid: parseFloat(paymentsAgg[0]?.total_paid || 0)
      },
      accountsReceivable: {
        pendingAccounts: 0, // Simplificado - se puede calcular desde invoices
        totalBalance: 0
      },
      inventory: {
        lowStockCount: lowStockCount
      }
    }
  } catch (error) {
    console.error('[REPORT] Error getting dashboard stats:', error)
    return {
      sales: { totalOrders: 0, totalRevenue: 0, avgOrderValue: 0 },
      invoices: { totalInvoices: 0, totalInvoiced: 0 },
      payments: { totalPayments: 0, totalPaid: 0 },
      accountsReceivable: { pendingAccounts: 0, totalBalance: 0 },
      inventory: { lowStockCount: 0 }
    }
  }
}

/**
 * Reporte de inventario
 */
export async function getInventoryReport() {
  try {
    const products = await Product.find()
      .sort({ stock: 1 })
      .lean()

    // Obtener movimientos de stock para cada producto
    const skus = products.map(p => p.sku)
    const movements = await StockMovement.aggregate([
      {
        $match: { sku: { $in: skus } }
      },
      {
        $group: {
          _id: '$sku',
          total_entradas: {
            $sum: {
              $cond: [
                { $in: ['$movement_type', ['purchase', 'adjustment', 'return']] },
                { $abs: '$quantity' },
                0
              ]
            }
          },
          total_salidas: {
            $sum: {
              $cond: [
                { $eq: ['$movement_type', 'sale'] },
                { $abs: '$quantity' },
                0
              ]
            }
          }
        }
      }
    ])

    const movementMap = {}
    movements.forEach(m => {
      movementMap[m._id] = {
        totalEntradas: m.total_entradas,
        totalSalidas: m.total_salidas
      }
    })

    return products.map(product => {
      const movement = movementMap[product.sku] || { totalEntradas: 0, totalSalidas: 0 }
      return {
        id: product._id.toString(),
        sku: product.sku,
        name: product.name,
        stock: product.stock,
        price: parseFloat(product.price) || 0,
        totalEntradas: movement.totalEntradas,
        totalSalidas: movement.totalSalidas,
        valorizacion: product.stock * (parseFloat(product.price) || 0)
      }
    })
  } catch (error) {
    console.error('[REPORT] Error getting inventory report:', error)
    return []
  }
}

export default {
  getSalesReport,
  getTopProducts,
  getClientsReport,
  getDashboardStats,
  getInventoryReport
}
