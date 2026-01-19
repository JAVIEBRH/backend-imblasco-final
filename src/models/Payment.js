/**
 * PAYMENT MODEL (MongoDB)
 * Modelo para pagos
 */

import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  invoice_id: {
    type: String,
    default: null,
    index: true
  },
  order_id: {
    type: String,
    default: null,
    index: true
  },
  client_id: {
    type: String,
    required: true,
    index: true
  },
  payment_type: {
    type: String,
    enum: ['invoice', 'order', 'advance'],
    required: true
  },
  payment_method: {
    type: String,
    default: null
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  payment_date: {
    type: Date,
    default: Date.now
  },
  reference_number: {
    type: String,
    default: null
  },
  notes: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled'],
    default: 'pending',
    index: true
  },
  created_by: {
    type: String,
    default: 'system'
  }
}, {
  timestamps: true,
  collection: 'payments'
});

// Índice adicional (solo payment_date; los demás ya están en campos)
paymentSchema.index({ payment_date: -1 });

const Payment = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);

export default Payment;
