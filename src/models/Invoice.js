/**
 * INVOICE MODEL (MongoDB)
 * Modelo para facturas
 */

import mongoose from 'mongoose';

const invoiceSchema = new mongoose.Schema({
  invoice_number: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  order_id: {
    type: String,
    required: true,
    index: true
  },
  client_id: {
    type: String,
    required: true,
    index: true
  },
  invoice_type: {
    type: String,
    enum: ['factura', 'boleta'],
    default: 'factura'
  },
  status: {
    type: String,
    enum: ['draft', 'issued', 'paid', 'cancelled'],
    default: 'draft',
    index: true
  },
  net_amount: {
    type: Number,
    required: true,
    min: 0
  },
  iva_amount: {
    type: Number,
    required: true,
    min: 0
  },
  total_amount: {
    type: Number,
    required: true,
    min: 0
  },
  client_rut: {
    type: String,
    default: ''
  },
  client_name: {
    type: String,
    default: ''
  },
  client_address: {
    type: String,
    default: ''
  },
  client_commune: {
    type: String,
    default: ''
  },
  issue_date: {
    type: Date,
    default: Date.now
  },
  due_date: {
    type: Date,
    default: null
  },
  paid_date: {
    type: Date,
    default: null
  },
  created_by: {
    type: String,
    default: 'system'
  }
}, {
  timestamps: true,
  collection: 'invoices'
});

// Índice adicional (solo issue_date; los demás ya están en campos)
invoiceSchema.index({ issue_date: -1 });

const Invoice = mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema);

export default Invoice;
