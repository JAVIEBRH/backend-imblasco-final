# Rama PROOF: no merge a main ni develop

## Regla explícita

**La rama PROOF no debe fusionarse (merge) ni pasarse a `main` ni a `develop` a menos que el usuario lo indique explícitamente.**

- No hacer merge de PROOF → main.
- No hacer merge de PROOF → develop.
- No hacer merge de main o develop → PROOF (para no traer código que no corresponde a esta rama).
- Cualquier integración de los cambios de PROOF en otras ramas debe hacerse **solo cuando el usuario lo pida por escrito**.

## Motivo

En PROOF se implementa y prueba la **nueva arquitectura de OpenAI** (Responses API, Vector Store, file_search, consultar_productos, contar_productos). Ese código es experimental y debe permanecer aislado hasta que se decida llevarlo a producción.

Archivos/cambios solo en PROOF (no pasarlos a main/develop sin indicación): `docs/PROOF_NO_MERGE.md`, `docs/RAMA_PROOF_OPENAI.md`, `docs/COMPARATIVA_DOC_OPENAI_VS_CODIGO.md`, `src/config/openai.js` (getResponsesAPIConfig), `config/system_prompt.txt`, `src/services/responses-chat.service.js`, ruta `POST /api/chat/responses` en `src/routes/chat.routes.js`, variables `OPENAI_VECTOR_STORE_ID`/`VECTOR_STORE_ID` en documentación.

## Responsabilidad

Tanto los desarrolladores como las herramientas de IA (p. ej. Cursor) deben respetar esta regla: no sugerir ni ejecutar merges de PROOF a main/develop sin instrucción explícita del usuario.
