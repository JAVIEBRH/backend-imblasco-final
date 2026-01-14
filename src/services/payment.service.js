/**
 * PAYMENT SERVICE
 * Servicio de gestión de pagos
 */

import { query, getClient } from '../config/database.js'
import * as invoiceService from './invoice.service.js'

/**
 * Registrar pago
 */
export async function registerPayment(paymentData) {
  const client = await getClient()
  
  try {
    await client.query('BEGIN')

    // Verificar factura si existe
    if (paymentData.invoiceId) {
      const invoice = await invoiceService.getInvoice(paymentData.invoiceId)
      if (!invoice) {
        throw new Error('Factura no encontrada')
      }
    }

    // Crear pago
    const result = await client.query(
      `INSERT INTO payments (
        invoice_id, order_id, client_id, payment_type, payment_method,
        amount, payment_date, reference_number, notes, status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        paymentData.invoiceId || null,
        paymentData.orderId || null,
        paymentData.clientId,
        paymentData.paymentType,
        paymentData.paymentMethod || null,
        paymentData.amount,
        paymentData.paymentDate || new Date(),
        paymentData.referenceNumber || null,
        paymentData.notes || null,
        paymentData.status || 'pending',
        paymentData.createdBy || 'system'
      ]
    )

    const payment = result.rows[0]

    // Si hay factura, actualizar cuenta por cobrar
    if (paymentData.invoiceId) {
      await updateAccountsReceivable(paymentData.invoiceId, paymentData.amount)
      
      // Actualizar fecha de pago en factura si está completamente pagada
      const ar = await query(
        'SELECT balance FROM accounts_receivable WHERE invoice_id = $1',
        [paymentData.invoiceId]
      )
      
      if (ar.rows.length > 0 && parseFloat(ar.rows[0].balance) <= 0) {
        await query(
          'UPDATE invoices SET paid_date = CURRENT_DATE WHERE id = $1',
          [paymentData.invoiceId]
        )
      }
    }

    await client.query('COMMIT')

    return await getPayment(payment.id)

  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

/**
 * Actualizar cuenta por cobrar
 */
async function updateAccountsReceivable(invoiceId, paymentAmount) {
  const ar = await query(
    'SELECT * FROM accounts_receivable WHERE invoice_id = $1',
    [invoiceId]
  )

  if (ar.rows.length === 0) return

  const current = ar.rows[0]
  const newPaidAmount = parseFloat(current.paid_amount) + parseFloat(paymentAmount)
  const newBalance = parseFloat(current.original_amount) - newPaidAmount

  let status = 'partial'
  if (newBalance <= 0) {
    status = 'paid'
  }

  await query(
    `UPDATE accounts_receivable 
     SET paid_amount = $1, balance = $2, status = $3, updated_at = CURRENT_TIMESTAMP
     WHERE invoice_id = $4`,
    [newPaidAmount, Math.max(0, newBalance), status, invoiceId]
  )
}

/**
 * Obtener pago por ID
 */
export async function getPayment(paymentId) {
  const result = await query(
    'SELECT * FROM payments WHERE id = $1',
    [paymentId]
  )

  if (result.rows.length === 0) return null

  const row = result.rows[0]
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    orderId: row.order_id,
    clientId: row.client_id,
    paymentType: row.payment_type,
    paymentMethod: row.payment_method,
    amount: parseFloat(row.amount),
    paymentDate: row.payment_date,
    referenceNumber: row.reference_number,
    notes: row.notes,
    status: row.status,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at
  }
}

/**
 * Obtener pagos por filtros
 */
export async function getPayments(filters = {}) {
  let sql = 'SELECT * FROM payments WHERE 1=1'
  const params = []
  let paramCount = 1

  if (filters.invoiceId) {
    sql += ` AND invoice_id = $${paramCount}`
    params.push(filters.invoiceId)
    paramCount++
  }

  if (filters.clientId) {
    sql += ` AND client_id = $${paramCount}`
    params.push(filters.clientId)
    paramCount++
  }

  if (filters.status) {
    sql += ` AND status = $${paramCount}`
    params.push(filters.status)
    paramCount++
  }

  if (filters.dateFrom) {
    sql += ` AND payment_date >= $${paramCount}`
    params.push(filters.dateFrom)
    paramCount++
  }

  if (filters.dateTo) {
    sql += ` AND payment_date <= $${paramCount}`
    params.push(filters.dateTo)
    paramCount++
  }

  sql += ' ORDER BY payment_date DESC, created_at DESC'

  const result = await query(sql, params)
  return result.rows.map(row => ({
    id: row.id,
    invoiceId: row.invoice_id,
    orderId: row.order_id,
    clientId: row.client_id,
    paymentType: row.payment_type,
    paymentMethod: row.payment_method,
    amount: parseFloat(row.amount),
    paymentDate: row.payment_date,
    referenceNumber: row.reference_number,
    status: row.status,
    createdAt: row.created_at
  }))
}

/**
 * Confirmar pago
 */
export async function confirmPayment(paymentId) {
  const result = await query(
    `UPDATE payments 
     SET status = 'confirmed', confirmed_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [paymentId]
  )

  if (result.rows.length === 0) {
    throw new Error('Pago no encontrado')
  }

  return await getPayment(paymentId)
}

export default {
  registerPayment,
  getPayment,
  getPayments,
  confirmPayment
}


