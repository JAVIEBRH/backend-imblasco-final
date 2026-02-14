# Plan: Optimización de búsqueda - Evitar descarga completa de catálogo

## Problema identificado

**Síntoma:** Consultas que tardan 30-38 segundos porque descargan todo el catálogo (1494 productos, 15 páginas) cuando no deberían.

**Casos problemáticos de los logs:**
1. "estuche de medidas 16,4 x 5,5 x 2,8 cms" → 38.6s
   - AMBIGUA promovida a PRODUCTOS
   - Término extraído: "estuche medida 16 cms cms cms" (raro)
   - Búsqueda API devuelve 0 o >=100 → descarga todo el catálogo
   - Además detecta mal "X 2" como SKU

2. "cuantas unidades trae el embalaje master?" → 34.8s
   - CARACTERISTICAS → PRODUCTOS
   - Término: "cuanta trae embalaje master" (no es nombre de producto)
   - Búsqueda API devuelve 0 → descarga todo el catálogo dos veces

3. "que personalizacion tiene el producto BP10?" → 20.2s
   - CARACTERISTICAS → PRODUCTOS
   - Término: "BP10" (correcto, pero pregunta sobre atributo, no búsqueda)
   - Encuentra producto, pero igual descarga catálogo si búsqueda API falla

**Causa raíz:** No hay detección temprana de que estas consultas **NO son búsqueda de producto por nombre**. Son:
- Preguntas sobre características/atributos del producto en contexto
- Preguntas sobre medidas/dimensiones sin nombre claro de producto
- Preguntas genéricas sobre productos sin término específico válido

---

## Solución propuesta

### Estrategia: Detección temprana conservadora

**Principio:** Solo bloquear casos **claramente** no-búsqueda. Si hay duda, permitir la búsqueda normal (mejor falsos positivos que perder búsquedas legítimas).

### 1. Nueva función: `shouldSkipFullCatalogSearch()`

**Ubicación:** `conversation.service.js`, después de `extractProductTerm()` (aprox. línea 503)

**Propósito:** Detectar si una consulta NO debería disparar búsqueda de catálogo completo ANTES de llamar a `getAllProducts()`.

**Criterios de bloqueo (conservadores):**

#### A. Preguntas sobre características/atributos sin término de producto válido

**Patrones:**
- "cuantas unidades trae [algo]"
- "que [atributo] tiene [algo]"
- "cuantas [unidades/cajas/piezas] [trae/contiene/viene]"
- "que [personalizacion/caracteristicas/especificaciones] tiene"

**Lógica:**
- Si el término extraído (`extractProductTerm`) es genérico o muy corto (< 3 caracteres)
- Y el mensaje contiene palabras clave de "característica" (unidades, trae, contiene, personalizacion, etc.)
- → Bloquear descarga completa

**Ejemplo:**
```
Mensaje: "cuantas unidades trae el embalaje master?"
Término extraído: "embalaje master" (válido, pero pregunta sobre atributo)
→ NO bloquear (término válido, puede ser búsqueda legítima)

Mensaje: "cuantas unidades trae el embalaje?"
Término extraído: "embalaje" (válido)
→ NO bloquear

Mensaje: "cuantas unidades trae?"
Término extraído: "" o muy corto
→ BLOQUEAR (no hay término de producto)
```

#### B. Medidas/dimensiones sin nombre de producto claro

**Patrones:**
- "estuche de medidas [X] x [Y] x [Z]"
- "producto de [medidas/dimensiones] [X] x [Y]"
- Contiene números con "x" o "X" entre ellos (patrón de medidas)

**Lógica:**
- Si el mensaje contiene patrón de medidas (ej. "16,4 x 5,5 x 2,8", "10x20x5")
- Y el término extraído después de limpiar medidas es genérico o muy corto
- → Bloquear descarga completa

**Ejemplo:**
```
Mensaje: "estuche de medidas 16,4 x 5,5 x 2,8 cms"
Término después de limpiar medidas: "estuche" (válido)
→ NO bloquear (puede buscar "estuche" y luego filtrar por medidas)

Mensaje: "producto de medidas 10x20x5"
Término después de limpiar medidas: "" o muy corto
→ BLOQUEAR (no hay nombre de producto)
```

#### C. Preguntas genéricas sobre productos sin término específico

**Ya cubierto parcialmente por `extractProductTerm()` y `TERMINOS_GENERICOS_PRODUCTO`**, pero reforzar:

- Si el término extraído está vacío o solo contiene palabras genéricas
- Y el mensaje no contiene SKU/ID explícito
- → Bloquear descarga completa

---

### 2. Integración en el flujo de búsqueda

**Puntos de integración:**

#### A. Bloque PRODUCTOS/RECOMENDACION (línea ~1950)

**Antes de:** `terminoProductoParaBuscar = context.terminoProductoParaBuscar || extractProductTerm(message)`

**Añadir:**
```javascript
// Detección temprana: ¿esta consulta debería evitar descarga completa de catálogo?
const shouldSkipFullCatalog = shouldSkipFullCatalogSearch(message, terminoProductoParaBuscar, queryType)
if (shouldSkipFullCatalog) {
  console.log(`[WooCommerce] ⚠️ Consulta detectada como no-búsqueda de producto por nombre → evitando descarga completa de catálogo`)
  // Continuar flujo pero sin llamar a getAllProducts()
  // En su lugar, responder con mensaje apropiado o usar búsqueda API limitada
}
```

#### B. Bloque matching determinístico (línea ~2550)

**Antes de:** `allProducts = await wordpressService.getAllProducts()`

**Añadir:**
```javascript
// Si ya detectamos que no debería descargar catálogo completo, usar solo búsqueda API limitada
if (shouldSkipFullCatalog) {
  // Intentar solo búsqueda API rápida (limitada a 20-30 resultados)
  allProducts = await wordpressService.searchProductsInWordPress(termToUse, 30)
  if (!allProducts || allProducts.length === 0) {
    // Si no hay resultados, responder directamente sin descargar catálogo completo
    console.log(`[WooCommerce] ⚠️ Búsqueda API sin resultados y consulta no es búsqueda por nombre → omitiendo catálogo completo`)
    // Continuar con flujo de "no encontrado" sin getAllProducts()
  }
}
```

---

### 3. Función `shouldSkipFullCatalogSearch()` - Implementación

```javascript
/**
 * Detecta si una consulta NO debería disparar descarga completa de catálogo.
 * Conservadora: solo bloquea casos claramente no-búsqueda.
 * 
 * @param {string} message - Mensaje original del usuario
 * @param {string} extractedTerm - Término extraído por extractProductTerm()
 * @param {string} queryType - Tipo de consulta (PRODUCTOS, RECOMENDACION, etc.)
 * @returns {boolean} - true si debería evitar getAllProducts(), false si puede buscar normalmente
 */
function shouldSkipFullCatalogSearch(message, extractedTerm, queryType) {
  if (!message || typeof message !== 'string') return false
  
  const msgNorm = message.toLowerCase().trim()
  const termNorm = (extractedTerm || '').toLowerCase().trim()
  
  // Criterio 1: Preguntas sobre características/atributos sin término válido
  const caracteristicasPatterns = [
    /cuantas?\s+(unidades?|cajas?|piezas?|unidad)\s+(trae|contiene|viene|incluye)/i,
    /que\s+(personalizacion|caracteristicas|especificaciones|atributos?)\s+tiene/i,
    /cuantas?\s+(unidades?|cajas?)\s+(trae|contiene)\s+el\s+(embalaje|master|pack)/i
  ]
  
  const isCaracteristicasQuery = caracteristicasPatterns.some(pattern => pattern.test(message))
  if (isCaracteristicasQuery) {
    // Si el término extraído es muy corto o genérico, bloquear
    if (!termNorm || termNorm.length < 3 || TERMINOS_GENERICOS_PRODUCTO.some(gen => termNorm === gen)) {
      console.log(`[WooCommerce] ⚠️ Pregunta sobre características sin término válido → evitando catálogo completo`)
      return true
    }
  }
  
  // Criterio 2: Medidas/dimensiones sin nombre de producto claro
  const medidasPattern = /\d+[,.]?\d*\s*[xX×]\s*\d+[,.]?\d*(\s*[xX×]\s*\d+[,.]?\d*)?/ // Ej: "16,4 x 5,5 x 2,8" o "10x20x5"
  const hasMedidas = medidasPattern.test(message)
  
  if (hasMedidas) {
    // Limpiar medidas del mensaje y ver si queda término válido
    const sinMedidas = message
      .replace(/\d+[,.]?\d*\s*[xX×]\s*\d+[,.]?\d*(\s*[xX×]\s*\d+[,.]?\d*)?/g, '')
      .replace(/medidas?|dimensiones?|cms?|cm\.|metros?/gi, '')
      .trim()
    
    const termSinMedidas = extractProductTerm(sinMedidas)
    if (!termSinMedidas || termSinMedidas.length < 3) {
      console.log(`[WooCommerce] ⚠️ Medidas sin nombre de producto válido → evitando catálogo completo`)
      return true
    }
  }
  
  // Criterio 3: Término genérico o vacío sin SKU/ID explícito
  if (!termNorm || termNorm.length < 2) {
    // Verificar si hay SKU/ID explícito en el mensaje
    const hasExplicitSku = /\b(SKU|SKU:|codigo|código|id|ID):?\s*[A-Za-z0-9]+/i.test(message) || 
                           /\b\d{6,}\b/.test(message) || // SKU numérico largo
                           /\b[A-Za-z]\d+[A-Za-z]?[-.]?\d*\b/i.test(message) // SKU tipo "K62", "XL10"
    
    if (!hasExplicitSku) {
      console.log(`[WooCommerce] ⚠️ Término vacío/genérico sin SKU explícito → evitando catálogo completo`)
      return true
    }
  }
  
  // Si no cumple ningún criterio de bloqueo, permitir búsqueda normal
  return false
}
```

---

### 4. Mejora adicional: Detección de SKU en medidas

**Problema:** "X 2" en "X 2,8 cms" se detecta como SKU.

**Solución:** En la detección de SKU (línea ~1974), añadir validación:

```javascript
// Antes de agregar SKU detectado, verificar que no está en contexto de medidas
const medidasContextPattern = /\d+[,.]?\d*\s*[xX×]\s*\d+[,.]?\d*(\s*[xX×]\s*\d+[,.]?\d*)?/
const isInMedidasContext = medidasContextPattern.test(message)

if (isInMedidasContext) {
  // Extraer el contexto alrededor del SKU detectado
  const skuIndex = message.indexOf(sku)
  const contextBefore = message.substring(Math.max(0, skuIndex - 20), skuIndex)
  const contextAfter = message.substring(skuIndex + sku.length, Math.min(message.length, skuIndex + sku.length + 20))
  
  // Si el contexto contiene números con "x" o "X", probablemente es medida, no SKU
  if (/\d+\s*[xX×]\s*\d+/.test(contextBefore + contextAfter)) {
    console.log(`[WooCommerce] ⚠️ SKU "${sku}" detectado en contexto de medidas → ignorando`)
    continue // No agregar este SKU
  }
}
```

---

## Orden de implementación

1. **Crear función `shouldSkipFullCatalogSearch()`** en `conversation.service.js` (después de `extractProductTerm`)
2. **Integrar en bloque PRODUCTOS/RECOMENDACION** (línea ~1950) - antes de extraer término
3. **Integrar en bloque matching determinístico** (línea ~2550) - antes de `getAllProducts()`
4. **Mejorar detección de SKU** para ignorar "X 2" en medidas (línea ~1974)
5. **Probar con casos de los logs:**
   - "cuantas unidades trae el embalaje master?" → debería evitar catálogo completo
   - "estuche de medidas 16,4 x 5,5 x 2,8 cms" → debería evitar catálogo completo si término es genérico
   - "tienen el producto K62?" → debería seguir funcionando normalmente (término válido)

---

## Beneficios esperados

- **Reducción de tiempo:** Consultas no-búsqueda pasan de 30-38s a <5s (solo búsqueda API limitada o respuesta directa)
- **Menor carga:** Menos llamadas a WooCommerce API (15 páginas → 0-1 petición)
- **Mejor UX:** Respuestas más rápidas cuando el usuario pregunta sobre características en lugar de buscar productos
- **Sin regresiones:** Búsquedas legítimas siguen funcionando igual (criterios conservadores)

---

## Riesgos y mitigación

**Riesgo:** Bloquear una búsqueda legítima por error.

**Mitigación:**
- Criterios conservadores: solo bloquear casos claros
- Mantener búsqueda API limitada incluso cuando se bloquea catálogo completo
- Logs claros para monitorear qué se bloquea
- Si hay término válido (>3 caracteres, no genérico), NO bloquear

**Riesgo:** Cambiar comportamiento de búsquedas existentes.

**Mitigación:**
- La función es opt-in: solo afecta cuando `shouldSkipFullCatalog === true`
- Búsquedas con SKU/ID explícito siguen igual
- Búsquedas con término válido siguen igual
- Solo afecta casos edge donde término es genérico/vacío Y pregunta sobre características
