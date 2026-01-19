/**
 * STOCK MOVEMENT MODEL (MongoDB)
 * Modelo para movimientos de inventario
 */

import mongoose from 'mongoose';

const stockMovementSchema = new mongoose.Schema({
  product_id: {
    type: String,
    required: true,
    index: true
  },
  sku: {
    type: String,
    required: true,
    uppercase: true,
    index: true
  },
  movement_type: {
    type: String,
    enum: ['sale', 'purchase', 'adjustment', 'return', 'transfer'],
    required: true,
    index: true
  },
  quantity: {
    type: Number,
    required: true
  },
  previous_stock: {
    type: Number,
    required: true
  },
  new_stock: {
    type: Number,
    required: true
  },
  reference_type: {
    type: String,
    default: null
  },
  reference_id: {
    type: String,
    default: null
  },
  reason: {
    type: String,
    default: null
  },
  notes: {
    type: String,
    default: ''
  },
  created_by: {
    type: String,
    default: 'system'
  }
}, {
  timestamps: true,
  collection: 'stock_movements'
});

// Índices adicionales (solo createdAt y referencia compuesta)
stockMovementSchema.index({ createdAt: -1 });
stockMovementSchema.index({ reference_type: 1, reference_id: 1 });

const StockMovement = mongoose.models.StockMovement || mongoose.model('StockMovement', stockMovementSchema);

export default StockMovement;
