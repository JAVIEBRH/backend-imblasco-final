# Solución: Caché de catálogo SIN stock (estructura solamente)

## Problema identificado

**Tu preocupación es válida:** Si cacheamos el catálogo completo con `stock_quantity` incluido, el stock quedaría desactualizado.

**Evidencia del código:**
- `getAllProducts()` devuelve productos con `stock_quantity` (línea 378-380 de wordpress.service.js)
- Cuando se encuentra un producto, se usa directamente `productStockData.stock_quantity` del catálogo
- Si cacheamos esto, el stock quedaría "congelado" hasta que expire el caché

---

## Solución: Caché de estructura + Stock en tiempo real

### Estrategia híbrida

**1. Caché de estructura del catálogo (sin stock/precio)**
- **Qué cachear:** `id`, `name`, `sku`, `type`, `tags`, `dimensions`, `weight` (datos que cambian poco)
- **TTL:** 10-15 minutos (estructura de productos cambia raramente)
- **Qué NO cachear:** `stock_quantity`, `stock_status`, `price` (datos que cambian frecuentemente)

**2. Consulta de stock/precio en tiempo real cuando se necesita**
- Cuando se encuentra un producto en el catálogo cacheado, consultar stock/precio actualizado con `getProductById(productId)`
- Solo 1 petición HTTP adicional por producto encontrado (vs 15 peticiones para descargar todo el catálogo)

**3. Caché de stock/precio con TTL muy corto (opcional)**
- Si el mismo producto se consulta varias veces en <30 segundos, usar caché
- TTL: 30-60 segundos máximo

---

## Implementación propuesta

### 1. Modificar `getAllProducts()` para aceptar parámetro `includeStock`

```javascript
// wordpress.service.js
export async function getAllProducts({ includeStock = false } = {}) {
  // ... código existente de descarga ...
  
  return allProducts.map(product => ({
    id: product.id,
    name: product.name || '',
    sku: product.sku || '',
    type: product.type || 'simple',
    tags: parseTags(product.tags),
    dimensions: parseDimensions(product.dimensions),
    weight: product.weight != null ? String(product.weight).trim() || null,
    // Solo incluir stock/precio si se solicita explícitamente
    ...(includeStock && {
      price: product.price ? parseFloat(product.price) : null,
      stock_quantity: product.stock_quantity !== null && product.stock_quantity !== undefined 
        ? parseStockQuantity(product.stock_quantity) 
        : null,
      stock_status: product.stock_status || 'unknown',
      manage_stock: product.manage_stock || false,
      available: product.stock_status === 'instock' || (product.stock_quantity != null && parseStockQuantity(product.stock_quantity) > 0)
    })
  }))
}
```

### 2. Crear caché de estructura del catálogo

```javascript
// wordpress.service.js (al inicio del archivo)

// Caché de estructura del catálogo (sin stock/precio)
let catalogStructureCache = null
let catalogStructureCacheTimestamp = null
const CATALOG_STRUCTURE_TTL_MS = 10 * 60 * 1000 // 10 minutos

/**
 * Obtener estructura del catálogo (sin stock/precio) con caché
 * @returns {Promise<Array>} Lista de productos con id, name, sku, type, tags, etc. (sin stock/precio)
 */
export async function getCatalogStructure() {
  const now = Date.now()
  
  // Si hay caché válido, devolverlo
  if (catalogStructureCache && catalogStructureCacheTimestamp && 
      (now - catalogStructureCacheTimestamp) < CATALOG_STRUCTURE_TTL_MS) {
    console.log(`[WooCommerce] ✅ Usando estructura del catálogo desde caché (${catalogStructureCache.length} productos)`)
    return catalogStructureCache
  }
  
  // Descargar estructura completa (sin stock)
  console.log(`[WooCommerce] Descargando estructura del catálogo (sin stock/precio)...`)
  catalogStructureCache = await getAllProducts({ includeStock: false })
  catalogStructureCacheTimestamp = now
  
  console.log(`[WooCommerce] ✅ Estructura del catálogo cacheada: ${catalogStructureCache.length} productos`)
  return catalogStructureCache
}

/**
 * Invalidar caché de estructura (llamar cuando haya cambios en productos)
 */
export function invalidateCatalogStructureCache() {
  catalogStructureCache = null
  catalogStructureCacheTimestamp = null
  console.log('[WooCommerce] Caché de estructura del catálogo invalidado')
}
```

### 3. Función helper para enriquecer producto con stock/precio actualizado

```javascript
// wordpress.service.js

// Caché de stock/precio por producto (TTL muy corto)
const stockPriceCache = new Map() // productId -> { stock, price, timestamp }
const STOCK_PRICE_TTL_MS = 30 * 1000 // 30 segundos

/**
 * Enriquecer producto con stock/precio actualizado
 * @param {Object} product - Producto de la estructura del catálogo (sin stock/precio)
 * @returns {Promise<Object>} Producto con stock/precio actualizado
 */
export async function enrichProductWithStockPrice(product) {
  if (!product || !product.id) return product
  
  const now = Date.now()
  const cached = stockPriceCache.get(product.id)
  
  // Si hay caché válido de stock/precio, usarlo
  if (cached && (now - cached.timestamp) < STOCK_PRICE_TTL_MS) {
    return {
      ...product,
      stock_quantity: cached.stock_quantity,
      stock_status: cached.stock_status,
      price: cached.price,
      available: cached.available
    }
  }
  
  // Consultar stock/precio en tiempo real
  try {
    const fullProduct = await getProductById(product.id)
    const enriched = {
      ...product,
      stock_quantity: fullProduct.stock_quantity,
      stock_status: fullProduct.stock_status,
      price: fullProduct.price,
      available: fullProduct.available
    }
    
    // Guardar en caché de stock/precio
    stockPriceCache.set(product.id, {
      stock_quantity: fullProduct.stock_quantity,
      stock_status: fullProduct.stock_status,
      price: fullProduct.price,
      available: fullProduct.available,
      timestamp: now
    })
    
    return enriched
  } catch (error) {
    console.error(`[WooCommerce] Error enriqueciendo producto ${product.id} con stock/precio:`, error.message)
    return product // Devolver producto sin stock si falla
  }
}
```

### 4. Modificar `conversation.service.js` para usar estructura cacheada + stock en tiempo real

**En lugar de:**
```javascript
const allProducts = await wordpressService.getAllProducts()
```

**Usar:**
```javascript
// Obtener estructura del catálogo desde caché (rápido, sin stock)
const catalogStructure = await wordpressService.getCatalogStructure()

// Aplicar matching determinístico sobre estructura (sin stock)
const matchResult = productMatcher.matchProduct(
  termToUse,
  catalogStructure, // Solo estructura, sin stock
  p => p.sku || '',
  p => p.name || ''
)

if (matchResult.status === 'FOUND') {
  // Enriquecer producto encontrado con stock/precio actualizado (1 petición HTTP)
  productStockData = await wordpressService.enrichProductWithStockPrice(matchResult.product.originalProduct)
  // ... resto del código
}
```

---

## Beneficios de esta solución

### ✅ Stock siempre actualizado
- Stock/precio se consulta en tiempo real cuando se necesita
- Caché de stock/precio con TTL de 30s solo para evitar consultas repetidas del mismo producto en segundos

### ✅ Reducción drástica de tiempo
- **Antes:** 15 peticiones HTTP para descargar catálogo completo = 30-38s
- **Ahora:** 1 petición HTTP para estructura (cacheada después de primera vez) + 1 petición para stock/precio del producto encontrado = ~2-3s

### ✅ Menor carga en WooCommerce
- Estructura del catálogo se descarga 1 vez cada 10 minutos (compartida entre todos los usuarios)
- Stock/precio solo se consulta para productos encontrados (1-5 productos por consulta)

### ✅ Sin congelar stock
- Stock siempre se consulta en tiempo real
- Caché de stock solo dura 30 segundos (para evitar consultas repetidas del mismo producto)

---

## Comparación de tiempos

### Escenario: Usuario busca "K62"

**Antes (sin caché):**
1. Descargar catálogo completo: 15 peticiones HTTP = ~30s
2. Matching determinístico: ~2s
3. Encontrar producto: ~1s
4. **Total: ~33s**

**Ahora (con caché de estructura):**
1. Obtener estructura desde caché: ~0.01s (ya está en memoria)
2. Matching determinístico: ~2s
3. Encontrar producto: ~1s
4. Enriquecer con stock/precio: 1 petición HTTP = ~1s
5. **Total: ~4s** (reducción de 88%)

### Escenario: Segundo usuario busca "M181" (mismo minuto)

**Antes:**
1. Descargar catálogo completo otra vez: 15 peticiones = ~30s
2. Matching: ~2s
3. Encontrar: ~1s
4. **Total: ~33s**

**Ahora:**
1. Obtener estructura desde caché: ~0.01s (reutiliza caché del primer usuario)
2. Matching: ~2s
3. Encontrar: ~1s
4. Enriquecer con stock/precio: 1 petición = ~1s
5. **Total: ~4s** (reducción de 88%)

---

## Manejo de concurrencia

**Problema:** Si 5 usuarios hacen consultas al mismo tiempo y el caché está vacío, todos intentarían descargar el catálogo simultáneamente.

**Solución: Semáforo simple**

```javascript
// wordpress.service.js

let catalogDownloadInProgress = false
let catalogDownloadPromise = null

export async function getCatalogStructure() {
  const now = Date.now()
  
  // Si hay caché válido, devolverlo
  if (catalogStructureCache && catalogStructureCacheTimestamp && 
      (now - catalogStructureCacheTimestamp) < CATALOG_STRUCTURE_TTL_MS) {
    return catalogStructureCache
  }
  
  // Si ya hay una descarga en progreso, esperar a que termine y reutilizar resultado
  if (catalogDownloadInProgress && catalogDownloadPromise) {
    console.log('[WooCommerce] Esperando descarga de catálogo en progreso...')
    return await catalogDownloadPromise
  }
  
  // Iniciar descarga (solo una a la vez)
  catalogDownloadInProgress = true
  catalogDownloadPromise = getAllProducts({ includeStock: false })
    .then(products => {
      catalogStructureCache = products
      catalogStructureCacheTimestamp = Date.now()
      catalogDownloadInProgress = false
      catalogDownloadPromise = null
      return products
    })
    .catch(error => {
      catalogDownloadInProgress = false
      catalogDownloadPromise = null
      throw error
    })
  
  return await catalogDownloadPromise
}
```

**Resultado:** Si 5 usuarios hacen consultas al mismo tiempo y el caché está vacío:
- Usuario 1 inicia descarga (15 peticiones HTTP)
- Usuarios 2-5 esperan a que termine
- Cuando termina, todos usan el mismo caché
- **Total:** 15 peticiones HTTP en lugar de 75

---

## Invalidación del caché

**Cuándo invalidar:**
- **Manual:** Endpoint `/api/admin/invalidate-catalog-cache` para invalidar cuando haya cambios
- **Automático:** TTL de 10 minutos (estructura cambia raramente)
- **Webhook (futuro):** Si WooCommerce envía webhook cuando se crea/modifica producto, invalidar caché

---

## Resumen

**Solución:** Caché de estructura del catálogo (sin stock/precio) + consulta de stock/precio en tiempo real cuando se necesita.

**Ventajas:**
- ✅ Stock siempre actualizado (se consulta en tiempo real)
- ✅ Reducción de tiempo: 33s → 4s (88% más rápido)
- ✅ Menor carga: 15 peticiones cada 10 minutos vs 15 peticiones por consulta
- ✅ Manejo de concurrencia: solo 1 descarga a la vez, resto reutiliza caché
- ✅ Sin congelar stock: stock/precio siempre fresco

**Implementación:**
1. Modificar `getAllProducts()` para aceptar `includeStock: false`
2. Crear `getCatalogStructure()` con caché
3. Crear `enrichProductWithStockPrice()` para consultar stock en tiempo real
4. Modificar `conversation.service.js` para usar estructura cacheada + enriquecimiento
5. Añadir semáforo para manejar concurrencia

¿Te parece bien esta solución? ¿Quieres que la implemente?
