# Revisión: Cards de producto con imagen

## Flujo trazado

### 1. Un solo producto (`context.productStockData`)

- **Orígenes de datos:**  
  - `getProductById()` → devuelve `images` e `image` (WooCommerce).  
  - `enrichProductWithStockPrice()` → añade `image` e `images` al objeto fusionado.  
  - Asignación directa `productStockData = productById` (línea ~2465): `productById` viene de `getProductById()`, ya incluye `image`/`images`.
- **Contexto:** Solo se asigna `context.productStockData = productStockData`. No se muta en el happy path.
- **Payload:** Antes del `return createResponse(...)` se hace una copia `responseProduct = { ...context.productStockData }`, se asigna `responseProduct.imageUrl = getImageUrl(responseProduct)` y se pasa `responseProduct` a `createResponse`.  
- **createResponse:** Añade `out.product = product` si `product != null`. La firma y el resto de salidas tempranas (4 args) no se modificaron.
- **Rutas:** Tanto `POST /api/chat/message` (`res.json({ success: true, ...response })`) como el stream (`streamPayload.product = response.product`) envían el objeto con `imageUrl`.
- **Frontend:** `msg.product` se usa con `msg.product.imageUrl`, `name`, `sku`, `price`, `stock_quantity`, `coming_soon`. Si no hay `imageUrl` se muestra el placeholder.

**Conclusión:** El flujo de un producto no se ha roto; solo se añade el campo `imageUrl` al payload.

---

### 2. Varios productos (`context.productSearchResults`)

- **Orígenes:** Listas enriquecidas con `ensureListEnriched()` → `enrichProductsWithStockPrice()` → `enrichProductWithStockPrice()` por ítem. Cada ítem tiene `image`/`images` tras el cambio en wordpress.service.
- **Contexto:** Se asigna `context.productSearchResults = productSearchResults`. No se muta en el happy path.
- **Payload:** Se construye un **nuevo** array `responseProductSearchResultsWithImageUrl = responseProductSearchResults.map(item => ({ ...item, imageUrl: getImageUrl(item) }))` y se pasa a `createResponse`. No se modifica el array original de `context`.
- **createResponse:** Añade `out.productSearchResults = productSearchResults` cuando es array con longitud > 0.
- **Rutas:** Igual que arriba; el cliente recibe `response.productSearchResults` con cada ítem incluyendo `imageUrl`.
- **Frontend:** `msg.productSearchResults` se mapea a cards; cada `p` usa `p.imageUrl`, `p.name`, etc. Placeholder si no hay `imageUrl`.

**Conclusión:** El flujo de lista de productos no se ha roto; solo se añade `imageUrl` a cada ítem en el payload.

---

### 3. Respuestas sin producto (info, garantía, quejas, etc.)

- Esas ramas hacen `return createResponse(message, state, options, cart)` con 4 argumentos (product y productSearchResults quedan `null`).
- No se ha tocado ninguna de esas ~40 salidas tempranas.
- `createResponse` solo pone `out.product` / `out.productSearchResults` cuando los argumentos son no nulos, por tanto el cliente sigue sin recibir `product` ni `productSearchResults` en esos casos.
- El frontend solo muestra cards cuando `msg.product` o `msg.productSearchResults` existen; el resto sigue siendo solo `msg.text`.

**Conclusión:** Sin cambios en el comportamiento para respuestas sin producto.

---

### 4. Helper `getImageUrl` y orígenes de imagen

- Definición: `product?.images?.[0]?.src ?? product?.imagen?.url ?? null`.
- WooCommerce (tras 1.1 y 1.2): aporta `images[0].src` vía `image` o `images` en el objeto enriquecido.
- Stockf: ya mergeaba `imagen.url` en el enriquecimiento existente; el helper lo usa como fallback.
- No se modifica `context.productStockData` ni `context.productSearchResults`; solo el objeto/array que se pasa a `createResponse`.

---

### 5. Comprobaciones rápidas

| Comprobación | Estado |
|--------------|--------|
| `getProductById` devuelve `images` e `image` | OK (wordpress.service.js) |
| `enrichProductWithStockPrice` propaga `image` e `images` | OK (wordpress.service.js) |
| Happy path añade `imageUrl` solo al payload, no al context | OK (conversation.service.js) |
| Salidas tempranas `createResponse(..., 4 args)` intactas | OK (no modificadas) |
| Rutas chat envían `response.product` y `response.productSearchResults` | OK (chat.routes.js) |
| Frontend usa `msg.product` / `msg.productSearchResults` con `imageUrl` y placeholder | OK (B2BChat.jsx) |

---

## Resumen

La modificación de cards con imagen **no rompe** el flujo existente: solo se añaden campos (`images`, `image` en backend; `imageUrl` en el payload de respuesta) y componentes de presentación (cards con imagen o placeholder). La lógica de resolución de productos, enriquecimiento y asignación a `context.productStockData` / `context.productSearchResults` se mantiene igual.
