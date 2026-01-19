/**
 * MODELO: PRODUCT INDEX (MongoDB)
 * Índice de productos SOLO para búsqueda (NO almacena stock/precios)
 * 
 * MongoDB solo ayuda a encontrar el woo_id, nada más.
 * ❌ NO almacena stock, precios, variaciones
 */

import mongoose from 'mongoose';

const productIndexSchema = new mongoose.Schema({
  woo_id: {
    type: Number,
    required: true,
    index: true
  },
  codigo: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  sku: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    index: true
  },
  nombre: {
    type: String,
    required: true,
    trim: true,
    index: 'text' // Índice de texto para búsqueda
  },
  tipo: {
    type: String,
    enum: ['simple', 'variable'],
    default: 'simple',
    index: true
  },
  // Metadata adicional (solo para búsqueda, NO stock/precios)
  categoria: {
    type: String,
    default: '',
    index: true
  }
}, {
  timestamps: true,
  collection: 'productos' // Nombre de colección según especificación
});

// Índices compuestos para búsqueda rápida
productIndexSchema.index({ sku: 1, woo_id: 1 });
productIndexSchema.index({ codigo: 1, woo_id: 1 });
productIndexSchema.index({ nombre: 'text', codigo: 'text' });

// Métodos
productIndexSchema.methods.toJSON = function() {
  const obj = this.toObject();
  return {
    id: obj._id.toString(),
    woo_id: obj.woo_id,
    codigo: obj.codigo,
    sku: obj.sku,
    nombre: obj.nombre,
    tipo: obj.tipo,
    categoria: obj.categoria
  };
};

const ProductIndex = mongoose.models.ProductIndex || mongoose.model('ProductIndex', productIndexSchema);

export default ProductIndex;
