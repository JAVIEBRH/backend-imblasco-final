# Análisis: flujos que no rellenan atributos correctamente (precio, stock, attributes)

Objetivo: identificar **todas** las ramas donde se usa producto (o lista) que puede venir de **estructura cacheada** (getCatalogStructure) o de una lista no enriquecida, y por tanto faltar **price**, **stock_quantity**/stock_status o **attributes**.

---

## 1. Qué devuelve cada origen

| Origen | price | stock_quantity / stock_status | attributes |
|--------|-------|-------------------------------|------------|
| **getCatalogStructure()** | ❌ no | ❌ no | ❌ no (no se mapean en getAllProducts includeStock:false) |
| **searchProductsInWordPress()** | ✅ | ✅ | ✅ (API completa) |
| **getProductById()** / **getProductBySku()** | ✅ | ✅ | ✅ |
| **enrichProductWithStockPrice()** / **enrichProductsWithStockPrice()** | ✅ | ✅ | ✅ (vía getProductById) |

Estructura = `getAllProducts({ includeStock: false })` → solo: id, name, sku, type, weight, dimensions, tags. **No** price, stock_quantity, stock_status, **ni attributes**.

---

## 2. Listas (productSearchResults / finalSearchResults) – precio y stock

Cuando la lista se muestra al usuario, se usa `p.price` y stock (directo o vía `getStockTextForListProduct`). Si los ítems vienen de estructura, **no tienen precio ni stock**.

| # | Línea aprox. | Asignación | Origen de los ítems | ¿Enriquecido? | Problema |
|---|--------------|------------|----------------------|---------------|----------|
| 1 | ~2375 | `productSearchResults = sorted.slice(0, 10)` | `productsWithCode` → filtro sobre `allProducts`. Con SKU explícito, `allProducts` puede ser getCatalogStructure() | ❌ | Precio/stock faltante en lista |
| 2 | ~2844 | `productSearchResults = topMatches` | `topMatches` de `partialMatches` sobre `allProducts`. En matching determinístico, `allProducts` puede ser getCatalogStructure() (0 o ≥100) | ❌ | Precio/stock faltante en lista |
| 3 | ~2700 | `productSearchResults = recomendacionList` | `recomendacionList = partialMatches.slice(0,5)` sobre `allProducts`. Mismo `allProducts` de estructura en RECOMENDACION | ❌ | Precio/stock faltante en lista |

**Corrección:** en los tres casos, antes de asignar a `productSearchResults`, llamar a `wordpressService.enrichProductsWithStockPrice(lista, MAX_PRODUCTS_TO_ENRICH_STOCK)` y asignar el resultado.

---

## 3. Producto único (productStockData) – precio y stock

Si `productStockData` se usa para mostrar ficha (precio, stock, variaciones), debe tener price y stock. Si viene de estructura o de una lista no enriquecida, **no los tiene**.

| # | Línea aprox. | Asignación | Origen | ¿Enriquecido? | Problema |
|---|--------------|------------|--------|---------------|----------|
| 4 | ~2365 | `productStockData = exactMatches[0]` | `exactMatches` = filtro de `productsWithCode`; `productsWithCode` viene de `allProducts` que puede ser getCatalogStructure() (búsqueda por SKU sin resultado en API) | ❌ | Precio/stock faltante en ficha de producto único |
| 5 | ~2969 | `productStockData = finalSearchResults[0]` | Cuando hay **un solo** resultado, se promueve a producto único. `finalSearchResults` puede ser una de las listas no enriquecidas (sorted, topMatches, recomendacionList) | ❌ | Precio/stock faltante en ficha de producto único |

**Corrección:**  
- En ~2365: al asignar `productStockData = exactMatches[0]`, si ese producto puede venir de estructura, asignar `productStockData = await wordpressService.enrichProductWithStockPrice(exactMatches[0])`.  
- En ~2969: antes de asignar `productStockData = finalSearchResults[0]`, enriquecer ese ítem: `productStockData = await wordpressService.enrichProductWithStockPrice(finalSearchResults[0])` (y session.currentProduct = productStockData).

---

## 4. Atributos del producto (productStockData.attributes)

En el flujo **VARIANTE** se usa:

- `productStockData.attributes` para comprobar si el atributo/valor existe en el padre (líneas ~3220–3223).
- `productStockData.attributes` como fallback para rellenar `valoresDisponibles` si no hay en variaciones (líneas ~3332–3336).
- `productStockData.attributes` para “más detalles” en prompts (línea ~3924).

Si `productStockData` viene de **estructura**, no tiene `.attributes` (getCatalogStructure no mapea attributes). Consecuencias:

- La validación “¿existe el valor A en el padre?” falla → se marca variante como no disponible aunque sí exista.
- El fallback de valores desde el padre no aporta nada.
- En “más detalles” no se listan atributos.

| # | Línea aprox. | Uso | Problema cuando productStockData es de estructura |
|---|--------------|-----|----------------------------------------------------|
| 6 | ~3220–3223 | `productStockData.attributes.some(...)` para atributoExisteEnPadre | attributes undefined → atributoExisteEnPadre siempre false → “no disponible en tamaño A” aunque A exista |
| 7 | ~3332–3336 | `productStockData.attributes.forEach` para valoresDisponibles | attributes undefined → no se rellenan valores desde padre (solo desde variaciones; si variaciones sí están, puede funcionar) |
| 8 | ~3924 | Bloque “más detalles” con atributos del producto | attributes undefined → no se muestran atributos en la respuesta |

**Origen del problema:** Cualquier rama que asigne a `productStockData` un objeto que venga de getCatalogStructure (por ejemplo vía exactMatches[0], finalSearchResults[0], o un ítem de listas no enriquecidas) deja a ese producto sin `.attributes`. No es una rama distinta de “atributos”, sino la **misma** falta de enriquecimiento: al enriquecer con `enrichProductWithStockPrice` / `enrichProductsWithStockPrice` (que usan getProductById), el producto pasa a tener attributes. Por tanto, **corregir los puntos 4 y 5 (y las listas 1–3)** evita también usar un producto sin attributes en VARIANTE.

---

## 5. Resumen de casos a corregir

| # | Tipo | Dónde | Qué falta | Acción |
|---|------|--------|-----------|--------|
| 1 | Lista | ~2375 `productSearchResults = sorted.slice(0, 10)` | price, stock en lista | Enriquecer con enrichProductsWithStockPrice antes de asignar |
| 2 | Lista | ~2844 `productSearchResults = topMatches` | price, stock en lista | Enriquecer con enrichProductsWithStockPrice antes de asignar |
| 3 | Lista | ~2700 `productSearchResults = recomendacionList` | price, stock en lista | Enriquecer con enrichProductsWithStockPrice antes de asignar |
| 4 | Producto único | ~2365 `productStockData = exactMatches[0]` | price, stock, attributes en ficha y VARIANTE | Enriquecer con enrichProductWithStockPrice antes de asignar |
| 5 | Producto único | ~2969 `productStockData = finalSearchResults[0]` | price, stock, attributes en ficha y VARIANTE | Enriquecer con enrichProductWithStockPrice(finalSearchResults[0]) antes de asignar |
| 6–8 | VARIANTE | Uso de productStockData.attributes | attributes cuando productStockData viene de estructura | Se resuelve al corregir 4 y 5 (productStockData ya enriquecido tendrá attributes) |

No hay más ramas detectadas donde se asigne **lista** o **producto único** desde estructura sin enriquecer. El resto de asignaciones a `productStockData` vienen de: getProductById, getProductBySku, searchProductsInWordPress, findVariationBySku, o de bloques que ya llaman a enrichProductWithStockPrice/enrichProductsWithStockPrice.

---

## 6. Conclusión

- **Precio/stock en listas:** faltan en 3 ramas (listas desde estructura sin enriquecer).
- **Precio/stock en producto único:** faltan en 2 ramas (exactMatches[0] y finalSearchResults[0] desde estructura o lista no enriquecida).
- **attributes en VARIANTE:** faltan cuando `productStockData` es ese mismo producto no enriquecido; no es un bug aparte de “atributos”, sino de no enriquecer en las ramas 4 y 5.

Con las correcciones indicadas (enriquecer en los 3 puntos de listas y en los 2 puntos de producto único), se deja de usar en ningún flujo un producto sin price, stock ni attributes cuando se muestra al usuario o se valida variante.
