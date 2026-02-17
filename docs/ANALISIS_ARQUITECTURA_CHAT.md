# Análisis de arquitectura del chat – Diagnóstico (sin cambios)

**Objetivo:** Mapear la arquitectura real del backend de chatbot, confirmar uso de OpenAI/tools, detectar riesgos e inconsistencias, y dejar preguntas abiertas antes de cualquier refactor.

**Alcance:** Solo diagnóstico. No se implementan cambios, refactors ni migraciones.

---

## 1. Resumen ejecutivo: qué tenéis vs qué hace el código

| Creencia inicial | Realidad en el código |
|-----------------|------------------------|
| **Responses API** (`openai.responses.create()`) | **No.** Todo el código usa **Chat Completions API** (`openai.chat.completions.create()`). No hay uso de Responses API en el repo. |
| **System prompt desde `system_prompt.txt`** | **Parcial.** Flujo oficial: prompt en **conkavo-ai.service.js** (constante `SYSTEM_INSTRUCTIONS_CONKAVO`). Flujo alternativo (POST /api/chat): lee **ARQUITECTURA_ACORDADA.md** en raíz del proyecto (no `system_prompt.txt`). |
| **Vector Store en OpenAI con .md institucional** | **No.** No hay referencias a Vector Store, `file_search` ni attachments de archivos en el backend. La información institucional está en el system prompt (texto fijo en Conkavo) y en `company-info.service.js`. |
| **Tools: file_search, consultar_productos, contar_productos** | **No.** En el único servicio que declara tools (**assistant.service.js**) las tools son: **`consultar_stock`** y **`buscar_productos`** (MongoDB/ProductIndex + WooCommerce). No existe `file_search`, `consultar_productos` ni `contar_productos`. |
| **Backend ejecuta funciones cuando el modelo las pide** | **Sí**, pero solo en el flujo **POST /api/chat** (assistant.service). El flujo que usa el frontend (**POST /api/chat/message**) **no** usa tools de OpenAI: el backend orquesta todo (Conkavo clasifica intención + backend consulta WooCommerce/STOCKF y luego Conkavo redacta). |

---

## 2. Flujos actuales: dos pipelines distintos

### 2.1 Flujo en producción (B2BChat)

El frontend **B2BChat** llama solo a:

- **POST /api/chat/message** (o **POST /api/chat/message/stream**)

Pipeline:

```
Cliente (B2BChat)
  → POST /api/chat/message  [body: userId, message]
  → chat.routes.js
  → conversationService.processMessageWithAI(userId, message, options)
  → conversation.service.js (motor de estados + lógica de negocio)
       ├── Sesión en memoria (Map: userId → { state, history, currentProduct, ... })
       ├── Detecciones tempranas (horario almuerzo, corrección/queja, gibberish, puerta dura genéricos)
       ├── SKU/ID explícito por regex → consulta directa sin IA
       ├── Si no hay SKU/ID: conkavoAI.analizarIntencionConsulta() → Chat Completions (1 llamada)
       ├── Según queryType: WooCommerce, product-matcher, stockf, company-info, etc.
       ├── Al final: conkavoAI.redactarRespuesta() o redactarRespuestaStream() → Chat Completions (1 llamada)
       └── createResponse(botMessage, state, options, cart, product, productSearchResults)
  → Respuesta JSON (o SSE en /stream)
```

- **OpenAI:** solo **Chat Completions** en **conkavo-ai.service.js**:
  - `analizarIntencionConsulta()`: clasificación de intención (PRODUCTO, INFORMACION_GENERAL, AMBIGUA, VARIANTE, etc.) con JSON estructurado.
  - `redactarRespuesta()` / `redactarRespuestaStream()`: redacción del texto final a partir del “texto para IA” que arma el backend.
- **No hay** tools, no hay Vector Store, no hay `file_search`. La IA no ejecuta funciones; solo analiza y redacta.
- **Historial:** en memoria (`sessions` Map). Se trunca a 50 mensajes por sesión. No persiste en MongoDB/PostgreSQL para este flujo.
- **Estado:** estado de conversación (IDLE, WAITING_PRODUCT, etc.) y carrito en PostgreSQL (cart.service).

### 2.2 Flujo alternativo (documentado como deprecado)

- **POST /api/chat** [body: `session_id`, `message`]

Pipeline:

```
Cliente
  → POST /api/chat
  → chat.routes.js
  → assistant.service.handleChat({ session_id, message })
  → assistant.service.js
       ├── Historial y contexto en MongoDB (modelo Conversation: session_id, mensajes[], contexto_actual)
       ├── System prompt desde archivo: ARQUITECTURA_ACORDADA.md (raíz del proyecto)
       ├── Detecciones previas (horario almuerzo, búsqueda genérica, color/atributos con contexto)
       ├── openai.chat.completions.create({ model: 'gpt-4o-mini', messages, tools, tool_choice: 'auto' })
       ├── Si hay tool_calls: ejecutar consultar_stock y/o buscar_productos (MongoDB ProductIndex + WooCommerce)
       ├── Si hubo tool results: o bien formatear respuesta local (stock/búsqueda) o segunda llamada a Chat Completions con tool results
       └── Guardar en Conversation (mensajes + contexto_actual), stripOrderLanguage, etc.
  → { session_id, response, contexto_actual }
```

- **Tools:** solo dos: `consultar_stock` (codigo) y `buscar_productos` (termino). Ambas usan ProductIndex (MongoDB) y WooCommerce para stock.
- **Una sola ronda de tools:** no hay loop; tras los tool results se usa o bien respuesta formateada en backend o una segunda llamada a `chat.completions.create` sin tools.
- **System prompt:** leído de `ARQUITECTURA_ACORDADA.md`. Si el archivo no existe en la raíz, `getSystemPrompt()` lanzará al leer.

---

## 3. Diagrama de flujo simplificado

```
                    ┌─────────────────────────────────────────────────────────────┐
                    │                     FRONTEND (B2BChat)                       │
                    │  POST /api/chat/message  o  /api/chat/message/stream          │
                    └───────────────────────────────┬─────────────────────────────┘
                                                    │
                                                    ▼
                    ┌─────────────────────────────────────────────────────────────┐
                    │  chat.routes.js                                              │
                    │  (rate limit en /message y /stream; resolveChatAuth)         │
                    └───────────────────────────────┬─────────────────────────────┘
                                                    │
                                                    ▼
                    ┌─────────────────────────────────────────────────────────────┐
                    │  conversation.service.processMessageWithAI(userId, message)  │
                    │  • Sesión en memoria (Map)                                    │
                    │  • Detecciones tempranas (almuerzo, gibberish, genéricos)  │
                    │  • SKU/ID por regex → consulta directa                       │
                    └───────────────────────────────┬─────────────────────────────┘
                                                    │
                          ┌─────────────────────────┼─────────────────────────┐
                          │                         │                         │
                          ▼                         ▼                         ▼
                    ┌───────────┐            ┌───────────────┐           ┌─────────────┐
                    │ Conkavo   │            │ WooCommerce   │           │ STOCKF      │
                    │ (OpenAI   │            │ + ProductIndex │           │ (metadata)  │
                    │  Chat     │            │ + product-     │           │             │
                    │ Completions)           │ matcher       │           │             │
                    │                          │               │           │             │
                    │ • analizarIntencion      │               │           │             │
                    │ • redactarRespuesta      │               │           │             │
                    └───────────┘            └───────────────┘           └─────────────┘
                          │                         │                         │
                          └─────────────────────────┼─────────────────────────┘
                                                    │
                                                    ▼
                    ┌─────────────────────────────────────────────────────────────┐
                    │  createResponse(botMessage, state, options, cart, product,   │
                    │                 productSearchResults)                        │
                    └─────────────────────────────────────────────────────────────┘

    ─ ─ ─ ─ ─ ─ ─ ─  Flujo NO usado por B2BChat  ─ ─ ─ ─ ─ ─ ─ ─

                    POST /api/chat (session_id, message)
                                    │
                                    ▼
                    assistant.service.handleChat
                                    │
                    • Conversation (MongoDB): historial + contexto
                    • ARQUITECTURA_ACORDADA.md → system
                    • openai.chat.completions.create + tools (consultar_stock, buscar_productos)
                    • 1 ronda tools → formato local o 2ª llamada
                                    │
                                    ▼
                    { response, contexto_actual }
```

---

## 4. Qué está bien

1. **Separación de responsabilidades en el flujo oficial**  
   El backend decide qué hacer (WooCommerce, STOCKF, company-info); la IA clasifica y redacta. Evita que el modelo “invente” datos.

2. **Uso correcto de Chat Completions**  
   Tanto en Conkavo como en assistant.service: llamadas bien formadas, system + messages, y en assistant tools con `tool_choice: 'auto'`.

3. **Flujo de tools en assistant.service**  
   Una sola ronda de tool_calls; ejecución de funciones; en caso de varios results se prioriza formato local (stock o búsqueda) o una segunda llamada. No hay loop infinito de tools.

4. **Manejo de errores en tool arguments**  
   Si `JSON.parse(toolCall.function.arguments)` falla, se usa `{}` y se registra el error; no se inventan argumentos.

5. **Documentación de API**  
   `docs/API_CHAT.md` deja claro qué es oficial (/message, /message/stream) y qué está deprecado (POST /api/chat).

6. **Rate limit y timeout**  
   `chat-rate-limit.js` y timeout 120 s en rutas de mensaje reducen riesgo de abuso y colgados.

7. **Respuesta ante fallos**  
   En `processMessageWithAI` los errores se capturan y se devuelve un mensaje genérico al usuario sin romper la respuesta JSON.

---

## 5. Riesgos e inconsistencias

### 5.1 Dos flujos de chat

- **Producción:** `/message` y `/message/stream` → `processMessageWithAI` (Conkavo + WooCommerce + STOCKF, sin tools).
- **Alternativo:** POST `/api/chat` → `handleChat` (assistant.service, con tools y MongoDB Conversation).

Consecuencias: dos modelos de sesión (memoria vs MongoDB), dos formas de “system prompt”, dos formas de integrar productos. Si solo se usa el flujo oficial, el código de POST /api/chat y de assistant.service es deuda; si en el futuro se quiere usar tools o Vector Store, hay que decidir si se unifica o se mantiene un solo pipeline.

### 5.2 Historial del flujo oficial solo en memoria

- `conversation.service.js` guarda sesiones en un `Map()` en proceso. Si el servidor se reinicia, se pierde todo el historial de chat para ese flujo.
- No hay persistencia en base de datos para `session.history`. Limitación conocida pero importante para escalado o recuperación.

### 5.3 System prompt y archivo externo

- **Flujo oficial:** prompt fijo en código (Conkavo). Cambios requieren despliegue.
- **Flujo alternativo:** lee `ARQUITECTURA_ACORDADA.md` en arranque (cache en memoria). Si el archivo no existe, cualquier uso de POST /api/chat fallará al leer. Conviene confirmar si el archivo existe en el repo y en despliegue.

### 5.4 Tamaño y complejidad de conversation.service.js

- El archivo tiene miles de líneas y muchas ramas (queryType, detecciones, flujos de producto, recomendaciones, etc.). Aumenta el riesgo de regresiones y dificulta pruebas y mantenimiento. No es un bug puntual pero sí un riesgo de diseño.

### 5.5 Posible fragilidad en respuestas cuando hay varios tool_calls

- En assistant.service, si el modelo devuelve varios tool_calls y ninguno es “stock” ni “búsqueda” (p. ej. solo herramientas no implementadas o nombres distintos), `lastStockResult` y `lastSearchResults` quedan vacíos y se hace la segunda llamada con tool results. Correcto, pero si en el futuro se añaden más tools, la lógica de “priorizar formato local” (solo stock/búsqueda) puede quedar incompleta o confusa.

### 5.6 User hardcodeado en processMessageWithAI

- Línea ~1592: `const user = { email: 'cesar.barahona@conkavo.cl', role: 'agent' }`. El contexto que se pasa al flujo depende de un usuario fijo. Para multi-tenant o permisos reales habría que sustituirlo por el usuario autenticado.

### 5.7 Timeout y latencia

- Documentación y comentarios mencionan “revisar timeout en processMessageWithAI”. La ruta tiene 120 s; las llamadas a OpenAI (Conkavo) tienen su propio timeout (60 s en conkavo-ai). En escenarios con WooCommerce lento, la experiencia puede degradarse; no es un error de implementación pero es un punto a vigilar.

---

## 6. Gaps respecto a vuestra creencia inicial

- **Responses API:** no se usa. Todo es Chat Completions.
- **Vector Store / file_search:** no existe en el backend. La base de conocimiento “institucional” es texto en system prompt y company-info.
- **Tools `consultar_productos` y `contar_productos`:** no existen. Las únicas tools son `consultar_stock` y `buscar_productos` en assistant.service (y ese flujo no es el que usa B2BChat).
- **System prompt en `system_prompt.txt`:** no. Flujo oficial = constante en Conkavo; flujo alternativo = `ARQUITECTURA_ACORDADA.md`.

---

## 7. Preguntas abiertas antes de modificar

1. **¿POST /api/chat (assistant.service) debe seguir existiendo?**  
   Si no hay cliente que lo use, ¿se depreca oficialmente, se documenta como “legacy” o se elimina para simplificar?

2. **¿Queréis introducir Vector Store / file_search en el futuro?**  
   Si sí, habría que decidir en qué pipeline (por ejemplo solo en uno) y cómo convive con la información que ya está en Conkavo y company-info.

3. **¿El historial del chat (flujo oficial) debe persistirse?**  
   Si se requiere entre reinicios o entre instancias, habría que guardar `session.history` (y posiblemente estado) en MongoDB o PostgreSQL.

4. **¿Existe `ARQUITECTURA_ACORDADA.md` en la raíz del proyecto en todos los entornos?**  
   Si alguien llama a POST /api/chat, el servicio falla si el archivo no está. Vale la pena comprobarlo en CI y en despliegue.

5. **¿El usuario del contexto (`user`) debe venir de autenticación real?**  
   Para no depender del usuario hardcodeado y para permisos/precios por usuario.

6. **¿Queréis unificar en un solo pipeline (p. ej. solo Conkavo + herramientas propias del backend) o mantener dos (uno con tools de OpenAI y otro sin)?**  
   La respuesta guía si se invierte en simplificar conversation.service o en extender assistant.service.

---

## 8. Referencia rápida de archivos

| Archivo | Rol |
|---------|-----|
| `src/routes/chat.routes.js` | Rutas: POST /, /init, /action, /message, /message/stream, /history/:userId, /state/:userId, /actions, /reset/:userId. |
| `src/services/conversation.service.js` | Flujo oficial: processMessageWithAI, sesiones en memoria, estados, integración Conkavo + WooCommerce + STOCKF. |
| `src/services/assistant.service.js` | Flujo POST /api/chat: handleChat, tools consultar_stock/buscar_productos, Conversation (MongoDB), ARQUITECTURA_ACORDADA.md. |
| `src/services/conkavo-ai.service.js` | OpenAI Chat Completions: analizarIntencionConsulta, redactarRespuesta, redactarRespuestaStream; system prompt embebido. |
| `src/services/company-info.service.js` | Información de empresa para el agente. |
| `docs/API_CHAT.md` | Documentación de endpoints oficiales y deprecados. |

---

---

## 9. ANÁLISIS ENFOQUE ESTABILIDAD (sin implementar cambios)

Objetivo: diagnóstico técnico para que el sistema siga funcionando de forma confiable y no se rompa ante cambios futuros de OpenAI. No se ha modificado ni se propone modificar código, lógica de búsqueda ni arquitectura.

### 9.1 Confirmación contra el código real (suposiciones)

| Suposición | Confirmación en código |
|------------|-------------------------|
| Node.js + SDK oficial OpenAI | **Sí.** `package.json`: `"openai": "^6.15.0"`. Uso de `import OpenAI from 'openai'` y `client.chat.completions.create()`. |
| `openai.responses.create()` por turno | **No.** En todo el repo solo se usa **`openai.chat.completions.create()`**. No existe `responses.create()`. |
| System prompt desde `system_prompt.txt` como "instructions" | **No.** Flujo oficial: prompt en constante `SYSTEM_INSTRUCTIONS_CONKAVO` (conkavo-ai.service.js). Flujo POST /api/chat: `ARQUITECTURA_ACORDADA.md` leído como contenido de mensaje system, no desde `system_prompt.txt`. |
| Tools: file_search, consultar_productos, contar_productos | **No.** Las únicas tools declaradas (assistant.service.js) son **consultar_stock** y **buscar_productos**. No hay file_search, consultar_productos ni contar_productos. |
| Backend ejecuta funciones cuando el modelo las pide | **Sí** en el flujo POST /api/chat (assistant.service). En el flujo en producción (POST /api/chat/message) el backend no usa tools de OpenAI; orquesta todo y la IA solo clasifica y redacta. |

### 9.2 Flujo actual del chat (paso a paso)

**Flujo en producción (B2BChat):**

1. Cliente envía **POST /api/chat/message** (o `/message/stream`) con `userId`, `message`.
2. **chat.routes.js:** valida body, aplica rate limit y auth en /message y /stream, opcionalmente guarda mensaje inbound (fire-and-forget), establece timeout HTTP 120 s.
3. **conversation.service.processMessageWithAI(userId, message, options):**
   - Obtiene o crea sesión en memoria (`sessions` Map).
   - Añade mensaje usuario al historial.
   - Detecciones tempranas (corrección/queja, horario almuerzo, gibberish, puerta dura genéricos) → respuesta fija, sin OpenAI.
   - Si hay SKU/ID explícito por regex → consulta directa a WooCommerce/product-matcher, sin llamar a OpenAI para clasificación.
   - Si no: **conkavoAI.analizarIntencionConsulta()** → una llamada a **Chat Completions** (modelo gpt-4o-mini, JSON, con timeout 60 s y 2 reintentos).
   - Según `queryType` (PRODUCTOS, INFORMACION_GENERAL, VARIANTE, etc.): el backend consulta WooCommerce, STOCKF, company-info, product-matcher y construye `textoParaIA`.
   - **conkavoAI.redactarRespuesta()** o **redactarRespuestaStream()** → una llamada a **Chat Completions** (mismo modelo, con timeout y reintentos) para redactar el texto final.
   - **createResponse()** con botMessage, state, options, cart, product, productSearchResults.
4. Ruta devuelve JSON (o SSE en stream). Errores capturados en try/catch: 500 con mensaje genérico al usuario.

**Flujo alternativo (POST /api/chat):**

1. Cliente envía **POST /api/chat** con `session_id`, `message`.
2. **assistant.service.handleChat:** lee historial y contexto desde MongoDB (Conversation), carga system desde ARQUITECTURA_ACORDADA.md, detecciones previas (almuerzo, búsqueda genérica, color con contexto).
3. **openai.chat.completions.create** con `messages`, `tools` (consultar_stock, buscar_productos), `tool_choice: 'auto'` — **sin timeout ni retry en este servicio**.
4. Si hay `tool_calls`: ejecuta cada una (consultar_stock, buscar_productos), acumula tool results; si hay resultado de stock o búsqueda usa respuesta formateada local; si no, **segunda** llamada a chat.completions.create con messages + assistantMessage + toolResults (sin tools).
5. Guarda en Conversation, devuelve response y contexto_actual.

### 9.3 Partes correctas y alineadas con buenas prácticas

- **Chat Completions API** (no Responses API): uso de la API estable y documentada; menos riesgo de deprecación brusca que productos beta.
- **Flujo oficial (Conkavo):** todas las llamadas a OpenAI pasan por **openaiCreate** → **withTimeout(60 s)** + **withRetry(2, 1 s)**. Reduce colgados y fallos transitorios.
- **Manejo de errores en analizarIntencionConsulta:** si el JSON de la respuesta no se puede parsear, se devuelve objeto por defecto seguro (AMBIGUA, necesitaMasInfo) en lugar de propagar o inventar datos.
- **Conversation.service:** si falla analizarIntencionConsulta, se captura el error, se fuerza queryType = AMBIGUA y analisisOpenAI de fallback; el flujo sigue.
- **Rutas /message y /message/stream:** try/catch devuelve 500 con mensaje amigable y no rompe la respuesta; timeout HTTP 120 s evita conexiones colgadas indefinidamente.
- **Tools en assistant.service:** una sola ronda de tool_calls; no hay loop que pueda repetir tools indefinidamente. Parseo de `arguments` con try/catch y uso de `{}` si falla, sin inventar argumentos.
- **Validación de tipo de análisis:** si OpenAI devuelve un `tipo` no incluido en la lista permitida, se fuerza AMBIGUA y necesitaMasInfo.

### 9.4 Partes riesgosas o dudosas (estabilidad)

- **assistant.service.js (POST /api/chat):** las llamadas a **openai.chat.completions.create** son **directas**, sin timeout ni retry. Si la API tarda o falla de forma transitoria, la petición puede colgar hasta el timeout del cliente o fallar sin reintento. **Riesgo:** medio (este flujo no es el usado por B2BChat en producción).
- **Modelo fijo "gpt-4o-mini":** hardcodeado en conkavo-ai.service.js (múltiples llamadas) y en assistant.service.js. Si OpenAI depreca o renombra el modelo, habría que actualizar en varios sitios. **Riesgo:** bajo a medio (cambios de nombres suelen avisarse).
- **response_format: { type: 'json_object' }** en analizarIntencionConsulta: dependencia de un parámetro concreto de la API. Cualquier cambio o deprecación de este formato podría afectar al parsing. **Riesgo:** bajo.
- **Historial en memoria (flujo oficial):** `sessions` es un Map en proceso. Reinicio del servidor borra todo el historial de chat. No hay persistencia para este flujo. **Riesgo:** operativo (pérdida de contexto), no de “romper” lógica.
- **Tool call con nombre no manejado:** en assistant.service, si el modelo devolviera un tool_call con nombre distinto de `consultar_stock` o `buscar_productos`, ese call no se ejecuta y no se añade resultado a `toolResults`. La segunda llamada recibiría menos tool results de los esperados. Comportamiento estable pero potencialmente confuso si en el futuro se añaden más tools sin actualizar el switch. **Riesgo:** bajo con las dos tools actuales.
- **ARQUITECTURA_ACORDADA.md:** si no existe en la raíz, getSystemPrompt() lanza al leer el archivo. Cualquier uso de POST /api/chat fallaría. **Riesgo:** bajo si el archivo está en repo y en despliegue; conviene confirmar.
- **Tamaño y complejidad de conversation.service.js:** un solo archivo con miles de líneas y muchas ramas. Aumenta el riesgo de regresiones al tocar código y dificulta pruebas localizadas. **Riesgo:** de mantenimiento y estabilidad a largo plazo (medio).

### 9.5 Exposición a cambios futuros de OpenAI (riesgo global)

| Área | Nivel | Comentario |
|------|--------|------------|
| Uso de Responses API | **Nulo** | No se usa; no hay exposición a deprecación o cambios de esa API. |
| Chat Completions API | **Bajo** | API estable y estándar. Cambios suelen ser retrocompatibles (nuevos campos, modelos). |
| Modelo gpt-4o-mini | **Bajo–medio** | Si OpenAI depreca o renombra, basta con actualizar el string del modelo en los sitios donde se usa. |
| Formato de tools (function calling) | **Bajo** | Es el mecanismo estándar de Chat Completions; poco probable un cambio rupturista. |
| response_format (json_object) | **Bajo** | Parámetro opcional; posible que en el futuro se generalice o se sustituya; fácil de localizar. |
| Timeout/retry en assistant.service | **Medio** | Solo para el flujo POST /api/chat. Si en el futuro ese flujo se usara más, la falta de timeout/retry sería más crítica. |

**Conclusión:** exposición global a cambios de OpenAI **baja a media**. La base (Chat Completions, sin Responses API, sin Vector Store en código) es estable. Los puntos sensibles son el modelo concreto y la ausencia de timeout/retry en assistant.service.

### 9.6 Puntos frágiles resumidos

- **Loops de tools:** no hay. Solo una ronda de tool_calls en assistant.service; luego respuesta formateada o segunda llamada sin tools.
- **Manejo de estado de conversación:** flujo oficial: estado en memoria (Map); se pierde al reiniciar. Flujo alternativo: estado en MongoDB (Conversation). Dos modelos distintos; no hay inconsistencia interna dentro de cada flujo.
- **Manejo de errores del SDK:** Conkavo: errores propagados desde openaiCreate (timeout/retry); quien llama (processMessageWithAI) tiene try/catch y devuelve mensaje genérico. Assistant: no hay try/catch alrededor de las llamadas a create(); los errores suben a la ruta POST /api/chat (que no tiene try/catch específico en el fragmento revisado; si hay middleware global de errores, se cubre ahí).
- **Timeouts:** Conkavo 60 s por llamada; HTTP 120 s en rutas /message y /message/stream. Assistant: sin timeout propio; depende del cliente o del servidor HTTP.
- **Acoplamientos riesgosos:** dependencia explícita del formato JSON de analizarIntencionConsulta (tipos, campos). Si OpenAI cambiara el estilo de respuesta sin romper JSON, la lógica que mapea `tipo` a queryType podría necesitar ajustes. Lista `tiposValidos` actúa como defensa.

### 9.7 Dependencias potencialmente legacy o riesgosas

- **openai ^6.15.0:** versión reciente del SDK. Mantener en actualizaciones menores para correcciones de bugs y compatibilidad con la API.
- **Uso de `response_format: { type: 'json_object' }`:** documentado en la API actual; vigilar notas de OpenAI por si en el futuro se prefiere otro mecanismo (p. ej. structured outputs con nombre de esquema).
- **Sin uso de Vector Store / file_search en código:** no hay dependencia de APIs de Assistants/Vector Store; por tanto no hay riesgo de rotura por cambios en esos productos.

### 9.8 Preguntas abiertas antes de cualquier modificación

1. ¿POST /api/chat (assistant.service) debe seguir activo? Si no hay cliente, ¿se deja documentado como legacy o se elimina para reducir superficie de mantenimiento?
2. ¿Queréis persistir el historial del flujo oficial (sessions) en base de datos para no perderlo en reinicios?
3. ¿Existe ARQUITECTURA_ACORDADA.md en la raíz en todos los entornos (dev, staging, prod)? Si alguien usa POST /api/chat, la ausencia del archivo rompe.
4. ¿Conviene añadir timeout y retry a las llamadas OpenAI en assistant.service por si ese flujo se rehabilita o se usa en otro cliente?
5. ¿Tiene sentido centralizar el nombre del modelo (p. ej. variable de entorno o constante compartida) para facilitar un único punto de cambio si OpenAI depreca gpt-4o-mini?
6. ¿Hay middleware global de errores que capture excepciones no capturadas de POST /api/chat (handleChat)? Si no, un fallo de OpenAI en ese flujo podría devolver 500 sin mensaje controlado.

---

*Documento generado como diagnóstico. No implica cambios en el código. Enfoque: estabilidad y comprensión del sistema, sin refactors ni mejoras de inteligencia.*
