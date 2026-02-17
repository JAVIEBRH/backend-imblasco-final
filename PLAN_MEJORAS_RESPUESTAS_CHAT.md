# Plan general: mejoras de respuestas del chat (revisión cuestionario)

Objetivo: que las mejoras sean **de carácter general** y subsanen **cualquier problema relacionado al espectro del fallo**, no solo los casos puntuales del test.

---

## 1. Espectro de fallos identificados

| Espectro | Ejemplos del test | Causa raíz |
|----------|-------------------|------------|
| **Contacto/empresa vs producto** | "Qué telefonos tienen?" → búsqueda de productos "teléfonos" | La palabra puede ser producto o dato de contacto; se prioriza búsqueda. |
| **Conversacional vs búsqueda** | "Gracias", "ok", "No entendí" → "No encontré productos..." | No hay capa que trate salidas sociales; todo cae en búsqueda o AMBIGUA. |
| **"Qué venden" genérico** | "¿Qué venden?" → "¿En qué puedo ayudarte?" | La puerta dura responde sin dar categorías. |
| **Servicios de la empresa** | "¿Hacen grabado?" → mensaje de reposición | Clasificado como FALLBACK/FUTURO en vez de información de empresa/servicios. |
| **Cotización / presupuesto** | "Necesito presupuesto" → mensaje de reposición | "Presupuesto" no se asocia a cotización; cae en FALLBACK o mensaje equivocado. |
| **Estado del pedido** | "¿Cuándo llega mi pedido?" → instrucciones de cotización | No existe intent "estado de pedido"; se responde con flujo de cotización. |
| **Template equivocado** | Varios → "No contamos con información de fechas de reposición" | FALLBACK sin tipo o tipo incorrecto usa un mensaje genérico que no corresponde. |
| **Contexto de precio** | "Cuánto cuesta" (sin producto) → responde con último producto en contexto | Uso de contexto cuando el usuario no ha elegido un producto concreto. |

---

## 2. Principios del plan

- **Pre-clasificación (puerta dura)** donde la intención sea inequívoca: contacto, conversacional, "qué venden".
- **Reforzar el clasificador (IA)** con ejemplos y reglas para contacto vs producto, servicios, presupuesto, estado de pedido.
- **Post-clasificación** para corregir errores típicos (ej. término "teléfono(s)" clasificado como PRODUCTO).
- **Mensajes por tipo** para que cada FALLBACK tenga texto coherente con la intención (no un solo mensaje genérico).
- **Una sola fuente de verdad** para categorías y datos de empresa (company-info / prompt), para evitar respuestas inventadas o desalineadas.

---

## 3. Fases del plan

### Fase 1: Capa de pre-clasificación (puerta dura)

**Ubicación:** `conversation.service.js`, al inicio del flujo (antes de OpenAI y WooCommerce).

1. **Intención de contacto / datos de la empresa**
   - Detectar mensajes que piden **teléfono(s), email, contacto, cómo los contacto, datos de la empresa** (palabras clave normalizadas).
   - Criterio: si el mensaje se interpreta claramente como "datos de contacto de Imblasco" (ej. "qué telefonos tienen", "número de contacto", "a qué mail escribo"), **no** enviar a búsqueda de productos.
   - Acción: tratar como `INFORMACION_GENERAL` y responder con `companyInfoService` (teléfonos, correo, etc.). Opción: misma rama que ya usa información de empresa, solo asegurar que estos mensajes entren ahí.

2. **Intención conversacional (social)**
   - Detectar mensajes **muy cortos** que son solo: agradecimiento, confirmación, o petición de aclaración.
   - Ejemplos: "gracias", "ok", "okay", "no entendí", "no entendi", "puedes repetir", "no capté".
   - Acción: respuesta fija amigable (ej. "De nada, ¿algo más?" / "Ok, ¿en qué más te ayudo?" / "Claro, dime de nuevo o pregúntame por un producto o SKU."). **No** llamar a búsqueda ni devolver "No encontré productos que coincidan con...".

3. **“Qué venden” / “qué productos tienen”**
   - Ya existe `GENERIC_PHRASES_SET` con "qué venden", etc.; hoy devuelve un texto genérico.
   - Mejora: para estas frases concretas, **no** usar solo "¿En qué puedo ayudarte?"; devolver una respuesta que **incluya categorías** (pesca y caza, trofeos, artículos publicitarios, grabado, etc.). Origen: lista fija en código o `company-info` si ahí están las categorías, para mantener una sola fuente de verdad.

**Resultado esperado:** Eliminar del espectro de fallos todos los casos de "teléfonos" como producto, "gracias/ok/no entendí" como búsqueda, y "qué venden" sin categorías.

---

### Fase 2: Clasificador de intención (OpenAI / Conkavo)

**Ubicación:** `conkavo-ai.service.js` (prompt de `analizarIntencionConsulta`).

1. **Contacto vs producto**
   - En la sección de INFORMACION_GENERAL, dejar explícito:
     - "Qué telefonos tienen?", "qué teléfonos tienen", "número de teléfono", "teléfono de contacto", "a qué número llamo" → **siempre INFORMACION_GENERAL**, nunca PRODUCTO.
   - Añadir ejemplo en el JSON de ejemplo:
     - `"Qué telefonos tienen?" → {"tipo":"INFORMACION_GENERAL", ...}`.

2. **Servicios de la empresa (grabado, materiales, etc.)**
   - Incluir en INFORMACION_GENERAL (o definir tipo SERVICIOS si se quiere separar después):
     - "¿Hacen grabado?", "¿trabajan acero inoxidable?", "¿hacen personalización?", "¿tienen taller de grabado?" → información de empresa/servicios, **no** FALLBACK ni búsqueda de producto por la palabra ("grabado", "acero").
   - Añadir 1–2 ejemplos en el prompt para que el modelo no devuelva FALLBACK/FUTURO para estos casos.

3. **Presupuesto / cotización**
   - Dejar claro: "presupuesto", "necesito presupuesto", "quiero presupuesto", "cotización" → **INFORMACION_GENERAL** (y en backend responder con flujo de cotización), **nunca** FALLBACK con tipoFallback FUTURO u otro.

4. **Estado del pedido / seguimiento**
   - Incluir en FALLBACK un nuevo **tipoFallback** (ej. `PEDIDO_ESTADO` o `SEGUIMIENTO_PEDIDO`):
     - "¿Cuándo llega mi pedido?", "estado de mi pedido", "dónde está mi pedido", "seguimiento del pedido" → FALLBACK con ese tipo.
   - En backend (Fase 4) definir un mensaje específico: no tenemos acceso al estado; contactar ventas/correo/teléfono.

5. **Conversacional**
   - Opcional en el clasificador: tipo `CONVERSACION` para "gracias", "ok", "no entendí" (si no se resuelven 100% en Fase 1). Si se implementa, el backend debe responder con frases cortas de cierre/repetición, sin búsqueda.

**Resultado esperado:** Menos confusiones contacto/producto, servicios/producto, presupuesto/reposición; estado del pedido con mensaje propio; opcionalmente conversacional bien etiquetado.

---

### Fase 3: Post-clasificación (validaciones en backend)

**Ubicación:** `conversation.service.js`, justo después de recibir el resultado de `analizarIntencionConsulta`.

1. **Producto con término “teléfono(s)”**
   - Si `tipo === 'PRODUCTO'` y el término extraído (o el mensaje normalizado) indica claramente **contacto** (ej. "telefono", "telefonos", "teléfono", "teléfonos", "contacto", "email"):
     - Reasignar a `INFORMACION_GENERAL` y seguir el flujo de información de empresa (con `companyInfoService`).

2. **FALLBACK sin tipo**
   - Si `tipo === 'FALLBACK'` y `tipoFallback` es null o no reconocido:
     - No usar el mensaje de "fechas de reposición" por defecto.
     - Usar un mensaje genérico neutro: "Para esa consulta te recomiendo contactar a ventas: [correo/teléfono]." (o el texto que se defina), de modo que no se pegue un template de reposición a preguntas como "¿Hacen grabado?" o "Necesito presupuesto".

**Resultado esperado:** Corregir deslices del modelo (teléfono→producto, FALLBACK sin tipo) sin tocar solo casos puntuales.

---

### Fase 4: Mensajes por tipo de FALLBACK y “qué venden”

**Ubicación:** `conversation.service.js` (y si aplica, constantes o `company-info`).

1. **FALLBACK según tipoFallback**
   - **FUTURO:** "No contamos con información de fechas de reposición. [Contacto]." (ya existe).
   - **RESERVA:** "Para reservas o compras puedes usar el sitio web o contactar a un ejecutivo. [Contacto]." (ya existe).
   - **DESCUENTO:** "Los precios son los publicados. Para condiciones comerciales: [Contacto]." (ya existe).
   - **Nuevo – PEDIDO_ESTADO / SEGUIMIENTO_PEDIDO:** "No tenemos acceso al estado de tu pedido desde aquí. Para consultar envíos o seguimiento escribe a [ventas/correo] o llama a [teléfonos]."
   - **Default (tipoFallback null o desconocido):** Mensaje genérico que **no** hable de reposición: "Para esa consulta te recomiendo escribir a [email] o llamar al [teléfono]."

2. **Respuesta “qué venden”**
   - Definir texto (o plantilla) que incluya:
     - Saludo breve.
     - Lista de categorías (pesca y caza deportiva, trofeos y premiación, artículos publicitarios, grabado personalizado, etc.).
     - Invitación a preguntar por producto o SKU.
   - Origen de categorías: lista fija en código o `company-info.service` si ya las expone, para una sola fuente de verdad.

**Resultado esperado:** Cada intención de FALLBACK tiene mensaje coherente; "qué venden" siempre ofrece categorías; no se mezclan mensajes de reposición con otras consultas.

---

### Fase 5: Contexto de “cuánto cuesta” / precio sin producto

**Ubicación:** `conversation.service.js` (y reglas en Conkavo si se usa contexto para PRODUCTO).

1. **Regla general**
   - Si el mensaje es **solo** "cuánto cuesta", "cuál es el precio", "qué precio tiene" **sin** nombre de producto ni SKU en el mensaje:
     - Si **no** hay un único producto claramente seleccionado en el contexto (ej. usuario acaba de elegir “el 3” de una lista), tratar como **AMBIGUA** con `necesitaMasInfo: true`: pedir nombre o SKU del producto.
   - Si **sí** hay producto en contexto y el usuario acaba de referirse a él (ej. eligió uno de una lista y luego dice "cuánto cuesta"), entonces sí usar contexto y responder con ese producto.

2. **Implementación**
   - En el prompt de análisis: reforzar que "cuánto cuesta" / "cuál es el precio" **sin** producto en el mensaje y **sin** referencia clara al último ítem mostrado → AMBIGUA, necesitaMasInfo.
   - En backend: si viene PRODUCTO con término genérico o sin término y el mensaje es solo precio/costo, no rellenar con el último producto de la sesión; devolver "Necesito el nombre o SKU del producto para darte precio."

**Resultado esperado:** Evitar respuestas de precio con un producto que el usuario no eligió (ej. "Cuánto cuesta" después de una lista → no asumir el primero o el último).

---

## 4. Orden sugerido de implementación

1. **Fase 1** – Pre-clasificación (contacto, conversacional, "qué venden"). Impacto alto, cambios acotados.
2. **Fase 4** – Mensajes FALLBACK (incl. PEDIDO_ESTADO y default neutro) y respuesta "qué venden" con categorías. Evita que otros fallos sigan mostrando texto equivocado.
3. **Fase 2** – Ajustes al clasificador (contacto, servicios, presupuesto, estado de pedido, ejemplos).
4. **Fase 3** – Post-clasificación (teléfono→INFORMACION_GENERAL, FALLBACK sin tipo).
5. **Fase 5** – Refino de uso de contexto para "cuánto cuesta" / precio.

---

## 5. Cómo comprobar que el espectro queda cubierto

- **Regresión:** Volver a ejecutar el script `revision-chat-cuestionario.js` (o las preguntas 28, 2.12, 2.13, 2.14, 2.23, 2.25, 2.26, 2.27, 2.11) y verificar que las respuestas sean las esperadas.
- **Casos nuevos:** Probar variantes:
  - "número de teléfono", "a qué mail escribo", "gracias", "ok", "no entendí", "qué venden", "hacen grabado", "necesito presupuesto", "cuándo llega mi pedido", "cuánto cuesta" (sin producto).
- **Documentar** en este plan o en `docs/` los criterios de "contacto vs producto" y "conversacional vs búsqueda" para futuros cambios.

---

## 6. Archivos principales a tocar

| Archivo | Fases |
|---------|--------|
| `src/services/conversation.service.js` | 1 (puerta dura), 3 (post-clasificación), 4 (mensajes FALLBACK y "qué venden"), 5 (contexto precio) |
| `src/services/conkavo-ai.service.js` | 2 (prompt de análisis, ejemplos, tipoFallback PEDIDO_ESTADO) |
| `src/services/company-info.service.js` | 4 (opcional: categorías como dato reutilizable para "qué venden") |

Este plan es general y por espectro: cualquier pregunta similar a las de la tabla (contacto, conversacional, qué venden, servicios, presupuesto, estado de pedido, FALLBACK mal tipado, precio sin producto) quedará cubierta por las mismas reglas o mensajes.
