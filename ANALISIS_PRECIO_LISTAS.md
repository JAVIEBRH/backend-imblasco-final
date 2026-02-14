# Análisis: por qué a veces el precio no se rellena en listas de productos

## Resumen

En algunos flujos, la lista que se muestra al usuario se construye a partir de **productos que vienen de la estructura cacheada** (`getCatalogStructure()`), que **no incluye precio ni stock**. Esos productos se asignan a `productSearchResults` sin enriquecer, y más adelante el prompt usa `p.price` → sale "Precio no disponible" / N/A.

**Responsable del precio en la lista:** siempre es `p.price` del objeto en `finalSearchResults`. No hay ningún paso que rellene precio a partir de `enrichStockForListProducts` (esa función solo aporta stock vía suma de variaciones).

---

## 1. Cómo se construye la lista que ve el usuario

- `finalSearchResults = context.productSearchResults || productSearchResults`
- Para mostrar la lista se hace:
  - `sliceForList = finalSearchResults.slice(0, MAX_PRODUCTS_TO_ENRICH_STOCK)`
  - `stockByProductId = await enrichStockForListProducts(sliceForList)`  ← **solo stock** (suma variaciones)
  - Para cada `p` en `sliceForList`:
    - Stock: `getStockTextForListProduct(p, stockByProductId)` (usa `p` + `stockByProductId`)
    - Precio: `formatPrecioParaCliente(p.price)`  ← **solo usa `p.price`**

Por tanto: si `p` viene de estructura cacheada (sin precio), el precio en la respuesta será siempre "Precio no disponible". El problema no es que falle el enriquecimiento de precio en algún paso intermedio, sino que **en varios sitios se asigna a `productSearchResults` una lista que nunca se enriquece con precio**.

---

## 2. Origen de los productos: cuándo tienen precio y cuándo no

| Origen | ¿Tiene price/stock? |
|--------|----------------------|
| `searchProductsInWordPress(term, limit)` | Sí. La API devuelve productos completos con price y stock. |
| `getCatalogStructure()` | No. Solo estructura (id, name, sku, type, etc.) para no congelar stock. |
| `getProductsSample(limit)` | Sí. Llama a la API de productos y mapea price y stock. |
| `enrichProductWithStockPrice(p)` / `enrichProductsWithStockPrice(arr, n)` | Sí. Obtienen producto completo por id y rellenan price y stock. |

Cualquier lista que se arme filtrando/ordenando **solo** a partir de `getCatalogStructure()` (o de un `allProducts` que en ese flujo sea estructura) tendrá `price` (y a veces stock) vacíos si no se enriquece después.

---

## 3. Dónde se asigna `productSearchResults` y si tiene precio

### 3.1 Asignaciones que SÍ tienen precio (correctas)

- **fullNameMatch AMBIGUOUS (≈2489):**  
  `productSearchResults = await wordpressService.enrichProductsWithStockPrice(ambiguous, 5)`  
  → Lista enriquecida, con precio.

- **Código en nombre, varios productos (≈2580):**  
  `productSearchResults = await wordpressService.enrichProductsWithStockPrice(sortedName.slice(0, 10), 5)`  
  → Enriquecida, con precio.

- **matchResult AMBIGUOUS (≈2751):**  
  `productSearchResults = await wordpressService.enrichProductsWithStockPrice(ambiguous, 5)`  
  → Enriquecida, con precio.

- **Fallback WP (≈2854, 2706, 2947):**  
  `productSearchResults = wpFallbackResults` / `wpFallback`  
  → Vienen de `searchProductsInWordPress(...)`, productos completos con precio.

- **RECOMENDACION sin término (≈2883):**  
  `productSearchResults = list` con `list` de `searchProductsInWordPress('regalo', 20)` o `getProductsSample(20)`  
  → Ambos devuelven productos con precio.

- **Un solo producto FOUND (≈2746):**  
  `context.productSearchResults = [productStockData]` con `productStockData` enriquecido  
  → Tiene precio.

### 3.2 Asignaciones que pueden NO tener precio (origen en estructura)

1. **Varios productos con mismo código/SKU (≈2375)**  
   - Código: `productSearchResults = sorted.slice(0, 10)`  
   - `sorted` sale de `productsWithCode`, que viene de filtrar `allProducts`.  
   - En el flujo por SKU explícito, cuando la API no devuelve nada, `allProducts = await wordpressService.getCatalogStructure()` → estructura sin precio.  
   - Esos 10 productos se muestran sin enriquecer → **precio no rellenado**.

2. **Búsqueda parcial por palabras (≈2844)**  
   - Código: `productSearchResults = topMatches`  
   - `topMatches` sale de `partialMatches`, que es `allProducts.filter(...)`.  
   - En el flujo determinístico, si primero se hace búsqueda por término y da 0 o ≥100, `allProducts = await wordpressService.getCatalogStructure()` → estructura sin precio.  
   - Los “top 10” se asignan tal cual → **precio no rellenado**.

3. **RECOMENDACION con término (≈2700)**  
   - Código: `productSearchResults = recomendacionList`  
   - `recomendacionList = partialMatches.slice(0, 5)`, y `partialMatches` viene de `allProducts.filter(...)`.  
   - El mismo `allProducts` puede ser `getCatalogStructure()` cuando la búsqueda inicial devuelve 0 o ≥100.  
   - Esos 5 productos se asignan sin enriquecer → **precio no rellenado**.

---

## 4. Sobre `enrichStockForListProducts`

- **Qué hace:** para cada producto del slice (con `p.id` y sin `stock_quantity`), llama a `getProductVariations(p.id)`, suma cantidades y guarda en `stockByProductId[p.id] = { sum, error }`.
- **Qué no hace:** no modifica el objeto `p` ni rellena `p.price`. El precio que se muestra sigue siendo el de `p` en `finalSearchResults`.

Por eso, aunque se llame a `enrichStockForListProducts`, si los elementos de `finalSearchResults` vinieron de estructura, el precio no se rellena en ningún paso.

---

## 5. Conclusión y corrección necesaria

- **Causa:** En tres ramas se asigna a `productSearchResults` (y por tanto a `finalSearchResults`) una lista que en ese flujo puede ser **solo estructura** (getCatalogStructure), sin enriquecer con `enrichProductsWithStockPrice`. El precio se toma siempre de `p.price`, por lo que queda vacío.
- **No es un fallo de “enriquecimiento de precio en un paso intermedio”:** el único enriquecimiento de precio/stock que existe para listas es `enrichProductsWithStockPrice`, y no se está usando en esas tres ramas.
- **Qué hay que hacer:** en esos tres puntos, después de tener la lista (sorted/topMatches/recomendacionList) y antes de asignar a `productSearchResults`, enriquecer con `wordpressService.enrichProductsWithStockPrice(lista, MAX_PRODUCTS_TO_ENRICH_STOCK)` y asignar el resultado. Así se garantiza que el precio (y stock) se rellenen y no dependan de la estructura cacheada.

Con eso se evita que en ningún paso una lista mostrada al usuario provenga de estructura cacheada sin rellenar precio.
