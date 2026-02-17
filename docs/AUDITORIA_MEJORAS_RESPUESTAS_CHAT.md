# Auditoría: mejoras de respuestas del chat (revisión cuestionario)

Fecha: tras implementación del plan en `PLAN_MEJORAS_RESPUESTAS_CHAT.md`.  
Objetivo: verificar que las mejoras están bien implementadas y **no rompen** búsquedas, criterios ni flujos existentes.

---

## 1. Resumen de verificación

| Fase | Implementado | Correcto | Riesgo roto | Mitigación aplicada |
|------|--------------|----------|-------------|---------------------|
| 1 Pre-clasificación | Sí | Sí | Bajo | Puertas solo con `!providedExplicitSku && !providedExplicitId` |
| 2 Clasificador Conkavo | Sí | Sí | Bajo | Ejemplos y validación PEDIDO_ESTADO |
| 3 Post-clasificación | Sí | Sí | Bajo | Solo reasignar cuando mensaje pide contacto |
| 4 Mensajes FALLBACK | Sí | Sí | Ninguno | Switch con default neutro |
| 5 Contexto "cuánto cuesta" | Sí | Sí (corregido) | Medio | Solo AMBIGUA si **no** hay producto en contexto |
| Cotización vs precio producto | Sí | Sí (corregido) | Medio | No cotización si "precio del X" o SKU en mensaje |

---

## 2. Garantías de no rotura

### 2.1 SKU/ID explícito siempre gana

- Toda la pre-clasificación (contacto, conversacional, genéricos) va bajo `if (!providedExplicitSku && !providedExplicitId)`.
- Si el mensaje contiene SKU/ID detectado por regex al inicio, **nunca** se entra en esas puertas: se mantiene `queryType = PRODUCTOS` y búsqueda directa por SKU/ID.
- **No se rompe:** "L39", "precio del L39", "el SKU 601050020", etc.

### 2.2 Contacto vs producto

- `isPreguntaContactoEmpresa` usa patrones que exigen **intención de contacto** (ej. "qué telefonos tienen", "número de contacto", "a qué mail escribo").
- No hace match en "tienen teléfonos inalámbricos?" (no es "qué teléfonos tienen") ni en "busco teléfono corporativo" como producto.
- **No se rompe:** búsqueda de productos cuyo nombre incluye "teléfono" cuando la frase no pide datos de contacto de la empresa.

### 2.3 Conversacional solo mensajes cortos y exactos

- `isConversacionalCierre` exige mensaje normalizado en un set reducido y `norm.length <= 25`.
- "No entendí el tema del envío" no coincide (más de 25 caracteres o no está en el set).
- **No se rompe:** preguntas largas o que contengan "no entendí" pero con más contexto.

### 2.4 Genéricos y "qué venden"

- La puerta de genéricos sigue siendo **coincidencia exacta** con `GENERIC_PHRASES_SET` (normalizado).
- Solo se cambia el **texto** de respuesta cuando además está en `QUE_VENDEN_PHRASES_SET`: se añaden categorías desde `companyInfoService.getCompanyInfo().rubros`.
- **No se rompe:** ninguna búsqueda; solo mensajes que ya se consideraban genéricos reciben otra redacción.

### 2.5 Cotización vs precio de un producto

- `isPreguntaCotizacionOComoComprar` ahora devuelve **false** cuando:
  - el mensaje pide precio de algo concreto: `precio (del|de la) X`, o
  - contiene algo tipo SKU/ID: `SKU: X`, `ID: 123`, o patrón tipo `L39`, `K62`.
- Así, "cuál es el precio del L39", "necesito el precio del producto K62" no se tratan como cotización y siguen por flujo producto/precio.
- **No se rompe:** consultas de precio por producto o SKU; "necesito presupuesto" / "necesito cotización" siguen yendo a cotización.

### 2.6 Fase 5: "cuánto cuesta" y contexto

- Solo se fuerza AMBIGUA (pedir producto/SKU) cuando:
  - el mensaje es solo precio (`isPreguntaSoloPrecio`),
  - no hay SKU/ID explícito en el mensaje, **y**
  - **no hay producto en contexto** (`!(session.currentProduct || context.currentProduct)`).
- Si el usuario acaba de elegir un producto (ej. "el 2") y luego dice "cuánto cuesta", hay producto en contexto y **no** se fuerza AMBIGUA; se usa el producto en contexto.
- **No se rompe:** flujo "elijo producto → pregunto precio"; solo se pide producto/SKU cuando no hay ninguno en contexto para no asumir uno equivocado.

### 2.7 Post-clasificación PRODUCTO → INFORMACION_GENERAL

- Solo se reasigna cuando `isPreguntaContactoEmpresa(message)` es true (mismo criterio que la pre-clasificación).
- No se reasigna por el mero hecho de que el término extraído sea "teléfono"; evita falsos positivos si la IA saca mal el término.

### 2.8 FALLBACK y mensajes

- FALLBACK con `tipoFallback` null o no reconocido usa mensaje neutro ("Para esa consulta te recomiendo contactar a un ejecutivo: [contacto]").
- No se usa el texto de reposición por defecto.
- `PEDIDO_ESTADO` tiene mensaje propio (no tenemos acceso al estado del pedido; contactar ventas/teléfono).

---

## 3. Orden del flujo (resumen)

1. Detección de SKU/ID explícito → si hay, `queryType = PRODUCTOS` y no se aplican puertas de pre-clasificación.
2. Gibberish → respuesta fija.
3. Pre-clasificación contacto (solo sin SKU/ID).
4. Pre-clasificación conversacional (solo sin SKU/ID).
5. Puerta genéricos / "qué venden" (solo sin SKU/ID).
6. Detección temprana por regex (devolución, recomendación, humano, reclamo, cotización).
7. Si no hay SKU/ID: OpenAI analiza; luego post-clasificación (contacto) y Fase 5 (solo precio sin contexto).
8. Resto del flujo (PRODUCTOS, VARIANTE, AMBIGUA, FALLBACK, INFORMACION_GENERAL, etc.) sin cambios en la lógica de búsqueda o criterios.

---

## 4. Correcciones aplicadas durante la auditoría

1. **Fase 5:** Se añadió la condición `!tieneProductoEnContexto` para no forzar AMBIGUA cuando ya hay producto en contexto (evitar romper "elegí producto → cuánto cuesta").
2. **Cotización:** Se añadieron guardas en `isPreguntaCotizacionOComoComprar` para no tratar como cotización cuando el mensaje pide "precio del X" o contiene SKU/ID, evitando desviar "precio del L39" al flujo de cotización.

---

## 5. Archivos tocados

- `src/services/conversation.service.js`: pre-clasificación, post-clasificación, Fase 5, FALLBACK, cotización, "qué venden".
- `src/services/conkavo-ai.service.js`: prompt y ejemplos (contacto, servicios, presupuesto, PEDIDO_ESTADO), validación de `tipoFallback`.

Ningún otro archivo modifica búsquedas, criterios de producto/recomendación/variante o flujos de pedido/carrito.
