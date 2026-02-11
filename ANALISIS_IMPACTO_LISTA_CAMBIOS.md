# Análisis de impacto: lista de cambios (criterio y alcance de búsqueda)

**Objetivo:** Ningún cambio debe empeorar el criterio ni el alcance de búsqueda del chat.

- **Criterio de búsqueda:** qué mensajes disparan búsqueda, qué término se usa, clasificación (PRODUCTOS / AMBIGUA / INFORMACION_GENERAL, etc.).
- **Alcance de búsqueda:** qué resultados se obtienen, límites, filtros, qué se muestra al usuario.

**Verificación:** Contrastado con el código (enero 2026). **Revalidar líneas antes de implementar** (pueden variar con commits). Archivos: `conversation.service.js`, `wordpress.service.js`, `conkavo-ai.service.js`, `company-info.service.js`.

---

## Resumen por tipo de impacto

| Impacto en búsqueda | Ítems | Conclusión |
|---------------------|-------|------------|
| **No afecta criterio ni alcance** (solo presentación, estado interno o código muerto) | 1, 8, 11, 12, 13, 16, 17, 18, 22, 23, 24, 25, 26, 27, 28 | Seguros: no empeoran búsqueda. |
| **Reduce búsquedas incorrectas** (menos falsos positivos) | 2, 3, 4, 5, 6, 7 | Mejora el criterio. Condición: no añadir stopWords que sean nombres/SKU reales. |
| **Afecta el alcance o la comparación** (implementación precisa obligatoria) | 9, 15, 10, 14, 19, 21 | Ver detalle y riesgos críticos abajo. |

---

## 1. Precio en lista sin `parseFloat` (Alta)

- **Ubicación (revalidar):** `conversation.service.js` **línea 3556** — único sitio donde se usa `p.price.toLocaleString` sin `parseFloat`. En 702 y 3641 ya se usa `parseFloat(p.price)`.
- **Qué cambia:** En la línea de la lista, usar `parseFloat(p.price)` antes de `toLocaleString`.
- **Criterio:** No afecta (no cambia qué se busca ni cuándo).
- **Alcance:** No afecta (mismos productos; solo formateo del precio).
- **Riesgo:** Ninguno. Solo evita error si `price` viene como string.

---

## 2–7. Consulta transferencia/cuenta y AMBIGUA → PRODUCTOS (Alta/Media)

- **Ubicación (revalidar):** Clasificación: `conkavo-ai.service.js` ~302 `analizarIntencionConsulta`, ~17 SYSTEM_INSTRUCTIONS. Promoción AMBIGUA→PRODUCTOS: `conversation.service.js` **1689-1702** (terminoAmb, termValidoParaBuscar, queryType = 'PRODUCTOS'). StopWords y extractProductTerm: **309-319** (stopWords), **1691** (terminosGenericosAmb2). Añadir filtro cuenta/transferencia antes de 1699 o en stopWords 311.
- **Qué cambia:**  
  - Clasificación: "a qué cuenta les transfiero" → INFORMACION_GENERAL.  
  - Filtros: no promover AMBIGUA a PRODUCTOS cuando el mensaje es de cuenta/transferencia/depósito.  
  - `extractProductTerm`: filtrar "cuenta", "transferir", "depósito", etc. (stopWords o lógica equivalente).
- **Criterio:** **Mejora.** Hoy mensajes de transferencia pueden disparar búsqueda (AMBIGUA → PRODUCTOS con término "cuenta"); después no dispararán búsqueda de productos.
- **Alcance:** No se reduce búsqueda legítima: nadie busca un producto llamado "cuenta" o "transferir". Solo se evitan búsquedas erróneas.
- **Riesgo:** Ninguno para el criterio ni el alcance. Condición: no añadir a stopWords palabras que puedan ser nombre de producto real (ej. un SKU o modelo que contenga "cuenta" en otro sentido).

---

## 8. Variaciones mostradas por SKU en lugar de por atributo (Alta)

- **Ubicación (revalidar):** `conversation.service.js` **3456-3465** — construcción de `variationsList` (map con `v.name`, `v.sku`). Incluir atributo principal desde `v.attributes` (ej. color/talla).
- **Qué cambia:** En listas de variaciones, mostrar "Color: Rojo (SKU: …)" en lugar de solo nombre/SKU.
- **Criterio:** No afecta (no cambia qué producto o variante se busca).
- **Alcance:** No afecta (mismos productos/variantes; solo cómo se muestran).
- **Riesgo:** Ninguno.

---

## 9 y 15. `context.productSearchResults` no se limpia (Media)

- **Ubicación (revalidar):** Se asigna en **2049, 2154, 2245, 2339, 2344, 2437, 2447, 2526, 2561**. Solo se limpia en **1898, 1918** (flujos ELIGE_UNO / repetición). No se limpia al entrar al flujo PRODUCTOS. `context` es por request (se crea en **1295**); el riesgo es reutilizar valor de otra rama en el mismo request. Punto seguro para limpiar: justo después de **1458** cuando `queryType === 'PRODUCTOS'`, antes de cualquier asignación a `context.productSearchResults`.
- **Qué cambia:** Limpiar `context.productSearchResults` cuando se inicia búsqueda PRODUCTOS (ej. al inicio del bloque PRODUCTOS).
- **Criterio:** No afecta (no cambia el término ni cuándo se busca).
- **Alcance:** **Mejora.** Evita que se reutilicen resultados de una búsqueda anterior en una nueva; la lista mostrada corresponde a la búsqueda actual. Sin el fix, el alcance puede ser "incorrecto" (resultados viejos).
- **Riesgo:** Bajo. Solo hay que limpiar en los mismos puntos donde se fija `queryType` o se inicia flujo PRODUCTOS, sin borrar resultados antes de usarlos en la respuesta actual.

---

## 10. Variaciones WooCommerce: `attr.option` vs `attr.value` (Media)

- **Ubicación (revalidar):** `conversation.service.js` **2826** (`attrValue = (attr.option || '')`), **2898-2899** (`attr.option`). `assistant.service.js` **191-192** (`attr.option`). Añadir fallback `(attr.option || attr.value)` en conversation en 2826 y 2898.
- **Qué cambia:** En variaciones, usar `(attr.option || attr.value)` donde se lee el valor del atributo.
- **Criterio:** No afecta (no cambia qué producto se busca).
- **Alcance:** **Puede ampliar.** Si hoy WooCommerce devuelve `value` y no `option`, hoy no matcheamos esa variante; con el fallback sí. Mismos productos padre; más variantes reconocidas. **No introduce nuevas variantes inexistentes; solo evita perder variantes válidas por discrepancia de payload.**
- **Riesgo:** Ninguno para el criterio ni el alcance. No se restringe nada, solo se acepta otro formato.

---

## 11. Parsing de stock en wordpress.service (Media)

- **Ubicación (revalidar):** `wordpress.service.js` **127, 173, 177, 238, 242, 272, 276, 338, 342, 388, 392, 462, 466** — uso de `parseInt(product.stock_quantity)` o `parseInt(variation.stock_quantity)`. `parseStockQuantity` en conversation.service.js (buscar definición) usa Number + Math.floor; alinear o reutilizar.
- **Qué cambia:** Usar la misma lógica que `parseStockQuantity` (o llamarla) en lugar de solo `parseInt` para cantidades de stock.
- **Criterio:** No afecta.
- **Alcance:** No afecta qué productos/variantes se devuelven; puede cambiar el número mostrado (más coherente con el resto del sistema).
- **Riesgo:** Bajo. Alinear criterio de "cantidad" evita discrepancias; no reduce resultados.

---

## 12. Datos bancarios (Media) — Ya implementado

- Sin impacto en búsqueda.

---

## 13. Lista de términos genéricos duplicada (Media)

- **Ubicación (revalidar):** `conversation.service.js` **545** (`terminosGenericos`), **1691** (`terminosGenericosAmb2`), **1732**, **2266** — misma lista repetida. Unificar en una constante al inicio del módulo o en un objeto compartido.
- **Qué cambia:** Una sola constante/array para términos genéricos y reutilizarla en todos los sitios.
- **Criterio:** No afecta (la lista efectiva es la misma; mismos términos considerados genéricos).
- **Alcance:** No afecta.
- **Riesgo:** Ninguno siempre que no se añada ni quite ningún término al unificar.

---

## 14. `session.lastSearchTerm` normalización inconsistente (Media)

- **Ubicación (revalidar):** Se guarda en **2569** con `normalizeCode(...)`. Se compara en **1909** con `currentSearchTermNorm` (1879-1880). Verificar misma fuente y que plural/singular no rompa la igualdad.
- **Qué cambia:** Asegurar que el término con el que se compara `lastSearchTerm` (ej. "¿es la misma búsqueda?") esté normalizado igual que cuando se guardó (misma función `normalizeCode`).
- **Criterio:** **Puede afectar.** "Misma búsqueda" decide si se reutiliza lista anterior o se hace búsqueda nueva. Si hoy a veces no se normaliza igual, corregir hace el comportamiento más predecible.
- **Alcance:** Con normalización consistente: mismas búsquedas se tratan como iguales; distintas como distintas. No se pierden búsquedas legítimas si la normalización es la estándar (ej. `normalizeCode`). El efecto es de mejora (comportamiento más consistente), no de restricción.
- **Riesgo:** Bajo si en ambos lados se usa la misma función de normalización. Revisar que no se normalice de más (ej. eliminar parte de un SKU o nombre).

---

## 16. `context.needsConfirmation` no se resetea (Baja)

- **Ubicación (revalidar):** Se asigna `true` en **2527**. Se usa en **3536, 3621**. No hay asignación explícita a `false`; el context se recrea por request (1295), pero si en algún flujo se reutiliza context, podría quedar pegado.
- **Qué cambia:** Poner `needsConfirmation = false` al inicio del procesamiento o cuando la respuesta ya no requiere confirmación.
- **Criterio:** No afecta qué se busca; puede afectar flujo (cuándo se pide confirmación).
- **Alcance:** No reduce resultados; solo evita estados "pegados" que pidan confirmación cuando no toca.
- **Riesgo:** Bajo.

---

## 17. Singular/plural en stock (Baja)

- Solo texto mostrado. Sin impacto en criterio ni alcance.

---

## 18. `formatProductsList` legacy (Baja)

- **Ubicación (revalidar):** `conversation.service.js` **691** `formatProductsList`. No usada en los bloques "PRODUCTOS ENCONTRADOS" (estos usan getStockTextForListProduct + enrichStock). Documentar en JSDoc que no debe usarse para resultados de búsqueda.
- Documentación y uso; no cambia lógica de búsqueda. Sin impacto.

---

## 19. Matching de atributos en variantes ("50 cms" vs "50cm") (Baja)

- **Ubicación (revalidar):** `conversation.service.js` **2784-2785** (valorNormalizado = trim toLowerCase), **2796** (optValue === valorNormalizado), **2829** (attrValue === valorNormalizado). Comparación es estricta; normalizar espacios/unidades (ej. "50 cms" → "50cm") antes de comparar.
- **Qué cambia:** Normalizar valor de atributo (espacios, unidades) antes de comparar.
- **Criterio:** No afecta qué producto padre se busca.
- **Alcance:** Puede hacer que matchee una variante que hoy no matchea por diferencia de formato. Es ampliación de lo que consideramos "misma variante".
- **Riesgo:** Bajo si la normalización es conservadora (ej. quitar espacios, unificar "cms"/"cm"). Evitar normalizar tanto que "50 cms" y "50 pulgadas" se confundan.

---

## 20. (No usado en lista; ver 19/21)

---

## 21. `stripLeadingGreeting` no captura todas las variantes (Baja)

- **Ubicación (revalidar):** `conversation.service.js` **295-301** (regex actual). Se usa solo para **displayQuery** en **3533 y 3636**, no para el término de búsqueda (este viene de terminoProductoParaBuscar o extractProductTerm). Ampliar solo saludos; no tocar nombre/SKU.
- **Qué cambia:** Ampliar el regex (o la lógica) para quitar más saludos al inicio antes de mostrar "búsqueda relacionada con X".
- **Criterio:** **Puede afectar el texto mostrado.** El impacto es exclusivamente en el texto derivado del mensaje original (`displayQuery`), no en `terminoProductoParaBuscar` ni en el término usado para buscar (que viene de `extractProductTerm` o `context.terminoProductoParaBuscar`).
- **Alcance:** Mejora la calidad del texto mostrado al usuario; no reduce resultados si solo se eliminan saludos y no parte del nombre/SKU.
- **Riesgo:** Bajo si solo se añaden variantes de saludo (ej. "buen día", "good morning") y no se recorta nada que sea nombre de producto o SKU.

---

## 22. `context.varianteNoEncontrada` no se usa (Lógica incompleta)

- **Ubicación (revalidar):** `conversation.service.js` **2806, 2846, 2943** — se asigna; no se lee en ningún sitio. Eliminar asignaciones o usar (ej. en textoParaIA cuando varianteValidada === false) para mensaje más preciso.
- **Qué cambia:** Dejar de asignar el objeto o usarlo en el mensaje al usuario.
- **Criterio:** No afecta (código muerto o solo mejora de mensaje).
- **Alcance:** No afecta (código muerto o solo mejora de mensaje).
- **Riesgo:** Ninguno.

---

## 23. `productStockData.is_variation` vs `parent_id` (Lógica incompleta)

- **Ubicación (revalidar):** `conversation.service.js` **3409** `const isVariation = productStockData.is_variation`. Uso en **3412, 3446, 3439**. wordpress.service no devuelve `is_variation` en getProductById. Cambiar a `const isVariation = (productStockData.parent_id != null)`.
- **Qué cambia:** Derivar "es variación" de `parent_id != null` en lugar de `is_variation`.
- **Criterio:** No afecta (no cambia qué se busca).
- **Alcance:** No afecta qué productos/variantes se devuelven; solo cálculo de stock y si se muestra "producto padre" en el detalle. Comportamiento debe ser el mismo o más estable.
- **Riesgo:** Ninguno.

---

## 24. `productStockData.parent_product` no siempre asignado (Lógica incompleta)

- **Ubicación (revalidar):** `conversation.service.js` **3439-3440** (parentInfo). wordpress.service solo asigna parent_product al retornar variación por SKU (~532). En otros flujos (2835-2838, 3373-3381) no se asigna; en 3381 se reemplaza productStockData por el padre, por lo que parentInfo suele quedar vacío. Opción: no usar parentInfo si no existe o asignar parent cuando hay parent_id.
- **Qué cambia:** Asignar `parent_product` cuando hay `parent_id` o no usar `parentInfo` si no está.
- **Criterio:** No afecta. Solo presentación (línea "Producto padre: …").
- **Alcance:** No afecta. Solo presentación.
- **Riesgo:** Ninguno.

---

## 25. `variationsList` por atributo (Lógica incompleta)

- **Ubicación (revalidar):** `conversation.service.js` **3456-3462** — map con `v.name` y `v.sku`. Añadir lectura de `v.attributes` (attr.option o attr.value) para etiqueta tipo "Color: X" / "Talla: Y".
- **Qué cambia:** Mostrar en la lista "Color: X" o "Talla: Y" además de nombre/SKU.
- **Criterio:** No afecta. Solo presentación.
- **Alcance:** No afecta. Solo presentación.
- **Riesgo:** Ninguno.

---

## 26, 27, 28. `stockNumberForPrompt`, `searchMethod`/`confidenceLevel`, `variantePidioListar` (Lógica incompleta)

- **Ubicación (revalidar):** stockNumberForPrompt **3472-3474**, usado en **3512**. searchMethod/confidenceLevel **3477-3478**, usados en **3491-3492**. variantePidioListar: asignado en **2594, 2929, 2936, 2949, 2966**; usado solo en **3229**. Documentar o refactorizar sin cambiar flujo.
- **Qué cambia:** Uso en prompts, documentación o limpieza de variables poco usadas.
- **Criterio:** No afecta (no decide qué se busca).
- **Alcance:** No afecta (no decide qué se devuelve).
- **Riesgo:** Ninguno.

---

## Riesgos críticos (por punto, antes de implementar)

Riesgos que pueden hacer que un cambio empeore el criterio, el alcance o la estabilidad. Revisar cada ítem antes de tocar código.

| # | Riesgo crítico | Mitigación |
|---|----------------|------------|
| **1** | Si se aplica `parseFloat` en un sitio que ya recibe número, no rompe; si `price` es `null`/`undefined`, `parseFloat` da NaN y toLocaleString puede fallar. | Comprobar: `p.price != null ? parseFloat(p.price).toLocaleString('es-CL') : 'N/A'` (o equivalente). Solo cambiar **línea 3556**; no tocar 702 ni 3641. |
| **2-7** | Añadir "cuenta", "transferir", "depósito" a stopWords o al filtro pre-PRODUCTOS puede hacer que un producto/SKU que contenga esa palabra deje de buscarse. | No añadir palabras que puedan ser parte de nombre de producto o SKU real. Filtro por intención (frase completa "a qué cuenta transfiero") es más seguro que solo stopWord "cuenta". Revalidar prompt de `analizarIntencionConsulta` para que devuelva INFORMACION_GENERAL en esas frases. |
| **8** | Si se extrae atributo de `v.attributes` y WooCommerce devuelve estructura distinta (option vs value, o array vacío), la línea puede quedar vacía o dar error. | Usar `(attr.option \|\| attr.value)` y comprobar que `v.attributes` exista y sea array. No asumir siempre "color" o "talla"; usar el primer atributo con valor. |
| **9, 15** | Limpiar `context.productSearchResults` **después** de que ya se haya asignado en el mismo request hace que `finalSearchResults` quede vacío y se muestre "no encontrados" incorrectamente. | Limpiar **solo** al inicio del flujo PRODUCTOS (ej. justo después de 1458 cuando `queryType === 'PRODUCTOS'`), nunca entre asignación y uso (2544, 3531, 3618). |
| **10** | Si en algún WooCommerce `value` tiene significado distinto a `option` (ej. ID vs etiqueta), usar `option \|\| value` podría mostrar o matchear el valor equivocado. | En la práctica WooCommerce suele enviar uno u otro; el fallback solo amplía. Si hubiera conflicto, priorizar `option` (actual). Revalidar en staging. |
| **11** | Sustituir `parseInt` por `parseStockQuantity` en wordpress.service puede cambiar valores si `parseStockQuantity` trunca o redondea distinto (ej. NaN → 0). | Revisar implementación de `parseStockQuantity` en conversation.service; si usa Math.floor o 0 para no numéricos, alinear. No cambiar lógica de umbral (instock/outofstock). |
| **12** | Ya implementado. | N/A. |
| **13** | Al unificar arrays, si se usa una referencia y alguien hace `.push()` o modifica el array, afecta a todos los usos. | Usar constante de solo lectura (Object.freeze o no mutar). Verificar que las 3 listas (545, 1691, 1732, 2266) queden con exactamente los mismos términos. |
| **14** | Si se "mejora" normalización y se normaliza de más (ej. quitar números o unificar plural), "libretas N34" y "libreta N34" podrían considerarse distintas o iguales de forma no deseada. | No cambiar `normalizeCode`; solo asegurar que el término que se guarda (2569) y el que se compara (1909) pasen por la misma función. Revisar que `currentSearchTermRaw` en 1879 sea la misma lógica que lo guardado. |
| **16** | Resetear `needsConfirmation = false` demasiado pronto puede hacer que no se pida confirmación cuando sí se debe (ej. cantidades altas). | Poner `false` al inicio del procesamiento del mensaje (junto con context en 1295) o en ramas donde no se requiera confirmación; no en 2527 ni antes de evaluar la respuesta. |
| **17** | Cambiar singular/plural en mensajes de stock puede desalinear con otras cadenas (ej. "1 unidades"). | Revisar todos los sitios que usan "unidad/unidades" (getStockTextForListProduct, variationsList, etc.) y unificar criterio (qty === 1 vs qty !== 1). |
| **18** | Si alguien usa `formatProductsList` para resultados de búsqueda en el futuro, podría mostrar stock incorrecto (sin enriquecimiento). | Solo documentar en JSDoc; no cambiar firma ni comportamiento. Añadir comentario: "No usar para listas de PRODUCTOS ENCONTRADOS; usar getStockTextForListProduct + enrichStockForListProducts." |
| **19** | Normalizar "50 cms" y "50cm" a lo mismo está bien; normalizar "50" a "50cm" o mezclar "50 cms" con "50 pulgadas" sería error grave. | Normalización conservadora: quitar espacios, unificar "cms"/"cm"; no inventar unidades ni concatenar. Comparar solo después de normalizar ambos lados. |
| **21** | Si el regex de `stripLeadingGreeting` elimina parte de un nombre de producto (ej. "Hola" dentro de "Hola kit"), el displayQuery mostraría texto equivocado; el término de búsqueda no se ve afectado porque viene de terminoProductoParaBuscar o extractProductTerm. | Solo añadir variantes de saludo al inicio (buen día, good morning). No tocar el cuerpo del mensaje. Probar con mensajes que contengan "hola" en medio. |
| **22** | Eliminar las asignaciones a `varianteNoEncontrada` sin más puede dejar variables undefined en código que las espere en el futuro. Si se usa en textoParaIA, no olvidar todos los ramales donde se asigna (2806, 2846, 2943). | Si se elimina: buscar referencias a `varianteNoEncontrada` y quitarlas. Si se usa: construir el mensaje en el bloque donde `varianteValidada === false` (3225+) usando atributo/valor/razon. |
| **23** | En teoría un producto podría tener `parent_id` por otro motivo que no sea "es variación" (legado WooCommerce). En la práctica no suele pasar. | Cambio seguro: `isVariation = (productStockData.parent_id != null)`. Si hubiera productos con parent_id y no variación, se tratarían como variación (stock por variaciones); revisar en catálogo real. |
| **24** | Asignar `parent_product` implica llamar a getProductById(parentId) si no se tiene; puede ser una llamada extra por request. | Solo asignar cuando ya se tenga el padre en memoria (ej. al reemplazar productStockData por el padre en 3381, guardar el viejo como parent_product antes de reemplazar). Evitar llamadas adicionales innecesarias. |
| **25** | Igual que 8: estructura de `v.attributes` puede variar. Mostrar "Color: X" asumiendo que el primer atributo es color puede ser falso en productos con solo "Talla". | Usar el nombre real del atributo (attr.name) y su valor (option o value); no hardcodear "Color" ni "Talla". |
| **26** | Eliminar `stockNumberForPrompt` y usar solo `stockInfo` en el prompt puede hacer que la IA no tenga el número explícito para "¿cuántas unidades?". | Mantener la instrucción con el número; no eliminar la variable sin revisar el prompt en 3512. |
| **27** | Si se usan `searchMethod`/`confidenceLevel` para lógica (ej. pedir confirmación cuando MEDIA), puede cambiar flujo y molestar al usuario. | Si no se implementa lógica nueva, dejar como están (solo informativos). Si se implementa, definir bien los umbrales. |
| **28** | Eliminar o refactorizar `variantePidioListar` sin actualizar el único uso (3229) puede hacer que siempre se tome un ramal (pidioListar true o false) incorrecto. | Si se elimina, sustituir en 3229 por otra condición (ej. `!analisisOpenAI?.valorAtributo`). Si se mantiene, no tocar las asignaciones sin revisar 3229. |

---

## Conclusión general

- **No empeoran el criterio ni el alcance (efecto neutro o positivo):** 1, 2–7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24, 25, 26, 27, 28, siempre que:
  - En 2–7 no se añadan a stopWords palabras que sean nombres/SKUs reales.
  - En 14 se use la misma normalización al guardar y al comparar.
  - En 19 la normalización de atributos sea conservadora.
  - En 21 solo se amplíen saludos y no se recorte nombre/SKU.

- **Los únicos que tocan el criterio o el alcance** son 2–7 (menos búsquedas erróneas), 9/15 (alcance más correcto), 10 (posible ampliación de variantes), 14 (comportamiento más consistente) y 21 (mejor texto mostrado). En todos los casos, bien implementados, el efecto es neutro o positivo respecto al criterio y alcance de búsqueda del chat.
