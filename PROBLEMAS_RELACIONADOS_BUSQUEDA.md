# Problemas relacionados con búsqueda y descarga de catálogo

## Problemas identificados (además de los ya documentados)

---

## 1. **Escalabilidad: catálogo creciente**

**Problema:** Si el catálogo crece de 1494 a 3000+ productos, el problema empeorará exponencialmente.

**Impacto actual:**
- 1494 productos = 15 páginas = 15 peticiones HTTP
- Tiempo: ~30-38 segundos
- Si crece a 3000 productos = 30 páginas = 30 peticiones HTTP
- Tiempo estimado: ~60-80 segundos

**Riesgo:** El sistema se volverá inutilizable en producción si el catálogo crece.

**Solución propuesta:**
- **Caché en memoria** del catálogo completo (TTL 5-10 minutos)
- **Caché en Redis/MongoDB** para persistencia entre reinicios
- **Invalidación inteligente:** Solo refrescar cuando haya cambios reales (webhook de WooCommerce o manual)

---

## 2. **Concurrencia: múltiples usuarios descargando catálogo simultáneamente**

**Problema:** Si 5 usuarios hacen consultas que disparan `getAllProducts()` al mismo tiempo:
- 5 usuarios × 15 peticiones = **75 peticiones HTTP simultáneas** a WooCommerce
- Puede sobrecargar WooCommerce API
- Puede causar rate limiting (429 Too Many Requests)
- Puede hacer que todas las consultas fallen o sean muy lentas

**Evidencia en código:**
```javascript
// wordpress.service.js línea 350-365
const pagePromises = []
for (let page = 2; page <= totalPages; page++) {
  pagePromises.push(wcRequest(...)) // Todas en paralelo
}
const remainingPages = await Promise.all(pagePromises) // 14 peticiones simultáneas
```

**Riesgo:** En producción con varios usuarios concurrentes, el sistema puede colapsar.

**Solución propuesta:**
- **Semáforo/Mutex:** Solo permitir una descarga completa de catálogo a la vez
- **Caché compartido:** Primera request descarga, las demás esperan y reutilizan el resultado
- **Rate limiting interno:** Máximo N descargas completas por minuto

---

## 3. **Sin caché: descarga repetida del mismo catálogo**

**Problema:** Cada vez que se necesita el catálogo completo, se descarga de nuevo (15 peticiones HTTP).

**Ejemplo del problema:**
- Usuario 1 pregunta "estuche de medidas..." → descarga 1494 productos (38s)
- Usuario 2 pregunta "cuantas unidades trae..." → descarga 1494 productos de nuevo (34s)
- Usuario 1 pregunta otra cosa que requiere catálogo → descarga 1494 productos otra vez

**Impacto:**
- Carga innecesaria en WooCommerce
- Tiempo desperdiciado
- Costo de ancho de banda

**Solución propuesta:**
- **Caché en memoria** (Map o variable global) con TTL corto (5 minutos)
- **Invalidación:** Refrescar solo cuando sea necesario
- **Compartir entre requests:** Mismo catálogo para todos los usuarios mientras esté en caché

---

## 4. **Costo de API: límites de rate de WooCommerce**

**Problema:** WooCommerce puede tener límites de rate (ej. 100 requests/minuto).

**Escenario problemático:**
- 10 usuarios concurrentes haciendo consultas que disparan `getAllProducts()`
- Cada `getAllProducts()` = 15 peticiones
- 10 × 15 = **150 peticiones en ~30 segundos**
- Si el límite es 100/min, se excede y WooCommerce devuelve 429

**Riesgo:** Errores 429 en producción, consultas fallando.

**Solución propuesta:**
- **Rate limiting interno:** Limitar cuántas descargas completas se hacen por minuto
- **Backoff exponencial:** Si hay 429, esperar antes de reintentar
- **Caché agresivo:** Reducir necesidad de descargas completas

---

## 5. **Memoria: 1494 productos cargados en memoria por request**

**Problema:** Cada request que descarga el catálogo completo carga ~1494 objetos en memoria.

**Impacto:**
- Si hay 10 requests concurrentes descargando catálogo = ~15,000 objetos en memoria
- En Render (plan gratuito/básico), puede causar problemas de memoria
- Puede causar OOM (Out of Memory) si hay muchos usuarios

**Solución propuesta:**
- **Caché compartido:** Solo una copia en memoria, no una por request
- **Streaming/Chunking:** Procesar productos en chunks en lugar de cargar todo
- **Limpieza:** Liberar memoria después de usar el catálogo

---

## 6. **Variaciones: carga costosa para múltiples productos**

**Problema:** Cuando se encuentra un producto variable, se cargan todas sus variaciones.

**Del log:**
```
[WooCommerce] Producto 14383: 3 variaciones en 1 página(s)
[WooCommerce] Producto 4039: 3 variaciones en 1 página(s)
```

**Escenario problemático:**
- Búsqueda devuelve 5 productos variables
- Cada uno tiene 3-10 variaciones
- Se hacen 5-50 peticiones adicionales a WooCommerce
- Tiempo adicional: +5-15 segundos

**Riesgo:** Si la búsqueda devuelve muchos productos variables, el tiempo se dispara.

**Solución propuesta:**
- **Lazy loading:** Solo cargar variaciones cuando el usuario las pide explícitamente
- **Caché de variaciones:** Guardar variaciones en contexto/sesión para no recargar
- **Batch requests:** Si WooCommerce lo soporta, pedir variaciones de múltiples productos en una sola petición

---

## 7. **Búsqueda parcial: descarga catálogo completo incluso con resultados parciales**

**Problema:** Cuando busca por palabras parciales y encuentra resultados, igual descarga todo el catálogo si la búsqueda API devuelve >=100.

**Del código (línea ~2557):**
```javascript
if (allProducts.length >= SEARCH_LIMIT) {
  allProducts = await wordpressService.getAllProducts() // Descarga todo aunque ya tenga 100 resultados
}
```

**Ejemplo:**
- Usuario busca "bolsa"
- Búsqueda API devuelve 100 productos con "bolsa" en el nombre
- Sistema descarga todo el catálogo (1494) para "no perder coincidencias"
- Pero ya tiene 100 resultados relevantes, ¿realmente necesita los otros 1394?

**Riesgo:** Descarga innecesaria cuando ya hay resultados suficientes.

**Solución propuesta:**
- **Límite inteligente:** Si búsqueda API devuelve >=100, usar esos 100 directamente sin descargar todo
- **Solo descargar todo si:** Búsqueda API devuelve 0 resultados Y término es muy específico
- **Priorizar resultados de búsqueda API:** Son más relevantes que matching sobre catálogo completo

---

## 8. **CARACTERISTICAS → PRODUCTOS: demasiado agresivo**

**Problema:** Cuando OpenAI clasifica como CARACTERISTICAS, se convierte automáticamente a PRODUCTOS y busca.

**Del log:**
```
[IA] tipo=CARACTERISTICAS, término=N/A, atributo=unidades embalaje master
[WooCommerce] 🔄 CARACTERISTICAS → PRODUCTOS (unificado: más detalles por backend)
```

**Casos problemáticos:**
- "cuantas unidades trae el embalaje master?" → CARACTERISTICAS → PRODUCTOS → busca "cuanta trae embalaje master" (no es nombre de producto)
- "que personalizacion tiene el producto BP10?" → CARACTERISTICAS → PRODUCTOS → busca "BP10" (correcto, pero pregunta sobre atributo, no búsqueda)

**Riesgo:** Descarga catálogo completo para preguntas que no son búsqueda.

**Solución propuesta:**
- **Detectar si hay producto en contexto:** Si hay `session.currentProduct` o `context.productStockData`, NO convertir a PRODUCTOS, responder sobre ese producto
- **Detectar si pregunta sobre atributo:** Si `atributo` está presente en CARACTERISTICAS, responder sobre atributo del producto en contexto, no buscar
- **Solo convertir a PRODUCTOS si:** No hay producto en contexto Y hay término válido de producto

---

## 9. **Contexto mal usado: preguntas sobre características del producto en contexto**

**Problema:** Cuando hay producto en contexto y el usuario pregunta sobre características, a veces se busca otro producto en lugar de responder sobre el contexto.

**Del log:**
```
contextProductName="Bolsa Papel Kraft BP10" contextProductSku="30x22x10"
message="cuantas unidades trae el embalaje master?"
[WooCommerce] 🔄 Usuario pide producto distinto al del contexto
```

**Análisis:** El usuario pregunta sobre "embalaje master" pero tiene "Bolsa Papel Kraft BP10" en contexto. El sistema decide que es "producto distinto" y busca. Pero "embalaje master" puede ser una pregunta genérica sobre características, no un producto específico.

**Riesgo:** Descarga catálogo completo cuando debería responder sobre el producto en contexto.

**Solución propuesta:**
- **Detectar preguntas genéricas sobre características:** Si pregunta "cuantas unidades trae [algo]" y no hay término válido de producto, responder sobre producto en contexto o decir "no sé"
- **Mejorar `userAsksForDifferentProduct()`:** No considerar "embalaje master" como producto distinto si es pregunta genérica

---

## 10. **Timeouts: 15 peticiones pueden causar timeout si WooCommerce está lento**

**Problema:** `getAllProducts()` hace 15 peticiones en paralelo. Si WooCommerce está lento (ej. 2s por petición), el total puede exceder timeouts.

**Escenario:**
- WooCommerce responde en 2s por petición
- 15 peticiones en paralelo = ~2-3 segundos total (si todas completan)
- Pero si alguna falla o tarda más, puede exceder timeout de 60s de OpenAI o 90s de la ruta

**Riesgo:** Timeouts en producción si WooCommerce está sobrecargado.

**Solución propuesta:**
- **Timeout por petición:** Cada petición individual con timeout de 5s
- **Timeout total:** Timeout de 30s para `getAllProducts()` completo
- **Fallback:** Si timeout, usar búsqueda API limitada en lugar de fallar completamente

---

## 11. **Búsqueda por código en nombre/SKU: descarga catálogo completo siempre**

**Problema:** Cuando busca por código (ej. "K62", "M181") y no encuentra por SKU exacto, busca en nombre/SKU descargando todo el catálogo.

**Del código (línea ~2247):**
```javascript
if (productsWithCode.length === 0) {
  const allProducts = await wordpressService.getAllProducts() // Siempre descarga todo
  productsWithCode = allProducts.filter(...)
}
```

**Riesgo:** Cada búsqueda por código que no encuentra SKU exacto descarga 1494 productos.

**Solución propuesta:**
- **Búsqueda API primero:** Intentar búsqueda API con el código antes de descargar todo
- **Solo descargar todo si:** Búsqueda API devuelve 0 Y código es muy específico (ej. numérico largo)
- **Caché:** Si ya se descargó el catálogo recientemente, reutilizarlo

---

## 12. **Detección de SKU en medidas: falsos positivos**

**Problema:** "X 2" en "X 2,8 cms" se detecta como SKU.

**Del log:**
```
[WooCommerce] 🔍 SKU detectado en el nombre: "X 2" → normalizado: "X2"
[WooCommerce] Buscando SKU "X 2" con 4 variaciones
[WooCommerce] Buscando SKU "X2" con 2 variaciones
```

**Riesgo:** Búsquedas innecesarias por SKU falso, tiempo desperdiciado.

**Solución propuesta:**
- **Validar contexto:** Si "X 2" está rodeado de números y "x" o "X", probablemente es medida
- **Patrón de medidas:** Detectar patrón "número x número x número" antes de detectar SKU
- **Ignorar SKU en contexto de medidas:** No buscar SKU si está en contexto de medidas

---

## 13. **AMBIGUA promovida a PRODUCTOS: término extraído puede ser raro**

**Problema:** Cuando AMBIGUA se promueve a PRODUCTOS, el término extraído puede ser raro o incorrecto.

**Del log:**
```
[WooCommerce] 🔄 AMBIGUA con término de producto → promovido a PRODUCTOS: "estuche medida 16 cms cms cms"
```

**Análisis:** El término tiene "cms cms cms" (duplicación rara), probablemente por cómo se extrajo del mensaje con medidas.

**Riesgo:** Búsqueda con término raro → 0 resultados → descarga catálogo completo innecesariamente.

**Solución propuesta:**
- **Limpiar término antes de buscar:** Eliminar duplicaciones, normalizar mejor
- **Validar término:** Si término tiene duplicaciones raras o es muy largo, limpiarlo antes de buscar
- **Detectar medidas en término:** Si término contiene patrón de medidas, limpiarlo antes de buscar

---

## 14. **Sin límite de tiempo total para búsqueda**

**Problema:** No hay límite de tiempo total para todo el proceso de búsqueda.

**Escenario:**
- Búsqueda API: 2s
- Descarga catálogo completo: 30s
- Matching determinístico: 5s
- Carga variaciones: 10s
- **Total: 47s** (casi excede timeout de 90s de la ruta)

**Riesgo:** Si algún paso tarda más, puede exceder timeout y fallar.

**Solución propuesta:**
- **Timeout total:** Máximo 60s para todo el proceso de búsqueda
- **Early exit:** Si algún paso tarda demasiado, cancelar y usar resultados parciales
- **Priorizar:** Búsqueda API rápida primero, catálogo completo solo si es necesario

---

## 15. **Búsqueda por palabras parciales: puede devolver muchos resultados irrelevantes**

**Problema:** Cuando busca por palabras parciales (ej. "X2" en nombres), puede encontrar productos irrelevantes.

**Del log:**
```
[WooCommerce] ✅ Encontrados 3 productos que contienen "X2" en nombre/SKU
```

**Análisis:** Encontró 3 productos con "X2" pero el usuario buscaba "estuche de medidas 16,4 x 5,5 x 2,8 cms", no productos con "X2" en el nombre.

**Riesgo:** Resultados irrelevantes, usuario confundido, tiempo desperdiciado.

**Solución propuesta:**
- **Mejorar matching parcial:** Solo buscar palabras completas, no substrings
- **Relevancia:** Priorizar productos donde la palabra aparece en nombre completo, no en SKU
- **Validar contexto:** Si término viene de medidas, no buscar por substrings de medidas

---

## Resumen de problemas críticos

| # | Problema | Impacto | Urgencia |
|---|----------|---------|----------|
| 1 | Escalabilidad (catálogo creciente) | Alto | Media |
| 2 | Concurrencia (múltiples descargas simultáneas) | **Crítico** | **Alta** |
| 3 | Sin caché (descarga repetida) | Alto | **Alta** |
| 4 | Rate limiting WooCommerce | Medio | Media |
| 5 | Memoria (muchos objetos) | Medio | Baja |
| 6 | Variaciones costosas | Medio | Media |
| 7 | Búsqueda parcial descarga todo | Medio | Media |
| 8 | CARACTERISTICAS → PRODUCTOS agresivo | Alto | **Alta** |
| 9 | Contexto mal usado | Medio | Media |
| 10 | Timeouts | Medio | Media |
| 11 | Búsqueda por código descarga todo | Alto | Media |
| 12 | SKU en medidas (falsos positivos) | Bajo | Baja |
| 13 | AMBIGUA término raro | Medio | Baja |
| 14 | Sin límite tiempo total | Medio | Media |
| 15 | Resultados irrelevantes | Bajo | Baja |

---

## Priorización recomendada

### **Crítico (implementar primero):**
1. **Caché del catálogo completo** (problema #3) - Reduce descargas repetidas
2. **Detección temprana no-búsqueda** (ya en plan) - Evita descargas innecesarias
3. **CARACTERISTICAS → PRODUCTOS mejorado** (problema #8) - Evita búsquedas incorrectas

### **Alto impacto (implementar después):**
4. **Semáforo/Mutex para concurrencia** (problema #2) - Evita sobrecarga
5. **Búsqueda por código optimizada** (problema #11) - Reduce descargas
6. **Búsqueda parcial mejorada** (problema #7) - Evita descargas cuando ya hay resultados

### **Mejoras (implementar cuando haya tiempo):**
7. Caché de variaciones
8. Timeout total para búsqueda
9. Mejor detección de SKU en medidas
10. Limpieza de términos raros

---

## Conclusión

El problema principal es la **falta de caché** y la **descarga repetida del catálogo completo**. Con caché + detección temprana de no-búsqueda, se resuelven la mayoría de los problemas críticos.

Los problemas de **concurrencia** y **CARACTERISTICAS → PRODUCTOS** son los siguientes más críticos y deberían abordarse después del caché.
