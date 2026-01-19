/**
 * MODELS INDEX
 * Exportar todos los modelos de MongoDB
 */

// Importar conexión primero
import { connect } from '../config/database.js';

// Importar modelos
import Product from './Product.js';
import ProductIndex from './ProductIndex.js';
import Cart from './Cart.js';
import Order from './Order.js';
import User from './User.js';
import Invoice from './Invoice.js';
import Payment from './Payment.js';
import StockMovement from './StockMovement.js';
import Conversation from './Conversation.js';

// Conectar a MongoDB al cargar modelos (opcional, puede hacerse en index.js)
// await connect();

export {
  Product,
  ProductIndex,
  Cart,
  Order,
  User,
  Invoice,
  Payment,
  StockMovement,
  Conversation
};

export default {
  Product,
  ProductIndex,
  Cart,
  Order,
  User,
  Invoice,
  Payment,
  StockMovement,
  Conversation
};
