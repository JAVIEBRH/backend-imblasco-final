# Análisis: búsqueda por medidas (WooCommerce, STOCKF, nuestro sistema)

Objetivo: definir la mejor forma de implementar filtrado por dimensiones para consultas del tipo “estuche 17×7×2,8 cm”, sin romper el resto del flujo, sin tocar otros filtros y sin ralentizar el sistema.

---

## 1. Orden de dimensiones: WooCommerce y nuestro sistema

### WooCommerce (y lo que usamos hoy)

- La API de WooCommerce expone dimensiones como: **`length`, `width`, `height`** (en ese orden).
- En nuestro código (`wordpress.service.js`), `parseDimensions(product.dimensions)` devuelve:
  ```js
  { length, width, height }
  ```
- Ese mismo objeto se guarda en cada producto de la estructura de catálogo y en los resultados de `searchProductsInWordPress`.
- **Conclusión:** el orden “oficial” con el que nos llega la info es **length → width → height**. Debemos usar exactamente ese orden cuando leemos del producto (Woo o lo que venga de STOCKF si algún día tiene estructura similar).

### Usuario escribe en cualquier orden

- El usuario puede decir "17 x 7 x 2,8" o "2,8 x 17 x 7" o "7 cm x 17 x 2.8".
- Si comparáramos en un orden fijo (ej. length=17, width=7, height=2.8), un mismo producto podría no coincidir según cómo lo escriba el usuario.
- **Solución:** no imponer orden al usuario. Para comparar:
  - Del **mensaje:** extraer los tres números → ordenar → `[a, b, c]` (ej. [2.8, 7, 17]).
  - Del **producto:** leer `length`, `width`, `height` (en ese orden, como vienen de Woo) → parsear a números → ordenar → `[a', b', c']`.
  - Comparar los dos conjuntos ordenados con una tolerancia (ej. ±0,3 cm). Así el orden en Woo/STOCKF solo define “qué tres valores tiene el producto”; la comparación es orden-independiente para el usuario.

---

## 2. STOCKF: qué tiene y qué no

### Estructura actual

- STOCKF no expone dimensiones como tres campos (length/width/height).
- Tiene:
  - **`caracteristicas`:** objeto clave-valor (ej. "Tamaño": "54.5 mm x 33 mm", "Material": "Metal").
  - **`excerpt`:** texto libre donde pueden aparecer medidas.
- Uso actual en el sistema: solo **enriquecimiento** de un producto ya encontrado (por SKU o mysql_id). No se usa para buscar ni filtrar.

### Implicación para medidas

- Si en el futuro se quieren usar medidas desde STOCKF, habría que:
  - Parsear texto (ej. "54.5 mm x 33 mm" o "17 x 7 x 2,8 cm") a uno o tres números.
  - Normalizar unidades (mm → cm) y comparar conjuntos ordenados igual que con Woo.
- Para **no romper nada y no ralentizar**, la opción más segura es:
  - **Fase 1:** usar solo **WooCommerce** para el filtro por medidas (ya tenemos `dimensions` en cada producto).
  - **STOCKF:** dejarlo para una fase 2 solo si hace falta (ej. productos sin dimensiones en Woo pero con medidas en caracteristicas/excerpt), y entonces añadir parseo de texto + misma lógica de conjuntos ordenados.

---

## 3. Flujo actual de búsqueda (resumen)

- Entrada: mensaje, posible SKU/ID explícito, término de producto (OpenAI o extraído).
- Búsqueda por **nombre completo** (matchProduct con nombre/SKU) → FOUND / AMBIGUOUS / NOT_FOUND.
- Si NOT_FOUND: búsqueda **parcial** por palabras (término normalizado) sobre `allProducts`.
- Si no hay parciales: **fallback WP** (`searchProductsInWordPress(termToUse, 10)`).
- Luego: si `finalSearchResults.length === 1` y no es RECOMENDACION → **“Un solo resultado: afirmando producto”** (se fija ese producto como respuesta única).

En ningún paso se usa `product.dimensions` para filtrar ni rankear. Las dimensiones están en los objetos pero no intervienen en la decisión.

---

## 4. Dónde y cuándo aplicar el filtro por medidas

### Principios

1. **Solo cuando el mensaje indique medidas:** usar el mismo tipo de detección que ya existe (patrón `número x número` o `número x número x número`, y/o palabras como "medidas", "dimensiones", "cms", "mm"). Si no hay medidas en el mensaje, no ejecutar esta lógica.
2. **Sobre listas que ya tenemos:** no hacer nuevas llamadas a Woo ni STOCKF. Trabajar sobre:
   - `allProducts`, o
   - `partialMatches` / `productSearchResults` / `wpFallbackResults` según en qué punto insertemos el paso.
3. **No sustituir ningún filtro actual:** el filtro por medidas es un **paso adicional** que solo corre cuando detectamos “consulta con medidas”. No cambiar la lógica de matching por nombre, SKU, búsqueda parcial ni fallback WP.
4. **Un solo recorrido en memoria:** sobre la lista de candidatos, filtrar (o reordenar) por coincidencia de dimensiones. Coste O(n) con n = tamaño de esa lista (decenas o pocos cientos). Sin I/O extra.

### Punto de inserción recomendado

- **Después de tener una lista de candidatos y antes de “afirmar” un único producto.**
- Es decir:
  1. El flujo sigue igual hasta tener `productSearchResults` o `wpFallbackResults` (o la lista que se use para `finalSearchResults`).
  2. Si en el mensaje detectamos “consulta con medidas”:
     - Extraemos del mensaje tres números (medidas) y los normalizamos a la misma unidad (ej. cm).
     - Filtramos la lista de candidatos: nos quedamos solo con productos que tengan `dimensions` parseables y cuyo conjunto ordenado (length, width, height) coincida con el del usuario dentro de una tolerancia.
     - Reemplazamos (o asignamos) esa lista filtrada como resultado final (lista puede quedar 0, 1 o N).
  3. Si **no** detectamos medidas, no hacemos nada; el flujo es el de siempre.

- Además, **justo antes de “Un solo resultado: afirmando producto”**: si el mensaje contenía medidas y `finalSearchResults.length === 1`, opcionalmente podemos verificar que ese único producto coincida en dimensiones; si no coincide, no afirmar y tratar como lista de 1 o “no encontrado con esas medidas” (evita fijar el KIT Herramientas cuando el usuario pidió estuche 17×7×2,8).

Con esto se mejora mucho la respuesta cuando se consulta por medidas y se evita afirmar un producto que no cumple las medidas, sin tocar el resto de filtros ni añadir latencia relevante.

---

## 5. Orden y comparación: resumen

| Origen        | Orden que usamos al leer        | Uso en la comparación                          |
|---------------|----------------------------------|------------------------------------------------|
| WooCommerce   | `length`, `width`, `height`      | Leer los 3 valores → ordenar → comparar set    |
| Mensaje usuario | Cualquiera (17×7×2,8 o 2,8×17×7) | Extraer 3 números → ordenar → comparar set     |
| STOCKF (fase 2) | Texto (parsear a 3 números)     | Mismo criterio: conjunto ordenado + tolerancia |

Así se respeta que “el orden que utilicemos sea el mismo que está en Woo o STOCKF” para **leer** la información; y al mismo tiempo se tiene en cuenta que el usuario puede dar las medidas en otro orden, comparando conjuntos de tres valores (ordenados) en lugar de posiciones fijas.

---

## 6. Productos variables (Woo)

- En Woo, las dimensiones a veces están en el **producto variable (padre)** y a veces en cada **variación**.
- Nuestra estructura de catálogo y `searchProductsInWordPress` devuelven productos con `dimensions` en el nivel que Woo los traiga (a menudo el padre).
- Para no ralentizar ni complicar la primera versión:
  - Usar solo las `dimensions` del producto que ya tenemos en la lista (padre o simple). Si existen y son parseables, aplicamos el filtro; si no, ese producto no se considera “coincidente por medidas” (pero sigue pudiendo aparecer por nombre/SKU si no aplicamos filtro estricto en ese camino).
- Si más adelante se requiere filtrar por dimensiones de variación, sería una extensión (por ejemplo, enriquecer variaciones y filtrar después), con cuidado de no disparar muchas llamadas extra.

---

## 7. Riesgos evitados

- **No alterar otros filtros:** el filtro por medidas solo se ejecuta cuando hay patrón de medidas en el mensaje; el resto de búsquedas (nombre, SKU, parcial, fallback) no cambian.
- **No ralentizar en exceso:** una pasada O(n) sobre la lista ya cargada, sin nuevas peticiones a Woo ni a STOCKF.
- **No afirmar producto incorrecto:** si hay medidas en el mensaje y un solo resultado del fallback WP, comprobar coincidencia por dimensiones antes de “afirmar producto”; si no coincide, no fijar ese producto como respuesta única.

---

## 8. Resumen de la mejor forma de implementarlo

1. **Detección:** reutilizar/alinear con la detección de “medidas en el mensaje” (patrón número×número o número×número×número + opcional “medidas”/“cms”/etc.).
2. **Fuente de verdad en fase 1:** solo **WooCommerce** (`product.dimensions`: length, width, height en ese orden).
3. **Lectura:** siempre usar el orden Woo (length, width, height) para leer; para comparar, convertir a conjunto ordenado de tres números (usuario y producto) y aplicar tolerancia.
4. **Inserción:** después de tener la lista de candidatos (parciales o fallback WP) y antes de “Un solo resultado: afirmando producto”; si hay medidas, filtrar esa lista por coincidencia de dimensiones; opcionalmente, antes de afirmar el único resultado, verificar que cumpla medidas.
5. **STOCKF:** no usar en fase 1; fase 2 solo si se necesita, con parseo de texto y misma lógica de conjuntos ordenados.
6. **Variables:** usar dimensiones del producto que ya está en la lista (típicamente padre); variaciones solo si se añade soporte explícito más adelante.

Con esto se mejora mucho la búsqueda cuando se consulta por medidas, se respeta el orden de Woo/STOCKF y el orden en que el usuario escribe, y no se rompe ni se ralentiza el resto del sistema.
