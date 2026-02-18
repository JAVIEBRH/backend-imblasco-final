# Catastro PROOF: qué datos usa y qué está “bloqueado”

## Qué pasó con “¿tienes L88?”

El modelo respondió *“No tengo información sobre un producto L88…”* porque:

1. **consultar_productos** en PROOF busca solo en **ProductIndex** (MongoDB base **dataimblasco**, colección `productos`). Si esa colección está vacía o no tiene el código L88, devuelve `[]` y el modelo interpreta “no hay en catálogo”.
2. **file_search** (Vector Store con tus MDs) sí está disponible, pero el modelo puede no haberlo usado para esta pregunta (puede haber priorizado consultar_productos o haber respondido sin llamar herramientas).
3. **stockf** y **WooCommerce** no se usan en el flujo PROOF; por eso da la sensación de “información bloqueada”.

---

## Catastro: fuentes de datos en PROOF

| Fuente | ¿Usada en PROOF? | Dónde / Cómo |
|--------|-------------------|--------------|
| **Vector Store (MDs)** | ✅ Sí | Tool **file_search** con `VECTOR_STORE_ID`. OpenAI busca en los archivos que subiste. El modelo tiene que **decidir** llamar a esta tool (p. ej. para empresa, horarios, políticas). Para “¿tienes L88?” puede que no la use. |
| **ProductIndex (MongoDB)** | ✅ Sí | Tool **consultar_productos** → `ProductIndex.find()` en la base **dataimblasco**, colección **productos** (conexión por defecto `MONGO_URI`). Solo devuelve: woo_id, codigo, sku, nombre, tipo. **No** incluye stock, precios ni descripciones. Si la colección está vacía o no tiene L88, la búsqueda devuelve `[]`. |
| **stockf (MongoDB)** | ❌ No | En develop sí se usa (`MONGO_URI_STOCKF_READ`) para enriquecer con coming_soon, características, etc. En **PROOF** no hay ninguna tool ni código que consulte stockf. |
| **WooCommerce (API)** | ✅ Sí (import + chat) | **Import:** script `import-products` llena ProductIndex. **Chat:** la tool **obtener_detalle_producto** consulta WooCommerce en tiempo real (stock, precio, variaciones) cuando el usuario pide precio/stock/variantes de un producto. Requiere WC_URL, WC_KEY, WC_SECRET en .env. |

---

## ¿PROOF necesita la API de WooCommerce?

- **Para el catálogo (nombres, SKU, búsqueda):** hay que ejecutar **`npm run import-products`** con WooCommerce configurado en .env, así consultar_productos tiene datos.
- **Para stock, precio y variantes en tiempo real:** sí. La tool **obtener_detalle_producto** llama a WooCommerce cuando el usuario pregunta por precio, stock o variaciones. Si WooCommerce no está configurado, esa tool devuelve un mensaje de error y la IA lo comunica al usuario.

---

## Resumen

- **Vector Store:** configurado y usable; depende de que el modelo llame a **file_search**.
- **Catálogo en PROOF:** solo **ProductIndex** (dataimblasco). Si no está poblado o no tiene L88, “consultar_productos” devuelve vacío.
- **stockf y WooCommerce:** no están integrados en PROOF; por eso no ves esa información en las respuestas.

---

## Cómo hacer que funcione (pasos concretos)

### 1. Poblar el catálogo (ProductIndex)

El backend busca productos en la colección **productos** de la base **dataimblasco** (MONGO_URI). Si está vacía, consultar_productos siempre devuelve [].

**Haz esto una vez (o cuando actualices productos en WooCommerce):**

```bash
cd "ruta/al/backend"   # rama PROOF
npm run import-products
```

Ese script lee WooCommerce (WC_URL, WC_KEY, WC_SECRET del .env) y llena la colección productos con woo_id, codigo, sku, nombre, tipo. Así "L88", "K62", etc. existirán en el índice y consultar_productos los encontrará.

### 2. System prompt actualizado

En `config/system_prompt.txt` las instrucciones indican al modelo que: para preguntas de productos debe llamar **siempre** a consultar_productos; si devuelve vacío, usar **file_search** antes de decir "no tengo información"; para empresa/horarios/contacto usar file_search.

### 3. WooCommerce en tiempo real (conectado)

La tool **obtener_detalle_producto(woo_id | sku)** consulta WooCommerce y devuelve stock, precio y variaciones. La IA la usa cuando el usuario pide precio, stock o variantes. Requiere WC_URL, WC_KEY, WC_SECRET en .env.

### 4. Opcional (futuro)

Conectar stockf para características/coming_soon si se desea; WooCommerce ya está integrado para stock/precio/variantes.

Este documento sirve como catastro de qué está conectado y qué no en la rama PROOF.
