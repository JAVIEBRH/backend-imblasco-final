# Análisis del código: enriquecimiento y flujo de búsqueda

## 1. Arquitectura general

El flujo de producto en `conversation.service.js` se basa en:

- **Contexto/sesión**: `productStockData` (producto único para ficha) y `productSearchResults` (lista para desambiguar o recomendación).
- **Orígenes de datos**:
  - **Estructura (getCatalogStructure)**: productos ligeros (id, name, sku, type, weight, dimensions, tags) **sin** price, stock_quantity ni attributes.
  - **API completa**: `getProductById`, `getProductBySku`, `searchProductsInWordPress`, `getProductsSample` devuelven productos con price, stock y (salvo getProductsSample) attributes.

La regla aplicada: **solo se muestra producto o lista en UI cuando tienen precio/stock (y attributes en producto único para VARIANTE)**. Para datos que vienen de estructura, se enriquece justo después de elegir producto(s), sin tocar la lógica de búsqueda.

---

## 2. Helpers de enriquecimiento

Definidos tras `MAX_PRODUCTS_TO_ENRICH_STOCK` (~828):

| Helper | Criterio "ya enriquecido" | Acción si no |
|--------|----------------------------|--------------|
| `ensureProductEnriched(product)` | `product.price != null && product.stock_quantity !== undefined` | `wordpressService.enrichProductWithStockPrice(product)` |
| `ensureListEnriched(list, max)` | Lista no vacía y primer ítem con price y stock_quantity | `wordpressService.enrichProductsWithStockPrice(list, max)` |

- **Ventaja**: no se hacen llamadas extra cuando el dato ya viene completo (p. ej. de `searchProductsInWordPress`).
- **wordpress.service**: `enrichProductWithStockPrice` ahora incluye `attributes` en el objeto devuelto (y en caché), para que VARIANTE tenga `productStockData.attributes`.

---

## 3. Asignaciones a `productStockData`

Resumen de **todas** las asignaciones y si el valor está garantizado enriquecido:

| Línea aprox. | Origen | ¿Enriquecido? |
|--------------|--------|----------------|
| 1756 | `session.currentProduct` / `context.currentProduct` | Ya estaba en contexto (enriquecido en turno anterior). |
| 1766, 1776 | `null` (limpieza) | N/A. |
| 1786 | Reasignación desde variable local | Sí (es el mismo producto del contexto). |
| 1922 | `session.currentProduct` / `context.currentProduct` | Sí (contexto previo). |
| 1973 | `lastShownAmb[0]` | Sí, `enrichProductWithStockPrice`. |
| 2244 | `lastShown[idx - 1]` | Sí, `enrichProductWithStockPrice`. |
| 2264 | `exactInLast[0]` | Sí, `enrichProductWithStockPrice`. |
| 2321 | `finalProduct` (getProductBySku / findVariationBySku) | Sí, API completa. |
| 2372 | `productsWithCode[0]` (length === 1) | Sí, `enrichProductWithStockPrice`. |
| 2390 | `exactMatches[0]` (un match exacto por SKU) | **Sí, `ensureProductEnriched`.** |
| 2422 | `productById` (getProductById) | Sí, API completa. |
| 2490 | `fullNameMatch.product.originalProduct` | Sí, `enrichProductWithStockPrice`. |
| 2570 | `productBySku` (getProductBySku) | Sí, API completa. |
| 2588 | `productsWithCode[0]` (rama nombre/SKU) | Sí, `enrichProductWithStockPrice`. |
| 2595 | `exactMatchesName[0]` | Sí, `enrichProductWithStockPrice`. |
| 2749 | `matchResult.product.originalProduct` | Sí, `enrichProductWithStockPrice`. |
| 2770-2771 | Reasignación + `context.productSearchResults = [productStockData]` | Sí (productStockData ya enriquecido en esa rama). |
| 2963 | `wpFallbackResults[0]` | Sí, `searchProductsInWordPress` devuelve productos completos. |
| 2994 | `finalSearchResults[0]` (un solo resultado final) | **Sí, `ensureProductEnriched`.** |
| 3051 | `lastShown[0]` | Sí, `enrichProductWithStockPrice`. |
| 3122, 3125, 3130 | `null` o `productoContexto` (VARIANTE) | Contexto ya enriquecido. |
| 3146 | `byRaw` / `byNorm` (getProductBySku) | Sí, API completa. |
| 3153 | `searchResults[0]` (searchProductsInWordPress en VARIANTE) | Sí, API completa. |
| 3186 | `parentProduct` (getProductById) | Sí, API completa. |
| 3202 | Reasignación a context | Sí (mismo producto ya enriquecido). |

Conclusión: **todas las asignaciones a `productStockData` que llegan a la UI provienen de API completa o de enriquecimiento explícito** (ensureProductEnriched o enrichProductWithStockPrice).

---

## 4. Asignaciones a `productSearchResults` / `context.productSearchResults`

| Línea aprox. | Origen | ¿Enriquecido? |
|--------------|--------|----------------|
| 1757 | `[]` (inicial) | N/A. |
| 1779 | `null` (limpieza) | N/A. |
| 2250, 2270 | `[]` (tras elegir uno de lastShown) | N/A. |
| 2400 | `sorted.slice(0, 10)` (varios con mismo código/SKU) | **Sí, `ensureListEnriched`.** |
| 2514 | `fullNameMatch.ambiguousProducts` (originalProduct) | Sí, `enrichProductsWithStockPrice(ambiguous, 5)`. |
| 2605 | `sortedName.slice(0, 10)` (nombre/SKU) | Sí, `enrichProductsWithStockPrice(..., 5)`. |
| 2725 | `recomendacionList` (RECOMENDACION con término) | **Sí, `ensureListEnriched`.** |
| 2731 | `wpFallback` (searchProductsInWordPress) | Sí, API completa. |
| 2771 | `[productStockData]` | Sí (productStockData ya enriquecido). |
| 2776 | `matchResult.ambiguousProducts` | Sí, `enrichProductsWithStockPrice(ambiguous, 5)`. |
| 2869 | `topMatches` (búsqueda parcial desde estructura) | **Sí, `ensureListEnriched`.** |
| 2879 | `wpFallbackResults` | Sí, API completa. |
| 2908 | `list` (RECOMENDACION sin término) | **Sí en práctica**: `list` viene de `searchProductsInWordPress('regalo', 20)` o `getProductsSample(20)`; ambos devuelven price/stock. No usa estructura. |
| 2972 | `wpFallbackResults` | Sí, API completa. |
| 3008 | `listToStore.slice(0, 10)` | Son referencias a `finalSearchResults` (ya enriquecidos en su rama de origen). |

Conclusión: **todas las listas que se muestran como resultados de búsqueda/recomendación están enriquecidas o provienen de APIs que ya devuelven price/stock.**

---

## 5. Uso de getCatalogStructure y productos "de estructura"

- **getCatalogStructure** se usa cuando:
  - Búsqueda por SKU explícito no encuentra por API → se filtra estructura por nombre/SKU (2363, 2364).
  - Búsqueda por nombre: si `searchProductsInWordPress` devuelve vacío o >= límite, se usa estructura (2469, 2471, 2579, 2687, 2690).
  - Matching determinístico (productMatcher) sobre `allProducts` (2484, 2740, 2832).

En esos flujos, los productos que **salen** de estructura y se asignan a producto único o lista son los que pasan por:
- `ensureProductEnriched` (exactMatches[0], finalSearchResults[0]),
- `ensureListEnriched` (sorted.slice(0,10), recomendacionList, topMatches),
- o por `enrichProductWithStockPrice` / `enrichProductsWithStockPrice` en otras ramas (productsWithCode[0], ambiguous, sortedName, etc.).

No queda ninguna asignación directa "producto de estructura → productStockData / productSearchResults" sin enriquecer.

---

## 6. Flujo VARIANTE (colores/tallas)

- El producto de contexto (`productStockData` / `session.currentProduct`) se usa para leer `attributes` y variaciones.
- Ese producto llega ahí por una de las rutas ya analizadas (todas enriquecidas); además `enrichProductWithStockPrice` ahora rellena `attributes` desde `getProductById`, por lo que VARIANTE recibe atributos aunque el producto se hubiera elegido desde estructura.

---

## 7. Mejoras aplicadas

1. **Unificar criterio de “ya enriquecido”**: Hoy `ensureProductEnriched` usa `price != null && stock_quantity !== undefined`. Si en el futuro se añaden más campos (p. ej. `attributes`) como requisito para “completo”, convendría centralizar en un único predicado (p. ej. `isProductEnriched(product)`) para no duplicar condiciones.
2. **RECOMENDACION sin término**: Pasa por `ensureListEnriched(list)` por homogeneidad; si la lista ya tiene price/stock no se hacen llamadas extra.
3. **Límite en listas**: `ensureListEnriched` usa `MAX_PRODUCTS_TO_ENRICH_STOCK` (5); las listas mostradas pueden ser hasta 10 ítems. Los ítems 6–10 en listas que vienen de estructura no se enriquecen por este helper; si la UI muestra solo los 5 primeros con precio y el resto “consultar”, es coherente con el diseño actual.

---

## 8. Resumen

- **Enriquecimiento**: Centralizado en `ensureProductEnriched` / `ensureListEnriched` y en llamadas directas a `enrichProductWithStockPrice` / `enrichProductsWithStockPrice` donde ya existían.
- **Cobertura**: Todas las asignaciones a `productStockData` y `productSearchResults` que alimentan la UI están cubiertas por API completa o enriquecimiento.
- **Estructura**: Solo se usa para decidir *qué* producto(s) elegir; la exposición a la UI pasa siempre por enriquecimiento cuando el origen es estructura.
- **VARIANTE**: Cubierto por `attributes` en `enrichProductWithStockPrice` y por el hecho de que el producto de contexto siempre ha pasado por una ruta enriquecida.

El código queda consistente con el objetivo: no mostrar listas ni producto único sin precio/stock (ni sin attributes en producto único) cuando los datos vienen de estructura cacheada.
