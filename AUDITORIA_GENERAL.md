# Auditoría general del proyecto (backend + frontend)

**Fecha:** 2025  
**Alcance:** Backend (IMBLASCOASISTENTEBACKEND) y Frontend (IMBLASCOASISTENTEFRONTEND). Código, documentación y flujos del chat B2B, recomendaciones, búsqueda, detalles y cards.

---

## 1. Resumen ejecutivo

- **Flujo principal en producción:** El chat que usa el frontend (B2BChat) es **POST /api/chat/message** (o **/message/stream**), orquestado por `conversation.service.processMessageWithAI` + Conkavo/OpenAI, WooCommerce y STOCKF (MongoDB).  
- **Dos pipelines de chat:** Existe además **POST /api/chat** con `assistant.service.handleChat` (ProductIndex, Conversation). Si solo se usa uno en producción, el otro es deuda técnica y puede generar confusión.  
- **Fortalezas:** Flujo de productos/detalles/cards e imágenes está documentado y alineado (AUDITORIA_DETALLES_Y_CARDS, etc.). Recomendaciones genéricas (“recomiendame un producto”) se corrigieron con el mapa de términos.  
- **Problemas detectados:** Riesgos de timeout, auth por env, búsqueda por plurales, un caso de recomendación (“candados”) sin cubrir, y varios huecos de pruebas/casos de uso que las auditorías anteriores no contemplaban.

---

## 2. Alcance y método

- **Revisado:**  
  - Backend: `chat.routes.js`, `conversation.service.js` (flujo principal, createResponse, recomendaciones, detalles), `wordpress.service.js` (búsqueda, imágenes, enriquecimiento), `stockf.service.js`, `conkavo-ai.service.js`, `wordpress-auth.service.js`, `chat-auth.js`, `index.js`.  
  - Frontend: `B2BChat.jsx` (mensajes, productos, cards, streaming, errores), `useChat.js`, `api.js`, `App.jsx` (userId, auth).  
  - Docs: README backend, AUDITORIA_*, REVISION_*, CRITERIOS_Y_LOGICA_DE_BUSQUEDA, IMPACTO_METADATA_STOCKF, AUTH_CHAT_WORDPRESS.  
- **Comparado con:** Comportamiento esperado descrito en docs y casos reales (recomendaciones genéricas, “recomiendame candados”, detalles en texto vs cards).

---

## 3. Flujos revisados (resumen)

| Flujo | Entrada | Salida | Estado |
|-------|--------|--------|--------|
| Mensaje libre | POST /api/chat/message { userId, message } | botMessage, product?, productSearchResults?, cart, state | OK; timeout 90s |
| Streaming | POST /api/chat/message/stream | SSE con chunks + payload final (product, productSearchResults) | OK |
| Auth chat | resolveChatAuth → wordpress-auth | isLoggedIn (env CHAT_AUTH_AS_LOGGED_IN) | Funcional; no hay validación real de token WP |
| Recomendación con categoría | "recomiendame llaveros" | Lista de productos con cards | OK |
| Recomendación genérica | "recomiendame un producto" / "algo" / "productos" | Lista por "regalo" | OK (tras fix en recomendacionTermMap) |
| Recomendación "candados" | "recomiendame candados" | Sin resultados en pruebas | **Hueco** (búsqueda WP / plural) |
| Detalles con producto en contexto | "más detalles" / "detalles del X" | Detalle enriquecido (STOCKF) en texto; card sin duplicar | OK |
| Un producto / lista | product, productSearchResults | Cards con imagen, precio, stock, próxima llegada | OK |

---

## 4. Bugs, huecos y riesgos

### 4.1 Backend

| Id | Tipo | Descripción | Severidad |
|----|------|-------------|-----------|
| B1 | Riesgo | **Timeout 90s** en POST /message y /message/stream. Respuestas muy lentas (OpenAI + Woo + STOCKF) pueden cortar con 504 y mensaje genérico. No hay retry en cliente. | Media |
| B2 | Riesgo | **Auth chat:** `isLoggedIn` depende de `CHAT_AUTH_AS_LOGGED_IN` (default “todos logueados”). No se valida token WordPress; cuando se integre, hay que implementar `validateTokenForChat` contra WP. | Media |
| B3 | Hueco | **“recomiendame candados”** no devuelve productos en pruebas, mientras “recomiendame mochilas” sí muestra candados. Posible causa: búsqueda WooCommerce por término `candados` (plural) no coincide con nombres tipo “Candado Metálico”. No hay normalización plural/singular en el término enviado a `searchProductsInWordPress`. | Baja |
| B4 | Deuda | **Dos flujos de chat:** POST /api/chat usa `handleChat` (assistant.service, ProductIndex, Conversation); POST /api/chat/message usa `processMessageWithAI` (conversation.service). Documentar cuál es el oficial y, si solo se usa uno, deprecar o eliminar el otro. | Baja |
| B5 | Mejora | **Rate limit:** En chat.routes.js hay TODO para rate limit por userId en POST /message. Sin límite, un usuario puede saturar OpenAI/Woo. | Baja |
| B6 | Mejora | **Fire-and-forget** de `saveChatMessage`: si falla, solo se loguea; el usuario recibe respuesta correcta. Aceptable; opcionalmente reintentos o cola. | Muy baja |

### 4.2 Frontend

| Id | Tipo | Descripción | Severidad |
|----|------|-------------|-----------|
| F1 | Riesgo | **userId:** B2BChat recibe `userId` por props (desde App: localStorage `b2b_userId` o generado). Si en producción el userId no coincide con el que valide el backend (p. ej. futuro JWT), sesión y permisos pueden desalinearse. | Media |
| F2 | Hueco | **Token de auth:** Las peticiones a /api/chat/message y /message/stream no envían `Authorization: Bearer` ni `body.token`. Cuando el backend exija token WordPress, el frontend debe enviarlo. | Media (futuro) |
| F3 | Mejora | **Manejo de errores:** Errores de red/HTTP se traducen a mensaje al usuario; correcto. No hay reintento automático en 504/503; el usuario debe “intentar de nuevo”. | Baja |
| F4 | Consistencia | **Historial en modo no-stream:** Se envía `conversationHistory: messages.slice(-10)` con solo `role` y `content` (texto). No se envían product/productSearchResults en el historial; coherente con que el backend no los use para contexto de productos. | OK |

### 4.3 Integración y datos

| Id | Tipo | Descripción | Severidad |
|----|------|-------------|-----------|
| I1 | Riesgo | **STOCKF (Mongo):** Si `MONGO_URI_STOCKF_READ` no está definida o falla la conexión, el enriquecimiento (coming_soon, características, etc.) no se aplica; el chat sigue funcionando con datos WooCommerce. Docs lo indican; conviene healthcheck o log claro en arranque. | Baja |
| I2 | Consistencia | **Imágenes:** WooCommerce devuelve `images`; backend usa `toAbsoluteImageUrl` y asigna `imageUrl` en el payload. Front muestra card con imagen o placeholder. Coherente. | OK |
| I3 | Límite | **Máximo 8 productos** en listas (MAX_PRODUCTS_TO_ENRICH_STOCK = 8; front slice(0, 8)). Alineado entre backend y front. | OK |

---

## 5. Casos de uso no cubiertos o frágiles

- **Recomendación genérica:** “recomiendame un producto”, “algo”, “productos” → cubiertos tras añadir `recomiendame`/`recomiéndame`/`productos` al `recomendacionTermMap` (mapeo a “regalo”).  
- **Recomendación por categoría concreta:** “recomiendame llaveros/copas/trofeos” → OK.  
- **“recomiendame candados”:** Sigue sin resultados; depende de cómo WooCommerce resuelva la búsqueda por “candados” (plural). Solución posible: normalizar a singular para búsqueda WP o ampliar términos (ej. “candado” en el mapa).  
- **Detalles en todos los alcances:** Con producto en contexto y mensaje de “detalles”, se fuerza `queryType = 'PRODUCTOS'` y se usa prompt con STOCKF; el detalle va en el texto del chat, no dentro del card. Documentado y coherente.  
- **Saludos mal clasificados:** Hay corrección cuando OpenAI devuelve INFORMACION_GENERAL y el mensaje es claramente un saludo; se responde con mensaje de bienvenida.  
- **Usuario no logueado:** Si `isLoggedIn === false`, consultas de productos/recomendaciones/variantes reciben mensaje de “necesitas cuenta” sin datos de catálogo. Coherente con AUTH_CHAT_WORDPRESS.

---

## 6. Por qué no salieron antes en auditorías

- Las auditorías previas (**AUDITORIA_DETALLES_Y_CARDS**, **AUDITORIA_INTEGRACION_CARDS_IMAGEN**, **REVISION_CARDS_IMAGEN**) se centraron en:  
  - Detalles en texto vs cards.  
  - Imágenes en productos y listas.  
  - Evitar card duplicado (product + productSearchResults mismo producto).  
  - No romper flujos existentes.  
- **No incluían:**  
  - Casos de uso de **recomendación genérica** (“recomiendame un producto”, “algo”, “productos”).  
  - Casos concretos como **“recomiendame candados”**.  
  - Comportamiento de **búsqueda por plural** en WooCommerce.  
  - Revisión de **dos pipelines de chat** (POST /api/chat vs /api/chat/message).  
  - **Auth** real (token WP) y **timeout/rate limit**.  
Esta auditoría general lee código y docs de punta a punta y cruza con casos reales y flujos no cubiertos por esas auditorías.

---

## 7. Recomendaciones prioritarias

1. **Documentar** en README o docs cuál es el endpoint de chat oficial (recomendado: POST /api/chat/message y /message/stream) y el estado de POST /api/chat (deprecado o solo para otro cliente).  
2. **Revisar timeout** (90s): valorar si es suficiente en producción; si no, subir o implementar streaming por defecto para respuestas largas.  
3. **“recomiendame candados”:** Probar normalización del término a singular (“candado”) antes de llamar a `searchProductsInWordPress`, o añadir “candados” → “candado” (o término que devuelva resultados) en el mapa de recomendaciones.  
4. **Auth:** Cuando se integre WordPress, implementar validación de token en `wordpress-auth.service.validateTokenForChat` y que el frontend envíe `Authorization: Bearer <token>` o `body.token`.  
5. **Rate limit:** Implementar límite por userId (o IP) en POST /api/chat/message para evitar abuso.  
6. **Suite de pruebas de regresión:** Añadir casos automatizados para: “recomiendame un producto”, “recomiendame algo”, “recomiendame llaveros”, “recomiendame candados” (esperado: al menos definir comportamiento deseado), y flujo detalles (producto en contexto + “más detalles”).

---

## 8. Conclusión

El sistema de chat B2B (conversation.service + WooCommerce + STOCKF + B2BChat) está coherente con la documentación reciente y con los flujos de productos, detalles y cards. Los problemas detectados son sobre todo **riesgos** (timeout, auth por env, dos pipelines), **huecos** (recomendación “candados”, normalización plural) y **mejoras** (rate limit, documentación del endpoint oficial). Ninguno es bloqueante para el uso actual si CHAT_AUTH_AS_LOGGED_IN y el timeout son aceptables; las recomendaciones anteriores permiten endurecer producción y evitar regresiones en casos que antes no se probaban de forma explícita.
