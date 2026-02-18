# Rama PROOF – Integración OpenAI (actual y futura)

## ⚠️ Regla de ramas

**PROOF no se fusiona con `main` ni con `develop`** salvo que el usuario lo indique explícitamente. Ver **docs/PROOF_NO_MERGE.md**.

---

## Objetivo de la rama

La rama **PROOF** está pensada para **probar la nueva forma de operar de OpenAI en el futuro**. Aquí se mantiene el código preparado para esa integración sin mezclar con `main` o `develop`.

## Qué está preparado hoy (estado actual)

### 1. SDK y API

- **SDK oficial** `openai` ^6.15.0 (Node.js).
- Uso **solo de Chat Completions** (`client.chat.completions.create()`), sin Responses API ni APIs en beta que puedan cambiar con la “nueva forma”.
- Flujo principal: **conkavo-ai.service.js** (clasificación de intención + redacción) con timeout (60 s) y reintentos (2).

### 2. Cliente OpenAI

- **Un solo punto de inicialización** en `conkavo-ai.service.js`: `initializeOpenAI()` / `getOpenAIClient()`.
- La API key se toma de **variables de entorno** (`process.env.OPENAI_API_KEY`). En local se cargan desde `.env` (dotenv en `index.js`); en producción desde el host (p. ej. Render). Así, la “nueva forma” de OpenAI (si deja de usar `.env` o cambia el origen de la clave) se puede atender cambiando solo **de dónde se lee** la key (env del sistema, secret manager, etc.), sin tocar la lógica de negocio.

### 3. Configuración centralizada (rama PROOF)

- Módulo **`src/config/openai.js`**: lee `OPENAI_API_KEY`, `OPENAI_MODEL` (opcional) y `OPENAI_BASE_URL` (opcional).
- Todos los servicios que usan OpenAI deberían usar esta config. Así, cuando OpenAI cambie (nuevo endpoint, nuevo modelo, otro origen de la key), solo se actualiza este módulo o las variables de entorno.

### 4. Documentación y estabilidad

- **docs/ANALISIS_ARQUITECTURA_CHAT.md**: análisis de exposición a cambios futuros de OpenAI (Chat Completions, modelo, timeouts, etc.).
- Código alineado con ese análisis: sin Responses API, sin Vector Store en código; manejo de errores y fallbacks definidos.

## Variables de entorno (actual y futura)

| Variable | Uso actual | Uso futuro (nueva forma OpenAI) |
|----------|------------|----------------------------------|
| `OPENAI_API_KEY` | Obligatoria. Lee de `.env` (local) o del host (producción). | Si OpenAI deja de usar `.env`, seguirá leyéndose de `process.env` (sistema o plataforma). |
| `OPENAI_MODEL` | Opcional. Por defecto `gpt-4o-mini`. | Permite cambiar de modelo sin tocar código (p. ej. nuevo nombre de modelo). |
| `OPENAI_BASE_URL` | Opcional. Por defecto el de OpenAI. | Útil si en el futuro hay proxy, Azure, o otro endpoint. |

## Dónde se usa OpenAI en PROOF

- **conkavo-ai.service.js**: analizar intención, redactar respuesta (y stream). Usa `getOpenAIClient()` y la config de `src/config/openai.js`.
- **assistant.service.js**: flujo alternativo POST /api/chat (tools). Usa la misma config para modelo y cliente.
- **responses-chat.service.js** (solo PROOF): flujo Responses API con `instructions` (config/system_prompt.txt), `input`, tools (file_search + consultar_productos + contar_productos). Expuesto en **POST /api/chat/responses**.
- **index.js**: health/status y validación de `OPENAI_API_KEY` al arranque.

## Próximos pasos cuando exista la “nueva forma” de OpenAI

1. Revisar documentación oficial de OpenAI (nuevo dashboard, proyectos, claves, endpoints).
2. Ajustar **solo** `src/config/openai.js` y/o variables de entorno (origen de la key, `OPENAI_BASE_URL`, `OPENAI_MODEL`).
3. Probar en PROOF; cuando esté estable, integrar a `develop`/`main` según el flujo de ramas del equipo.

---

*Documento creado para dejar explícito qué está preparado en PROOF para la futura integración con la nueva forma de operar de OpenAI.*
