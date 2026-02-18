# Nuevo enfoque OpenAI (Responses API + Vector Store + MDs) — Definición de lógica y riesgos

**Objetivo:** Definir la lógica del cambio que os piden (Responses API, MDs en Vector Store, system prompt en proyecto, tools file_search + consultar_productos + contar_productos) y aclarar **si y dónde** podría romperse lo que ya funciona. **No se incluye código;** solo criterios de diseño y decisiones.

---

## 1. Resumen de lo que os piden vs lo que tenéis hoy

### Lo que os piden (documento “Conexión backend → OpenAI” + transcripción)

| Elemento | Dónde vive | Uso |
|----------|------------|-----|
| **MDs** (información empresa: dirección, horarios, políticas, métodos de pago, etc.) | **En OpenAI:** subidos a un **Vector Store**. No en el repo. Se actualiza re-subiendo/actualizando archivos en ese Store. | El modelo los consulta con la herramienta **file_search** (vector_store_ids en .env). El backend no lee los MDs; solo pasa el ID del store. |
| **System prompt** (tono, reglas, cuándo usar cada herramienta, prohibiciones) | **En el proyecto** (ej. `config/system_prompt.txt` o similar). Lo que envía tu jefe: “orden de respuesta”, reglas 1–6, 3a, 4b, etc. | Se lee del disco y se envía como **instructions** en cada llamada a la API. |
| **API** | Responses API: `openai.responses.create({ model, instructions, input, tools })`. | Una o varias llamadas por turno: si el modelo pide herramientas, el backend ejecuta (consultar_productos / contar_productos), mete el resultado en el input y vuelve a llamar hasta que la respuesta sea solo texto. |
| **Tools** | Definidas en código en el servicio de chat. | **file_search** (Vector Store), **consultar_productos** (query, limit → MongoDB), **contar_productos** (→ MongoDB). |

Flujo por turno: usuario envía mensaje → backend arma `model` + `instructions` (system_prompt.txt) + `input` (historial + mensaje) + `tools` → llama a `responses.create()` → si la respuesta incluye llamadas a herramientas, el backend ejecuta las funciones (MongoDB), añade los resultados al input y repite `responses.create()` hasta que no haya más tool calls → texto final se postprocesa si aplica y se devuelve al front.

### Lo que tenéis hoy (según análisis previo)

- **Frontend en producción (B2BChat)** solo usa **POST /api/chat/message** (y opcionalmente /message/stream).
- Ese endpoint usa **conversation.service.processMessageWithAI** + **Conkavo** (Chat Completions, no Responses API).
- No hay Vector Store ni file_search. La información institucional está en texto fijo en Conkavo y en company-info.service.
- No hay `consultar_productos` ni `contar_productos`; en el flujo alternativo (POST /api/chat) hay `consultar_stock` y `buscar_productos` (ProductIndex + WooCommerce).
- La lógica “que prima” es vuestra: detecciones tempranas, regex SKU/ID, clasificación de intención con Conkavo, luego WooCommerce, STOCKF, product-matcher, y al final Conkavo redacta. El backend orquesta todo; la IA no ejecuta herramientas en el flujo de producción.

Conclusión: el documento nuevo y la transcripción describen una **arquitectura distinta** a la que está implementada hoy. Adaptarse “a la nueva forma de OpenAI” implica **elegir cómo** encajar esa arquitectura en vuestro sistema sin romper lo que ya funciona.

---

## 2. ¿Este nuevo cambio traería problema al código actual?

Depende **cómo** lo implementéis.

### Escenario A: Reemplazar de golpe el flujo actual por el nuevo

- Se sustituye el interior de **processMessageWithAI** (o el camino que usa POST /api/chat/message) por el nuevo flujo: Responses API + instructions desde system_prompt.txt + input (historial) + tools (file_search, consultar_productos, contar_productos).
- **Riesgo alto de “romper” lo que ya tenéis:**
  - La respuesta del chat dejaría de pasar por vuestra lógica actual (detecciones tempranas, queryType, WooCommerce en tiempo real, STOCKF, product-matcher, createResponse con `state`, `options`, `cart`, `product`, `productSearchResults`).
  - El frontend puede estar esperando ese formato de respuesta (botMessage, state, options, cart, product, productSearchResults). Si el nuevo flujo solo devuelve “texto del modelo”, el front podría dejar de mostrar carrito, opciones de botones o cards de producto.
  - El catálogo/stock hoy puede venir de **WooCommerce + ProductIndex/STOCKF**; el nuevo diseño habla de **consultar_productos** y **contar_productos** contra **MongoDB**. Si vuestra fuente de verdad de stock/precio es WooCommerce y MongoDB es solo índice, habría que definir bien qué devuelve `consultar_productos` (¿solo MongoDB o también datos de WooCommerce?) para no perder precisión.

Por tanto: **sí puede traer problema** si se reemplaza todo el flujo actual de una vez sin mantener la misma “forma” de respuesta ni la misma fuente de datos.

### Escenario B: Nuevo flujo en paralelo (recomendado para no romper)

- Se deja **intacto** el flujo actual de POST /api/chat/message (conversation.service + Conkavo + WooCommerce + STOCKF).
- Se implementa el **nuevo** flujo en un lugar separado, por ejemplo:
  - Un **nuevo endpoint** (ej. POST /api/chat/v2/message), o
  - Un **modo** controlado por query/body (ej. `?useResponsesApi=true` o `useNewChat: true`), que use Responses API + system_prompt.txt + Vector Store + consultar_productos + contar_productos.
- El frontend sigue usando por defecto el flujo actual. Cuando estéis listos, probáis el nuevo (otra ruta o otro cliente). Si el nuevo os convence y queréis que sea el oficial, entonces:
  - Se hace que el front llame al nuevo flujo,
  - Se adapta la respuesta del nuevo flujo al formato que espera el front (state, options, cart, product, productSearchResults) si hace falta,
  - Y solo entonces se puede deprecar o eliminar el flujo viejo.

Así **no se rompe** lo actual; se añade una alternativa y se valida antes de cortar nada.

---

## 3. Definición de lógica del nuevo enfoque (sin código)

### 3.1 Dónde vive cada cosa

- **MDs (base de conocimiento de la empresa)**  
  - **No en el repo.** Se suben a un **Vector Store** en la cuenta de OpenAI (por API o por interfaz).  
  - El backend solo necesita el **ID de ese Vector Store** (ej. en .env: `VECTOR_STORE_ID`).  
  - Actualizar información = actualizar archivos en ese Store (re-subir o reemplazar); el backend no guarda ni sirve los MDs.

- **System prompt (instructions)**  
  - **Sí en el proyecto**, por ejemplo en `config/system_prompt.txt` (o la ruta que elijáis).  
  - Contenido: todo lo que pegaste de tu jefe (tono, primera persona del plural, reglas 1–6, 3a, 3a2, 4b, 5, 5b, 5c, 6, 6a, 6a1, horario almuerzo, datos transferencia, etc.).  
  - En cada request el backend **lee ese archivo** y envía su contenido como `instructions` en la llamada a Responses API.  
  - No confundir: “la info en MDs” = empresa (OpenAI). “Cómo debe responder” = system prompt (repo).

### 3.2 Qué hace el backend en cada request (flujo lógico)

1. Recibe mensaje del usuario e identificador de sesión (ej. userId o session_id).
2. Recupera el **historial** de esa sesión (desde donde lo tengáis: memoria, MongoDB, etc.).
3. Arma el **input** de la API: historial de conversación + mensaje nuevo (en el formato que pida la Responses API).
4. Lee **system_prompt.txt** del disco → `instructions`.
5. Obtiene **model** (ej. desde .env, tipo gpt-4o-mini).
6. Define **tools**: file_search (con vector_store_ids = [VECTOR_STORE_ID]), consultar_productos (query, limit), contar_productos (sin parámetros).
7. Llama a `openai.responses.create({ model, instructions, input, tools })`.
8. Inspecciona la respuesta:
   - Si la respuesta es **solo texto** → ese es el mensaje del asistente. Ir a 10.
   - Si la respuesta incluye **llamadas a herramientas**:
     - Para **file_search**: lo resuelve OpenAI con el Vector Store; no tenéis que ejecutar nada, pero sí incluir ese resultado en el input de la siguiente llamada (según cómo lo especifique la Responses API).
     - Para **consultar_productos** y **contar_productos**: el backend **ejecuta** la función contra MongoDB (y si aplica WooCommerce/STOCKF según vuestra decisión), obtiene el resultado y lo mete en el cuerpo de la siguiente petición (p. ej. como `function_call_output` o el nombre que use la API).
9. Con el input actualizado (conversación + resultados de herramientas), repite la llamada a `responses.create()`. Volver a 8 hasta que la respuesta no pida más herramientas.
10. Toma el **texto final** del asistente. Opcional: postproceso (quitar markdown, ajustar formato, etc.).
11. Guarda el turno en el historial (mensaje usuario + respuesta asistente).
12. Devuelve al cliente la respuesta. Si el front espera `botMessage`, `state`, `options`, `cart`, `product`, `productSearchResults`, hay que decidir: o el nuevo flujo también construye ese objeto (a partir del texto y de los resultados de consultar_productos que ya tengáis en el último turno), o el front se adapta a un formato más simple (solo texto) en la ruta nueva.

### 3.3 Herramientas: contrato con el modelo

- **file_search**  
  - Tipo: búsqueda en Vector Store.  
  - Parámetros: vector_store_ids (desde .env).  
  - El modelo la usa para preguntas institucionales (horarios, dirección, políticas, etc.). El backend no implementa nada; OpenAI usa los MDs del Store.

- **consultar_productos**  
  - Tipo: function calling.  
  - Parámetros: por ejemplo `query` (string), `limit` (número).  
  - Cuando el modelo la llama, el backend ejecuta la búsqueda (MongoDB, y si queréis también WooCommerce/STOCKF) y devuelve una estructura que el system prompt espera: p. ej. productos con nombre, SKU, precio, y si aplica **stock_resumen** (stockTotal, stockPorVariante, coming_soon), **especificaciones_texto**, etc. Eso implica que vuestra capa de datos (MongoDB + lo que suméis) debe poder exponer esos campos para no contradecir las reglas del prompt (3, 3a, 3a2, 4b, etc.).

- **contar_productos**  
  - Tipo: function.  
  - Parámetros: ninguno (o los que defináis).  
  - El backend cuenta productos en MongoDB y devuelve el número (y si el prompt pide “colores”/“variantes”, ese resultado debe incluir lo que el prompt espere para la regla 3b).

### 3.4 Loop de herramientas

- El documento dice: “Se repite hasta que la respuesta de OpenAI ya no pida más herramientas.”  
- En la lógica hay que implementar un **límite máximo de vueltas** (ej. 5 o 10) para evitar bucles infinitos si el modelo pide herramientas una y otra vez. Si se alcanza el límite, se toma la última respuesta disponible o un mensaje de fallback y se termina el turno.

### 3.5 Historial y estado

- **Historial:** debe estar en el formato que acepte la Responses API como `input` (normalmente lista de mensajes user/assistant). Si hoy tenéis historial en memoria (Map) o en MongoDB, se transforma a ese formato al armar cada request.
- **Estado (state, options, cart):** en el flujo nuevo “puro”, el modelo solo devuelve texto; no hay estados explícitos como IDLE, WAITING_PRODUCT. Si el front necesita state/options/cart, o bien:
  - el nuevo endpoint devuelve un formato compatible (ej. state fijo “IDLE”, options/cart vacíos o derivados de sesión), o
  - el front en la ruta nueva no depende de esos campos hasta que decidáis unificar.

---

## 4. Respuesta directa a vuestras dudas

### “¿La integración nueva rompería todo lo que hemos hecho hasta ahora?”

- **No**, si la hacéis como **flujo nuevo en paralelo** (nuevo endpoint o modo) y dejáis el actual intacto hasta validar.
- **Sí podría**, si **reemplazáis** el flujo actual de /api/chat/message por el nuevo sin mantener el mismo contrato de respuesta (botMessage, state, options, cart, product, productSearchResults) y sin asegurar que consultar_productos/contar_productos usen la misma fuente de verdad (WooCommerce/STOCKF) que consideréis correcta.

### “La info en MDs arriba en OpenAI y no deberíamos tenerla en el código”

- Correcto en el nuevo diseño: la **información de la empresa** (horarios, dirección, políticas, datos bancarios, etc.) va en **archivos .md subidos al Vector Store** en OpenAI. No tenéis que tener ese contenido en el repo ni en company-info.service para ese flujo; el modelo lo obtiene vía file_search.
- Lo que **sí** debe vivir en el proyecto es el **system prompt** (instructions): las reglas de cómo responder, cuándo usar file_search vs consultar_productos, formato de respuesta, prohibiciones. Eso se lee del repo (ej. system_prompt.txt) y se envía en cada request.

### “Lo que prima es nuestra lógica”

- En el flujo **actual**, vuestra lógica prima al 100%: vosotros decidís intención, consultáis WooCommerce/STOCKF, y la IA solo redacta.
- En el **nuevo** flujo, el modelo **decide** cuándo llamar a file_search, consultar_productos o contar_productos; pero **qué devuelven** esas funciones y **cómo debe responder** (reglas 1–6, 3a, 4b, etc.) lo seguís controlando vosotros con el system prompt y con la implementación de consultar_productos/contar_productos. Así vuestra lógica sigue primando en “qué datos tiene el modelo” y “en qué formato y con qué reglas responde”.

---

## 5. Sobre el zip mds.zip

No tengo acceso a la carpeta Descargas para abrir `mds.zip`. Si podéis:

- Copiar los .md al repo (ej. en `docs/mds-origen/`) y decirme la ruta, o  
- Pegar aquí el listado de nombres de archivos y un resumen del contenido de cada uno,

puedo revisar que encajen con:

- Lo que el system prompt espera (horario almuerzo, datos transferencia, etc.),  
- Y con el uso de **file_search** (texto en los MDs = lo que el modelo podrá “buscar” para preguntas institucionales).

---

## 6. Resumen de decisiones antes de implementar

1. **Dónde encajar el nuevo flujo:** nuevo endpoint/modo y dejar el actual intacto, o reemplazo directo (con más riesgo).
2. **Formato de respuesta al front:** mismo que ahora (botMessage, state, options, cart, product, productSearchResults) o más simple en la ruta nueva.
3. **Qué devuelve consultar_productos:** solo MongoDB o también WooCommerce/STOCKF; y que incluya stock_resumen, especificaciones_texto, SKU, precio como pide el system prompt.
4. **Límite de vueltas** del loop de herramientas (ej. 5–10).
5. **Dónde se guarda el historial** para el nuevo flujo (memoria vs MongoDB) y en qué formato se pasa a `input`.
6. **Ruta del system prompt** en el proyecto (ej. `config/system_prompt.txt`) y que exista en todos los entornos.

Con esto tenéis la lógica del nuevo cambio definida y los puntos donde podría “romper” lo actual, sin escribir código todavía.
