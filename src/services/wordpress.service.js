/**
 * WORDPRESS / WOOCOMMERCE SERVICE
 * Servicio para conectar con WooCommerce REST API
 * El agente está autenticado con Consumer Key/Secret para consultar productos y stock
 */

import { normalizeCode } from '../utils/normalization.js'
import { withTimeout, withRetry } from '../utils/resilience.js'
import { buildAttributeOptionKey } from '../utils/attribute-value.js'
import { logEvent } from '../utils/structured-logger.js'

// Función helper para obtener variables de entorno (carga lazy)
function getWooCommerceConfig() {
  const WC_URL = process.env.WC_URL || 'https://imblasco.cl'
  const WC_KEY = process.env.WC_KEY
  const WC_SECRET = process.env.WC_SECRET
  
  return { WC_URL, WC_KEY, WC_SECRET }
}

// Log de depuración para verificar carga de variables (ejecutar después de que dotenv se carga)
// Usar setTimeout para ejecutar después de que el módulo se haya cargado completamente
setTimeout(() => {
  const { WC_URL, WC_KEY, WC_SECRET } = getWooCommerceConfig()
  console.log('[WordPress Service] Variables cargadas:')
  console.log('  WC_URL:', WC_URL ? `✅ ${WC_URL}` : '❌ NO CONFIGURADA')
  console.log('  WC_KEY:', WC_KEY ? `✅ Configurada (${WC_KEY.length} chars, inicia: ${WC_KEY.substring(0, 5)}...)` : '❌ NO CONFIGURADA')
  console.log('  WC_SECRET:', WC_SECRET ? `✅ Configurada (${WC_SECRET.length} chars, inicia: ${WC_SECRET.substring(0, 5)}...)` : '❌ NO CONFIGURADA')
}, 100)

/**
 * Parsear cantidad de stock (alineado con conversation.service parseStockQuantity).
 * Usa Number + Math.floor para consistencia; evita parseInt.
 * @param {*} val - stock_quantity (string o número)
 * @returns {number} Entero >= 0, o 0 si no es un número válido
 */
function parseStockQuantity(val) {
  if (val == null) return 0
  const n = Number(val)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.floor(n)
}

/** Normaliza dimensiones de la API (length, width, height strings). Devuelve null si no hay ninguna. */
function parseDimensions(dim) {
  if (!dim || typeof dim !== 'object') return null
  const length = dim.length != null ? String(dim.length).trim() : ''
  const width = dim.width != null ? String(dim.width).trim() : ''
  const height = dim.height != null ? String(dim.height).trim() : ''
  if (!length && !width && !height) return null
  return { length: length || null, width: width || null, height: height || null }
}

/** Normaliza tags de la API. Devuelve array de { id, name, slug }. */
function parseTags(tags) {
  if (!Array.isArray(tags)) return []
  return tags.filter(t => t && (t.id != null || t.name)).map(t => ({
    id: t.id != null ? t.id : null,
    name: t.name != null ? String(t.name).trim() : '',
    slug: t.slug != null ? String(t.slug).trim() : ''
  }))
}

// Cache in-memory para atributos y términos (evitar llamadas repetidas a la API)
let _attributesCache = null
const _termsCacheByAttrId = new Map()

/**
 * Lista de atributos globales de WooCommerce (id, name, slug). Slug suele ser pa_tamaño, pa_talla, etc.
 * @returns {Promise<Array<{id: number, name: string, slug: string}>>}
 */
async function getProductAttributes() {
  if (_attributesCache) return _attributesCache
  try {
    const data = await wcRequest('products/attributes')
    const list = Array.isArray(data) ? data : (data?.product_attributes || [])
    _attributesCache = list.map(a => ({
      id: a.id,
      name: a.name != null ? String(a.name).trim() : '',
      slug: (a.slug != null ? String(a.slug).trim() : '').toLowerCase()
    }))
    return _attributesCache
  } catch (e) {
    console.warn('[WooCommerce] No se pudieron cargar atributos:', e?.message)
    return []
  }
}

/**
 * Términos de un atributo (slug → name para mostrar, ej. "21" → "21 cm").
 * @param {number} attributeId
 * @returns {Promise<Array<{slug: string, name: string}>>}
 */
async function getProductAttributeTerms(attributeId) {
  if (!attributeId) return []
  if (_termsCacheByAttrId.has(attributeId)) return _termsCacheByAttrId.get(attributeId)
  try {
    const data = await wcRequest(`products/attributes/${attributeId}/terms`)
    const list = Array.isArray(data) ? data : (data?.product_attribute_terms || [])
    const terms = list.map(t => ({
      slug: (t.slug != null ? String(t.slug).trim() : '').toLowerCase(),
      name: t.name != null ? String(t.name).trim() : ''
    }))
    _termsCacheByAttrId.set(attributeId, terms)
    return terms
  } catch (e) {
    console.warn(`[WooCommerce] No se pudieron cargar términos del atributo ${attributeId}:`, e?.message)
    return []
  }
}

/**
 * Resuelve los valores de atributos de variaciones (slug → nombre para mostrar).
 * Usa la API de atributos y términos para mostrar "21 cm", "XL", etc. en lugar del slug "21", "xl".
 * @param {Array} variations - Array de variaciones con attributes: [{ name, option }]
 * @returns {Promise<Map<string, string>>} Map clave `${attrName.toLowerCase()}|${optionSlug}` → nombre para mostrar
 */
export async function resolveAttributeOptionDisplayNames(variations) {
  const map = new Map()
  if (!Array.isArray(variations) || variations.length === 0) return map
  const attrSlugs = new Set()
  const pairs = []
  for (const v of variations) {
    if (!v?.attributes || !Array.isArray(v.attributes)) continue
    for (const attr of v.attributes) {
      const name = (attr.name || '').trim()
      const option = (attr.option != null && attr.option !== '') ? String(attr.option).trim() : (attr.value != null ? String(attr.value).trim() : '')
      if (!name || !option) continue
      attrSlugs.add(name.toLowerCase())
      pairs.push({ name, option })
    }
  }
  if (attrSlugs.size === 0) return map
  const attributes = await getProductAttributes()
  const logAttributes = process.env.LOG_WOO_ATTRIBUTES === '1'
  for (const slug of attrSlugs) {
    const attr = attributes.find(a => a.slug === slug || a.slug === slug.replace(/^pa_/, '') || (slug.startsWith('pa_') && a.slug === slug.slice(3)))
    if (!attr?.id) continue
    const terms = await getProductAttributeTerms(attr.id)
    if (logAttributes && terms.length > 0) {
      const termList = terms.map(t => `${t.slug}→"${t.name}"`).join(', ')
      console.log(`[WooCommerce] Atributo "${slug}" (id ${attr.id}): términos ${terms.length} → ${termList}`)
    }
    for (const t of terms) {
      if (!t.slug || t.name === '') continue
      const key = buildAttributeOptionKey(slug, t.slug)
      map.set(key, t.name)
    }
  }
  return map
}

// Autenticación básica HTTP para WooCommerce REST API
function getAuthHeader() {
  const { WC_KEY, WC_SECRET } = getWooCommerceConfig()
  if (!WC_KEY || !WC_SECRET) {
    console.error('[WordPress Service] ❌ ERROR: WC_KEY o WC_SECRET no configuradas')
    console.error('  WC_KEY:', WC_KEY ? 'Definida' : 'UNDEFINED')
    console.error('  WC_SECRET:', WC_SECRET ? 'Definida' : 'UNDEFINED')
    throw new Error('WC_KEY o WC_SECRET no configuradas en .env')
  }
  const auth = Buffer.from(`${WC_KEY}:${WC_SECRET}`).toString('base64')
  return `Basic ${auth}`
}

/**
 * Hacer petición a WooCommerce API
 * @param {boolean} returnHeaders - Si es true, devuelve { data, headers }
 */
async function wcRequest(endpoint, options = {}, returnHeaders = false) {
  const { WC_URL } = getWooCommerceConfig()
  const url = `${WC_URL}/wp-json/wc/v3/${endpoint}`
  const WC_TIMEOUT_MS = 25000
  const WC_MAX_RETRIES = 2
  const WC_RETRY_DELAY_MS = 800

  try {
    return await withRetry(async () => {
      const response = await withTimeout(
        WC_TIMEOUT_MS,
        fetch(url, {
          method: options.method || 'GET',
          headers: {
            'Authorization': getAuthHeader(),
            'Content-Type': 'application/json',
            ...options.headers
          },
          ...options
        })
      )

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`❌ Error WooCommerce API (${response.status}):`, errorText.substring(0, 200))
        throw new Error(`WooCommerce API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      if (returnHeaders) {
        return {
          data,
          headers: {
            total: response.headers.get('X-WP-Total'),
            totalPages: response.headers.get('X-WP-TotalPages')
          }
        }
      }

      return data
    }, { maxRetries: WC_MAX_RETRIES, delayMs: WC_RETRY_DELAY_MS })
    logEvent({ event: 'woo_request', endpoint, latencyMs: Date.now() - start })
    return result
  } catch (error) {
    logEvent({ event: 'woo_request', endpoint, latencyMs: Date.now() - start, error: error.message })
    console.error(`❌ Error conectando a WooCommerce:`, error.message)
    throw error
  }
}

/**
 * Verificar si un usuario está logueado en WordPress
 * NOTA: El agente está autenticado como cesar.barahona@conkavo.cl para consultas
 * Esta función puede usarse para verificar usuarios finales del chat
 */
export async function verifyUserLogin(userId) {
  // El agente está autenticado con Consumer Key/Secret, no necesita verificar login de usuario
  // Para consultas de stock, el agente puede consultar directamente
  return {
    isLoggedIn: true, // El agente está autenticado
    user: {
      email: 'cesar.barahona@conkavo.cl',
      role: 'agent'
    }
  }
}

/**
 * Obtener stock de un producto desde WooCommerce por SKU o ID
 * @param {string|number} identifier - SKU del producto o ID
 * @returns {Promise<{available: boolean, stock?: number, price?: number, name?: string, sku?: string}>}
 */
export async function getProductStock(identifier) {
  try {
    // Intentar buscar por SKU primero
    let product = null
    
    // Buscar por SKU
    const searchBySku = await wcRequest(`products?sku=${encodeURIComponent(identifier)}&per_page=1`)
    if (searchBySku && Array.isArray(searchBySku) && searchBySku.length > 0) {
      product = searchBySku[0]
    } else {
      // Si no se encuentra por SKU, intentar por ID
      const productById = await wcRequest(`products/${identifier}`)
      if (productById && productById.id) {
        product = productById
      }
    }
    
    if (!product) {
      return null
    }
    
    const stockQuantity = product.stock_quantity !== null && product.stock_quantity !== undefined 
      ? parseStockQuantity(product.stock_quantity) 
      : null
    
    const available = product.stock_status === 'instock' || (stockQuantity !== null && stockQuantity > 0)
    
    return {
      available,
      stock: stockQuantity,
      stock_quantity: stockQuantity, // Compatibilidad
      price: product.price ? parseFloat(product.price) : null,
      name: product.name || '',
      sku: product.sku || '',
      id: product.id,
      stock_status: product.stock_status || 'unknown',
      manage_stock: product.manage_stock || false,
      type: product.type || 'simple',
      description: product.description || '',
      short_description: product.short_description || '',
      attributes: product.attributes || [],
      categories: product.categories || [],
      weight: product.weight != null ? String(product.weight).trim() || null : null,
      dimensions: parseDimensions(product.dimensions),
      tags: parseTags(product.tags)
    }
  } catch (error) {
    console.error('Error obteniendo stock del producto:', error.message)
    return null
  }
}

/**
 * Obtener muestra de productos de WooCommerce (sin búsqueda, para matching determinístico)
 * @param {number} limit - Límite de resultados (default: 100)
 * @returns {Promise<Array>} Lista de productos
 */
export async function getProductsSample(limit = 100) {
  try {
    const products = await wcRequest(`products?per_page=${limit}&status=publish`)
    
    if (!Array.isArray(products)) {
      return []
    }
    
    return products.map(product => ({
      id: product.id,
      name: product.name || '',
      sku: product.sku || '',
      price: product.price ? parseFloat(product.price) : null,
      stock_quantity: product.stock_quantity !== null && product.stock_quantity !== undefined 
        ? parseStockQuantity(product.stock_quantity) 
        : null,
      stock_status: product.stock_status || 'unknown',
      manage_stock: product.manage_stock || false,
      available: product.stock_status === 'instock' || (product.stock_quantity != null && parseStockQuantity(product.stock_quantity) > 0)
    }))
  } catch (error) {
    console.error('Error obteniendo muestra de productos:', error.message)
    return []
  }
}

/**
 * Obtener TODOS los productos de WooCommerce con paginación completa
 * @param {{ includeStock?: boolean }} [opts] - includeStock: si true (default), incluye stock_quantity y price; si false, solo estructura (para caché)
 * @returns {Promise<Array>} Lista completa de productos
 */
export async function getAllProducts(opts = {}) {
  const includeStock = opts.includeStock !== false
  try {
    console.log('[WooCommerce] Obteniendo todos los productos con paginación...' + (includeStock ? '' : ' (solo estructura)'))
    
    // Primera petición para obtener el total de páginas
    const firstPage = await wcRequest(`products?per_page=100&page=1&status=publish`, {}, true)
    const totalPages = firstPage.headers.totalPages ? parseInt(firstPage.headers.totalPages) : 1
    const totalProducts = firstPage.headers.total ? parseInt(firstPage.headers.total) : 0
    
    console.log(`[WooCommerce] Total de productos: ${totalProducts}, Total de páginas: ${totalPages}`)
    
    let allProducts = []
    
    // Procesar primera página
    if (Array.isArray(firstPage.data)) {
      allProducts = allProducts.concat(firstPage.data)
    }
    
    // Si hay más páginas, obtenerlas todas
    if (totalPages > 1) {
      const pagePromises = []
      for (let page = 2; page <= totalPages; page++) {
        pagePromises.push(
          wcRequest(`products?per_page=100&page=${page}&status=publish`)
            .then(products => {
              console.log(`[WooCommerce] Página ${page}/${totalPages} obtenida: ${Array.isArray(products) ? products.length : 0} productos`)
              return Array.isArray(products) ? products : []
            })
            .catch(error => {
              console.error(`[WooCommerce] Error obteniendo página ${page}:`, error.message)
              return []
            })
        )
      }
      
      const remainingPages = await Promise.all(pagePromises)
      remainingPages.forEach(pageProducts => {
        allProducts = allProducts.concat(pageProducts)
      })
    }
    
    console.log(`[WooCommerce] ✅ Total de productos obtenidos: ${allProducts.length}`)
    
    return allProducts.map(product => {
      const base = {
        id: product.id,
        name: product.name || '',
        sku: product.sku || '',
        type: product.type || 'simple',
        weight: product.weight != null ? String(product.weight).trim() || null : null,
        dimensions: parseDimensions(product.dimensions),
        tags: parseTags(product.tags)
      }
      if (includeStock) {
        base.price = product.price ? parseFloat(product.price) : null
        base.stock_quantity = product.stock_quantity !== null && product.stock_quantity !== undefined
          ? parseStockQuantity(product.stock_quantity)
          : null
        base.stock_status = product.stock_status || 'unknown'
        base.manage_stock = product.manage_stock || false
        base.available = product.stock_status === 'instock' || (product.stock_quantity != null && parseStockQuantity(product.stock_quantity) > 0)
      }
      return base
    })
  } catch (error) {
    console.error('Error obteniendo todos los productos:', error.message)
    return []
  }
}

// Caché de estructura del catálogo (sin stock/precio) para no congelar stock
let catalogStructureCache = null
let catalogStructureCacheTimestamp = null
let catalogDownloadInProgress = false
let catalogDownloadPromise = null
const CATALOG_STRUCTURE_TTL_MS = 10 * 60 * 1000 // 10 minutos

/** Caché de stock/precio por producto (TTL corto para no congelar stock) */
const stockPriceCache = new Map()
const STOCK_PRICE_TTL_MS = 30 * 1000 // 30 segundos

/**
 * Obtener estructura del catálogo (sin stock/precio) con caché. Evita descargas repetidas y no congela stock.
 * @returns {Promise<Array>} Lista de productos con id, name, sku, type, tags, etc. (sin stock/precio)
 */
export async function getCatalogStructure() {
  const now = Date.now()
  if (catalogStructureCache && catalogStructureCacheTimestamp && (now - catalogStructureCacheTimestamp) < CATALOG_STRUCTURE_TTL_MS) {
    console.log(`[WooCommerce] ✅ Usando estructura del catálogo desde caché (${catalogStructureCache.length} productos)`)
    return catalogStructureCache
  }
  if (catalogDownloadInProgress && catalogDownloadPromise) {
    console.log('[WooCommerce] Esperando descarga de catálogo en progreso...')
    return await catalogDownloadPromise
  }
  catalogDownloadInProgress = true
  catalogDownloadPromise = getAllProducts({ includeStock: false })
    .then(products => {
      catalogStructureCache = products
      catalogStructureCacheTimestamp = Date.now()
      catalogDownloadInProgress = false
      catalogDownloadPromise = null
      console.log(`[WooCommerce] ✅ Estructura del catálogo cacheada: ${products.length} productos`)
      return products
    })
    .catch(err => {
      catalogDownloadInProgress = false
      catalogDownloadPromise = null
      throw err
    })
  return await catalogDownloadPromise
}

/**
 * Invalidar caché de estructura (ej. cuando haya cambios en productos)
 */
export function invalidateCatalogStructureCache() {
  catalogStructureCache = null
  catalogStructureCacheTimestamp = null
  console.log('[WooCommerce] Caché de estructura del catálogo invalidado')
}

/**
 * Enriquecer producto (de estructura) con stock/precio actualizado en tiempo real
 * @param {Object} product - Producto con al menos id (de getCatalogStructure)
 * @returns {Promise<Object>} Producto con stock_quantity, stock_status, price, available
 */
export async function enrichProductWithStockPrice(product) {
  if (!product || product.id == null) return product
  const now = Date.now()
  const cached = stockPriceCache.get(product.id)
  if (cached && (now - cached.timestamp) < STOCK_PRICE_TTL_MS) {
    return { ...product, ...cached.data }
  }
  try {
    const full = await getProductById(product.id)
    if (!full) return product
    const data = {
      price: full.price,
      stock_quantity: full.stock_quantity,
      stock_status: full.stock_status,
      available: full.available,
      manage_stock: full.manage_stock,
      attributes: full.attributes || product.attributes || []
    }
    stockPriceCache.set(product.id, { data, timestamp: now })
    return { ...product, ...data }
  } catch (e) {
    console.warn(`[WooCommerce] Error enriqueciendo producto ${product.id}:`, e?.message)
    return product
  }
}

/**
 * Enriquecer hasta N productos con stock/precio en tiempo real (en paralelo)
 */
export async function enrichProductsWithStockPrice(products, max = 5) {
  const toEnrich = (Array.isArray(products) ? products : []).slice(0, max)
  if (toEnrich.length === 0) return products
  const enriched = await Promise.all(toEnrich.map(p => enrichProductWithStockPrice(p)))
  const rest = (Array.isArray(products) ? products : []).slice(max)
  return [...enriched, ...rest]
}

/**
 * Buscar productos en WooCommerce por término de búsqueda (FULL-TEXT fuzzy)
 * @param {string} searchTerm - Término de búsqueda (nombre, SKU, etc.)
 * @param {number} limit - Límite de resultados (default: 10)
 * @returns {Promise<Array>} Lista de productos encontrados
 * @deprecated Para matching determinístico, usar getProductsSample() + productMatcher.matchProduct()
 */
export async function searchProductsInWordPress(searchTerm, limit = 10) {
  try {
    const products = await wcRequest(`products?search=${encodeURIComponent(searchTerm)}&per_page=${limit}&status=publish`)
    
    if (!Array.isArray(products)) {
      return []
    }
    
    return products.map(product => ({
      id: product.id,
      name: product.name || '',
      sku: product.sku || '',
      price: product.price ? parseFloat(product.price) : null,
      stock_quantity: product.stock_quantity !== null && product.stock_quantity !== undefined 
        ? parseStockQuantity(product.stock_quantity) 
        : null,
      stock_status: product.stock_status || 'unknown',
      manage_stock: product.manage_stock || false,
      available: product.stock_status === 'instock' || (product.stock_quantity != null && parseStockQuantity(product.stock_quantity) > 0),
      type: product.type || 'simple',
      description: product.description || '',
      short_description: product.short_description || '',
      attributes: product.attributes || [],
      categories: product.categories || [],
      weight: product.weight != null ? String(product.weight).trim() || null : null,
      dimensions: parseDimensions(product.dimensions),
      tags: parseTags(product.tags)
    }))
  } catch (error) {
    console.error('Error buscando productos:', error.message)
    return []
  }
}

/**
 * Buscar producto por SKU específico con variaciones
 * @param {string} sku - SKU del producto
 * @returns {Promise<Object|null>} Producto encontrado o null
 */
export async function getProductBySku(sku) {
  try {
    const originalSku = sku.trim()
    
    // Generar variaciones del SKU para buscar
    const skuVariations = [
      originalSku,                    // Original
      originalSku.toUpperCase(),       // Mayúsculas
      originalSku.toLowerCase(),      // Minúsculas
      originalSku.replace(/-/g, ''),  // Sin guiones
      originalSku.replace(/-/g, ' '), // Guiones por espacios
      originalSku.replace(/\s+/g, '-'), // Espacios por guiones
      originalSku.replace(/\s+/g, ''),  // Sin espacios
    ]
    
    // Eliminar duplicados
    const uniqueVariations = [...new Set(skuVariations)]
    
    console.log(`[WooCommerce] Buscando SKU "${originalSku}" con ${uniqueVariations.length} variaciones`)
    
    // Intentar cada variación hasta encontrar el producto
    for (const skuVariation of uniqueVariations) {
      try {
        let products = await wcRequest(`products?sku=${encodeURIComponent(skuVariation)}&per_page=10`)
        
        if (Array.isArray(products) && products.length > 0) {
          // Buscar el producto que coincida exactamente con alguna variación del SKU
          const product = products.find(p => {
            const productSku = (p.sku || '').trim()
            return uniqueVariations.some(variation => 
              productSku.toUpperCase() === variation.toUpperCase() ||
              productSku.toLowerCase() === variation.toLowerCase() ||
              productSku.replace(/-/g, '').toUpperCase() === variation.replace(/-/g, '').toUpperCase()
            )
          }) || products[0] // Si no hay match exacto, usar el primero
          
          console.log(`[WooCommerce] ✅ Producto encontrado por SKU "${originalSku}" (variación "${skuVariation}"): ${product.name} (SKU real: ${product.sku})`)
          
          return {
            id: product.id,
            name: product.name || '',
            sku: product.sku || '',
            price: product.price ? parseFloat(product.price) : null,
            stock_quantity: product.stock_quantity !== null && product.stock_quantity !== undefined 
              ? parseStockQuantity(product.stock_quantity) 
              : null,
            stock_status: product.stock_status || 'unknown',
            manage_stock: product.manage_stock || false,
            available: product.stock_status === 'instock' || (product.stock_quantity != null && parseStockQuantity(product.stock_quantity) > 0),
            type: product.type || 'simple',
            description: product.description || '',
            short_description: product.short_description || '',
            attributes: product.attributes || [],
            categories: product.categories || [],
            parent_id: product.parent_id || product.parent || null // CRÍTICO: Capturar parent_id si es una variación
          }
        }
      } catch (error) {
        // Continuar con la siguiente variación si esta falla
        continue
      }
    }
    
    console.log(`[WooCommerce] ❌ No se encontró producto con SKU: ${originalSku} (probadas ${uniqueVariations.length} variaciones)`)
    return null
  } catch (error) {
    console.error('Error obteniendo producto por SKU:', error.message)
    return null
  }
}

/**
 * Obtener producto por ID
 * @param {number} productId - ID del producto
 * @returns {Promise<Object|null>} Producto encontrado o null
 */
export async function getProductById(productId) {
  try {
    if (!productId || typeof productId !== 'number') {
      return null
    }

    const product = await wcRequest(`products/${productId}`)
    
    if (!product || !product.id) {
      return null
    }

    return {
      id: product.id,
      name: product.name || '',
      sku: product.sku || '',
      price: product.price ? parseFloat(product.price) : null,
      stock_quantity: product.stock_quantity !== null && product.stock_quantity !== undefined 
        ? parseStockQuantity(product.stock_quantity) 
        : null,
      stock_status: product.stock_status || 'unknown',
      manage_stock: product.manage_stock || false,
      available: product.stock_status === 'instock' || (product.stock_quantity != null && parseStockQuantity(product.stock_quantity) > 0),
      type: product.type || 'simple',
      description: product.description || '',
      short_description: product.short_description || '',
      attributes: product.attributes || [],
      categories: product.categories || [],
      parent_id: product.parent_id || product.parent || null,
      weight: product.weight != null ? String(product.weight).trim() || null : null,
      dimensions: parseDimensions(product.dimensions),
      tags: parseTags(product.tags)
    }
  } catch (error) {
    console.error(`[WooCommerce] Error obteniendo producto por ID ${productId}:`, error.message)
    return null
  }
}

/**
 * Obtener variaciones de un producto variable (lazy loading con paginación completa)
 * @param {number} productId - ID del producto variable
 * @returns {Promise<Array>} Lista de variaciones
 */
export async function getProductVariations(productId) {
  try {
    if (!productId || typeof productId !== 'number') {
      return []
    }
    
    // Obtener primera página con headers para saber el total
    const firstPage = await wcRequest(`products/${productId}/variations?per_page=100&page=1&status=publish`, {}, true)
    
    if (!Array.isArray(firstPage.data)) {
      return []
    }
    
    const totalPages = firstPage.headers.totalPages ? parseInt(firstPage.headers.totalPages) : 1
    const totalVariations = firstPage.headers.total ? parseInt(firstPage.headers.total) : firstPage.data.length
    
    console.log(`[WooCommerce] Producto ${productId}: ${totalVariations} variaciones en ${totalPages} página(s)`)
    
    let allVariations = [...firstPage.data]
    
    // Si hay más páginas, obtenerlas todas
    if (totalPages > 1) {
      const pagePromises = []
      for (let page = 2; page <= totalPages; page++) {
        pagePromises.push(
          wcRequest(`products/${productId}/variations?per_page=100&page=${page}&status=publish`)
            .then(variations => {
              console.log(`[WooCommerce] Variaciones página ${page}/${totalPages}: ${Array.isArray(variations) ? variations.length : 0}`)
              return Array.isArray(variations) ? variations : []
            })
            .catch(error => {
              console.error(`[WooCommerce] Error obteniendo variaciones página ${page}:`, error.message)
              return []
            })
        )
      }
      
      const remainingPages = await Promise.all(pagePromises)
      remainingPages.forEach(pageVariations => {
        allVariations = allVariations.concat(pageVariations)
      })
    }
    
    console.log(`[WooCommerce] ✅ Total de variaciones obtenidas para producto ${productId}: ${allVariations.length}`)
    
    return allVariations.map(variation => ({
      id: variation.id,
      name: variation.name || '',
      sku: variation.sku || '',
      price: variation.price ? parseFloat(variation.price) : null,
      stock_quantity: variation.stock_quantity !== null && variation.stock_quantity !== undefined 
        ? parseStockQuantity(variation.stock_quantity) 
        : null,
      stock_status: variation.stock_status || 'unknown',
      manage_stock: variation.manage_stock || false,
      available: variation.stock_status === 'instock' || (variation.stock_quantity != null && parseStockQuantity(variation.stock_quantity) > 0),
      attributes: variation.attributes || [],
      parent_id: productId,
      description: variation.description != null ? String(variation.description).trim() || null : null,
      weight: variation.weight != null ? String(variation.weight).trim() || null : null,
      dimensions: parseDimensions(variation.dimensions)
    }))
  } catch (error) {
    console.error(`[WooCommerce] ❌ Error obteniendo variaciones del producto ${productId}:`, error.message)
    return []
  }
}

/**
 * Buscar variación por SKU en productos variables (solo en productos ya cargados)
 * @param {string} sku - SKU a buscar
 * @param {Array} variableProducts - Lista de productos variables (de getAllProducts)
 * @returns {Promise<Object|null>} Variación encontrada o null
 */
export async function findVariationBySku(sku, variableProducts) {
  if (!sku || !Array.isArray(variableProducts) || variableProducts.length === 0) {
    return null
  }
  
  // Normalizar SKU para búsqueda (usar función normalizeCode existente)
  const normalizedSku = normalizeCode(sku)
  
  if (!normalizedSku || normalizedSku.length === 0) {
    console.log(`[WooCommerce] ⚠️  SKU inválido o vacío después de normalización: "${sku}"`)
    return null
  }
  
  console.log(`[WooCommerce] 🔍 Buscando variación con SKU "${sku}" (normalizado: "${normalizedSku}") en ${variableProducts.length} productos variables...`)
  
  // Buscar en variaciones de cada producto variable
  // Optimización: detener búsqueda al encontrar la primera coincidencia exacta
  for (const product of variableProducts) {
    if (product.type !== 'variable' || !product.id) {
      continue
    }
    
    try {
      const variations = await getProductVariations(product.id)
      
      if (!variations || variations.length === 0) {
        continue // Producto sin variaciones, continuar con el siguiente
      }
      
      // Buscar TODAS las variaciones con SKU exacto (normalizado) - SOLO coincidencia exacta para evitar falsos positivos
      const matchingVariations = variations.filter(variation => {
        if (!variation.sku || typeof variation.sku !== 'string') {
          return false // Ignorar variaciones sin SKU
        }
        const variationSku = normalizeCode(variation.sku)
        // Coincidencia EXACTA normalizada (sin ambigüedad) - debe tener SKU y coincidir exactamente
        return variationSku.length > 0 && variationSku === normalizedSku
      })
      
      if (matchingVariations.length > 0) {
        // Si hay múltiples variaciones con el mismo SKU (caso raro pero posible), usar la primera
        // Esto evita ambigüedad - solo devolvemos una variación
        if (matchingVariations.length > 1) {
          console.log(`[WooCommerce] ⚠️  Múltiples variaciones con SKU "${sku}" encontradas (${matchingVariations.length}) en producto "${product.name}", usando la primera para evitar ambigüedad`)
        }
        
        const matchingVariation = matchingVariations[0]
        console.log(`[WooCommerce] ✅ Variación encontrada: ${matchingVariation.name} (SKU: ${matchingVariation.sku}, Producto padre: ${product.name})`)
        return {
          ...matchingVariation,
          parent_product: {
            id: product.id,
            name: product.name,
            sku: product.sku || ''
          }
        }
      }
    } catch (error) {
      console.error(`[WooCommerce] ⚠️  Error consultando variaciones de producto ${product.id} (${product.name}):`, error.message)
      // Continuar con el siguiente producto en lugar de fallar completamente
      continue
    }
  }
  
  console.log(`[WooCommerce] ❌ No se encontró variación con SKU "${sku}" (buscado en ${variableProducts.length} productos variables)`)
  return null
}

/**
 * Obtener productos que tengan alguno de los tags indicados (por ID).
 * Útil para "productos similares" cuando el producto actual tiene tags.
 * @param {number[]} tagIds - IDs de tags en WooCommerce
 * @param {number} limit - Máximo de productos a devolver (default 10)
 * @returns {Promise<Array>} Lista de productos con al menos uno de esos tags
 */
export async function getProductsByTag(tagIds, limit = 10) {
  try {
    if (!Array.isArray(tagIds) || tagIds.length === 0) return []
    const ids = tagIds.filter(id => id != null && Number.isFinite(Number(id))).map(Number)
    if (ids.length === 0) return []
    const products = await wcRequest(`products?tag=${ids.join(',')}&per_page=${limit}&status=publish`)
    if (!Array.isArray(products)) return []
    return products.map(product => ({
      id: product.id,
      name: product.name || '',
      sku: product.sku || '',
      price: product.price ? parseFloat(product.price) : null,
      stock_quantity: product.stock_quantity != null ? parseStockQuantity(product.stock_quantity) : null,
      stock_status: product.stock_status || 'unknown',
      type: product.type || 'simple',
      weight: product.weight != null ? String(product.weight).trim() || null : null,
      dimensions: parseDimensions(product.dimensions),
      tags: parseTags(product.tags)
    }))
  } catch (error) {
    console.error('[WooCommerce] Error obteniendo productos por tag:', error.message)
    return []
  }
}

/**
 * Verificar si el servicio está configurado
 * @returns {boolean}
 */
export function isWordPressConfigured() {
  const { WC_URL, WC_KEY, WC_SECRET } = getWooCommerceConfig()
  return !!(WC_URL && WC_KEY && WC_SECRET)
}

export default {
  verifyUserLogin,
  getProductStock,
  searchProductsInWordPress,
  getProductBySku,
  getProductById,
  getProductsSample,
  getAllProducts,
  getCatalogStructure,
  enrichProductWithStockPrice,
  enrichProductsWithStockPrice,
  invalidateCatalogStructureCache,
  getProductVariations,
  getProductsByTag,
  findVariationBySku,
  isWordPressConfigured
}
