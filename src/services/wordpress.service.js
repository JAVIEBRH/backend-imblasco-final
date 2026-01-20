/**
 * WORDPRESS / WOOCOMMERCE SERVICE
 * Servicio para conectar con WooCommerce REST API
 * El agente está autenticado con Consumer Key/Secret para consultar productos y stock
 */

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
 * Retry con backoff exponencial para errores transitorios
 * @param {Function} fn - Función a ejecutar
 * @param {number} maxRetries - Número máximo de reintentos (default: 3)
 * @param {number} baseDelay - Delay base en ms (default: 1000)
 * @returns {Promise} Resultado de la función
 */
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      
      // Si es el último intento, lanzar el error
      if (attempt === maxRetries) {
        throw error
      }
      
      // Determinar si es un error transitorio que merece retry
      const isTransientError = 
        error.message?.includes('429') || // Rate limit
        error.message?.includes('500') || // Server error
        error.message?.includes('502') || // Bad gateway
        error.message?.includes('503') || // Service unavailable
        error.message?.includes('504') || // Gateway timeout
        error.message?.includes('timeout') ||
        error.message?.includes('ECONNRESET') ||
        error.message?.includes('ETIMEDOUT')
      
      if (!isTransientError) {
        // Error no transitorio (404, 401, etc.) - no retry
        throw error
      }
      
      // Calcular delay exponencial: 1s, 2s, 4s, 8s...
      const delay = baseDelay * Math.pow(2, attempt)
      console.warn(`[WooCommerce] ⚠️ Error transitorio (intento ${attempt + 1}/${maxRetries + 1}), reintentando en ${delay}ms...`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  throw lastError
}

/**
 * Hacer petición a WooCommerce API con retry automático para errores transitorios
 * @param {string} endpoint - Endpoint de la API
 * @param {Object} options - Opciones de la petición
 * @param {boolean} returnHeaders - Si es true, devuelve { data, headers }
 * @param {number} timeout - Timeout en ms (default: 30000)
 * @returns {Promise} Datos de la respuesta
 */
async function wcRequest(endpoint, options = {}, returnHeaders = false, timeout = 30000) {
  const { WC_URL } = getWooCommerceConfig()
  const url = `${WC_URL}/wp-json/wc/v3/${endpoint}`
  
  return retryWithBackoff(async () => {
    // Crear AbortController para timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)
    
    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers: {
          'Authorization': getAuthHeader(),
          'Content-Type': 'application/json',
          ...options.headers
        },
        signal: controller.signal,
        ...options
      })
      
      clearTimeout(timeoutId)
      
      // Manejar errores HTTP específicos
      if (!response.ok) {
        const status = response.status
        const errorText = await response.text()
        
        // Errores que NO deben retry (errores del cliente)
        if (status === 404) {
          // Producto no encontrado - NO inventar que existe
          throw new Error(`Producto no encontrado (404)`)
        }
        if (status === 401 || status === 403) {
          // No autorizado - problema de credenciales
          throw new Error(`Error de autenticación WooCommerce (${status})`)
        }
        
        // Otros errores pueden ser transitorios
        console.error(`❌ Error WooCommerce API (${status}):`, errorText.substring(0, 200))
        const error = new Error(`WooCommerce API error: ${status} ${response.statusText}`)
        error.status = status
        throw error
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
    } catch (error) {
      clearTimeout(timeoutId)
      
      if (error.name === 'AbortError') {
        const timeoutError = new Error(`Timeout consultando WooCommerce (${timeout}ms)`)
        timeoutError.isTimeout = true
        throw timeoutError
      }
      
      // Re-lanzar error para que retryWithBackoff lo maneje
      throw error
    }
  })
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
      ? parseInt(product.stock_quantity) 
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
      categories: product.categories || []
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
        ? parseInt(product.stock_quantity) 
        : null,
      stock_status: product.stock_status || 'unknown',
      manage_stock: product.manage_stock || false,
      available: product.stock_status === 'instock' || (product.stock_quantity && parseInt(product.stock_quantity) > 0)
    }))
  } catch (error) {
    console.error('Error obteniendo muestra de productos:', error.message)
    return []
  }
}

/**
 * Obtener TODOS los productos de WooCommerce con paginación completa
 * @returns {Promise<Array>} Lista completa de productos
 */
export async function getAllProducts() {
  try {
    console.log('[WooCommerce] Obteniendo todos los productos con paginación...')
    
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
    // CRÍTICO: NO silenciar errores - si una página falla, debe notificarse
    if (totalPages > 1) {
      const pagePromises = []
      const pageErrors = []
      
      for (let page = 2; page <= totalPages; page++) {
        pagePromises.push(
          wcRequest(`products?per_page=100&page=${page}&status=publish`)
            .then(products => {
              console.log(`[WooCommerce] Página ${page}/${totalPages} obtenida: ${Array.isArray(products) ? products.length : 0} productos`)
              return { page, products: Array.isArray(products) ? products : [], error: null }
            })
            .catch(error => {
              // NO silenciar errores - registrar para notificar
              console.error(`[WooCommerce] ❌ Error obteniendo página ${page}/${totalPages}:`, error.message)
              pageErrors.push({ page, error: error.message })
              return { page, products: [], error: error.message }
            })
        )
      }
      
      const remainingPages = await Promise.all(pagePromises)
      
      // Procesar resultados y verificar errores
      remainingPages.forEach(pageResult => {
        if (pageResult.error) {
          // Error ya fue logueado, pero no agregamos productos vacíos
          // Esto evita falsos negativos - si la página falló, no asumimos que no hay productos
          console.warn(`[WooCommerce] ⚠️ Página ${pageResult.page} falló - productos de esta página no incluidos`)
        } else {
          allProducts = allProducts.concat(pageResult.products)
        }
      })
      
      // Si hubo errores, notificar pero no fallar completamente
      if (pageErrors.length > 0) {
        console.warn(`[WooCommerce] ⚠️ ${pageErrors.length} página(s) fallaron de ${totalPages - 1} páginas adicionales`)
        console.warn(`[WooCommerce] ⚠️ Páginas con error:`, pageErrors.map(e => e.page).join(', '))
        // NO lanzar error - retornar productos obtenidos parcialmente
        // El sistema puede funcionar con datos parciales, pero debe estar claro que son parciales
      }
    }
    
    console.log(`[WooCommerce] ✅ Total de productos obtenidos: ${allProducts.length}`)
    
    return allProducts.map(product => ({
      id: product.id,
      name: product.name || '',
      sku: product.sku || '',
      price: product.price ? parseFloat(product.price) : null,
      stock_quantity: product.stock_quantity !== null && product.stock_quantity !== undefined 
        ? parseInt(product.stock_quantity) 
        : null,
      stock_status: product.stock_status || 'unknown',
      manage_stock: product.manage_stock || false,
      available: product.stock_status === 'instock' || (product.stock_quantity && parseInt(product.stock_quantity) > 0),
      type: product.type || 'simple' // Agregar tipo de producto (simple, variable, etc.)
    }))
  } catch (error) {
    console.error('Error obteniendo todos los productos:', error.message)
    return []
  }
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
        ? parseInt(product.stock_quantity) 
        : null,
      stock_status: product.stock_status || 'unknown',
      manage_stock: product.manage_stock || false,
      available: product.stock_status === 'instock' || (product.stock_quantity && parseInt(product.stock_quantity) > 0),
      type: product.type || 'simple',
      description: product.description || '',
      short_description: product.short_description || '',
      attributes: product.attributes || [],
      categories: product.categories || []
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
              ? parseInt(product.stock_quantity) 
              : null,
            stock_status: product.stock_status || 'unknown',
            manage_stock: product.manage_stock || false,
            available: product.stock_status === 'instock' || (product.stock_quantity && parseInt(product.stock_quantity) > 0),
            type: product.type || 'simple',
            description: product.description || '',
            short_description: product.short_description || '',
            attributes: product.attributes || [],
            categories: product.categories || []
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
      const pageErrors = []
      for (let page = 2; page <= totalPages; page++) {
        pagePromises.push(
          wcRequest(`products/${productId}/variations?per_page=100&page=${page}&status=publish`)
            .then(variations => {
              console.log(`[WooCommerce] Variaciones página ${page}/${totalPages}: ${Array.isArray(variations) ? variations.length : 0}`)
              return { page, variations: Array.isArray(variations) ? variations : [], error: null }
            })
            .catch(error => {
              // NO silenciar errores - registrar para notificar
              console.error(`[WooCommerce] ❌ Error obteniendo variaciones página ${page}/${totalPages}:`, error.message)
              pageErrors.push({ page, error: error.message })
              return { page, variations: [], error: error.message }
            })
        )
      }
      
      const remainingPages = await Promise.all(pagePromises)
      
      // Procesar resultados y verificar errores
      remainingPages.forEach(pageResult => {
        if (pageResult.error) {
          console.warn(`[WooCommerce] ⚠️ Variaciones página ${pageResult.page} falló - variaciones de esta página no incluidas`)
        } else {
          allVariations = allVariations.concat(pageResult.variations)
        }
      })
      
      // Si hubo errores, notificar pero no fallar completamente
      if (pageErrors.length > 0) {
        console.warn(`[WooCommerce] ⚠️ ${pageErrors.length} página(s) de variaciones fallaron de ${totalPages - 1} páginas adicionales`)
        console.warn(`[WooCommerce] ⚠️ Páginas con error:`, pageErrors.map(e => e.page).join(', '))
      }
    }
    
    console.log(`[WooCommerce] ✅ Total de variaciones obtenidas para producto ${productId}: ${allVariations.length}`)
    
    return allVariations.map(variation => ({
      id: variation.id,
      name: variation.name || '',
      sku: variation.sku || '',
      price: variation.price ? parseFloat(variation.price) : null,
      stock_quantity: variation.stock_quantity !== null && variation.stock_quantity !== undefined 
        ? parseInt(variation.stock_quantity) 
        : null,
      stock_status: variation.stock_status || 'unknown',
      manage_stock: variation.manage_stock || false,
      available: variation.stock_status === 'instock' || (variation.stock_quantity && parseInt(variation.stock_quantity) > 0),
      attributes: variation.attributes || [], // Array de objetos con {id, name, option}
      parent_id: productId
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
 * Normalizar código/SKU (helper para uso interno)
 * @param {string} code - Código/SKU a normalizar
 * @returns {string} - Código normalizado
 */
function normalizeCode(code) {
  if (!code || typeof code !== 'string') return ''
  return code.toUpperCase().replace(/[-.\s_]/g, '').trim()
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
  getProductsSample,
  getAllProducts,
  getProductVariations,
  findVariationBySku,
  isWordPressConfigured
}
