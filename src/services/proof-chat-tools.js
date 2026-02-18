/**
 * PROOF CHAT - Tools para Responses API
 * consultar_productos y contar_productos (MongoDB ProductIndex).
 * Solo rama PROOF; no modifica lógica existente.
 */

import ProductIndex from '../models/ProductIndex.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * Busca productos en el índice MongoDB por query (texto/SKU/código).
 * Devuelve formato compatible con el system prompt: nombre, sku, precio (null si no hay WooCommerce), stock_resumen, especificaciones_texto.
 * @param {string} query - Término de búsqueda
 * @param {number} [limit] - Máximo de resultados (default 20, max 50)
 * @returns {Promise<{ productos: Array<{ nombre: string, sku: string, precio: number|null, stock_resumen?: object, especificaciones_texto?: string }>, total: number }>}
 */
export async function consultarProductos(query, limit = DEFAULT_LIMIT) {
  const cap = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const cleanTerm = (query && typeof query === 'string') ? query.trim() : '';
  if (!cleanTerm) {
    return { productos: [], total: 0 };
  }

  try {
    let results = await ProductIndex.find(
      { $text: { $search: cleanTerm } },
      { score: { $meta: 'textScore' } }
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(cap)
      .lean();

    if (!results || results.length === 0) {
      const regex = new RegExp(cleanTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      results = await ProductIndex.find({
        $or: [
          { sku: regex },
          { codigo: regex },
          { nombre: regex }
        ]
      })
        .limit(cap)
        .lean();
    }

    const productos = (results || []).map((p) => ({
      nombre: p.nombre || '',
      sku: p.sku || p.codigo || '',
      precio: null,
      stock_resumen: null,
      especificaciones_texto: null
    }));

    return { productos, total: productos.length };
  } catch (err) {
    console.error('[PROOF-TOOLS] consultarProductos error:', err?.message || err);
    return { productos: [], total: 0 };
  }
}

/**
 * Cuenta total de productos en el índice MongoDB.
 * @returns {Promise<{ total: number }>}
 */
export async function contarProductos() {
  try {
    const total = await ProductIndex.countDocuments();
    return { total };
  } catch (err) {
    console.error('[PROOF-TOOLS] contarProductos error:', err?.message || err);
    return { total: 0 };
  }
}
