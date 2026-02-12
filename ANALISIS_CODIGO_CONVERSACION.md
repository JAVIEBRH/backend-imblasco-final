# Análisis detallado de código – conversation.service.js

**Fecha:** 2026-02-04  
**Objetivo:** Errores, gaps de búsquedas, mensajes de variantes y coherencia de contexto.

---

## 1. Resumen ejecutivo

- **context.currentProduct** nunca se asigna (solo se inicializa en `null`); todas las lecturas equivalen a `session.currentProduct`.
- **VARIANTE** puede mostrar **slugs crudos** (ej. `21`, `a-plus`, `591095347`) en lugar de nombres para mostrar (ej. "21 cm", "A+").
- **Validación de atributo** en producto de contexto compara `attr.name === atributoSolicitado` sin normalizar; WooCommerce usa `pa_color` / `pa_talla`, por lo que "color" no coincide con "pa_color" y se limpia contexto incorrectamente.
- Al **forzar VARIANTE** desde PRODUCTOS no se setea `context.terminoProductoParaBuscar`; si la IA no devolvió término, se depende solo de `extractProductTerm(message)`.
- **extractProductTerm** no filtra palabras como "colores", "tallas", "tamaños"; en "qué colores tiene el BLAS 12" puede devolver "colores blas 12" en lugar de "BLAS 12".

---

## 2. Hallazgos detallados

### 2.1 context.currentProduct nunca se asigna

- **Dónde:** Inicialización en ~línea 573 (`currentProduct: null`) y múltiples lecturas `context.currentProduct || session.currentProduct`.
- **Problema:** En todo el flujo solo se asigna `session.currentProduct`; `context.currentProduct` no se actualiza. El fallback es redundante y puede generar confusión.
- **Recomendación:**  
  - Opción A: Asignar `context.currentProduct = product` cada vez que se asigne `session.currentProduct = product` para mantener coherencia.  
  - Opción B: Eliminar el uso de `context.currentProduct` y usar solo `session.currentProduct`.

### 2.2 VARIANTE: lista de valores con slugs en lugar de nombres para mostrar

- **Dónde:** Bloque VARIANTE que lista variantes disponibles (~3312–3393). Se usa `context.variantesDisponibles.valores` y `valoresStr = valores.join(', ')`.
- **Origen de valores:** En ~3085–3114 los valores vienen de `attr.option` (variaciones) o `attr.options` (producto padre), es decir, **slugs** de WooCommerce (ej. `21`, `a-plus`, IDs numéricos).
- **Problema:** El prompt indica "Usa SOLO: 21, a-plus, 591095347", por lo que la IA puede repetir slugs en la respuesta al usuario en lugar de "21 cm", "A+", etc.
- **En contraste:** En PRODUCTOS (~3623–3630) sí se usa `resolveAttributeOptionDisplayNames` y `getVariationDisplayLabel` para mostrar etiquetas legibles.
- **Recomendación:** En el bloque VARIANTE, antes de construir `valoresStr`, obtener el mapa de nombres (`resolveAttributeOptionDisplayNames(context.productVariations)`) y mapear cada slug a nombre para mostrar cuando exista; si no hay entrada en el mapa, usar el slug.

### 2.3 Validación de atributo en producto de contexto (pa_ vs nombre)

- **Dónde:** ~2860–2866. Se comprueba si el producto en contexto tiene el atributo solicitado con `attrName === atributoSolicitado`.
- **Problema:** En WooCommerce, `attr.name` suele ser el slug del atributo, p. ej. `pa_color`, `pa_talla`. `analisisOpenAI.atributo` es "color", "talla". Por tanto `"pa_color" === "color"` es false y se considera que el producto no tiene el atributo, se limpia contexto y se pide producto de nuevo.
- **Recomendación:** Normalizar ambos lados antes de comparar, p. ej. `attrName.replace(/^pa_/, '') === atributoSolicitado` o usar la misma lógica que en ~3086–3091 (`attrNameMatches`).

### 2.4 Forzar VARIANTE sin fijar terminoProductoParaBuscar

- **Dónde:** ~1694–1701. Cuando el mensaje pide colores/tallas/tamaños se hace `queryType = 'VARIANTE'`, `analisisOpenAI.tipo = 'VARIANTE'`, `analisisOpenAI.atributo = atributoForzado`, pero no se setea `context.terminoProductoParaBuscar`.
- **Problema:** Si la IA no devolvió `terminoProducto` (p. ej. solo interpretó "colores"), en VARIANTE se usa `analisisOpenAI.terminoProducto || extractProductTerm(message)`. Si `extractProductTerm` devuelve algo incorrecto (véase 2.5), la búsqueda puede fallar.
- **Recomendación:** Al reclasificar a VARIANTE, asignar  
  `context.terminoProductoParaBuscar = (analisisOpenAI.terminoProducto || extractProductTerm(message)).trim() || null`  
  para que el flujo VARIANTE y posibles usos posteriores de `context.terminoProductoParaBuscar` sean coherentes.

### 2.5 extractProductTerm: palabras de atributo no filtradas

- **Dónde:** ~419–483. Lista de `stopWords` y filtrado de palabras.
- **Problema:** "colores", "tallas", "tamaños" no están en `stopWords`. En un mensaje como "qué colores tiene el BLAS 12", tras quitar "qué", "tiene", "el", puede quedar "colores blas 12" y el término devuelto ser "colores blas 12", que no es un buen término de producto para búsqueda.
- **Recomendación:** Añadir a `stopWords` (o a una lista específica de palabras de atributo que se eliminen al extraer término de producto): "colores", "tallas", "tamaños", "color", "talla", "tamaño", "variaciones", "variación", "variantes", "variante". Así se favorece que el término extraído sea "BLAS 12".

### 2.6 productSearchResults vs context.productSearchResults

- **Revisado:** En todos los caminos donde se asigna `productSearchResults`, también se asigna `context.productSearchResults`, salvo en el branch de desambiguación (~2760–2761), donde solo se hace `context.productSearchResults = listToStore.slice(0, 10)` (la variable local no se actualiza). Más abajo (~3851) se usa `finalSearchResults = context.productSearchResults || productSearchResults || []`, por lo que se toma la lista correcta.
- **Conclusión:** No hay gap; el uso de ambas variables está cubierto.

### 2.7 Otros puntos revisados

- **getProductBySku:** Se llama con SKU raw y con `normalizeCode(sku)` en paralelo donde aplica; uso coherente.
- **Flujo VARIANTE cuando no hay producto:** Se retorna mensaje amigable pidiendo nombre/SKU (~2914–2925); correcto.
- **Mensaje "no disponible en valor":** Se evita con `variantePidioListar` y textos que no usan la palabra "valor" como variante; correcto.

---

## 3. Acciones recomendadas (prioridad)

| Prioridad | Acción |
|----------|--------|
| Alta | Corregir validación de atributo en contexto (pa_ vs nombre) (~2862–2865). |
| Alta | En VARIANTE, usar nombres para mostrar en la lista de valores (mapa de atributos) en lugar de solo slugs. |
| Media | Al forzar VARIANTE, setear `context.terminoProductoParaBuscar`. |
| Media | Añadir "colores", "tallas", "tamaños", etc. a stopWords (o filtro equivalente) en `extractProductTerm`. |
| Baja | Unificar uso de `context.currentProduct` (asignarlo con session o dejar solo session). |

---

## 4. Archivos afectados

- `src/services/conversation.service.js`: todos los cambios anteriores.
- Opcional: `src/services/wordpress.service.js` solo se usa `resolveAttributeOptionDisplayNames` (ya existe); no requiere cambios para este análisis.
