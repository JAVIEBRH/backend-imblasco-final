/**
 * USER/CLIENT MODEL (MongoDB)
 * Modelo para usuarios/clientes
 */

import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  user_id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password_hash: {
    type: String,
    default: ''
  },
  nombre: {
    type: String,
    default: ''
  },
  razon_social: {
    type: String,
    default: ''
  },
  rut: {
    type: String,
    default: ''
  },
  giro: {
    type: String,
    default: 'Comercio'
  },
  direccion: {
    type: String,
    default: ''
  },
  comuna: {
    type: String,
    default: ''
  },
  email_facturacion: {
    type: String,
    default: ''
  },
  activo: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true,
  collection: 'users'
});

// Índices adicionales: ninguno (ya están en campos)

// Métodos
userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  return {
    id: obj._id.toString(),
    userId: obj.user_id,
    email: obj.email,
    nombre: obj.nombre,
    razonSocial: obj.razon_social,
    rut: obj.rut,
    giro: obj.giro,
    direccion: obj.direccion,
    comuna: obj.comuna,
    emailFacturacion: obj.email_facturacion,
    activo: obj.activo,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt
  };
};

const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;
