/**
 * IMPORTADOR DE PRODUCTOS (WooCommerce -> MongoDB)
 *
 * Propósito:
 * - Poblar colección "productos" SOLO con índice (woo_id, codigo, sku, nombre, tipo)
 * - NO guarda stock, precio ni variaciones
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { connect, disconnect } from '../config/database.js';
import ProductIndex from '../models/ProductIndex.js';
import { getAllProducts, getProductVariations } from '../services/wordpress.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar .env para scripts (no depende del servidor)
dotenv.config({
  path: path.resolve(__dirname, '../../.env'),
  override: false
});

function normalizeCode(code) {
  if (!code || typeof code !== 'string') return '';
  return code.toUpperCase().replace(/[-.\s_]/g, '').trim();
}

async function runImport() {
  console.log('\n=== IMPORTADOR DE PRODUCTOS (WooCommerce -> MongoDB) ===\n');

  await connect();

  console.log('🔍 Obteniendo productos desde WooCommerce...');
  const products = await getAllProducts();

  if (!Array.isArray(products) || products.length === 0) {
    console.warn('⚠️  No se encontraron productos en WooCommerce.');
    await disconnect();
    return;
  }

  console.log(`✅ Productos obtenidos: ${products.length}`);
  console.log('💾 Guardando índice en MongoDB (colección: productos)...');

  const operations = [];

  for (const p of products) {
    const skuRaw = (p.sku || '').trim();
    const codigo = normalizeCode(skuRaw) || String(p.id);
    const sku = normalizeCode(skuRaw) || String(p.id);
    const nombre = (p.name || '').trim();
    const tipo = p.type || 'simple';

    operations.push({
      updateOne: {
        filter: { woo_id: p.id, sku },
        update: {
          $set: {
            woo_id: p.id,
            codigo,
            sku,
            nombre,
            tipo,
            categoria: ''
          }
        },
        upsert: true
      }
    });

    if (p.type === 'variable') {
      const variations = await getProductVariations(p.id);
      for (const v of variations) {
        const vSkuRaw = (v.sku || '').trim();
        if (!vSkuRaw) continue;
        const vSku = normalizeCode(vSkuRaw);
        const vCodigo = vSku;
        const attrs = Array.isArray(v.attributes) && v.attributes.length > 0
          ? ' - ' + v.attributes.map(a => `${a.name}: ${a.option}`).join(', ')
          : '';
        const vNombre = `${nombre}${attrs}`;

        operations.push({
          updateOne: {
            filter: { woo_id: p.id, sku: vSku },
            update: {
              $set: {
                woo_id: p.id,
                codigo: vCodigo,
                sku: vSku,
                nombre: vNombre,
                tipo: 'variable',
                categoria: ''
              }
            },
            upsert: true
          }
        });
      }
    }
  }

  const result = await ProductIndex.bulkWrite(operations, { ordered: false });
  console.log('✅ Importación completada.');
  console.log(`   - Insertados: ${result.upsertedCount}`);
  console.log(`   - Actualizados: ${result.modifiedCount}`);

  await disconnect();
}

runImport().catch(async (error) => {
  console.error('❌ Error en el importador:', error.message);
  try {
    await disconnect();
  } catch (_) {
    // no-op
  }
  process.exit(1);
});
