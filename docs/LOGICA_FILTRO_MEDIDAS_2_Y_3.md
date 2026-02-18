# Lógica: filtro por medidas (2 y 3 valores) y cuándo aplicarlo

Objetivo: que el filtro por medidas **solo se active cuando el usuario está preguntando por medidas**, y soportar tanto "17 x 7 x 2,8" (3 valores) como "17 x 7" (2 valores) de forma coherente.

---

## 1. Cuándo considerar que “alguien pregunta por medidas”

Hay que distinguir:

- **Consulta por medidas:** "tienen estuche 17 x 7 x 2,8 cm?", "algo de 20 x 30 cm", "medidas 17 x 7".
- **No medidas:** "SKU 17x20", "código 601055402", "producto 17" (número de modelo/catálogo).

Criterios para activar el filtro (todos deben ser razonables):

### 1.1 Presencia de un patrón de dimensiones

- **3 números con dos “x”:** `A x B x C` → muy fuerte indicio de medidas (largo × ancho × alto).
- **2 números con una “x”:** `A x B` → puede ser medidas (ej. base 17×7) o código (ej. "17x20"). Hace falta refuerzo.

### 1.2 Refuerzo para considerar que es “pregunta por medidas”

Activar el filtro solo si, además del patrón, se cumple **al menos una** de:

1. **Palabras clave de medidas:** "medidas", "medida", "dimensiones", "dimensión", "cms", "cm.", "mm", "metros", "tamaño", "ancho", "alto", "largo", "centímetros", "milímetros".
2. **Patrón de 3 números:** `A x B x C` (con o sin decimales). Los códigos de producto suelen ser 2 números o uno largo, no tres medidas.
3. **Patrón de 2 números que “parecen medidas”:**
   - Al menos un decimal (ej. 17 x 7,5) → típico de medidas.
   - O números en rango razonable para cm (ej. 0.5–300) o mm (1–3000), y que **no** parezcan SKU: evitar si hay un número de 6+ dígitos en el mensaje (ej. 601055402) o si el mensaje contiene "SKU"/"código"/"código de producto" cerca del patrón.

Con esto se evita que "SKU 17x20" o "producto 601055402" activen el filtro, y que sí lo hagan "estuche 17 x 7 x 2,8", "medidas 17 x 7" o "20 x 30 cm".

### 1.3 Casos que no deben activar el filtro

- Mensaje solo con palabras clave sin números (ej. "qué medidas tienen") → no hay qué extraer; no aplicar filtro.
- Patrón tipo "17x20" sin palabras clave y sin tercer número → ambiguo; sin más contexto, no activar (o exigir palabra clave).
- Mensaje con "SKU 17x7" o "código 17 x 7" → no considerar medidas.

Propuesta de implementación del “gate”:

- Función `isMeasureQuery(message)` que devuelve true solo si:
  - Hay un patrón de 2 o 3 números con “x” (regex), **y**
  - Se cumple al menos uno de: (a) existe palabra clave de medidas en el mensaje, (b) el patrón tiene 3 números, (c) el patrón tiene 2 números y pasa el “parecen medidas” (decimal o rango + no SKU).

Usar **solo** `isMeasureQuery(message)` para decidir si aplicamos el filtro por medidas (y si extraemos dimensiones para filtrar). Así el filtro solo aparece cuando alguien pregunta por medidas.

---

## 2. Extracción: 2 vs 3 valores

- **Patrón con 3 números:** `A x B x C` → extraer los tres, ordenar, devolver `[min, mid, max]` en cm (igual que ahora). Si hay "mm", convertir a cm.
- **Patrón con 2 números:** `A x B` → extraer los dos, ordenar, devolver `[min, max]`. Unificar con el caso de 3 en la firma: por ejemplo una función que devuelva `{ type: '3', values: [a,b,c] }` o `{ type: '2', values: [a,b] }`, o bien `extractDimensionsFromMessage` que devuelva `number[]` de longitud 2 o 3 (y el comparador actúa según la longitud).

---

## 3. Comparación producto vs usuario

- **Producto:** siempre tiene 3 dimensiones en Woo (length, width, height). Las parseamos y ordenamos: `[p1, p2, p3]` con p1 ≤ p2 ≤ p3.

- **Usuario con 3 valores:** ya está: comparar tripletas ordenadas con tolerancia (user[i] ≈ product[i]).

- **Usuario con 2 valores:** el usuario está pidiendo “algo que tenga estas dos medidas” (ej. base 17×7, sin importar el alto). Criterio coherente:
  - Los dos números del usuario (ordenados) deben coincidir con **dos de las tres** dimensiones del producto (ordenadas), con tolerancia.
  - Es decir: existe un par (i, j), i ≠ j, tal que user[0] ≈ product[i] y user[1] ≈ product[j].
  - Con tripleta producto ordenada [p1, p2, p3]: comprobar las tres combinaciones (user[0],user[1]) vs (p1,p2), (p1,p3), (p2,p3). Si alguna cumple la tolerancia en ambos ejes, hay match.

Así "17 x 7" puede coincidir con un producto 17×7×2,8 (tripleta 2.8, 7, 17) porque 7 y 17 están en el producto.

---

## 4. Resumen de la lógica

| Paso | Acción |
|------|--------|
| 1 | Gate único: `isMeasureQuery(message)` → true solo si hay patrón 2 o 3 números + (palabra clave O 3 números O 2 números “parecen medidas” y no SKU). |
| 2 | Si no es medida, no extraer y no filtrar. |
| 3 | Si es medida: `extractDimensionsFromMessage(message)` → array de 2 o 3 números (ordenados, en cm). |
| 4 | Filtrar candidatos: producto queda si tiene `dimensions` y `dimensionsMatch(userValues, productTriple)` (soporta 2 o 3 valores de usuario). |
| 5 | Resto del flujo igual: un resultado → afirmar; cero → no afirmar; varios → listar. |

Con esto el filtro solo aparece cuando alguien pregunta por medidas y se aplica de forma coherente tanto para 2 como para 3 medidas.
