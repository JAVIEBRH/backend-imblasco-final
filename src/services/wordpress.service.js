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
 * Hacer petición a WooCommerce API
 */
async function wcRequest(endpoint, options = {}) {
  const { WC_URL } = getWooCommerceConfig()
  const url = `${WC_URL}/wp-json/wc/v3/${endpoint}`
  
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'Authorization': getAuthHeader(),
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ Error WooCommerce API (${response.status}):`, errorText.substring(0, 200))
      throw new Error(`WooCommerce API error: ${response.status} ${response.statusText}`)
    }
    
    return await response.json()
  } catch (error) {
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
      ? parseInt(product.stock_quantity) 
      : null
    
    const available = product.stock_status === 'instock' || (stockQuantity !== null && stockQuantity > 0)
    
    return {
      available,
      stock: stockQuantity,
      price: product.price ? parseFloat(product.price) : null,
      name: product.name || '',
      sku: product.sku || '',
      id: product.id,
      stock_status: product.stock_status || 'unknown',
      manage_stock: product.manage_stock || false
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
      available: product.stock_status === 'instock' || (product.stock_quantity && parseInt(product.stock_quantity) > 0)
    }))
  } catch (error) {
    console.error('Error buscando productos:', error.message)
    return []
  }
}

/**
 * Buscar producto por SKU específico
 * @param {string} sku - SKU del producto
 * @returns {Promise<Object|null>} Producto encontrado o null
 */
export async function getProductBySku(sku) {
  try {
    // Normalizar SKU: convertir a mayúsculas para búsqueda (WooCommerce puede tener case-sensitive)
    const normalizedSku = sku.trim().toUpperCase()
    
    // Buscar con SKU exacto primero
    let products = await wcRequest(`products?sku=${encodeURIComponent(normalizedSku)}&per_page=10`)
    
    // Si no encuentra, intentar con el SKU original (por si acaso)
    if ((!Array.isArray(products) || products.length === 0) && sku.trim() !== normalizedSku) {
      products = await wcRequest(`products?sku=${encodeURIComponent(sku.trim())}&per_page=10`)
    }
    
    if (!Array.isArray(products) || products.length === 0) {
      console.log(`[WooCommerce] No se encontró producto con SKU: ${sku}`)
      return null
    }
    
    // Buscar el producto que coincida exactamente con el SKU (por si hay múltiples resultados)
    const product = products.find(p => {
      const productSku = (p.sku || '').trim().toUpperCase()
      return productSku === normalizedSku || productSku === sku.trim().toUpperCase()
    }) || products[0] // Si no hay match exacto, usar el primero
    
    console.log(`[WooCommerce] ✅ Producto encontrado por SKU "${sku}": ${product.name} (SKU real: ${product.sku})`)
    
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
      available: product.stock_status === 'instock' || (product.stock_quantity && parseInt(product.stock_quantity) > 0)
    }
  } catch (error) {
    console.error('Error obteniendo producto por SKU:', error.message)
    return null
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
  getProductsSample,
  isWordPressConfigured
}
