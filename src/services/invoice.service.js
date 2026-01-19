/**
 * INVOICE SERVICE (MongoDB)
 * Servicio completo de facturación
 */

import { Invoice } from '../models/index.js'
import * as orderService from './order.service.js'
import * as clientService from './client.service.js'
import { calculateInvoiceAmounts } from './order-invoicing.service.js'
import mongoose from '../config/database.js'

/**
 * Generar número de factura secuencial
 * Formato: FAC-YYYYMMDD-XXXX
 */
async function generateInvoiceNumber() {
  const today = new Date()
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
  
  // Obtener el último número del día
  const lastInvoice = await Invoice.findOne({
    invoice_number: { $regex: `^FAC-${dateStr}-` }
  })
    .sort({ invoice_number: -1 })
    .lean()

  let sequence = 1
  if (lastInvoice) {
    const lastNumber = lastInvoice.invoice_number
    const lastSeq = parseInt(lastNumber.split('-')[2]) || 0
    sequence = lastSeq + 1
  }

  return `FAC-${dateStr}-${sequence.toString().padStart(4, '0')}`
}

/**
 * Crear factura desde un pedido
 * @param {string|number} orderId - ID del pedido
 * @param {string} invoiceType - Tipo de factura (factura, boleta)
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<Object>} Factura creada
 */
export async function createInvoiceFromOrder(orderId, invoiceType = 'factura', options = {}) {
  try {
    // Obtener pedido
    const order = await orderService.getOrder(orderId)
    if (!order) {
      throw new Error(`Pedido ${orderId} no encontrado`)
    }

    if (order.status !== 'confirmed' && order.status !== 'sent_to_erp') {
      throw new Error(`El pedido debe estar confirmado o enviado al ERP para facturar`)
    }

    // Verificar que no exista factura para este pedido
    const existingInvoice = await Invoice.findOne({
      order_id: orderId.toString(),
      status: { $ne: 'cancelled' }
    }).lean()

    if (existingInvoice) {
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
    const invoice = await Invoice.create({
      invoice_number: invoiceNumber,
      order_id: orderId.toString(),
      client_id: order.userId,
      invoice_type: invoiceType,
      status: 'issued',
      net_amount: netAmount,
      iva_amount: ivaAmount,
      total_amount: totalAmount,
      client_rut: clientData.rut,
      client_name: clientData.razon_social,
      client_address: `${clientData.direccion}, ${clientData.comuna}`,
      client_commune: clientData.comuna,
      issue_date: new Date(),
      due_date: options.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 días por defecto
      created_by: options.createdBy || 'system'
    })

    // Actualizar estado del pedido
    await orderService.updateOrderStatus(orderId, 'invoiced')

    return await getInvoice(invoice._id.toString())
  } catch (error) {
    console.error('[INVOICE] Error creating invoice:', error)
    throw error
  }
}

/**
 * Obtener factura por ID
 */
export async function getInvoice(invoiceId) {
  try {
    let invoice = null
    
    if (mongoose.Types.ObjectId.isValid(invoiceId)) {
      invoice = await Invoice.findById(invoiceId).lean()
    } else {
      invoice = await Invoice.findOne({ invoice_number: invoiceId }).lean()
    }
    
    if (!invoice) return null

    // Obtener items del pedido asociado
    const order = await orderService.getOrder(invoice.order_id)
    const items = order?.items || []

    return {
      id: invoice._id.toString(),
      invoiceNumber: invoice.invoice_number,
      orderId: invoice.order_id,
      clientId: invoice.client_id,
      invoiceType: invoice.invoice_type,
      status: invoice.status,
      netAmount: parseFloat(invoice.net_amount),
      ivaAmount: parseFloat(invoice.iva_amount),
      totalAmount: parseFloat(invoice.total_amount),
      clientRut: invoice.client_rut,
      clientName: invoice.client_name,
      clientAddress: invoice.client_address,
      clientCommune: invoice.client_commune,
      issueDate: invoice.issue_date,
      dueDate: invoice.due_date,
      paidDate: invoice.paid_date,
      notes: invoice.notes || '',
      items: items,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt
    }
  } catch (error) {
    console.error('[INVOICE] Error getting invoice:', error)
    return null
  }
}

/**
 * Obtener todas las facturas
 */
export async function getAllInvoices(filters = {}) {
  try {
    const query = {}

    if (filters.status) {
      query.status = filters.status
    }

    if (filters.clientId) {
      query.client_id = filters.clientId
    }

    if (filters.dateFrom || filters.dateTo) {
      query.issue_date = {}
      if (filters.dateFrom) {
        query.issue_date.$gte = new Date(filters.dateFrom)
      }
      if (filters.dateTo) {
        query.issue_date.$lte = new Date(filters.dateTo)
      }
    }

    const invoices = await Invoice.find(query)
      .sort({ issue_date: -1, invoice_number: -1 })
      .lean()

    return invoices.map(invoice => ({
      id: invoice._id.toString(),
      invoiceNumber: invoice.invoice_number,
      orderId: invoice.order_id,
      clientId: invoice.client_id,
      invoiceType: invoice.invoice_type,
      status: invoice.status,
      netAmount: parseFloat(invoice.net_amount),
      ivaAmount: parseFloat(invoice.iva_amount),
      totalAmount: parseFloat(invoice.total_amount),
      clientName: invoice.client_name,
      issueDate: invoice.issue_date,
      dueDate: invoice.due_date,
      totalItems: 0, // Se puede calcular desde el pedido si es necesario
      createdAt: invoice.createdAt
    }))
  } catch (error) {
    console.error('[INVOICE] Error getting all invoices:', error)
    return []
  }
}

/**
 * Cancelar factura
 */
export async function cancelInvoice(invoiceId, reason) {
  try {
    let invoice = null
    
    if (mongoose.Types.ObjectId.isValid(invoiceId)) {
      invoice = await Invoice.findByIdAndUpdate(
        invoiceId,
        {
          $set: {
            status: 'cancelled',
            notes: reason ? `Cancelada: ${reason}` : 'Cancelada: Sin razón especificada',
            updatedAt: new Date()
          }
        },
        { new: true }
      ).lean()
    } else {
      invoice = await Invoice.findOneAndUpdate(
        { invoice_number: invoiceId },
        {
          $set: {
            status: 'cancelled',
            notes: reason ? `Cancelada: ${reason}` : 'Cancelada: Sin razón especificada',
            updatedAt: new Date()
          }
        },
        { new: true }
      ).lean()
    }
    
    if (!invoice) {
      throw new Error('Factura no encontrada')
    }

    return await getInvoice(invoice._id?.toString() || invoiceId)
  } catch (error) {
    console.error('[INVOICE] Error cancelling invoice:', error)
    throw error
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
