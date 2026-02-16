# Auditoría: detalle enriquecido (STOCKF) y visualización de cards

## Objetivo

1. Que la solicitud de **detalles** (más características, especificaciones, descripción) muestre el detalle enriquecido de STOCKF en **todos los alcances**: lista, recomendación, producto único o tras elegir uno de una lista.
2. Que los **cards** se muestren correctamente (orden, lógica, sin duplicados).

---

## 1. Detalle enriquecido: alcance

### 1.1 Flujo único

- Usuario pide un producto por SKU/nombre → se resuelve `productStockData`.
- Usuario pide "más detalles" / "características" / "especificaciones".
- **Antes:** Dependía de que la IA clasificara como PRODUCTO; si salía OTRO/FALLBACK no se usaba el prompt con STOCKF.
- **Cambio:** Si hay `context.productStockData` y el mensaje coincide con el patrón de “pedir detalles”, se fuerza `queryType = 'PRODUCTOS'` antes de armar el prompt. Así siempre se entra al bloque que usa `formatStockfBlockForPrompt(productStockData)` e `instruccionDetalles` (incluir Próxima llegada, Especificaciones, Información adicional en el texto del chat).

### 1.2 Flujo lista → elegir uno → detalles

- Usuario pide lista (ej. "mochilas") → `productSearchResults` con N ítems.
- Usuario elige uno (ej. "el 2", "dame el E47", "dame detalles del ni30") → se resuelve a un solo producto y se asigna `productStockData`.
- Usuario pide "más detalles" (o ya lo dijo en la misma frase).
- Mismo comportamiento que 1.1: con `productStockData` y mensaje de detalles se fuerza PRODUCTOS y se usa el prompt con STOCKF. El enriquecimiento STOCKF se aplica a `context.productStockData` al inicio del bloque de respuesta (antes de armar `textoParaIA`).

### 1.3 Flujo recomendación → detalles

- Usuario pide recomendación → `productSearchResults` (lista).
- Usuario elige uno y/o pide "detalles del X".
- Igual que 1.2: al quedar un solo producto en `productStockData` y mensaje de detalles, `queryType` se fuerza a PRODUCTOS y el detalle sale en el texto del chat.

### 1.4 Regex “pedir detalles”

- Usado en dos sitios: (1) forzar `queryType` cuando hay producto en contexto; (2) dentro del bloque PRODUCTOS para `pideMasDetalles` e `instruccionDetalles`.
- Patrones cubiertos: más detalles, más información, qué más, describir, descripción, características, especificaciones, cuéntame más, detalles del [producto/SKU], información del producto, qué es este producto.

### 1.5 VARIANTE

- Si el usuario pregunta por variante (color, talla) y hay producto en contexto, luego pide "más detalles", el override de `queryType` a PRODUCTOS hace que se use el mismo prompt con detalle enriquecido.

---

## 2. Cards: orden y lógica

### 2.1 Payload enviado al cliente

- **Un producto:** `response.product` con el objeto producto (con `imageUrl`). No se envía `productSearchResults` cuando es el mismo producto único (véase 2.2).
- **Varios productos:** `response.productSearchResults` con array de productos (cada uno con `imageUrl`). No se envía `product` en ese caso (solo hay lista).

### 2.2 Evitar card duplicado

- **Problema:** En el flujo de matching (un producto encontrado) se hacía `context.productSearchResults = [productStockData]` y se enviaban `product` y `productSearchResults` (un ítem), lo que en el front pintaba dos cards iguales.
- **Cambio:** Antes de `createResponse`, si hay `responseProduct` y `responseProductSearchResults` con un solo ítem y ese ítem es el mismo que `responseProduct` (por `id` o por `sku`), se envía solo `responseProduct` (se anula `responseProductSearchResultsWithImageUrl`). Así el cliente recibe un solo card para “un producto”.

### 2.3 Orden de la lista

- El orden de `context.productSearchResults` es el que define la lógica de negocio (búsqueda, desambiguación, recomendación, etc.).
- Ese mismo array (con `imageUrl` añadido) se envía al cliente. El front hace `msg.productSearchResults.slice(0, 8)` y pinta los cards en el mismo orden (índice 0 = primer card, etc.).
- Desambiguación: cuando hay varios resultados se reordena con “producto más probable primero” y se guarda en `context.productSearchResults`; ese orden es el que se envía.

### 2.4 Contenido del card (frontend)

- Un producto: `msg.product` → un card con imagen (o placeholder), nombre, SKU, precio, stock, “Próxima llegada” si aplica. Sin bloque de características/excerpt en el card (el detalle va en el texto del chat).
- Lista: `msg.productSearchResults` → hasta 8 cards con la misma estructura. Sin duplicado cuando la lista tiene un solo ítem y además se envía ese mismo como `product` (corregido en backend).

---

## 3. Resumen de cambios en código

| Ubicación | Cambio |
|-----------|--------|
| `conversation.service.js` (antes de armar textoParaIA) | Si `context.productStockData` y mensaje coincide con “pedir detalles”, `queryType = 'PRODUCTOS'`. |
| `conversation.service.js` (happy path, antes de createResponse) | Si hay un solo producto y está tanto en `responseProduct` como en `responseProductSearchResults`, se envía solo `responseProduct`. |

---

## 4. Checklist de verificación

- [x] Producto único + “dame más detalles” → texto del chat incluye detalle STOCKF (Próxima llegada, Especificaciones, Info adicional).
- [x] Lista → usuario elige uno (por número/SKU/nombre) → “más detalles” → mismo comportamiento.
- [x] Recomendación → usuario elige uno y pide detalles → mismo comportamiento.
- [x] VARIANTE + producto en contexto + “detalles” → queryType forzado a PRODUCTOS, mismo prompt.
- [x] Un producto encontrado por matching → solo un card (no dos).
- [x] Lista de N productos → N cards en el orden de `productSearchResults` (máx. 8 en UI).
- [x] Card: solo imagen, nombre, SKU, precio, stock, Próxima llegada; sin características/excerpt en el card.
