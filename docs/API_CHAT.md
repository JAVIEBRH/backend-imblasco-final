# API de Chat – Endpoints oficiales y deprecados

## Endpoints oficiales (chat B2B con IA)

Estos son los que usa el frontend actual (B2BChat). Pipeline: `conversation.service.processMessageWithAI` + Conkavo/OpenAI + WooCommerce + STOCKF.

### POST /api/chat/message

Envía un mensaje y recibe la respuesta del asistente en un solo bloque.

**Body:**
- `userId` (string, requerido) – Identificador de sesión/usuario.
- `message` (string, requerido) – Texto del usuario.
- `conversationHistory` (array, opcional) – Últimos mensajes para contexto (solo en modo no-stream).

**Respuesta (200):**
- `success`, `botMessage`, `state`, `options`, `cart`
- `product` (objeto, opcional) – Un producto cuando la respuesta incluye un único producto (card).
- `productSearchResults` (array, opcional) – Lista de productos cuando la respuesta es una lista (cards).

**Headers opcionales:** `Authorization: Bearer <token>` para auth (cuando se integre WordPress).

---

### POST /api/chat/message/stream

Igual que `/message` pero la respuesta del bot se envía por **Server-Sent Events** (streaming). Útil para mostrar el texto mientras se genera.

**Body:** Igual que `/message` (`userId`, `message`).

**Respuesta:** Flujo SSE; al final un evento `data` con el payload completo (`done: true`, `botMessage`, `product`, `productSearchResults`, etc.).

---

### POST /api/chat/init

Inicializar sesión de chat (mensaje de bienvenida, estado inicial).

**Body:** `userId` (string).

---

### GET /api/chat/history/:userId

Obtener historial de mensajes del usuario.

---

## Deprecado / otro cliente

### POST /api/chat

Pipeline **alternativo**: `assistant.service.handleChat` (ProductIndex, Conversation, function calling). **No** es el usado por el frontend B2B actual.

- **Body:** `session_id`, `message`.
- Si solo se usan `/message` y `/message/stream`, este endpoint puede considerarse **deprecado** o reservado para otro cliente.

---

## Resumen

| Endpoint | Uso actual | Estado |
|----------|------------|--------|
| `POST /api/chat/message` | Frontend B2B | **Oficial** |
| `POST /api/chat/message/stream` | Frontend B2B | **Oficial** |
| `POST /api/chat/init` | Frontend B2B | **Oficial** |
| `GET /api/chat/history/:userId` | Frontend B2B | **Oficial** |
| `POST /api/chat` | — | **Deprecado** / otro cliente |
