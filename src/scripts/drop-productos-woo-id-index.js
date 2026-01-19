/**
 * Elimina el índice único antiguo en productos.woo_id
 * Necesario para permitir múltiples SKUs por mismo woo_id (variaciones)
 */

import { connect, disconnect } from '../config/database.js';
import mongoose from 'mongoose';

async function run() {
  console.log('\n=== ELIMINAR ÍNDICE woo_id ÚNICO ===\n');
  await connect();
  const collection = mongoose.connection.collection('productos');
  const indexes = await collection.indexes();
  const wooIdIndex = indexes.find(idx => idx.name === 'woo_id_1');

  if (!wooIdIndex) {
    console.log('✅ Índice woo_id_1 no existe. Nada que hacer.');
    await disconnect();
    return;
  }

  console.log('⚠️  Eliminando índice woo_id_1...');
  await collection.dropIndex('woo_id_1');
  console.log('✅ Índice eliminado.');
  await disconnect();
}

run().catch(async (err) => {
  console.error('❌ Error eliminando índice:', err.message);
  try { await disconnect(); } catch (_) {}
  process.exit(1);
});
