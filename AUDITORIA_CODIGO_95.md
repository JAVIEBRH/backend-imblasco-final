# Auditoría de código: hacia un sistema al 95%

Objetivo: evaluar el backend a nivel **código, lógica, construcción, solidez y proyección**, e indicar qué falta para que el sistema esté “bien” en un **95%** programáticamente.

---

## 1. Resumen ejecutivo

| Dimensión        | Estado actual | Para 95% |
|------------------|---------------|----------|
| Arquitectura     | Clara (Express, servicios, middleware) | Mantener y cerrar incoherencias (DB, rutas) |
| Lógica de negocio | Funcional; núcleo muy concentrado en un archivo | Reducir complejidad de `conversation.service.js` |
| Solidez          | Buena (timeouts, reintentos, validación, errorHandler) | Rate limit chat, health de dependencias |
| Proyección       | Tests mínimos, documentación dispersa | Más tests, doc unificada, criterios al día |
| Consistencia     | Mejorada (precio, términos genéricos, FALLBACK, contacto) | Unificar 5/10, mensaje “no encontré” |

**Estimación actual:** ~80–85%. Con las acciones priorizadas de esta auditoría se puede acercar al 95% sin reescribir el sistema.

---

## 2. Arquitectura y estructura

### 2.1 Lo que está bien

- **Separación por capas:** `routes` → `middleware` → `services` → `models` / `config` / `utils`. Responsabilidades razonablemente delimitadas.
- **Punto de entrada:** `server.js` carga `src/index.js`; variables de entorno se cargan antes de imports sensibles.
- **Middleware global:** `errorHandler` y `notFound` al final de la cadena; errores con `status`, log en 500+ o desarrollo, respuesta JSON unificada.
- **Servicios reutilizables:** `resilience.js` (timeout, retry), `formato.js` (precio), `normalization.js`, `attribute-value.js`, `company-info.service.js` como fuente única de datos de empresa y contacto.
- **Chat:** Auth no bloqueante (`resolveChatAuth`), timeouts en `/message` y `/message/stream`, heartbeat en stream, fire-and-forget para guardar mensajes (no bloquea respuesta).

### 2.2 Incoherencias e impacto

| Tema | Dónde | Problema | Riesgo |
|------|--------|----------|--------|
| **Base de datos** | `index.js` habla de “MongoDB”; `package.json` incluye `pg` | `pg` no se usa en el código actual; solo Mongoose. Mensaje de arranque y docs pueden confundir. | Bajo: no rompe nada; sí confunde en mantenimiento y onboarding. |
| **Rutas de stock** | Panel `/` usa `/api/stock/import` y `/api/stock` | `stock.service.js` usa modelo `Product` (MongoDB). Flujo CSV → MongoDB coherente; comentarios en código que mencionen “PostgreSQL” (si los hay) serían incorrectos. | Bajo si no hay referencias a PostgreSQL en servicios de stock. |
| **Dos flujos de chat** | `POST /api/chat` (handleChat) vs `POST /api/chat/message` (processMessageWithAI) | Dos pipelines distintos: uno con `assistant.service.js` (function calling, ProductIndex, Conversation), otro con `conversation.service.js` + Conkavo. | Medio: duplicación de concepto “chat”; si solo se usa uno en producción, el otro es deuda. |

**Recomendación:** Documentar en un solo lugar (p. ej. README o `docs/ARQUITECTURA.md`) qué BD se usa (MongoDB), qué rutas de chat son las de producción (`/api/chat/message` y stream) y para qué existe `/api/chat`. Eliminar `pg` de `package.json` si no hay planes de usarlo.

---

## 3. Código y lógica

### 3.1 conversation.service.js (núcleo del asistente)

- **Tamaño y complejidad:** Un solo archivo concentra la mayor parte de la lógica: análisis de intención, detección temprana, reclasificación, WooCommerce, construcción de prompts, variantes, recomendaciones, listas, fallbacks. Del orden de miles de líneas y muchas ramas anidadas.
- **Lo positivo:** Constantes recientes (`TERMINOS_GENERICOS_PRODUCTO`, uso de `formatPrecioParaCliente`), bloques claros con comentarios (FALLBACK, RECOMENDACION sin término, no logueado), detección temprana por regex para casos conocidos.
- **Riesgo:** Cualquier cambio en flujos (PRODUCTOS, RECOMENDACION, VARIANTE, AMBIGUA) puede afectar ramas adyacentes; testing manual o de regresión se vuelve crítico.

**Para acercarse al 95% sin refactor grande:**  
- Mantener (y ampliar ligeramente) los tests de regresión que tocan `conversation.service.js` (p. ej. atributos, formato).  
- Documentar en `CRITERIOS_Y_LOGICA_DE_BUSQUEDA.md` los flujos ya implementados (detección temprana, RECOMENDACION, cotización, devoluciones, FALLBACK con/sin tipo, contacto en else).  
- Opcional a medio plazo: extraer a módulos auxiliares funciones puras (normalización, detección de intención por regex, construcción de un tipo de prompt) para reducir tamaño del archivo y facilitar pruebas.

### 3.2 Duplicación y convenciones

- **Precio:** Unificado con `formatPrecioParaCliente` y `SIN_PRECIO_LABEL` en `formato.js`. Bien.
- **Términos genéricos:** Unificado en `TERMINOS_GENERICOS_PRODUCTO`. Bien.
- **Límites 5 vs 10:** Sigue habiendo `MAX_PRODUCTS_TO_ENRICH_STOCK = 5` y varios `slice(0, 10)` en búsquedas intermedias; el tope visible al usuario es 5. No es bug, pero conviene una constante única (p. ej. `MAX_PRODUCTOS_MOSTRAR_USUARIO = 5`) y usarla donde se limita lo que ve el usuario; los 10 pueden quedar como detalle interno con comentario.
- **Contacto:** Mismo patrón en FALLBACK y en el else genérico (`companyInfoService.getCompanyInfo().contacto` + `lineaContacto`). Bien.

### 3.3 Lógica de negocio crítica

- **Sesiones:** En memoria (objeto por `userId`). Si el proceso se reinicia, se pierde estado. Aceptable para MVP; para 95% “de producción” conviene documentar esta limitación y, si se exige persistencia, planificar almacenamiento (p. ej. MongoDB/Redis).
- **WooCommerce:** Servicio con timeout y reintentos; configuración lazy. Cache de atributos/términos en memoria. Coherente.
- **OpenAI (Conkavo):** Timeout 60s, reintentos; instrucciones de sistema estrictas (no inventar datos). Bien.
- **Auth chat:** `resolveChatAuth` determina `isLoggedIn` (env o token); no bloquea. Bien.

---

## 4. Solidez

### 4.1 Manejo de errores

- **Rutas:** Validación de entrada (userId, message, action, etc.) y `next(error)` en catch. El middleware global devuelve JSON con `success: false`, `message`, y opcionalmente `stack` en desarrollo.
- **Conversation:** `processMessageWithAI` en un try/catch en la ruta; se devuelve mensaje amigable al usuario y se registra el error en consola. Correcto.
- **Servicios externos:** `wordpress.service` y `conkavo-ai.service` usan `withTimeout` y `withRetry`. Reduce cuelgues y fallos transitorios.

### 4.2 Validación

- **Middleware de validación:** Existe (`validateUserId`, `validateSKU`, `validateQuantity`, `validateEmail`, `validateOrderStatus`, `validateLimit`, `validateOffset`, `validateChatAction`). No todas las rutas lo usan (p. ej. chat hace validación manual). Para 95%: reutilizar donde aplique para no duplicar reglas.
- **Límites:** `validateLimit` con tope 1000; multer para CSV con tope 10MB. Bien.

### 4.3 Gaps de solidez (recomendados para 95%)

| Gap | Dónde | Propuesta |
|-----|--------|-----------|
| **Rate limit** | `POST /api/chat/message` y `/message/stream` | Limitar peticiones por `userId` o IP (p. ej. 60/min) para evitar abuso y sobrecarga de OpenAI/WooCommerce. |
| **Health de dependencias** | Solo `/api/health` y `/api/health/openai` | Añadir (opcional) comprobación de MongoDB y, si se considera crítico, WooCommerce (ping o endpoint ligero). No bloquear arranque; solo informar en health. |
| **Timeout en respuestas de IA** | Ya hay 90s en rutas | Mantener; está bien. Revisar que el timeout de Conkavo (60s) sea menor que el de la ruta. |
| **res.headersSent** | `errorHandler` ya comprueba | Correcto; evita enviar dos respuestas. |

---

## 5. Proyección (tests, documentación, mantenibilidad)

### 5.1 Tests

- **Existente:** Tests de regresión para `getAttributeDisplayValue` y `buildAttributeOptionKey`; tests de conversation/stock-list. Ejecución con `npm run test:regression` y scripts asociados.
- **Cobertura:** Baja respecto al tamaño del sistema; el núcleo (conversation.service) tiene poca cobertura automatizada.
- **Para 95%:**  
  - Mantener y ampliar ligeramente tests de regresión (por ejemplo, que no se rompa formato de precio, que FALLBACK sin tipo devuelva contacto, que RECOMENDACION sin término devuelva lista).  
  - No es obligatorio llegar a cobertura alta en todo; sí es importante que los flujos críticos (chat con IA, listas, fallbacks) tengan al menos un test de humo o regresión.

### 5.2 Documentación

- **Docs dispersos:** Varios `.md` en raíz (CRITERIOS, AUDITORIA_FINAL, ANALISIS_*, CONECTAR_MONGODB, RENDER_DEPLOY, etc.). Útil pero fragmentado.
- **CRITERIOS_Y_LOGICA_DE_BUSQUEDA.md:** Desactualizado respecto a detección temprana, RECOMENDACION, cotización, devoluciones, FALLBACK y contacto en else.
- **Para 95%:**  
  - Actualizar CRITERIOS con los flujos reales (tipos de consulta, prioridades, detección temprana, RECOMENDACION vs PRODUCTOS).  
  - Un único documento de arquitectura (o sección en README) que resuma: stack (Node, Express, MongoDB, WooCommerce, OpenAI), rutas principales, dónde está la lógica del chat (conversation.service + Conkavo) y qué rutas de chat son las de producción.

### 5.3 Deuda técnica conocida (TODOs en código)

- `chat.routes.js`: comentarios sobre rate limit, timeout en processMessageWithAI, fire-and-forget de saveChatMessage, cache de historial. Son mejoras, no bugs; para 95% el más relevante es rate limit.

---

## 6. Pendientes de auditorías anteriores (ya implementados o cerrados)

De la auditoría “Acá falta X → Esto generará Y”:

- **1.1 RECOMENDACION sin término:** Implementado (5 productos por defecto).
- **1.2 RECOMENDACION + no logueado:** Implementado (mensaje de cuenta).
- **2.1 Términos genéricos:** Implementado (constante única).
- **2.3 Formato de precio:** Implementado (`formato.js`).
- **3.1 FALLBACK sin tipoFallback:** Implementado (siempre respuesta con contacto).
- **3.3 Contacto en else genérico:** Implementado (instrucción en `textoParaIA`).

Quedan como mejoras opcionales o de segundo orden:

- **2.2** Límites 5 vs 10: constante única + doc.
- **3.2** Mensaje “no encontré” cuando el tipo es RECOMENDACION (o no-búsqueda): texto específico en lugar del mensaje literal del usuario.
- **4.1 / 4.2** Actualizar CRITERIOS y documentar RECOMENDACION vs PRODUCTOS.
- **5.1** Fugas de tipos (RECLAMO, DERIVACION_HUMANO, DEVOLUCION) al else: opcional log cuando `queryType` caiga en else para detectar fugas.
- **1.3** Búsqueda por atributo: funcionalidad nueva; solo si el negocio la exige.

---

## 7. Plan sugerido para acercarse al 95%

### Prioridad alta (impacto directo en solidez y claridad)

1. **Rate limit en chat:** Añadir rate limit por `userId` o IP en `POST /api/chat/message` y `POST /api/chat/message/stream` (p. ej. express-rate-limit o similar).
2. **Actualizar CRITERIOS_Y_LOGICA_DE_BUSQUEDA.md:** Incluir detección temprana, RECOMENDACION (tope 5, mapeo, sin término, no logueado), cotización, devoluciones, FALLBACK con/sin tipo, contacto en else, y tabla RECOMENDACION vs PRODUCTOS.
3. **Documentar arquitectura:** Un solo lugar (README o `docs/ARQUITECTURA.md`) con stack, BD real (MongoDB), rutas de chat en uso y rol de cada servicio principal.

### Prioridad media (consistencia y mantenibilidad)

4. **Constante única para “máximo productos a mostrar”:** Definir `MAX_PRODUCTOS_MOSTRAR_USUARIO = 5` y usarla donde se limita la lista al usuario; dejar comentado por qué en algunos sitios se piden 10 a WooCommerce (buffer para enriquecimiento/desambiguación).
5. **Mensaje “no encontré” para RECOMENDACION:** Si en algún flujo se sigue mostrando “No se encontraron productos que coincidan con [mensaje]” en casos de recomendación, usar un texto específico (ej. “No pude armar recomendaciones con la información que diste. ¿Me dices algo más (regalo, oficina, etc.)?”).
6. **Reutilizar middleware de validación:** Donde las rutas repiten validación (p. ej. userId, message), usar `validateUserId` y validadores existentes para no duplicar lógica.

### Prioridad baja (proyección y pulido)

7. **Health de dependencias:** Incluir en `/api/health` (o en un `/api/health/deps`) estado de MongoDB (y opcionalmente WooCommerce) sin bloquear arranque.
8. **Limpieza de dependencias y mensajes:** Quitar `pg` de `package.json` si no se usa; ajustar mensajes de arranque que hablen de “MongoDB” para que no mencionen PostgreSQL si no aplica.
9. **Tests de regresión adicionales:** Al menos un test que verifique que FALLBACK sin tipo devuelve mensaje con contacto, y que RECOMENDACION sin término devuelve lista (o que no devuelve “no encontré productos” con el mensaje literal).

---

## 8. Conclusión

El sistema está bien estructurado, con buen manejo de errores, timeouts y reintentos en servicios externos, y con mejoras recientes que unifican criterios (precio, términos genéricos, FALLBACK, contacto). La mayor concentración de complejidad está en `conversation.service.js`, lo cual es aceptable si se documenta y se protege con tests de regresión.

Para situar el sistema en torno al **95%** a nivel de código, lógica, solidez y proyección:

- **Imprescindible:** Rate limit en chat, actualización de CRITERIOS y documentación de arquitectura.
- **Muy recomendable:** Constante única 5/10, mensaje “no encontré” para RECOMENDACION, uso consistente del middleware de validación.
- **Recomendable:** Health de dependencias, limpieza de dependencias/mensajes, 1–2 tests de regresión más para flujos críticos.

Con esto se cierra la mayoría de las brechas identificadas y se deja el código más mantenible y preparado para evolución sin grandes refactors.
