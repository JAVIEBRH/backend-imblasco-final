# Extracción de imágenes para cards (WooCommerce + stockf)

## Resumen

- **WooCommerce:** La API REST devuelve `images` en cada producto (array de `{ id, src, name, alt }`). La URL de la primera imagen es `images[0].src`. Hoy **no** estamos leyendo ni enviando ese campo.
- **stockf:** El campo `imagen` existe (tipo objeto). Ya lo incluimos en el enriquecimiento; falta **conocer su estructura** (p. ej. `imagen.url` o `imagen.src`) para exponer una URL única al front.

---

## 1. WooCommerce

### Qué devuelve la API

En `GET /wp-json/wc/v3/products/{id}` el producto trae:

```json
"images": [
  { "id": 123, "src": "https://imblasco.cl/wp-content/uploads/...", "name": "...", "alt": "..." }
]
```

- **URL de la imagen principal:** `product.images[0].src` (si `images.length > 0`).

### Qué hacemos hoy

En `wordpress.service.js`, `getProductById()` **no** mapea `images`. Solo devuelve: id, name, sku, price, stock_quantity, stock_status, type, description, attributes, categories, etc. Por tanto el objeto que usamos en el chat **no** tiene imagen.

### Qué hay que hacer

1. En `getProductById()` añadir algo como:
   - `images: product.images || []`
   - y/o `image: product.images?.[0]?.src ?? null` (una sola URL para el card).
2. En `enrichProductWithStockPrice()` incluir en `data` la imagen (o la URL) que venga de `getProductById()`, para que el producto enriquecido que llega a `context.productStockData` (y luego a `responseProduct` / `productSearchResults`) traiga imagen.
3. Opcional: en el objeto que se envía al front, exponer un único campo (p. ej. `imageUrl` o `image`) para que el front no tenga que elegir entre WC y stockf.

**Conclusión:** Sí se puede extraer la imagen de WooCommerce; solo hay que leer `product.images` en `getProductById` y propagarla hasta la respuesta del chat.

---

## 2. stockf

### Estructura real (verificada)

En la respuesta de **GET /api/dev/stockf-sample-products**, `withImagen[].imagen` tiene esta forma:

```json
{
  "thumbnail_id": "16906",
  "url": "https://imblasco.cl/regalos/wp-content/uploads/2023/10/RK20-2.jpg"
}
```

- **URL para el card:** usar **`imagen.url`**.
- `thumbnail_id` es el ID del medio en WordPress; no hace falta para mostrar la imagen en el chat.

### Qué hacemos hoy

- En `stockf.service.js`, `toEnrichment()` hace `imagen: doc.imagen != null ? doc.imagen : undefined`, así que el producto enriquecido puede tener `product.imagen` (objeto o lo que sea en stockf).
- El front aún no pinta imagen; cuando se implementen los cards, tendrá que usar una URL. Para no acoplar el front a la estructura exacta de stockf, conviene **normalizar en backend**: a partir de `product.imagen` (y de WooCommerce si hace falta) calcular un solo `imageUrl` (string o null) y enviarlo en `product` / ítems de `productSearchResults`.

**Conclusión:** En stockf la URL es **`product.imagen.url`**. En backend se puede normalizar a un único campo: `imageUrl = product.images?.[0]?.src ?? product.imagen?.url ?? null` y enviar siempre `imageUrl` al front.

---

## 3. Estrategia recomendada para los cards

1. **WooCommerce:** Añadir en `getProductById` (y en el enriquecimiento) la lectura de `images` y una URL principal (p. ej. `images[0].src`).
2. **stockf:** Tras inspeccionar `withImagen`, en backend normalizar `imagen` a una URL (si aplica) y, al armar `responseProduct` / `productSearchResults`, calcular un único campo **`imageUrl`**:
   - Primero WooCommerce: `product.images?.[0]?.src`
   - Si no, stockf: la propiedad que corresponda de `product.imagen` (p. ej. `product.imagen?.url` o `product.imagen?.src`).
3. **Frontend:** En cada card usar `product.imageUrl` (o el nombre que se elija). Si es null, mostrar placeholder.

Así las imágenes se pueden extraer correctamente de WooCommerce y, en su caso, de stockf, y el front solo consume una URL por producto.
