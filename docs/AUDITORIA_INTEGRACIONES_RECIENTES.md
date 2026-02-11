# Auditoría profunda: integraciones recientes y coherencia de código

**Rol:** Developer fullstack (empresa tecnológica avanzada).  
**Alcance:** Quejas/reclamos, devoluciones, derivación a humano, recomendaciones, auth/token, regex, clasificación de consultas y posibles contradicciones o bloqueos entre cambios recientes.  
**Fecha de referencia:** Tras implementación de restricción por login, auth WordPress, y políticas de no “contactaremos”/“dejar datos”.

---

## 1. Resumen ejecutivo

| Área | Estado | Riesgo |
|------|--------|--------|
| Quejas (RECLAMO) | ✅ Coherente | Bajo |
| Devoluciones (DEVOLUCION) | ✅ Coherente | Bajo |
| Derivación a humano (DERIVACION_HUMANO) | ✅ Coherente (1 inconsistencia en texto de prompt del clasificador) | Bajo |
| Recomendaciones (formato lista) | ✅ Cubierto | Bajo |
| Auth / token / isLoggedIn | ✅ Coherente | Bajo |
| Regex (detección temprana y sensibles) | ✅ Sin contradicciones; 1 posible ampliación | Bajo |
| Clasificación de consultas (queryType) | ✅ Cubierta; DEVOLUCION solo por regex | Bajo |
| TODOs/FIXMEs abiertos | 2 en chat.routes | Medio (técnico) |

**Conclusión:** No hay incongruencias que bloqueen o contrapongan cambios. El código está en condiciones de cubrir las consultas pensadas para su funcionamiento. Se detectan 2 mejoras de texto/documentación y 2 mejoras técnicas recomendadas.

---

## 2. Quejas (RECLAMO)

### 2.1 Flujo

- **Detección:** Regex temprana `isReclamoRequest(msg)` (conversation.service.js) **o** clasificador OpenAI tipo `RECLAMO`.
- **Orden:** Primero se evalúa DEVOLUCION, luego DERIVACION_HUMANO, luego RECLAMO. Si el mensaje encaja en varios, gana el primero (ej. “quiero devolver” gana sobre “tengo un reclamo” si ambos pudieran coincidir en el mismo mensaje).
- **Respuesta:** Bloque `queryType === 'RECLAMO'` arma `textoParaIA` con:
  - Reconocer malestar y agradecer.
  - Indicar que puede escribir a **ventas@imblasco.cl**.
  - **PROHIBIDO:** “un ejecutivo se hará cargo”, “te contactaremos”, “dejar datos para que los llamemos”.

### 2.2 Coherencia

- **company-info:** `contacto.email` y `contacto.telefono` coinciden con lo que se pide usar en derivaciones (ventas@imblasco.cl, teléfonos).
- **conversation.service:** El prompt de RECLAMO no pide datos ni contactaremos; solo correo para que el equipo revise.
- **conkavo-ai (system):** Dice “Reclamos: empatía + derivar a ventas”. No especifica “no contactaremos”; la **fuente de verdad** es el prompt construido en conversation.service, que sí lleva PROHIBIDO. Comportamiento final correcto.

### 2.3 Cobertura

- Regex: queja, quejas, tengo una queja, reclamo, quiero reclamar, me quejo de, problema con (mi|el) pedido.
- OpenAI: ejemplos en el prompt de análisis (tipo RECLAMO) alineados con esas intenciones.
- **Conclusión:** Las consultas de queja/reclamo están cubiertas y alineadas con la política de no “contactaremos” ni “dejar datos”.

---

## 3. Devoluciones (DEVOLUCION)

### 3.1 Flujo

- **Detección:** Solo por regex temprana `isDevolucionRequest(msg)`. **No** está en `tiposValidos` del clasificador OpenAI; es intencional para evitar que la IA lo clasifique mal y se priorice la detección explícita.
- **Respuesta:** Bloque `queryType === 'DEVOLUCION'` con:
  - Política de garantía y derecho a retracto desde `company-info.service.js`.
  - **PROHIBIDO:** “un ejecutivo se pondrá en contacto”, “dejar datos”, “te llamaremos”.

### 3.2 Coherencia

- `company-info`: `garantia`, `derechoRetracto` usados en el prompt; datos únicos.
- No se pide contacto ni datos; solo se informa política.
- **Conclusión:** Sin contradicciones; comportamiento correcto para devoluciones.

---

## 4. Derivación a humano (DERIVACION_HUMANO)

### 4.1 Flujo

- **Detección:** Regex `isHumanoRequest(msg)` **o** OpenAI tipo `DERIVACION_HUMANO`.
- **Respuesta:** Dar **correo y teléfonos** (ventas@imblasco.cl y números); PROHIBIDO “un ejecutivo lo contactará” y “dejar datos para que los llamemos”.

### 4.2 Inconsistencia de texto (solo documentación del clasificador)

- **conkavo-ai.service.js**, regla 8 del prompt de **análisis** de intención: dice “Responde que un ejecutivo lo contactará”.
- Política real: **no** decir que contactaremos.
- **Impacto:** El clasificador solo devuelve el tipo `DERIVACION_HUMANO`; la respuesta final la arma conversation.service con el PROHIBIDO correcto. Por tanto **no hay error de comportamiento**, pero el texto del prompt del clasificador contradice la política.
- **Recomendación:** Cambiar en conkavo-ai ese enunciado a algo como: “El cliente pide hablar con una persona; el backend dará correo/teléfono (no prometer contacto proactivo).”

### 4.3 Coherencia de datos

- conversation.service inyecta `companyInfoService.formatCompanyInfoForAgent()` en el prompt de DERIVACION_HUMANO; contacto único (ventas@imblasco.cl y teléfonos).
- **Conclusión:** Comportamiento correcto; única mejora es alinear el texto de la regla 8 del analizador con la política.

---

## 5. Recomendaciones (RECOMENDACION) y formato lista

### 5.1 Flujo

- Tipo `RECOMENDACION` (OpenAI) → misma búsqueda que PRODUCTOS (por término), luego lista de productos con formato “chat-friendly”.
- En el prompt para la IA se exige: por cada producto, nombre (y SKU), 📦 Stock, 💰 Precio, línea en blanco entre productos, cierre tipo “Dime cuál te interesa (por número, SKU o nombre)”.

### 5.2 Coherencia

- Formato jerárquico/amigable implementado en el bloque `queryType === 'PRODUCTOS' || queryType === 'RECOMENDACION'` (listas con numeración, stock, precio, validaciones).
- **Conclusión:** Cubre el tipo de consulta deseado y el formato lista solicitado.

---

## 6. Auth / token / isLoggedIn

### 6.1 Flujo

- **Middleware** `resolveChatAuth`: obtiene token (header Bearer, body.token, query.token) y userId; llama a `wordpress-auth.service.validateTokenForChat({ token, userId })`; asigna `req.chatAuth = { isLoggedIn, wpUser }`. En error, trata como no logueado (no bloquea la petición).
- **Rutas de chat** (`/message`, `/message/stream`): pasan `authOptions = { isLoggedIn: req.chatAuth?.isLoggedIn }` a `processMessageWithAI`.
- **conversation.service:** `resolveIsLoggedIn(options)`: si `options.isLoggedIn` es boolean se usa; si no, `CHAT_AUTH_AS_LOGGED_IN` (default efectivo: todos logueados para pruebas).

### 6.2 Restricción de información sensible

- **No logueado** y tipo sensible (PRODUCTOS, RECOMENDACION, VARIANTE): no se ejecuta búsqueda de productos (solo cuando `(PRODUCTOS || RECOMENDACION) && isLoggedIn`). Para VARIANTE no se entra al bloque de búsqueda; luego en la construcción de `textoParaIA` la rama `!isLoggedIn && queryTypeSensible` asigna el mensaje “necesitas cuenta” + paso1 solicitud de cuenta. No se filtra información sensible por VARIANTE en respuestas.
- **INFORMACION_GENERAL** y no logueado: si `isPreguntaCotizacionOComoComprar(message)` → se usa prompt que no da correo de cotización ni pasos con precios; solo “necesitas cuenta” + paso1.
- **Conclusión:** No hay contradicción entre middleware, rutas y conversation.service; la restricción por login está aplicada de forma coherente.

---

## 7. Regex: uso y posibles conflictos

### 7.1 Detección temprana (conversation.service.js)

- **DEVOLUCION:** `isDevolucionRequest` — devolver, devolución, etc.
- **DERIVACION_HUMANO:** `isHumanoRequest` — hablar con persona/ejecutivo, atención humana, que me llame ejecutivo, etc.
- **RECLAMO:** `isReclamoRequest` — queja, reclamo, reclamar, me quejo de, problema con pedido.

Orden de evaluación: DEVOLUCION → DERIVACION_HUMANO → RECLAMO. No hay solapamiento que invalide la política (el primero que matchea gana).

### 7.2 Info sensible (no logueado)

- **isPreguntaCotizacionOComoComprar:** cotización, cotizar, precio(s), comprar, pedido, cómo comprar, realizar/hacer pedido. Incluir “precio” hace que preguntas genéricas de tipo “información sobre precios” clasificadas como INFORMACION_GENERAL reciban “necesitas cuenta” en lugar de datos de precios; es coherente con la restricción.

### 7.3 Otros usos de regex

- SKU/ID explícito, saludos, hora de almuerzo, genéricos, patrones de variaciones, etc. No se detectan contradicciones entre ellos; los comentarios en código (puerta dura, reclasificación) están alineados con el flujo.
- **Conclusión:** Uso de regex consistente; no se identifican bloqueos ni contrapuntos entre detecciones. Opcional: ampliar `isReclamoRequest`/`isDevolucionRequest` si aparecen nuevas frases en producción (sin cambiar orden ni lógica actual).

---

## 8. Clasificación de consultas (queryType)

### 8.1 Tipos y fuentes

- **Solo regex temprana:** DEVOLUCION (OpenAI no devuelve DEVOLUCION).
- **Regex o OpenAI:** DERIVACION_HUMANO, RECLAMO.
- **OpenAI (y posible reclasificación):** PRODUCTO → PRODUCTOS, INFORMACION_GENERAL, AMBIGUA, VARIANTE, CARACTERISTICAS, FALLBACK, RECOMENDACION.

En conversation.service, `tiposValidos` incluye RECLAMO y DERIVACION_HUMANO; en conkavo-ai.service, `tiposValidos` del analizador no incluye DEVOLUCION por diseño (evitar confusión con devolución).

### 8.2 Mapeo y ramas de texto

- PRODUCTO → PRODUCTOS; el resto 1:1. Todas las ramas de construcción de `textoParaIA` (DERIVACION_HUMANO, RECLAMO, DEVOLUCION, INFORMACION_GENERAL, VARIANTE, CARACTERISTICAS, PRODUCTOS/RECOMENDACION, else genérico) están presentes y el cierre del `if/else` es correcto (no hay `queryType === 'PRODUCTOS' || 'RECOMENDACION'` como condición; la condición real es `queryType === 'PRODUCTOS' || queryType === 'RECOMENDACION'`).
- **Conclusión:** La clasificación cubre los tipos de consulta deseados y no hay ramas faltantes ni condiciones incorrectas.

---

## 9. Posibles brechas menores (no bloqueantes)

### 9.1 FALLBACK (reserva, descuento, futuro)

- Respuesta fija tipo “Para esa consulta debes contactar a un ejecutivo” (y variantes por tipoFallback).
- No se incluye correo/teléfono en ese mensaje. Si se quisiera homogeneizar con DERIVACION_HUMANO/RECLAMO, se podría añadir ventas@imblasco.cl y teléfonos en el texto de FALLBACK. Es decisión de producto; no es incongruencia de código.

### 9.2 System prompt de Conkavo (respuesta final)

- “Reclamos: empatía + derivar a ventas” y “DERIVACION_HUMANO: responde que un ejecutivo lo contactará” no reflejan la política “no contactaremos”. La respuesta real la construye conversation.service con PROHIBIDO, por lo que el comportamiento es correcto. Recomendable actualizar esos párrafos del system para alineación documental y futuros cambios.

---

## 10. TODOs / FIXMEs y recomendaciones técnicas

- **chat.routes.js**
  - `// TODO: añadir rate limit por userId en POST /message`
  - `// FIXME: revisar timeout en processMessageWithAI para respuestas lentas`
- Recomendación: mantener en backlog; rate limit y timeout son mejoras de robustez, no corrigen contradicciones de lógica.

---

## 11. Verificación de cobertura de consultas deseadas

| Tipo de consulta | Detección | Respuesta | ¿Cubre caso deseado? |
|------------------|-----------|-----------|----------------------|
| Queja/reclamo | Regex + OpenAI RECLAMO | Correo ventas, PROHIBIDO contactaremos/dejar datos | ✅ |
| Devolución | Regex DEVOLUCION | Garantía y retracto, PROHIBIDO contactaremos/dejar datos | ✅ |
| Hablar con humano | Regex + OpenAI DERIVACION_HUMANO | Correo y teléfonos, PROHIBIDO contactaremos/dejar datos | ✅ |
| Productos / recomendaciones | OpenAI + búsqueda | Lista con stock/precio o “necesitas cuenta” si no logueado | ✅ |
| Cotización / cómo comprar (no logueado) | INFORMACION_GENERAL + isPreguntaCotizacionOComoComprar | “Necesitas cuenta” + paso1, sin correo cotización | ✅ |
| Información general (horarios, dirección, etc.) | OpenAI INFORMACION_GENERAL | companyInfo; si es cotización y no logueado → restringido | ✅ |
| Variantes (logueado/no logueado) | VARIANTE | Con stock/precio o “necesitas cuenta” | ✅ |

---

## 12. Conclusión final

- **Incongruencias:** Ninguna que invalide o bloquee los flujos implementados.
- **Contrapuntos:** Solo de redacción en prompts del clasificador y en el system de Conkavo; no en la lógica ni en los datos usados para las respuestas.
- **Cobertura:** Los tipos de consulta pensados para el sistema (quejas, devoluciones, derivación a humano, recomendaciones, productos, información general, cotización restringida, variantes y auth) están cubiertos y el código es capaz de comportarse como se diseñó.
- **Acciones recomendadas (opcionales):**
  1. Ajustar en conkavo-ai la regla 8 (DERIVACION_HUMANO) y el párrafo de “Reclamos” del system para que no digan “contactaremos” ni “un ejecutivo lo contactará”.
  2. Valorar incluir correo/teléfono en las respuestas de FALLBACK para homogeneizar con el resto de derivaciones.
  3. Mantener en backlog: rate limit por userId y revisión de timeout en processMessageWithAI.
