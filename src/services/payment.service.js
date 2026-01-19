/**
 * PAYMENT SERVICE (MongoDB)
 * Servicio de gestión de pagos
 */

import { Payment } from '../models/index.js'
import { Invoice } from '../models/index.js'
import * as invoiceService from './invoice.service.js'
import mongoose from '../config/database.js'

/**
 * Registrar pago
 */
export async function registerPayment(paymentData) {
  try {
    // Verificar factura si existe
    if (paymentData.invoiceId) {
      const invoice = await invoiceService.getInvoice(paymentData.invoiceId)
      if (!invoice) {
        throw new Error('Factura no encontrada')
      }
    }

    // Crear pago
    const payment = await Payment.create({
      invoice_id: paymentData.invoiceId || null,
      order_id: paymentData.orderId || null,
      client_id: paymentData.clientId,
      payment_type: paymentData.paymentType,
      payment_method: paymentData.paymentMethod || null,
      amount: paymentData.amount,
      payment_date: paymentData.paymentDate || new Date(),
      reference_number: paymentData.referenceNumber || null,
      notes: paymentData.notes || null,
      status: paymentData.status || 'pending',
      created_by: paymentData.createdBy || 'system'
    })

    // Si hay factura, actualizar cuenta por cobrar (simplificado)
    if (paymentData.invoiceId) {
      // Actualizar fecha de pago en factura si está completamente pagada
      // Por ahora simplificado - en producción se calcularía el balance
      const invoice = await Invoice.findOne({ 
        _id: mongoose.Types.ObjectId.isValid(paymentData.invoiceId) 
          ? paymentData.invoiceId 
          : null 
      }).lean()
      
      if (invoice) {
        // Si el monto del pago es igual o mayor al total, marcar como pagada
        if (paymentData.amount >= invoice.total_amount) {
          await Invoice.findByIdAndUpdate(
            invoice._id,
            {
              $set: {
                status: 'paid',
                paid_date: new Date(),
                updatedAt: new Date()
              }
            }
          )
        }
      }
    }

    return await getPayment(payment._id.toString())
  } catch (error) {
    console.error('[PAYMENT] Error registering payment:', error)
    throw error
  }
}

/**
 * Obtener pago por ID
 */
export async function getPayment(paymentId) {
  try {
    let payment = null
    
    if (mongoose.Types.ObjectId.isValid(paymentId)) {
      payment = await Payment.findById(paymentId).lean()
    }
    
    if (!payment) return null

    return {
      id: payment._id.toString(),
      invoiceId: payment.invoice_id,
      orderId: payment.order_id,
      clientId: payment.client_id,
      paymentType: payment.payment_type,
      paymentMethod: payment.payment_method,
      amount: parseFloat(payment.amount),
      paymentDate: payment.payment_date,
      referenceNumber: payment.reference_number,
      notes: payment.notes,
      status: payment.status,
      confirmedAt: payment.confirmed_at,
      createdAt: payment.createdAt
    }
  } catch (error) {
    console.error('[PAYMENT] Error getting payment:', error)
    return null
  }
}

/**
 * Obtener pagos por filtros
 */
export async function getPayments(filters = {}) {
  try {
    const query = {}

    if (filters.invoiceId) {
      query.invoice_id = filters.invoiceId
    }

    if (filters.clientId) {
      query.client_id = filters.clientId
    }

    if (filters.status) {
      query.status = filters.status
    }

    if (filters.dateFrom || filters.dateTo) {
      query.payment_date = {}
      if (filters.dateFrom) {
        query.payment_date.$gte = new Date(filters.dateFrom)
      }
      if (filters.dateTo) {
        query.payment_date.$lte = new Date(filters.dateTo)
      }
    }

    const payments = await Payment.find(query)
      .sort({ payment_date: -1, createdAt: -1 })
      .lean()

    return payments.map(payment => ({
      id: payment._id.toString(),
      invoiceId: payment.invoice_id,
      orderId: payment.order_id,
      clientId: payment.client_id,
      paymentType: payment.payment_type,
      paymentMethod: payment.payment_method,
      amount: parseFloat(payment.amount),
      paymentDate: payment.payment_date,
      referenceNumber: payment.reference_number,
      status: payment.status,
      createdAt: payment.createdAt
    }))
  } catch (error) {
    console.error('[PAYMENT] Error getting payments:', error)
    return []
  }
}

/**
 * Confirmar pago
 */
export async function confirmPayment(paymentId) {
  try {
    let payment = null
    
    if (mongoose.Types.ObjectId.isValid(paymentId)) {
      payment = await Payment.findByIdAndUpdate(
        paymentId,
        {
          $set: {
            status: 'confirmed',
            confirmed_at: new Date(),
            updatedAt: new Date()
          }
        },
        { new: true }
      ).lean()
    }
    
    if (!payment) {
      throw new Error('Pago no encontrado')
    }

    return await getPayment(paymentId)
  } catch (error) {
    console.error('[PAYMENT] Error confirming payment:', error)
    throw error
  }
}

export default {
  registerPayment,
  getPayment,
  getPayments,
  confirmPayment
}
