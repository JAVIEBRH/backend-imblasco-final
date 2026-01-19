/**
 * PRODUCT MODEL (MongoDB)
 * Modelo para productos/inventario
 */

import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  sku: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  stock: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  price: {
    type: Number,
    required: false,
    default: 0,
    min: 0
  },
  description: {
    type: String,
    default: ''
  },
  category: {
    type: String,
    default: ''
  },
  // Campos adicionales del CSV
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true, // Crea createdAt y updatedAt automáticamente
  collection: 'products' // Nombre de la colección
});

// Índices adicionales (solo texto y stock; sku ya está en campo)
productSchema.index({ name: 'text' }); // Índice de texto para búsqueda
productSchema.index({ stock: 1 });

// Métodos
productSchema.methods.toJSON = function() {
  const obj = this.toObject();
  return {
    id: obj._id.toString(),
    codigo: obj.sku,
    sku: obj.sku,
    nombre: obj.name,
    name: obj.name,
    stock: obj.stock,
    precio: obj.price,
    price: obj.price,
    disponible: obj.stock > 0,
    description: obj.description,
    category: obj.category,
    updated_at: obj.updatedAt
  };
};

const Product = mongoose.models.Product || mongoose.model('Product', productSchema);

export default Product;
