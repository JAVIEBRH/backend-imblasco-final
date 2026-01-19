/**
 * ORDER MODEL (MongoDB)
 * Modelo para pedidos
 */

import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
  codigo: {
    type: String,
    required: true,
    uppercase: true
  },
  nombre: {
    type: String,
    required: true
  },
  cantidad: {
    type: Number,
    required: true,
    min: 1
  },
  precio: {
    type: Number,
    required: true,
    min: 0
  },
  subtotal: {
    type: Number,
    required: true,
    min: 0
  }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  order_id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  user_id: {
    type: String,
    required: true,
    index: true
  },
  items: {
    type: [orderItemSchema],
    required: true,
    default: []
  },
  total_amount: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['draft', 'confirmed', 'sent_to_erp', 'invoiced', 'error', 'cancelled', 'rejected'],
    default: 'draft',
    index: true
  },
  erp_reference: {
    type: String,
    default: null
  },
  invoice_number: {
    type: String,
    default: null
  },
  notes: {
    type: String,
    default: ''
  },
  // Campos de facturación
  net_amount: {
    type: Number,
    default: null
  },
  iva_amount: {
    type: Number,
    default: null
  },
  total_amount: {
    type: Number,
    default: null
  },
  client_snapshot: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: null
  },
  items_snapshot: {
    type: Array,
    default: null
  },
  invoiced_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  collection: 'orders'
});

// Índice adicional (solo createdAt; los demás ya están en campos)
orderSchema.index({ createdAt: -1 });

// Métodos
orderSchema.methods.toJSON = function() {
  const obj = this.toObject();
  return {
    id: obj._id.toString(),
    orderId: obj.order_id,
    userId: obj.user_id,
    items: obj.items,
    totalAmount: obj.total_amount,
    status: obj.status,
    erpReference: obj.erp_reference,
    invoiceNumber: obj.invoice_number,
    notes: obj.notes,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt
  };
};

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

export default Order;
