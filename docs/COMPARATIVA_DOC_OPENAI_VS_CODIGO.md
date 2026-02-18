# Comparativa: documento “Conexión backend → OpenAI” vs código actual (rama PROOF)

Este documento contrasta la descripción que os enviaron sobre la conexión backend–OpenAI con **lo que hay realmente en el repo** (rama PROOF). Sirve para decidir si hay que implementar esa arquitectura en PROOF o si el doc corresponde a otro sistema.

---

## 1. Resumen: documento recibido vs código actual

| Aspecto | Lo que dice el documento | Lo que hay en PROOF |
|--------|---------------------------|---------------------|
| **API de OpenAI** | **Responses API**: `openai.responses.create()` con `model`, `instructions`, `input`, `tools` | **Chat Completions API**: `openai.chat.completions.create()` con `model`, `messages`. No existe `responses.create()` en el repo. |
| **System prompt** | Contenido de `config/system_prompt.txt` (leído del disco) como `instructions` | Conkavo: constante `SYSTEM_INSTRUCTIONS_CONKAVO` en código. Assistant: `ARQUITECTURA_ACORDADA.md` en la raíz. No hay `config/system_prompt.txt`. |
| **Modelo** | `OPENAI_MODEL` en .env (ej. gpt-4o-mini) | Sí: ahora centralizado en `config/openai.js` (`OPENAI_MODEL` opcional, por defecto gpt-4o-mini). |
| **Cliente** | `new OpenAI({ apiKey: process.env.OPENAI_API_KEY })` | Sí: mismo patrón; en PROOF la key (y opcionalmente baseURL) sale de `config/openai.js`. |
| **Herramientas (tools)** | 3: **file_search** (Vector Store), **consultar_productos** (query, limit), **contar_productos** | **2** en assistant.service: **consultar_stock** y **buscar_productos**. No hay `file_search`, ni `consultar_productos`, ni `contar_productos`. El flujo que usa B2BChat (POST /api/chat/message) **no usa tools**: el backend orquesta todo y la IA solo clasifica y redacta. |
| **Vector Store** | `file_search` con `vector_store_ids: [VECTOR_STORE_ID]` (ID en .env) | No. No hay referencias a Vector Store ni `VECTOR_STORE_ID` en el código. La “base de conocimiento” institucional está en texto fijo (Conkavo + company-info.service). |
| **Flujo** | Request → `responses.create()` → si hay tool calls, backend ejecuta consultar_productos/contar_productos (MongoDB) o OpenAI hace file_search → se mete el resultado y se vuelve a llamar `responses.create()` hasta respuesta final. | Request → `chat.completions.create()` (analizar intención) → backend decide y consulta WooCommerce/STOCKF/company-info → `chat.completions.create()` (redactar respuesta). Sin loop de tools en el flujo principal. |

---

## 2. Conclusión

- El **documento** describe una arquitectura basada en **Responses API** + **instructions** + **input** + **tools** (file_search + consultar_productos + contar_productos) y Vector Store con ID en .env.
- El **código en PROOF** usa **Chat Completions**, otro conjunto de tools (consultar_stock, buscar_productos), otro origen del system prompt (código / ARQUITECTURA_ACORDADA.md) y **no** Vector Store ni `file_search`.

Por tanto, lo que os enviaron **no describe el comportamiento actual** del backend. Puede ser:

1. **Objetivo para PROOF**: la “nueva forma de operar” que queréis probar en esta rama (Responses API + file_search + consultar_productos + contar_productos + system_prompt.txt + VECTOR_STORE_ID).
2. **Otro proyecto o variante**: una especificación de otro sistema que ya tiene esa integración.

Si tenéis en .env el ID del vector store y los MDs subidos a ese store, encaja con la opción 1: preparar PROOF para esa arquitectura.

---

## 3. Implementación en PROOF (hecha)

En la rama PROOF ya está implementada la arquitectura del documento:

1. **Responses API**  
   - `src/services/responses-chat.service.js` usa `client.responses.create()` con `model`, `instructions`, `input`, `tools`.

2. **System prompt desde archivo**  
   - `config/system_prompt.txt` se lee como `instructions` en cada request.

3. **Variables de entorno**  
   - `OPENAI_MODEL` y **OPENAI_VECTOR_STORE_ID** (o **VECTOR_STORE_ID**) en `src/config/openai.js` (`getResponsesAPIConfig()`).

4. **Tools**  
   - **file_search** con `vector_store_ids: [VECTOR_STORE_ID]` (si está definido).
   - **consultar_productos** (query, limit) → búsqueda en MongoDB (ProductIndex), resultado en JSON.
   - **contar_productos** (sin params) → `ProductIndex.countDocuments()`.

5. **Endpoint**  
   - **POST /api/chat/responses**: body `{ userId, message, conversationHistory? }`. Responde con `{ success, botMessage }`.  
   - El flujo actual (POST /api/chat/message) no se modifica; ambos coexisten.

---

## 4. Referencias en el repo

- Arquitectura actual: **docs/ANALISIS_ARQUITECTURA_CHAT.md**
- Config OpenAI en PROOF: **src/config/openai.js**, **docs/RAMA_PROOF_OPENAI.md**
- Servicios que llaman a OpenAI: **src/services/conkavo-ai.service.js**, **src/services/assistant.service.js**
