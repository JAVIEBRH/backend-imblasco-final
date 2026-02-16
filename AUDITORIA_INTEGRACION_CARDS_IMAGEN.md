# Auditoría: integración cards de producto con imagen

Objetivo: revisión analítica del flujo producto → imagen → cliente para detectar código que no funciona como debe.

---

## 1. Hallazgos corregidos

### 1.1 `getProductStock()` no devolvía imagen (CORREGIDO)

- **Ubicación:** `wordpress.service.js` → `getProductStock(identifier)`
- **Problema:** El objeto devuelto se construía a mano con campos (id, name, sku, price, stock_quantity, etc.) y **no** incluía `images` ni `image`. Cuando el usuario pregunta por ID explícito, `conversation.service` asigna `productStockData = productById` (línea ~2465). Ese producto llega al happy path y `getImageUrl(responseProduct)` devuelve `null` porque no existe `images[0].src`, `image` ni `imagen.url`.
- **Efecto:** Productos resueltos solo por ID (p. ej. “dame el 123”) nunca mostraban imagen en el card.
- **Corrección:** En el `return` de `getProductStock` se añadieron `image` e `images` usando la misma lógica que en `getProductById` (URL absoluta con `toAbsoluteImageUrl`).

### 1.2 Solo se enriquecian 5 ítems y el front muestra hasta 8 (CORREGIDO)

- **Ubicación:** `conversation.service.js` → `MAX_PRODUCTS_TO_ENRICH_STOCK = 5`; `B2BChat.jsx` → `msg.productSearchResults.slice(0, 8)`.
- **Problema:** `ensureListEnriched(list)` usa por defecto `max = 5`. `enrichProductsWithStockPrice(products, max)` solo enriquece los primeros `max` productos; el resto (`rest = products.slice(max)`) se devuelve sin pasar por `getProductById`, por tanto sin `image`/`images`. El frontend muestra hasta 8 cards. Los ítems 6, 7 y 8 podían venir de estructura/catálogo sin imagen.
- **Efecto:** En listas de búsqueda, los cards 6–8 podían mostrar placeholder en lugar de imagen aunque el producto tuviera imagen en WooCommerce.
- **Corrección:** `MAX_PRODUCTS_TO_ENRICH_STOCK` cambiado de 5 a 8 para alinear con el número de cards mostrados.

---

## 2. Flujos verificados (sin cambio necesario)

### 2.1 Producto único desde contexto / enriquecimiento

- Rutas que asignan `productStockData` con `enrichProductWithStockPrice()` o `ensureProductEnriched()` reciben producto con `image`/`images` desde `getProductById()`. Correcto.

### 2.2 Listas desde `searchProductsInWordPress` (fallback)

- Tras la corrección previa, el mapeo incluye `image` e `images`. Las rutas que hacen `productSearchResults = wpFallback` / `wpFallbackResults` envían productos con imagen. Correcto.

### 2.3 Stockf `enrichProductList`

- Hace `result[i] = { ...result[i], ...enrichment }`. Solo fusiona campos de stockf (coming_soon, etc.); no elimina `image`/`images` del producto. Correcto.

### 2.4 Happy path e `imageUrl`

- Se construye `responseProduct` y `responseProductSearchResultsWithImageUrl` a partir de copias / nuevo array; se asigna `imageUrl` con `getImageUrl()`. No se muta `context`. Correcto.

### 2.5 Frontend: error de carga de imagen

- Si la `<img>` falla, `onError` oculta la imagen y muestra el placeholder. El placeholder es `nextElementSibling`; la estructura (img + div placeholder) lo garantiza. Correcto.

### 2.6 `createResponse` y rutas

- `createResponse` solo añade `product` / `productSearchResults` si no son null; las rutas reenvían el objeto tal cual. Sin problemas.

---

## 3. Riesgos / límites conocidos (sin corrección en esta pasada)

### 3.1 Caché de enriquecimiento (30 s)

- `enrichProductWithStockPrice` usa `stockPriceCache` con TTL 30 s. Entradas generadas antes de desplegar el código que añade `image`/`images` no tendrán imagen hasta que expire la caché o se reinicie el proceso.
- **Recomendación:** Tras un despliegue que añada campos de imagen, reiniciar el backend o esperar 30 s para que las respuestas con producto muestren imagen de forma consistente.

### 3.2 Productos sin imagen en WooCommerce

- Si un producto no tiene imagen en la tienda, `image`/`images` serán `null`/`[]` y el front mostrará el placeholder. Es el comportamiento esperado.

### 3.3 Listas con más de 8 resultados

- Si el backend envía más de 8 ítems en `productSearchResults`, el front solo muestra los 8 primeros (`slice(0, 8)`). Los 8 se enriquecen (con el nuevo límite). No hay bug; es diseño.

### 3.4 Variante construida a mano (líneas 3329–3334)

- En flujo de variante se hace `productStockData = { ...varianteEncontrada, name: productStockData.name, parent_id: productStockData.id }`. `varianteEncontrada` viene de variaciones de WooCommerce; si esa estructura incluye `image`/`images`, se conservan. Si no, ese producto concreto podría no tener imagen hasta que se unifique la forma de variaciones con la de productos simples. Bajo impacto porque el origen ya es un objeto de API.

---

## 4. Resumen de archivos tocados en esta auditoría

| Archivo | Cambio |
|--------|--------|
| `wordpress.service.js` | `getProductStock`: añadidos `image` e `images` al objeto devuelto. |
| `conversation.service.js` | `MAX_PRODUCTS_TO_ENRICH_STOCK`: 5 → 8. |

---

## 5. Checklist rápido para futuros cambios

- [ ] Cualquier ruta que asigne `context.productStockData` o `context.productSearchResults` con datos que se muestran en cards debe garantizar que esos objetos tengan `image`/`images` (o que el happy path pueda derivar `imageUrl` vía `getImageUrl`).
- [ ] Si se añade un nuevo origen de productos (nueva API, nuevo mapeo), incluir en el mapeo `image`/`images` o equivalente y reutilizar `toAbsoluteImageUrl` si las URLs pueden ser relativas.
- [ ] Si se cambia el número de cards mostrados en el front (p. ej. de 8 a 10), alinear `MAX_PRODUCTS_TO_ENRICH_STOCK` con ese valor.
