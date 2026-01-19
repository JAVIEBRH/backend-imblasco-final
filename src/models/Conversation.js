/**
 * MODELO: CONVERSACIONES
 * Almacena historial completo de conversaciones por sesión
 * 
 * MongoDB solo almacena:
 * - Índice de productos (woo_id, codigo, sku, nombre)
 * - Historial completo de mensajes por session_id
 * 
 * ❌ NO almacena stock, precios, variaciones (siempre se consulta en tiempo real)
 */

import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'assistant', 'system'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const contextoSchema = new mongoose.Schema({
  codigo_producto: {
    type: String,
    default: null
  }
}, { _id: false });

const conversationSchema = new mongoose.Schema({
  session_id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  mensajes: {
    type: [messageSchema],
    default: []
  },
  contexto_actual: {
    type: contextoSchema,
    default: () => ({ codigo_producto: null })
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'conversations'
});

// Actualizar updatedAt antes de guardar
conversationSchema.pre('save', function() {
  this.updatedAt = new Date();
});

const Conversation = mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);

export default Conversation;
