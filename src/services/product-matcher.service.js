/**
 * PRODUCT MATCHER SERVICE
 * Sistema de matching determinístico y normalizado para productos
 * 
 * PRINCIPIOS:
 * - Matching exacto únicamente (sin fuzzy, sin semántica, sin probabilístico)
 * - Normalización estricta (minúsculas, sin tildes, sin espacios, solo alfanuméricos)
 * - Estados claros: FOUND | AMBIGUOUS | NOT_FOUND
 * - No inferencias, no coincidencias parciales, no resultados ambiguos automáticos
 */

/**
 * Normaliza un texto eliminando tildes, espacios, caracteres especiales
 * y convirtiendo todo a minúsculas, manteniendo solo caracteres alfanuméricos
 * 
 * @param {string} text - Texto a normalizar
 * @returns {string} - Texto normalizado
 * 
 * @example
 * normalizeText("Libreta White PU N35") => "libretawhitepun35"
 * normalizeText("N-35") => "n35"
 * normalizeText("Bolígrafo") => "boligrafo"
 */
export function normalizeText(text) {
  if (!text || typeof text !== 'string') {
    return ''
  }
  
  return text
    .toLowerCase()                          // Convertir a minúsculas
    .normalize('NFD')                       // Descomponer caracteres Unicode (á -> a + ´)
    .replace(/[\u0300-\u036f]/g, '')       // Eliminar diacríticos (tildes, acentos)
    .replace(/[^a-z0-9]/g, '')             // Eliminar todo excepto a-z y 0-9
}

/**
 * Resultado de matching determinístico
 * @typedef {Object} MatchResult
 * @property {string} status - Estado: "FOUND" | "AMBIGUOUS" | "NOT_FOUND"
 * @property {Object|null} product - Producto encontrado (solo si status === "FOUND")
 * @property {string|null} product.sku - SKU del producto
 * @property {string|null} product.name - Nombre del producto
 * @property {Array<Object>} ambiguousProducts - Productos ambiguos (solo si status === "AMBIGUOUS")
 */

/**
 * Busca coincidencia determinística entre la entrada del usuario y una lista de productos
 * 
 * SOLO devuelve FOUND si hay coincidencia exacta normalizada con:
 * - SKU normalizado === entrada normalizada
 * - O nombre normalizado === entrada normalizada
 * 
 * @param {string} userInput - Entrada del usuario (SKU o nombre)
 * @param {Array<Object>} products - Lista de productos a buscar
 * @param {Function} getSku - Función para obtener SKU del producto (product) => string
 * @param {Function} getName - Función para obtener nombre del producto (product) => string
 * @returns {MatchResult} - Resultado del matching
 * 
 * @example
 * const products = [
 *   { sku: "N35", name: "Libreta White PU N35" },
 *   { sku: "N42", name: "Libreta White PU N42" }
 * ]
 * 
 * matchProduct("n35", products, p => p.sku, p => p.name)
 * // => { status: "FOUND", product: { sku: "N35", name: "Libreta White PU N35" }, ambiguousProducts: [] }
 * 
 * matchProduct("libretawhitepun35", products, p => p.sku, p => p.name)
 * // => { status: "FOUND", product: { sku: "N35", name: "Libreta White PU N35" }, ambiguousProducts: [] }
 * 
 * matchProduct("libreta", products, p => p.sku, p => p.name)
 * // => { status: "AMBIGUOUS", product: null, ambiguousProducts: [...] }
 */
export function matchProduct(userInput, products, getSku, getName) {
  // Validación de entrada
  if (!userInput || typeof userInput !== 'string' || userInput.trim().length === 0) {
    return {
      status: 'NOT_FOUND',
      product: null,
      ambiguousProducts: []
    }
  }
  
  if (!Array.isArray(products) || products.length === 0) {
    return {
      status: 'NOT_FOUND',
      product: null,
      ambiguousProducts: []
    }
  }
  
  // Normalizar entrada del usuario
  const normalizedInput = normalizeText(userInput)
  
  if (normalizedInput.length === 0) {
    return {
      status: 'NOT_FOUND',
      product: null,
      ambiguousProducts: []
    }
  }
  
  // Buscar coincidencias exactas
  const matches = []
  
  for (const product of products) {
    const sku = getSku(product) || ''
    const name = getName(product) || ''
    
    const normalizedSku = normalizeText(sku)
    const normalizedName = normalizeText(name)
    
    // Coincidencia exacta por SKU o nombre
    if (normalizedSku === normalizedInput || normalizedName === normalizedInput) {
      matches.push({
        product,
        matchType: normalizedSku === normalizedInput ? 'SKU' : 'NAME'
      })
    }
  }
  
  // Determinar estado del resultado
  if (matches.length === 0) {
    return {
      status: 'NOT_FOUND',
      product: null,
      ambiguousProducts: []
    }
  }
  
  if (matches.length === 1) {
    // Coincidencia única: FOUND
    const match = matches[0]
    return {
      status: 'FOUND',
      product: {
        sku: getSku(match.product) || null,
        name: getName(match.product) || null,
        originalProduct: match.product
      },
      ambiguousProducts: []
    }
  }
  
  // Múltiples coincidencias: AMBIGUOUS
  return {
    status: 'AMBIGUOUS',
    product: null,
    ambiguousProducts: matches.map(match => ({
      sku: getSku(match.product) || null,
      name: getName(match.product) || null,
      matchType: match.matchType,
      originalProduct: match.product
    }))
  }
}

/**
 * Busca coincidencia determinística por SKU únicamente
 * 
 * @param {string} skuInput - SKU de entrada (puede estar normalizado o no)
 * @param {Array<Object>} products - Lista de productos
 * @param {Function} getSku - Función para obtener SKU del producto
 * @returns {MatchResult} - Resultado del matching
 */
export function matchBySku(skuInput, products, getSku) {
  if (!skuInput || typeof skuInput !== 'string' || skuInput.trim().length === 0) {
    return {
      status: 'NOT_FOUND',
      product: null,
      ambiguousProducts: []
    }
  }
  
  if (!Array.isArray(products) || products.length === 0) {
    return {
      status: 'NOT_FOUND',
      product: null,
      ambiguousProducts: []
    }
  }
  
  const normalizedInput = normalizeText(skuInput)
  
  if (normalizedInput.length === 0) {
    return {
      status: 'NOT_FOUND',
      product: null,
      ambiguousProducts: []
    }
  }
  
  const matches = products.filter(product => {
    const sku = getSku(product) || ''
    const normalizedSku = normalizeText(sku)
    return normalizedSku === normalizedInput
  })
  
  if (matches.length === 0) {
    return {
      status: 'NOT_FOUND',
      product: null,
      ambiguousProducts: []
    }
  }
  
  if (matches.length === 1) {
    return {
      status: 'FOUND',
      product: {
        sku: getSku(matches[0]) || null,
        originalProduct: matches[0]
      },
      ambiguousProducts: []
    }
  }
  
  // Múltiples productos con el mismo SKU normalizado (caso raro pero posible)
  return {
    status: 'AMBIGUOUS',
    product: null,
    ambiguousProducts: matches.map(product => ({
      sku: getSku(product) || null,
      originalProduct: product
    }))
  }
}

/**
 * Busca coincidencia determinística por nombre únicamente
 * 
 * @param {string} nameInput - Nombre de entrada
 * @param {Array<Object>} products - Lista de productos
 * @param {Function} getName - Función para obtener nombre del producto
 * @returns {MatchResult} - Resultado del matching
 */
export function matchByName(nameInput, products, getName) {
  if (!nameInput || typeof nameInput !== 'string' || nameInput.trim().length === 0) {
    return {
      status: 'NOT_FOUND',
      product: null,
      ambiguousProducts: []
    }
  }
  
  if (!Array.isArray(products) || products.length === 0) {
    return {
      status: 'NOT_FOUND',
      product: null,
      ambiguousProducts: []
    }
  }
  
  const normalizedInput = normalizeText(nameInput)
  
  if (normalizedInput.length === 0) {
    return {
      status: 'NOT_FOUND',
      product: null,
      ambiguousProducts: []
    }
  }
  
  const matches = products.filter(product => {
    const name = getName(product) || ''
    const normalizedName = normalizeText(name)
    return normalizedName === normalizedInput
  })
  
  if (matches.length === 0) {
    return {
      status: 'NOT_FOUND',
      product: null,
      ambiguousProducts: []
    }
  }
  
  if (matches.length === 1) {
    return {
      status: 'FOUND',
      product: {
        name: getName(matches[0]) || null,
        originalProduct: matches[0]
      },
      ambiguousProducts: []
    }
  }
  
  return {
    status: 'AMBIGUOUS',
    product: null,
    ambiguousProducts: matches.map(product => ({
      name: getName(product) || null,
      originalProduct: product
    }))
  }
}

export default {
  normalizeText,
  matchProduct,
  matchBySku,
  matchByName
}
