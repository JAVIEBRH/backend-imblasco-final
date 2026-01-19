/**
 * CART MODEL (MongoDB)
 * Modelo para carritos de compra
 */

import mongoose from 'mongoose';

const cartItemSchema = new mongoose.Schema({
  sku: {
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
    default: 0
  }
}, { _id: false });

const cartSchema = new mongoose.Schema({
  user_id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  items: {
    type: Map,
    of: cartItemSchema,
    default: () => new Map()
  }
}, {
  timestamps: true,
  collection: 'carts',
  // Permitir que MongoDB almacene Map como objeto
  toJSON: { 
    transform: function(doc, ret) {
      // Convertir Map a objeto en toJSON
      if (ret.items && ret.items instanceof Map) {
        ret.items = Object.fromEntries(ret.items)
      }
      return ret
    }
  }
});

// Índice adicional: ninguno (user_id ya está en campo)

// Métodos
cartSchema.methods.toJSON = function() {
  const obj = this.toObject();
  
  // Convertir Map de items a objeto plano (si es necesario)
  let itemsObj = {};
  if (obj.items) {
    if (obj.items instanceof Map) {
      obj.items.forEach((value, key) => {
        itemsObj[key] = value;
      });
    } else {
      itemsObj = obj.items;
    }
  }

  return {
    cartId: obj._id.toString(),
    userId: obj.user_id,
    items: itemsObj,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt
  };
};

const Cart = mongoose.models.Cart || mongoose.model('Cart', cartSchema);

export default Cart;
