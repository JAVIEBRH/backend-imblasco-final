# Análisis: integración datos stockf.productos (MongoDB) con el asistente

## 1. Resumen ejecutivo

El asistente actual obtiene **todos los datos de productos** desde **WooCommerce** (wordpress.service.js). La base `stockf.productos` (MongoDB) contiene información adicional (próxima llegada, especificaciones, personalización, flags) que **no existe** hoy en el backend. Este documento analiza el contraste, la viabilidad de conexión y el impacto.

---

## 2. Estado actual del sistema

### 2.1 MongoDB actual (nuestra base)

**Conexión:** `DATABASE_URL` / `MONGO_URI` → base `dataimblasco` o `imblasco_b2b` (según .env).

**Colecciones en uso:**
- **conversations** – hilos de conversación (mensajes, session_id, contexto). **NO TOCAR.**
- **productos** (ProductIndex) – índice woo_id, codigo, sku, nombre, tipo, categoria. Origen: import desde WooCommerce (import-products.js). Usado por assistant.service para búsqueda por texto.
- **users, carts, orders, stock_movements, products** – según modelos existentes.

**Origen de datos de productos en el chat:**
- El flujo principal (conversation.service.js) usa **WooCommerce** vía wordpress.service.js:
  - `getCatalogStructure()` – estructura (id, name, sku, type, etc.) sin price/stock
  - `searchProductsInWordPress()` – búsqueda full-text
  - `getProductById()`, `getProductBySku()` – producto completo
  - `enrichProductWithStockPrice()` – price, stock, attributes
  - `getProductVariations()` – variaciones

**Estructura que devolvemos al frontend (productStockData / productSearchResults):**
- id, name, sku, price, stock_quantity, stock_status, available, type, attributes, dimensions, tags, etc.
- Todo proviene de WooCommerce (getProductById, enrichProductWithStockPrice).

### 2.2 Campo coming_soon

**No existe en nuestro código.** No hay ninguna referencia a `coming_soon`, `próxima llegada` o `proxima llegada` en el backend.

**Conclusión:** El campo “próxima llegada” **no está implementado** en el asistente. Si la web imblasco.cl lo muestra, es porque la web lee directamente de stockf.productos; el asistente no lo usa.

---

## 3. stockf.productos – qué aporta

| Campo | Tipo | Contenido | ¿Lo tenemos? |
|-------|------|-----------|--------------|
| **coming_soon** | Object | `{ activo, fecha }` → Próxima llegada | No |
| **caracteristicas** | Object | Tamaño, Material, Embalaje, Embalaje Master, Tamaño Caja Master, Peso Caja Master | No (WooCommerce tiene dimensiones básicas, no esta tabla) |
| **excerpt** | String (HTML) | Descripción + tabla especificaciones + opciones personalización (Sublimación, Grabado láser) + recomendaciones/instrucciones | No |
| **personalizaciones** | Object | Probablemente mismo contenido que excerpt | No |
| **imagen** | - | Ruta/URL imagen | WooCommerce tiene images, pero no usamos la misma fuente |
| **flags** | Object | visible en página, tiene coming_soon, tiene imagen, tiene personalización | No |
| **mysql_id** | number | ID WooCommerce (producto) | Vinculación con WooCommerce |
| **sku** | string | SKU | Sí (WooCommerce) |

**Regla importante (flags):** Si `flags.visible === false`, el producto no está publicado; **no se debe mostrar** información de ese producto (solo lectura).

---

## 4. Mejoras que traen estos datos

1. **Próxima llegada:** Mostrar “Próxima llegada: 29 Enero 2026” cuando hay stock 0 y `coming_soon.activo`.
2. **Especificaciones:** Tamaño, Material, Embalaje, etc. de forma estructurada (caracteristicas).
3. **Opciones de personalización:** Sublimación, Grabado láser, etc. (excerpt/personalizaciones).
4. **Recomendaciones/instrucciones:** Textos específicos por producto (excerpt).
5. **Flags:** Filtrar productos no visibles; saber si tiene personalización, imagen, coming_soon.
6. **Imagen:** Ruta canónica del producto (imagen).

---

## 5. Conexión a stockf – viabilidad técnica

### 5.1 ¿Podemos conectarnos de forma limpia?

Sí. MongoDB permite varias bases en el mismo cluster. Si stockf está en el mismo cluster que nuestra base:

**Opción A – misma conexión, base distinta:**
```javascript
const stockfDb = mongoose.connection.useDb('stockf');
const productosCollection = stockfDb.collection('productos');
```

**Opción B – conexión separada (read-only):**
```javascript
// Variable MONGO_URI_STOCKF_READ con usuario solo lectura
const stockfConn = await mongoose.createConnection(process.env.MONGO_URI_STOCKF_READ).asPromise();
const productosCollection = stockfConn.db.collection('productos');
```

### 5.2 Restricciones (obligatorio)

- **Solo lectura.** Usuario MongoDB con permiso `read` sobre `stockf`.
- **Sin tocar** nuestra base (conversations, users, etc.).
- **Sin escribir** en stockf.

### 5.3 Vinculación producto WooCommerce ↔ stockf

- **Por SKU:** Campo común en WooCommerce y stockf.
- **Por mysql_id:** En stockf corresponde al ID de producto en WooCommerce.

Flujo típico: producto encontrado en WooCommerce (id, sku) → consulta en stockf por `sku` o `mysql_id` → enriquecer con coming_soon, caracteristicas, excerpt, flags.

---

## 6. Nuestra base de datos – qué ocurre con ella

**No se reemplaza.** Las colecciones actuales siguen igual:

- **conversations** – hilos del chat.
- **productos** (ProductIndex) – índice de WooCommerce (si se sigue usando).
- **users, carts, orders, etc.** – sin cambios.

`stockf` se usa como **fuente de datos adicional de solo lectura**, no como reemplazo de nada.

---

## 7. Lógica nueva que habría que añadir

### 7.1 Servicio de enriquecimiento desde stockf

- `stockfService.getProductEnrichment(skuOrMysqlId)` → devuelve `{ coming_soon, caracteristicas, excerpt, flags, imagen }` o null.
- Respeta `flags.visible`: si false, no devolver datos (o marcar producto como no mostrable).

### 7.2 Uso en el flujo de productos

- Tras obtener producto de WooCommerce (productStockData), llamar a stockf para enriquecer.
- Añadir al objeto que se envía al frontend:
  - `coming_soon` (si activo)
  - `caracteristicas` (Tamaño, Material, Embalaje, etc.)
  - `personalizacion` o `excerpt` (opciones y recomendaciones, posiblemente con HTML sanizado)

### 7.3 Variaciones

- Las variaciones siguen viniendo de WooCommerce (`getProductVariations`).
- stockf no aporta variaciones; podría aportar flags o caracteristicas a nivel de producto padre.
- No hay conflicto: WooCommerce para variaciones, stockf para metadatos adicionales.

### 7.4 Campo coming_soon

- Implementación: cuando `stock_quantity === 0` (o sin stock) y `coming_soon.activo === true`, incluir `coming_soon.fecha` en la respuesta.
- El frontend puede mostrar “Próxima llegada: [fecha]”.
- Hoy no existe en el backend; habría que implementarlo.

---

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| stockf no disponible | Timeout bajo; si falla, responder sin enriquecimiento (comportamiento actual). |
| Esquema distinto en stockf | Validar estructura; manejar campos faltantes o null. |
| Datos sensibles en stockf | Solo lectura; no exponer más de lo necesario (coming_soon, caracteristicas, excerpt sanitizado). |
| Latencia extra | Caché por SKU (TTL corto); consulta en paralelo con WooCommerce cuando sea posible. |

---

## 9. Conclusión y recomendación

- **Análisis:** Los datos de stockf.productos aportan valor (próxima llegada, especificaciones, personalización, flags) que hoy no existen en el asistente.
- **Conexión:** Es viable con una segunda base o conexión de solo lectura; nuestra base y colecciones se mantienen intactas.
- **coming_soon:** No está implementado; habría que añadirlo si se quiere esta funcionalidad.
- **Impacto:** Requiere un servicio nuevo (stockf), enriquecimiento opcional de productos y reglas para flags (p. ej. no mostrar si no es visible). No sustituye WooCommerce; lo complementa.

**Recomendación:** Integrar solo si se confirman credenciales de solo lectura para stockf y se valida que el esquema (coming_soon, caracteristicas, excerpt, flags) es estable. La implementación puede ser incremental: primero coming_soon y flags.visible, luego caracteristicas y excerpt/personalización.
