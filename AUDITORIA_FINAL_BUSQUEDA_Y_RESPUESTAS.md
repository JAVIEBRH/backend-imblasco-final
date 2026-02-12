# Auditoría final: gaps de búsqueda, inconsistencias, errores de respuesta y criterios

Objetivo: identificar **qué falta** y **qué efecto tiene** (Acá falta X → esto generará Y).

---

## 1. Gaps de búsqueda

### 1.1 RECOMENDACION sin término ("qué me recomiendan?", "recomiendame algo")

**Dónde:** `conversation.service.js`: bloque de búsqueda por nombre (aprox. 2481–2496). Solo se entra a la búsqueda si `productTerm && productTerm.length > 0`. En RECOMENDACION con `terminoProducto` null y `extractProductTerm("qué me recomiendan?")` vacío o genérico, **nunca se ejecuta** la rama RECOMENDACION (ni búsqueda por término).

**Acá falta:** Un flujo específico para RECOMENDACION cuando no hay término: por ejemplo mostrar 5 productos por defecto (sample, destacados o por categoría) en lugar de no buscar.

**Esto generará:** Respuesta tipo "No se encontraron productos que coincidan con 'qué me recomiendan?'", confusa para el usuario.

---

### 1.2 RECOMENDACION con usuario no logueado

**Dónde:** La búsqueda en WooCommerce solo se hace si `(queryType === 'PRODUCTOS' || queryType === 'RECOMENDACION') && isLoggedIn`. Si el usuario no está logueado, no se buscan productos y no se rellena `productSearchResults`.

**Acá falta:** Tratamiento explícito para RECOMENDACION + no logueado: o bien no buscar y responder algo tipo "Para recomendaciones personalizadas necesitas tener cuenta / iniciar sesión", o documentar que es intencional (recomendaciones solo para logueados).

**Esto generará:** El flujo cae en "no se encontró información del producto" y se muestra "No se encontraron productos que coincidan con [mensaje]", en lugar de un mensaje de cuenta/acceso.

---

### 1.3 Búsqueda por valor de atributo (ej. "copa de 50 CM", "algo en tamaño 50")

**Dónde:** No existe en el código. VARIANTE asume siempre un producto concreto en contexto; no hay rama "buscar en catálogo productos que tengan atributo X = valor Y".

**Acá falta:** Diseño e implementación de la búsqueda por atributo (intención + filtro por variaciones).

**Esto generará:** Consultas como "necesito una copa de 50 CM" seguirán respondiendo con "indica nombre o SKU" o con un producto previo en contexto que no cumple el atributo.

---

## 2. Inconsistencias y desunificación de criterios

### 2.1 Lista de "términos genéricos" duplicada

**Dónde:** La misma lista aparece en varios sitios de `conversation.service.js`:
- aprox. 670, 1788, 1901, 1943, 2488: `['producto', 'productos', 'articulo', ...]`
- `GENERIC_PHRASES_RAW` / `GENERIC_PHRASES_SET` (aprox. 72–79) es otro concepto (frases completas), pero el criterio "palabra genérica" está repetido.

**Acá falta:** Una única constante (por ejemplo `TERMINOS_GENERICOS_PRODUCTO`) y usarla en todos los puntos.

**Esto generará:** Si se añade o quita un término genérico, hay que tocar 5+ sitios; si se olvida uno, comportamiento distinto según la rama (p. ej. AMBIGUA vs PRODUCTOS).

---

### 2.2 Límites de lista: 5 vs 10

**Dónde:**
- `MAX_PRODUCTS_TO_ENRICH_STOCK = 5` (aprox. 752): usado para enriquecer stock y para el tope de productos mostrados en listas.
- Varios `slice(0, 10)` en búsquedas (aprox. 2270, 2466, 2721, 2849): listas intermedias guardan hasta 10; luego el mensaje al usuario usa `sliceForList = finalSearchResults.slice(0, MAX_PRODUCTS_TO_ENRICH_STOCK)` (5).
- RECOMENDACION: `recomendacionList = partialMatches.slice(0, 5)` (explícito 5).

**Acá falta:** Criterio unificado y documentado: por qué en unos sitios 10 y en otros 5; o definir una constante única para "máximo productos a mostrar al usuario" y usarla en listas y en RECOMENDACION.

**Esto generará:** Cambios futuros pueden dejar listas de 10 en pantalla en alguna rama o duplicar lógica de tope.

---

### 2.3 Formato de precio en listas

**Dónde:** En la mayoría de listas se usa `Number(p.price).toLocaleString('es-CL')` o `p.price != null ? ... Number(p.price)...`. En aprox. 3970 (bloque "no referencia explícita" con resultados): `p.price ? parseFloat(p.price)...` (sin comprobar null de forma unificada).

**Acá falta:** Misma convención en todos los bloques: por ejemplo siempre `p.price != null ? '$' + Number(p.price).toLocaleString('es-CL') : 'Precio no disponible'`.

**Esto generará:** Si WooCommerce devuelve `price` como string en algún camino, riesgo de ver "NaN" o formato raro en un solo tipo de lista.

---

## 3. Errores de respuesta

### 3.1 FALLBACK sin tipoFallback

**Dónde:** aprox. 1732: `if (queryType === 'FALLBACK' && analisisOpenAI?.tipoFallback)`. Si OpenAI devuelve tipo FALLBACK pero `tipoFallback` es null o no es FUTURO/RESERVA/DESCUENTO, no se entra al switch y no se devuelve la respuesta con contacto.

**Acá falta:** Tratamiento de FALLBACK cuando `tipoFallback` falta: por ejemplo un `default` en el switch que ofrezca la misma línea de contacto ("Para esa consulta: [correo/teléfono]") o considerar FALLBACK sin tipo como "consulta genérica con contacto".

**Esto generará:** Usuario con consulta de tipo "no manejada" (reserva, descuento, etc.) clasificada como FALLBACK pero sin subtipo → no recibe el mensaje con contacto y cae en el else genérico sin ofrecer ventas@imblasco.cl / teléfonos.

---

### 3.2 Mensaje "no encontré productos" con el mensaje literal del usuario

**Dónde:** aprox. 4020–4022: "No se encontraron productos que coincidan con \"${message}\"". Si el usuario escribe "qué me recomiendan?" o "como cotizo?", ese texto se incrusta en la frase.

**Acá falta:** Para RECOMENDACION (o cuando el tipo es claramente no búsqueda por nombre), no usar el mensaje literal como "término buscado"; o tener un texto distinto tipo "No pude armar recomendaciones con la información que diste. ¿Me dices algo más (regalo, oficina, etc.)?".

**Esto generará:** Frases confusas como "No se encontraron productos que coincidan con 'qué me recomiendan?'" o "con 'como cotizo?'".

---

### 3.3 Respuesta genérica del else final sin contacto

**Dónde:** aprox. 4033–4039: cuando `queryType` no es INFORMACION_GENERAL, PRODUCTOS, VARIANTE ni FALLBACK (p. ej. AMBIGUA que no se resolvió, o valor inesperado), se usa un prompt genérico de 3–4 líneas **sin** incluir correo ni teléfonos.

**Acá falta:** Incluir en ese bloque una línea de contacto (ventas@imblasco.cl y teléfonos) para que, cuando no se capture intención, el usuario tenga a quién escribir o llamar.

**Esto generará:** Usuario con consulta rara o mal clasificada solo recibe una respuesta vaga y no sabe cómo contactar a la empresa.

---

## 4. Documentación y criterios

### 4.1 CRITERIOS_Y_LOGICA_DE_BUSQUEDA.md desactualizado

**Dónde:** El documento no refleja:
- Detección temprana RECOMENDACION (regex).
- Detección temprana cotización / cómo comprar → INFORMACION_GENERAL.
- Rama RECOMENDACION: sin matcher exacto, tope 5, mapeo empresarial/oficina → regalo/regalo oficina.
- Cotización: sección en company-info, prompt dedicado usuario logueado.
- Devoluciones: uso único de `getGarantiaDevolucionMensajeCliente()`.

**Acá falta:** Actualizar la sección de tipos de consulta, prioridades y flujos (detección temprana, RECOMENDACION, cotización, devoluciones).

**Esto generará:** Mantenimiento y onboarding con criterios equivocados o incompletos; pruebas que no cubren los flujos reales.

---

### 4.2 Criterio RECOMENDACION vs PRODUCTOS en el doc

**Dónde:** CRITERIOS describe búsqueda por nombre (match exacto, luego parcial); no explica que para RECOMENDACION no se usa match exacto y se aplica mapeo de contexto y tope 5.

**Acá falta:** Subsección o tabla que diferencie RECOMENDACION de PRODUCTOS (término, mapeo, tope, uso de categorías/tags si se añade).

**Esto generará:** Duda sobre si "recomiendame X" debe comportarse como búsqueda de producto o como recomendación; regresiones si alguien unifica mal las dos ramas.

---

## 5. Código mal aplicado o frágil

### 5.1 Condición del else final

**Dónde:** aprox. 4033: comentario dice "queryType no es INFORMACION_GENERAL, PRODUCTOS, VARIANTE ni FALLBACK". En la práctica también llegan aquí RECLAMO, DERIVACION_HUMANO y DEVOLUCION si por error no se devolvió antes; y FALLBACK cuando no hay tipoFallback (no se hace return en 1732).

**Acá falta:** O bien tratar FALLBACK sin tipoFallback antes (y dar contacto), o bien en el else comprobar si es FALLBACK y dar contacto; y opcionalmente loguear cuando queryType sea RECLAMO/DERIVACION_HUMANO/DEVOLUCION para detectar fugas.

**Esto generará:** FALLBACK sin tipoFallback y posibles fugas de otros tipos cayendo en respuesta genérica sin contacto.

---

### 5.2 RECOMENDACION y desambiguación (lastShownResults)

**Dónde:** aprox. 2816–2829: cuando hay varios resultados se llama a `desambiguarProductos` y se reordena la lista; luego `listToStore.slice(0, 10)`. Para RECOMENDACION la lista ya está limitada a 5 y no se quiere "desambiguar" como producto único.

**Estado:** Ya se evita promover un solo resultado a producto cuando `queryType === 'RECOMENDACION'` (aprox. 2808). La desambiguación se aplica a listas de 2+; para RECOMENDACION con 5 ítems se reordenaría por IA. No es un bug pero el mensaje de "dime cuál te interesa" ya es adecuado; valorar si desactivar desambiguación para RECOMENDACION para no reordenar sin necesidad.

**Esto generará:** Comportamiento actual correcto; solo posible mejora de consistencia (no reordenar recomendaciones).

---

## 6. Resumen: Acá falta X → Esto generará Y

| # | Acá falta | Esto generará |
|---|-----------|----------------|
| 1.1 | Flujo RECOMENDACION sin término (ej. 5 productos por defecto) | "No encontré productos con 'qué me recomiendan?'" |
| 1.2 | Tratamiento RECOMENDACION + no logueado | "No encontré productos" en vez de mensaje de cuenta |
| 1.3 | Búsqueda por atributo (catálogo) | No poder responder "copa 50 CM" sin producto concreto |
| 2.1 | Una sola constante de términos genéricos | Desalineación entre ramas al cambiar la lista |
| 2.2 | Criterio unificado 5 vs 10 (constante + doc) | Inconsistencia en cantidad de productos mostrados |
| 2.3 | Misma convención de precio en todas las listas | Posible NaN o formato raro en un bloque |
| 3.1 | FALLBACK sin tipoFallback con contacto por defecto | Usuario sin mensaje de contacto en fallbacks raros |
| 3.2 | Mensaje distinto cuando "no hay resultados" es RECOMENDACION | Frase confusa con el mensaje literal del usuario |
| 3.3 | Contacto en el else genérico | Usuario sin saber a quién contactar cuando no se entiende la intención |
| 4.1 | Actualizar CRITERIOS (detección temprana, RECOMENDACION, cotización, devoluciones) | Doc y pruebas desalineados con el código |
| 4.2 | Documentar diferencia RECOMENDACION vs PRODUCTOS | Regresiones o unificación incorrecta |
| 5.1 | Tratar FALLBACK sin tipoFallback (y/o log de fugas) | Respuesta genérica sin contacto en casos FALLBACK |

---

## 7. Orden sugerido de corrección

1. **Impacto alto y poco cambio:** 3.1 (FALLBACK sin tipoFallback), 3.3 (contacto en else genérico), 2.1 (constante términos genéricos).
2. **Impacto en experiencia:** 1.1 (RECOMENDACION sin término), 3.2 (mensaje "no encontré" para RECOMENDACION).
3. **Consistencia:** 2.2, 2.3.
4. **Documentación:** 4.1, 4.2.
5. **Funcionalidad nueva:** 1.2 (RECOMENDACION no logueado), 1.3 (búsqueda por atributo).
