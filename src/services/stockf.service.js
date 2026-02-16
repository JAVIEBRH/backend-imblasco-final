/**
 * Servicio de solo lectura sobre stockf.productos (MongoDB).
 * Enriquecimiento: coming_soon, caracteristicas, excerpt, personalizaciones, imagen, flags.
 * No escribe ni modifica nada; solo find/findOne.
 */

import { getStockfConnectionReady } from '../config/stockf-database.js'

const COLLECTION_NAME = 'productos'
const MAX_LIST_ENRICH = 5

function normalizeSku(sku) {
  if (sku == null || typeof sku !== 'string') return ''
  return String(sku).trim().toUpperCase().replace(/\s+/g, '')
}

/**
 * Extrae solo los campos de enriquecimiento del documento stockf (no el documento crudo).
 * @param {Object} doc - Documento de stockf.productos
 * @returns {{ coming_soon?, caracteristicas?, excerpt?, personalizaciones?, imagen?, flags? } | null}
 */
function toEnrichment(doc) {
  if (!doc || typeof doc !== 'object') return null
  const visible = doc.flags && doc.flags.visible === false
  const result = {
    coming_soon: doc.coming_soon != null ? doc.coming_soon : undefined,
    caracteristicas: doc.caracteristicas != null ? doc.caracteristicas : undefined,
    excerpt: doc.excerpt != null ? doc.excerpt : undefined,
    personalizaciones: doc.personalizaciones != null ? doc.personalizaciones : undefined,
    imagen: doc.imagen != null ? doc.imagen : undefined,
    flags: doc.flags != null ? doc.flags : undefined
  }
  const hasAny = Object.keys(result).some(k => result[k] !== undefined)
  return hasAny ? result : null
}

/**
 * Busca en stockf por SKU. Solo lectura.
 * @param {string} sku
 * @returns {Promise<{ enrichment: Object | null, hiddenByFlags: boolean }>}
 */
export async function getProductEnrichmentBySku(sku) {
  const conn = await getStockfConnectionReady()
  if (!conn) return { enrichment: null, hiddenByFlags: false }
  try {
    const col = conn.db.collection(COLLECTION_NAME)
    const normalized = normalizeSku(sku)
    if (!normalized) return { enrichment: null, hiddenByFlags: false }
    const doc = await col.findOne({ sku: normalized }, { maxTimeMS: 3000 })
    if (!doc) return { enrichment: null, hiddenByFlags: false }
    if (doc.flags && doc.flags.visible === false) return { enrichment: null, hiddenByFlags: true }
    return { enrichment: toEnrichment(doc), hiddenByFlags: false }
  } catch (err) {
    console.warn('[stockf] getProductEnrichmentBySku error:', err?.message)
    return { enrichment: null, hiddenByFlags: false }
  }
}

/**
 * Busca en stockf por mysql_id (ID WooCommerce). Solo lectura.
 * @param {number|string} mysqlId
 * @returns {Promise<{ enrichment: Object | null, hiddenByFlags: boolean }>}
 */
export async function getProductEnrichmentByMysqlId(mysqlId) {
  const conn = await getStockfConnectionReady()
  if (!conn) return { enrichment: null, hiddenByFlags: false }
  try {
    const col = conn.db.collection(COLLECTION_NAME)
    const id = typeof mysqlId === 'string' ? parseInt(mysqlId, 10) : Number(mysqlId)
    if (Number.isNaN(id)) return { enrichment: null, hiddenByFlags: false }
    const doc = await col.findOne({ mysql_id: id }, { maxTimeMS: 3000 })
    if (!doc) return { enrichment: null, hiddenByFlags: false }
    if (doc.flags && doc.flags.visible === false) return { enrichment: null, hiddenByFlags: true }
    return { enrichment: toEnrichment(doc), hiddenByFlags: false }
  } catch (err) {
    console.warn('[stockf] getProductEnrichmentByMysqlId error:', err?.message)
    return { enrichment: null, hiddenByFlags: false }
  }
}

/**
 * Enriquecimiento para un producto WooCommerce. Usa parent_id (variante) o id para mysql_id, y sku.
 * @param {Object} product - { id, sku, parent_id? }
 * @returns {Promise<{ enrichment: Object | null, hiddenByFlags: boolean }>}
 */
export async function getProductEnrichment(product) {
  if (!product || typeof product !== 'object') return { enrichment: null, hiddenByFlags: false }
  const conn = await getStockfConnectionReady()
  if (!conn) return { enrichment: null, hiddenByFlags: false }

  const mysqlId = product.parent_id != null ? product.parent_id : product.id
  const sku = product.sku

  // Intentar por mysql_id primero (más estable para variantes)
  if (mysqlId != null) {
    const byId = await getProductEnrichmentByMysqlId(mysqlId)
    if (byId.enrichment != null || byId.hiddenByFlags) return byId
  }
  if (sku) {
    return getProductEnrichmentBySku(sku)
  }
  return { enrichment: null, hiddenByFlags: false }
}

/**
 * Enriquecer los primeros N elementos de una lista de productos (solo lectura).
 * @param {Array<Object>} products - Lista de productos WooCommerce
 * @param {number} max - Máximo a enriquecer (default MAX_LIST_ENRICH)
 * @returns {Promise<Array<Object>>} Misma longitud; elementos enriquecidos donde hubo datos
 */
export async function enrichProductList(products, max = MAX_LIST_ENRICH) {
  if (!Array.isArray(products) || products.length === 0) return products
  const conn = await getStockfConnectionReady()
  if (!conn) return products

  const result = [...products]
  const toEnrich = Math.min(max, result.length)
  for (let i = 0; i < toEnrich; i++) {
    try {
      const { enrichment, hiddenByFlags } = await getProductEnrichment(result[i])
      if (hiddenByFlags) continue
      if (enrichment && typeof result[i] === 'object') {
        result[i] = { ...result[i], ...enrichment }
      }
    } catch (_) {
      // dejar ítem sin enriquecer
    }
  }
  return result
}
