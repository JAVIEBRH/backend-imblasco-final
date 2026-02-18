# Diseño de inserción: chat PROOF (Responses API + Vector Store)

Objetivo: integrar el nuevo flujo de chat (Responses API, file_search, consultar_productos, contar_productos) de forma **pulcra, aislada y sin modificar** el comportamiento actual de main/develop.

---

## 1. Principios

- **Cero cambios en flujos existentes:** no tocar `conversation.service.js`, `conkavo-ai.service.js`, ni la lógica interna de `POST /api/chat/message` ni `/message/stream`. El chat actual sigue igual.
- **Un solo punto de entrada nuevo:** un único endpoint dedicado al chat PROOF (ej. `POST /api/chat/proof`). El frontend de PROOF llama ahí; el resto sigue usando `/message`.
- **Servicio nuevo y acotado:** toda la lógica Responses API + tools + loop vive en un **único servicio nuevo**. Opcionalmente, las funciones que ejecutan las tools (consultar_productos, contar_productos) pueden estar en un módulo de tools para mantener el servicio más legible.
- **Reutilizar sin acoplar:** usar `ProductIndex` (MongoDB) y, si se necesita, lógica existente de búsqueda; pero la **forma de invocación** (nombre de función, parámetros, formato de respuesta) es la del nuevo contrato (consultar_productos con query/limit, contar_productos). No reutilizar modificando assistant.service ni conversation.service.
- **Configuración explícita:** system prompt desde `config/system_prompt.txt`; `VECTOR_STORE_ID` desde `.env`. Sin magic strings en medio del código.

---

## 2. Estructura de archivos propuesta

```
src/
  config/                    # ya existe en raíz: config/system_prompt.txt
  routes/
    chat.routes.js           # SOLO AÑADIR: una ruta nueva POST /proof (véase §4)
  services/
    proof-chat.service.js    # NUEVO: orquestador Responses API + loop de tools
    proof-chat-tools.js      # NUEVO (opcional): implementación consultar_productos y contar_productos
```

- **proof-chat.service.js:**  
  - Carga del system prompt (lectura de `config/system_prompt.txt`).  
  - Construcción del `input` (historial + mensaje) en el formato que pida la Responses API.  
  - Definición de tools: file_search (vector_store_ids desde `process.env.VECTOR_STORE_ID`), consultar_productos (query, limit), contar_productos (sin parámetros).  
  - Llamada a la API (Responses API).  
  - Si la respuesta trae tool calls: ejecutar cada una (delegando a proof-chat-tools o a funciones internas), meter resultados en el input, repetir llamada (con límite de vueltas, ej. 5–10).  
  - Persistencia de historial: Map en memoria keyed por `sessionId` (solo para este flujo), o lectura/escritura a un store dedicado; no reutilizar el `sessions` de conversation.service para no mezclar estados.

- **proof-chat-tools.js:**  
  - `consultarProductos(query, limit)`: usa ProductIndex (y si se decide más adelante, WooCommerce/STOCKF) para devolver una lista de productos con la forma que espere el system prompt (nombre, sku, precio, stock_resumen, especificaciones_texto cuando existan).  
  - `contarProductos()`: cuenta documentos en la colección de productos (ProductIndex o la que corresponda) y devuelve el número (y si el prompt lo pide, colores/variantes).  
  Así el servicio solo orquesta; las tools son funciones puras o casi puras.

---

## 3. Contrato del endpoint nuevo

- **Ruta:** `POST /api/chat/proof`  
  (queda bajo el mismo `app.use('/api/chat', chatRouter)`, por tanto la ruta completa es `/api/chat/proof`).

- **Body:**  
  `{ "session_id": string, "message": string }`  
  (mismo esquema que `POST /api/chat` para facilitar que el front pueda reutilizar la misma forma de envío).

- **Respuesta éxito (200):**  
  `{ "success": true, "response": string, "session_id": string }`  
  donde `response` es el texto final del asistente. Opcionalmente se puede añadir más adelante `productSearchResults` u otros campos si el front lo pide, sin cambiar el contrato básico.

- **Errores:**  
  - 400 si falta `session_id` o `message` o están vacíos.  
  - 504 si se supera un timeout (ej. 120 s, igual que `/message`).  
  - 500 si falla la Responses API o la ejecución de tools, con cuerpo `{ success: false, error: string, response?: string }` y un mensaje genérico en `response` para mostrar al usuario.

- **Middleware:**  
  Aplicar el mismo timeout que en `/message`. Opcional: rate limit y auth si quieren paridad con el resto del chat (se puede añadir después sin romper el diseño).

---

## 4. Cambios concretos por archivo

### 4.1 `src/routes/chat.routes.js`

- **Añadir** un único bloque para `POST /proof`:
  - Validar `session_id` y `message` (igual que en `POST /`).
  - Opcional: `saveChatMessage` inbound/outbound (fire-and-forget) para mantener trazabilidad.
  - `res.setTimeout(MESSAGE_TIMEOUT_MS, ...)` como en `/message`.
  - Llamar a `proofChatService.processMessage(session_id, message)` (o el nombre que se elija).
  - Responder con `{ success: true, response, session_id }` o con el objeto de error en 500/504.
- **No modificar** ninguna ruta existente (`/`, `/init`, `/action`, `/message`, `/message/stream`, `/history/:userId`, etc.).

### 4.2 `src/services/proof-chat.service.js` (NUEVO)

- Importar `openai` (cliente con `process.env.OPENAI_API_KEY`), `fs`/`path` para leer el system prompt, y las funciones de tools (`consultarProductos`, `contarProductos` desde proof-chat-tools).
- Leer `config/system_prompt.txt` (path absoluto desde la raíz del proyecto) y cachear en memoria para no leer disco en cada request.
- Mantener un Map `proofSessions = new Map()` keyed por `session_id`, valor: `{ history: [] }` (array de { role, content } o el formato que exija la Responses API). Límite de mensajes por sesión (ej. últimos 50) para no crecer sin control.
- Definir `getToolsDefinition()` que devuelva la estructura de tools que acepte la Responses API:
  - file_search con `vector_store_ids: [process.env.VECTOR_STORE_ID]`;
  - consultar_productos con parámetros query (string) y limit (number);
  - contar_productos sin parámetros.
- Implementar `processMessage(sessionId, message)`:
  1. Obtener o crear sesión en `proofSessions`.
  2. Añadir mensaje de usuario al historial.
  3. Construir `input` para la API a partir del historial (y el mensaje nuevo si no va dentro del historial según la API).
  4. Llamar a la Responses API con: model (ej. desde `process.env.OPENAI_MODEL` o `gpt-4o-mini`), instructions (system prompt), input, tools.
  5. Si la respuesta incluye tool calls: para cada una, si es `consultar_productos` o `contar_productos`, llamar a la función correspondiente en proof-chat-tools; si es file_search, la resuelve OpenAI (solo hay que incluir el resultado en el siguiente turno según la documentación de la API). Añadir los resultados al input y volver a llamar a la API. Límite de iteraciones (ej. 10) para evitar bucles infinitos.
  6. Cuando la respuesta sea solo texto, tomar ese texto como respuesta final, añadirlo al historial como mensaje del asistente, y devolver `{ response: textoFinal, session_id: sessionId }`.
- Manejo de errores: try/catch; en caso de error de API o de tool, devolver mensaje controlado y no dejar el proceso colgado.

### 4.3 `src/services/proof-chat-tools.js` (NUEVO)

- **consultarProductos(query, limit):**
  - Usar ProductIndex (y la lógica de búsqueda por texto/SKU que ya existe, p. ej. la de assistant.service `buscarProductos` o una versión que devuelva más campos).  
  - Devolver array de objetos con al menos: nombre (o title), sku, precio (si está disponible; si no, null o 0), y si ya existe en el proyecto: stock_resumen, especificaciones_texto. Si hoy no tenéis esos campos en ProductIndex, devolver un formato mínimo (nombre, sku, precio: null) y documentar que en una segunda iteración se puede enriquecer con WooCommerce/STOCKF.
- **contarProductos():**
  - `ProductIndex.countDocuments()` (o la colección que corresponda) y devolver `{ total: number }` (y si el prompt pide colores/variantes, un campo opcional).

Ambas funciones deben ser **async** y manejar errores (p. ej. devolver lista vacía o total 0 si falla MongoDB).

---

## 5. Dependencias y API de OpenAI

- El SDK actual es `openai@^6.15.0`. La Responses API puede exponerse como `client.responses.create()` o en un namespace `beta`. Hay que revisar la documentación oficial actual (https://platform.openai.com/docs/api-reference/responses) y el SDK para Node para usar el método correcto. Si el SDK no expone aún la Responses API, valorar si existe un endpoint REST directo y llamarlo con `fetch` o axios desde el servicio, manteniendo el resto del diseño igual.
- Si se usa un modelo distinto (ej. `gpt-4o`) para PROOF, ponerlo en `.env` como `OPENAI_MODEL_PROOF` o similar y leerlo en proof-chat.service.js; si no, usar el mismo que el resto.

---

## 6. Orden de implementación recomendado

1. **proof-chat-tools.js:** implementar `consultarProductos` y `contarProductos` usando ProductIndex (y solo MongoDB de momento). Probar con un script o test rápido que devuelvan la forma esperada.
2. **proof-chat.service.js:** implementar carga de system prompt, Map de sesiones, definición de tools, `processMessage` con una sola llamada a la API (sin loop) para validar que el request/response es correcto. Luego añadir el loop de tool calls y el límite de vueltas.
3. **chat.routes.js:** añadir `POST /proof` que llame a `proofChatService.processMessage` y devuelva el contrato definido arriba.
4. Probar con Postman o curl: enviar mensajes que fuercen file_search (p. ej. “¿cuál es el horario?”), consultar_productos (“¿tienen lápices?”) y contar_productos (“¿cuántos productos tienen?”), y comprobar que la respuesta final es coherente.
5. (Opcional) Conectar el frontend de la rama PROOF a `POST /api/chat/proof` en lugar de `/message` para usar solo el nuevo flujo en esa rama.

---

## 7. Qué no hacer

- No modificar `conversation.service.js`, `conkavo-ai.service.js`, ni `assistant.service.js` para este flujo.
- No reutilizar el Map `sessions` de conversation.service para el historial de PROOF (evitar acoplamiento y estados mezclados).
- No poner la lógica de Responses API dentro de chat.routes.js (mantenerla en el servicio).
- No implementar el loop de tools sin un límite máximo de iteraciones.
- No asumir que `openai.responses.create` existe sin comprobar la documentación del SDK; si no existe, usar la alternativa indicada (beta o HTTP directo).

---

## 8. Resumen

| Elemento | Acción |
|----------|--------|
| Flujo actual (/message, /message/stream) | No tocar |
| Nuevo endpoint | `POST /api/chat/proof` en chat.routes.js |
| Orquestación Responses API + tools | proof-chat.service.js (nuevo) |
| Ejecución consultar_productos / contar_productos | proof-chat-tools.js (nuevo), usando ProductIndex |
| System prompt | config/system_prompt.txt (ya creado) |
| Vector Store | VECTOR_STORE_ID en .env (ya configurado) |
| Historial PROOF | Map propio en proof-chat.service.js keyed por session_id |

Con esto la inserción queda acotada, predecible y reversible (borrar ruta + dos servicios si se decide no seguir con PROOF).
