/**
 * INVOICE SERVICE
 * Servicio completo de facturación
 */

import { query, getClient } from '../config/database.js'
import * as orderService from './order.service.js'
import * as clientService from './client.service.js'
import { calculateInvoiceAmounts } from './order-invoicing.service.js'

/**
 * Generar número de factura secuencial
 * Formato: FAC-YYYYMMDD-XXXX
 */
async function generateInvoiceNumber() {
  const today = new Date()
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
  
  // Obtener el último número del día
  const result = await query(
    `SELECT invoice_number FROM invoices 
     WHERE invoice_number LIKE $1 
     ORDER BY invoice_number DESC 
     LIMIT 1`,
    [`FAC-${dateStr}-%`]
  )

  let sequence = 1
  if (result.rows.length > 0) {
    const lastNumber = result.rows[0].invoice_number
    const lastSeq = parseInt(lastNumber.split('-')[2]) || 0
    sequence = lastSeq + 1
  }

  return `FAC-${dateStr}-${sequence.toString().padStart(4, '0')}`
}

/**
 * Crear factura desde un pedido
 * @param {number} orderId - ID del pedido
 * @param {string} invoiceType - Tipo de factura (factura, boleta)
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<Object>} Factura creada
 */
export async function createInvoiceFromOrder(orderId, invoiceType = 'factura', options = {}) {
  const client = await getClient()
  
  try {
    await client.query('BEGIN')

    // Obtener pedido
    const order = await orderService.getOrder(orderId)
    if (!order) {
      throw new Error(`Pedido ${orderId} no encontrado`)
    }

    if (order.status !== 'confirmed' && order.status !== 'sent_to_erp') {
      throw new Error(`El pedido debe estar confirmado o enviado al ERP para facturar`)
    }

    // Verificar que no exista factura para este pedido
    const existingInvoice = await query(
      'SELECT id FROM invoices WHERE order_id = $1 AND status != $2',
      [orderId, 'cancelled']
    )

    if (existingInvoice.rows.length > 0) {
      throw new Error('Ya existe una factura para este pedido')
    }

    // Obtener datos del cliente
    const clientData = await clientService.getClientData(order.userId)
    
    // Calcular montos
    const netAmount = parseFloat(order.total) || 0
    const { ivaAmount, totalAmount } = calculateInvoiceAmounts(netAmount)

    // Generar número de factura
    const invoiceNumber = await generateInvoiceNumber()

    // Crear factura
    const invoiceResult = await client.query(
      `INSERT INTO invoices (
        invoice_number, order_id, client_id, invoice_type, status,
        net_amount, iva_amount, total_amount,
        client_rut, client_name, client_address, client_commune,
        issue_date, due_date, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        invoiceNumber,
        orderId,
        order.userId,
        invoiceType,
        'issued',
        netAmount,
        ivaAmount,
        totalAmount,
        clientData.rut,
        clientData.razon_social,
        `${clientData.direccion}, ${clientData.comuna}`,
        clientData.comuna,
        new Date(),
        options.dueDate || null,
        options.createdBy || 'system'
      ]
    )

    const invoice = invoiceResult.rows[0]

    // Crear items de factura
    for (const item of order.items || []) {
      await client.query(
        `INSERT INTO invoice_items (
          invoice_id, sku, product_name, quantity, unit_price, subtotal
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          invoice.id,
          item.codigo || item.sku,
          item.nombre || item.productName,
          item.cantidad || item.quantity,
          item.precioUnitario || item.unitPrice,
          item.subtotal
        ]
      )
    }

    // Crear cuenta por cobrar
    await client.query(
      `INSERT INTO accounts_receivable (
        invoice_id, client_id, original_amount, balance, due_date, status
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        invoice.id,
        order.userId,
        totalAmount,
        totalAmount,
        options.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 días por defecto
        'pending'
      ]
    )

    // Actualizar estado del pedido
    await orderService.updateOrderStatus(orderId, 'invoiced')

    await client.query('COMMIT')

    return await getInvoice(invoice.id)

  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

/**
 * Obtener factura por ID
 */
export async function getInvoice(invoiceId) {
  const result = await query(
    `SELECT i.*, 
            COALESCE(json_agg(ii.* ORDER BY ii.id) FILTER (WHERE ii.id IS NOT NULL), '[]') as items
     FROM invoices i
     LEFT JOIN invoice_items ii ON i.id = ii.invoice_id
     WHERE i.id = $1
     GROUP BY i.id`,
    [invoiceId]
  )

  if (result.rows.length === 0) return null

  const row = result.rows[0]
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    orderId: row.order_id,
    clientId: row.client_id,
    invoiceType: row.invoice_type,
    status: row.status,
    netAmount: parseFloat(row.net_amount),
    ivaAmount: parseFloat(row.iva_amount),
    totalAmount: parseFloat(row.total_amount),
    clientRut: row.client_rut,
    clientName: row.client_name,
    clientAddress: row.client_address,
    clientCommune: row.client_commune,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    paidDate: row.paid_date,
    erpReference: row.erp_reference,
    siiFolio: row.sii_folio,
    notes: row.notes,
    items: Array.isArray(row.items) ? row.items : (row.items ? [row.items] : []),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/**
 * Obtener todas las facturas
 */
export async function getAllInvoices(filters = {}) {
  let sql = `SELECT i.*, 
                    COALESCE(json_agg(ii.* ORDER BY ii.id) FILTER (WHERE ii.id IS NOT NULL), '[]') as items
             FROM invoices i
             LEFT JOIN invoice_items ii ON i.id = ii.invoice_id`
  
  const conditions = []
  const params = []
  let paramCount = 1

  if (filters.status) {
    conditions.push(`i.status = $${paramCount}`)
    params.push(filters.status)
    paramCount++
  }

  if (filters.clientId) {
    conditions.push(`i.client_id = $${paramCount}`)
    params.push(filters.clientId)
    paramCount++
  }

  if (filters.dateFrom) {
    conditions.push(`i.issue_date >= $${paramCount}`)
    params.push(filters.dateFrom)
    paramCount++
  }

  if (filters.dateTo) {
    conditions.push(`i.issue_date <= $${paramCount}`)
    params.push(filters.dateTo)
    paramCount++
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ')
  }

  sql += ' GROUP BY i.id ORDER BY i.issue_date DESC, i.invoice_number DESC'

  const result = await query(sql, params)
  return result.rows.map(row => ({
    id: row.id,
    invoiceNumber: row.invoice_number,
    orderId: row.order_id,
    clientId: row.client_id,
    invoiceType: row.invoice_type,
    status: row.status,
    netAmount: parseFloat(row.net_amount),
    ivaAmount: parseFloat(row.iva_amount),
    totalAmount: parseFloat(row.total_amount),
    clientName: row.client_name,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    totalItems: Array.isArray(row.items) ? row.items.length : 0,
    createdAt: row.created_at
  }))
}

/**
 * Cancelar factura
 */
export async function cancelInvoice(invoiceId, reason) {
  const client = await getClient()
  
  try {
    await client.query('BEGIN')

    // Verificar que la factura existe y no esté cancelada
    const invoice = await getInvoice(invoiceId)
    if (!invoice) {
      throw new Error('Factura no encontrada')
    }

    if (invoice.status === 'cancelled') {
      throw new Error('La factura ya está cancelada')
    }

    // Actualizar factura
    await client.query(
      `UPDATE invoices 
       SET status = 'cancelled', notes = COALESCE(notes || E'\n', '') || $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [`Cancelada: ${reason || 'Sin razón especificada'}`, invoiceId]
    )

    // Actualizar cuenta por cobrar
    await client.query(
      `UPDATE accounts_receivable 
       SET status = 'written_off', balance = 0
       WHERE invoice_id = $1`,
      [invoiceId]
    )

    await client.query('COMMIT')
    return await getInvoice(invoiceId)

  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

/**
 * Generar PDF de factura (mockup - retorna datos para generar PDF)
 */
export async function generateInvoicePDF(invoiceId) {
  const invoice = await getInvoice(invoiceId)
  if (!invoice) {
    throw new Error('Factura no encontrada')
  }

  // En producción, aquí se generaría el PDF real
  // Por ahora retornamos los datos estructurados para generar PDF
  return {
    invoice,
    pdfData: {
      // Datos estructurados para generar PDF
      company: {
        name: 'ImBlasco S.A.',
        rut: '76.123.456-7',
        address: 'Álvarez de Toledo 981, San Miguel',
        phone: '225443327'
      },
      client: {
        rut: invoice.clientRut,
        name: invoice.clientName,
        address: invoice.clientAddress
      },
      invoice: {
        number: invoice.invoiceNumber,
        date: invoice.issueDate,
        dueDate: invoice.dueDate,
        items: invoice.items,
        netAmount: invoice.netAmount,
        ivaAmount: invoice.ivaAmount,
        totalAmount: invoice.totalAmount
      }
    }
  }
}

export default {
  createInvoiceFromOrder,
  getInvoice,
  getAllInvoices,
  cancelInvoice,
  generateInvoicePDF
}


