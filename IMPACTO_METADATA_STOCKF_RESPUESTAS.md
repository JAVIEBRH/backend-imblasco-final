# Impacto de los metadatos stockf en estructura y respuestas

## 1. Estructura actual de la respuesta

### 1.1 Qué devuelve el backend hoy

**`createResponse(message, state, options, cart)`** (conversation.service.js ~674) devuelve:

```js
{
  botMessage: string,   // Texto del bot (generado por la IA a partir de textoParaIA)
  state: string,        // IDLE, SELECTING_PRODUCT, etc.
  options: Array | null,// Solo botones de acción: [{ type: 'action', value: 'START_ORDER', label: '🛒 Iniciar Pedido' }, ...]
  cart: Array          // Items del carrito formateados
}
```

**Importante:** `productStockData` y `productSearchResults` **no se envían** al cliente. Se usan solo dentro del backend para:
- Construir el **texto** que se pasa a la IA (`textoParaIA`)
- Decidir flujos (un producto vs lista vs variante)

El frontend solo recibe el **texto** del bot (`botMessage`) y los botones (`options`). Si el frontend muestra algo tipo “ficha de producto”, lo hace a partir del mismo texto, no de un objeto producto estructurado.

### 1.2 Rutas que usan esta respuesta

- **POST /api/chat/message** → `res.json({ success: true, ...response })` → mismo objeto anterior.
- **POST /api/chat/message/stream** → al final envía `{ done: true, success: true, botMessage, state, options, cart }` → misma estructura.

---

## 2. Dos formas de mostrar la nueva información

### Opción A – Solo en el texto (sin cambiar estructura)

- Se **añade** coming_soon, caracteristicas, personalización/recomendaciones **solo a los prompts** (`textoParaIA`).
- La IA escribe en el mensaje cosas como: “Próxima llegada: 29 Enero 2026”, “Tamaño: 90 mm…”, “Opciones: Sublimación, Grabado láser”, “Recomendaciones para sublimación: …”.
- **Estructura de respuesta:** sin cambios. Sigue siendo `{ botMessage, state, options, cart }`.
- **Ventaja:** mínimo cambio; el usuario ya ve la info en el chat.
- **Desventaja:** el frontend no puede mostrar “próxima llegada” o especificaciones en componentes propios (badge, tabla) salvo parseando el texto.

### Opción B – Estructura enriquecida en la respuesta (y opcionalmente en el texto)

- Se **añaden** al JSON de respuesta campos con datos estructurados, por ejemplo:
  - `product`: objeto producto (WooCommerce + stockf: coming_soon, caracteristicas, personalizacion, imagen, flags).
  - `productSearchResults`: array de productos (cada uno con los mismos campos enriquecidos cuando aplique).
- El frontend puede renderizar fichas, badges “Próxima llegada”, tablas de especificaciones, opciones de personalización.
- **Además** se puede seguir inyectando parte de esto en `textoParaIA` para que el bot lo mencione en `botMessage`.

Para Opción B haría falta:
- Enriquecer `productStockData` / lista con datos de stockf (por SKU o mysql_id) **antes** de construir la respuesta.
- Cambiar el **valor de retorno** de `processMessageWithAI` (y/o de `createResponse`) para incluir `product` y/o `productSearchResults` cuando existan, sin quitar `botMessage`, `state`, `options`, `cart`.

---

## 3. Dónde cambiar según tipo de respuesta

Todos los puntos siguientes están en **conversation.service.js**. Los metadatos stockf (coming_soon, caracteristicas, excerpt/personalizacion, flags) se usarían **después** de tener `productStockData` o `productSearchResults` (por ejemplo con un `stockfService.getProductEnrichment(sku)`).

### 3.1 Un solo producto (ficha) – PRODUCTOS

**Bloque:** ~3910–4052 (cuando hay `productStockData` y no es lista de similares).

- **Variables que ya se arman:** `stockInfo`, `priceInfo`, `variationsInfo`, `extraProductInfo`, `bloqueDescripcion`, `bloqueAtributosCategorias`.
- **Cambios para que el texto muestre la nueva info:**
  - Después de tener `productStockData`, obtener enriquecimiento stockf (por `productStockData.sku` o `productStockData.id`).
  - Añadir al prompt (`textoParaIA`):
    - Si `coming_soon.activo` y hay `coming_soon.fecha`: línea tipo “Próxima llegada: [fecha]” (p. ej. cuando stock 0).
    - Si existe `caracteristicas`: bloque “Especificaciones: Tamaño: …, Material: …, Embalaje: …”.
    - Si existe `excerpt`/personalización: bloque “Opciones de personalización: …” y “Recomendaciones: …” (o texto plano extraído del HTML).
  - Respetar `flags.visible`: si es false, no incluir este producto en la respuesta (ya se habrá filtrado antes).
- **Si se elige Opción B (estructura):**
  - Construir objeto `product` para la respuesta: `{ ...productStockData, coming_soon, caracteristicas, personalizacion, imagen }`.
  - Incluir ese `product` en lo que devuelve `processMessageWithAI` (ver sección 4).

### 3.2 Variante (VARIANTE) – listar valores o variante concreta

**Bloques:** ~3564–3612 (listar colores/tallas/etc.), ~3659–3710 (variante encontrada), ~3711–3782 (variante no encontrada, producto no variable, etc.).

- **Cambios:**
  - Donde ya se usa `productStockData` (nombre, SKU, stock, precio), añadir al prompt:
    - “Próxima llegada: …” si aplica.
    - Especificaciones (caracteristicas) si el cliente pregunta por detalles.
  - Misma fuente: enriquecimiento por `productStockData.sku` / `id` una vez resuelto el producto.

No es necesario duplicar lógica: se puede tener una función helper que, dado `productStockData`, devuelva un bloque de texto “Próxima llegada / Especificaciones / Personalización” para concatenar a cualquier `textoParaIA` de producto o variante.

### 3.3 Lista de productos (varios resultados)

**Bloque:** ~4051–4112 (cuando hay `context.productSearchResults` o `productSearchResults` y no `needsConfirmation`).

- **Cambios para el texto:**
  - Al construir `productsList` (~4076–4079), para cada ítem se puede añadir “ – Próxima llegada: [fecha]” cuando ese producto tenga coming_soon activo (requiere enriquecer cada ítem de la lista con stockf, con límite para no hacer N consultas).
- **Si se elige Opción B:**
  - Devolver `productSearchResults` enriquecidos (cada elemento con coming_soon, caracteristicas, etc. si se desea) en la respuesta.

### 3.4 Productos similares (misma ficha, lista de similares)

**Bloque:** ~3974–3996 (lista de productos similares).

- Mismo criterio que “lista de productos”: opcionalmente enriquecer cada ítem y añadir al texto “Próxima llegada” por ítem, y/o incluir la lista enriquecida en la respuesta.

### 3.5 Otros bloques con producto

- **~4088–4112:** lista con “productos encontrados” (displayQuery); mismo tratamiento que 3.3.
- **~4146–4212:** otra rama de listas (finalSearchResults); mismo criterio.
- Cualquier otro `textoParaIA` que ya incluya “INFORMACIÓN REAL DEL PRODUCTO” o “PRODUCTOS ENCONTRADOS” se puede extender con los mismos bloques (coming_soon, caracteristicas, personalización).

---

## 4. Cambios en la estructura de la respuesta (Opción B)

### 4.1 Dónde se arma el retorno

- **processMessageWithAI** termina en ~4287–4292 con:
  ```js
  return createResponse(aiResponse, session.state, responseOptions.length > 0 ? responseOptions : null, cart)
  ```
- `createResponse` solo recibe `(message, state, options, cart)` y no tiene acceso a `context`.

### 4.2 Qué habría que cambiar

1. **createResponse**  
   Añadir parámetros opcionales, por ejemplo:
   ```js
   function createResponse(message, state, options = null, cart = null, product = null, productSearchResults = null) {
     const cartFormatted = ...
     return {
       botMessage: message,
       state,
       options,
       cart: cartFormatted,
       ...(product != null && { product }),
       ...(productSearchResults != null && productSearchResults.length > 0 && { productSearchResults })
     }
   }
   ```
   O bien no tocar `createResponse` y en el único sitio donde se hace `return createResponse(...)` al final de `processMessageWithAI`, construir antes un objeto `product`/`productSearchResults` desde `context` y pasarlos.

2. **processMessageWithAI**  
   Justo antes del `return createResponse(...)`:
   - Tomar `context.productStockData` (ya enriquecido con stockf si se implementó).
   - Si existe, construir `product` para el cliente (solo campos que el frontend necesite: id, name, sku, price, stock_quantity, coming_soon, caracteristicas, personalizacion, imagen, etc.).
   - Tomar `context.productSearchResults` (también enriquecidos si aplica).
   - Llamar a `createResponse(..., product, productSearchResults)` o equivalente.

3. **Rutas**  
   No hace falta cambiar las rutas: ya envían `...response`, así que si `response` incluye `product` y `productSearchResults`, el cliente los recibe.

4. **Stream**  
   En **POST /api/chat/message/stream** (~410–416) se envía al final un solo objeto con `botMessage`, `state`, `options`, `cart`. Si se añaden `product` y `productSearchResults` al objeto que devuelve `processMessageWithAI`, aquí bastaría con añadir al payload:
   ```js
   product: response?.product ?? null,
   productSearchResults: response?.productSearchResults ?? null
   ```
   para mantener la misma estructura que el endpoint no-stream.

---

## 5. Resumen

| Qué quieres | Dónde tocar | Estructura de respuesta |
|------------|-------------|-------------------------|
| Que el bot **diga** “Próxima llegada”, especificaciones, personalización | Añadir bloques a `textoParaIA` en los puntos de las secciones 3.1–3.5 (producto único, variante, listas) usando datos de stockf | Sin cambios |
| Que el frontend **muestre** producto/listas con badge, tabla, etc. | Enriquecer `productStockData`/`productSearchResults` con stockf; extender `createResponse` y el return de `processMessageWithAI` (y opcionalmente stream) con `product` y `productSearchResults` | Nuevos campos `product`, `productSearchResults` |
| Ambas cosas | Combinar: mismos puntos de 3.x para el texto + mismos cambios de 4.x para la estructura | Cambios en prompts + estructura |

**Orden recomendado:** primero enriquecer datos (servicio stockf + llamada por SKU/id) y añadir los bloques al **texto** (Opción A) en los bloques indicados; luego, si el frontend lo necesita, añadir la **estructura** (Opción B) en un solo lugar (createResponse + final de processMessageWithAI + stream).
