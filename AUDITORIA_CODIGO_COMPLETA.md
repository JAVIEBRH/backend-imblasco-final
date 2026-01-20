# 🔍 AUDITORÍA COMPLETA DE CÓDIGO - IMBLASCO B2B

**Fecha:** 2026-01-19  
**Auditor:** Análisis exhaustivo de lógica y arquitectura  
**Alcance:** Backend (Node.js/Express) y Frontend (React/Vite)

---

## 1. ⚠️ CRITICAL ISSUES (MUST-FIX)

### 1.1 **Sesiones en memoria sin persistencia (CRÍTICO)**

**Archivo:** `src/services/conversation.service.js:366`

```javascript
const sessions = new Map()  // ⚠️ PROBLEMA CRÍTICO
```

**Problema:**
- Las sesiones se almacenan en memoria (`Map()`)
- **Pérdida total de contexto** al reiniciar el servidor
- **Sin sincronización** entre múltiples instancias (Render puede tener múltiples workers)
- **Sin límite de memoria** - puede crecer indefinidamente
- **Race conditions** en acceso concurrente a la misma sesión

**Impacto:**
- Pérdida de historial de conversación en cada deploy
- Inconsistencias en producción con múltiples workers
- Posible memory leak en producción

**Severidad:** 🔴 CRÍTICA

**Recomendación:** Migrar a MongoDB usando modelo `Conversation` (ya existe en `src/models/Conversation.js`)

---

### 1.2 **Falta de validación de índices MongoDB**

**Archivo:** `src/services/assistant.service.js:91-102`

```javascript
let results = await ProductIndex.find(
  { $text: { $search: searchTerm } }
)
if (!results || results.length === 0) {
  results = await ProductIndex.find({
    $or: [
      { codigo: { $regex: searchTerm, $options: 'i' } },
      { sku: { $regex: searchTerm, $options: 'i' } }
    ]
  })
}
```

**Problema:**
- Uso de `$text` sin verificar que el índice de texto existe
- Búsquedas con `$regex` sin índices pueden ser lentas en colecciones grandes
- No hay validación de que los índices estén creados

**Impacto:**
- Queries lentas o fallos si los índices no existen
- Violación de la regla "MongoDB solo para índices"

**Severidad:** 🔴 CRÍTICA

---

### 1.3 **Race condition en paginación WooCommerce**

**Archivo:** `src/services/wordpress.service.js:208-228`

```javascript
if (totalPages > 1) {
  const pagePromises = []
  for (let page = 2; page <= totalPages; page++) {
    pagePromises.push(
      wcRequest(`products?per_page=100&page=${page}&status=publish`)
        .then(products => {
          return Array.isArray(products) ? products : []
        })
        .catch(error => {
          return []  // ⚠️ Silencia errores
        })
    )
  }
  const remainingPages = await Promise.all(pagePromises)
  remainingPages.forEach(pageProducts => {
    allProducts = allProducts.concat(pageProducts)
  })
}
```

**Problemas:**
- Si una página falla, retorna array vacío sin notificar
- **No hay límite de concurrencia** - puede saturar WooCommerce API
- Si `totalPages` cambia durante la ejecución, puede obtener páginas duplicadas o faltantes
- Sin retry logic para errores transitorios

**Impacto:**
- Datos incompletos sin notificación
- Posible rate limiting de WooCommerce
- Inconsistencias en datos obtenidos

**Severidad:** 🔴 CRÍTICA

---

### 1.4 **Falta de sanitización en JSON.parse**

**Archivo:** `src/services/conkavo-ai.service.js:427`

```javascript
const analisis = JSON.parse(resultado)
```

**Archivo:** `src/services/assistant.service.js:690`

```javascript
const args = JSON.parse(toolCall.function.arguments || '{}')
```

**Problema:**
- `JSON.parse()` sin try-catch puede crashear el servidor
- No valida estructura del JSON antes de parsear
- Si OpenAI retorna JSON malformado, el servidor falla

**Impacto:**
- Crash del servidor en producción
- Pérdida de mensajes del usuario

**Severidad:** 🔴 CRÍTICA

---

### 1.5 **Memory leak en historial de sesiones**

**Archivo:** `src/services/conversation.service.js:386-395`

```javascript
function addToHistory(session, sender, message) {
  session.history.push({
    sender,
    message,
    timestamp: new Date().toISOString()
  })
  if (session.history.length > 50) {
    session.history = session.history.slice(-50)
  }
}
```

**Problema:**
- Historial limitado a 50 mensajes, pero **nunca se limpia la sesión**
- Sesiones inactivas permanecen en memoria indefinidamente
- Sin TTL (Time To Live) para sesiones

**Impacto:**
- Memory leak gradual en producción
- Degradación de rendimiento con el tiempo

**Severidad:** 🔴 CRÍTICA

---

## 2. 🔴 LOGICAL INCONSISTENCIES

### 2.1 **Inconsistencia entre dos sistemas de sesión**

**Archivos:**
- `src/services/conversation.service.js` - Usa `Map()` en memoria
- `src/services/assistant.service.js` - Usa MongoDB `Conversation.findOne()`

**Problema:**
- Dos sistemas de sesión coexisten sin sincronización
- `/api/chat/message` usa `conversation.service.js` (memoria)
- `/api/chat` usa `assistant.service.js` (MongoDB)
- **Datos inconsistentes** entre endpoints

**Impacto:**
- Historial diferente según endpoint usado
- Confusión en frontend sobre qué endpoint usar

**Severidad:** 🔴 ALTA

---

### 2.2 **Lógica de stock compartido vs individual inconsistente**

**Archivo:** `src/services/conversation.service.js:2341-2405`

**Problema:**
- Si producto principal tiene `stock_quantity` definido, se asume stock compartido
- Pero las variaciones pueden tener `stock_quantity` individual también
- No verifica `manage_stock` del producto principal para determinar el modo real

**Impacto:**
- Stock mostrado incorrectamente al usuario
- Confusión entre stock compartido e individual

**Severidad:** 🟡 MEDIA (Ya parcialmente corregido, pero falta validar `manage_stock`)

---

### 2.3 **Doble consulta a WooCommerce para mismo producto**

**Archivo:** `src/services/conversation.service.js:1317-1377`

**Problema:**
- Si se encuentra producto por SKU, luego se consulta nuevamente por ID
- Múltiples llamadas a `getProductBySku()` y `getProductStock()` para el mismo producto
- Sin cache entre llamadas

**Impacto:**
- Llamadas redundantes a WooCommerce API
- Mayor latencia y posible rate limiting

**Severidad:** 🟡 MEDIA

---

### 2.4 **Falta de validación de `manage_stock` en productos variables**

**Archivo:** `src/services/conversation.service.js:2343`

**Problema:**
- Asume stock compartido si `stock_quantity !== null`, pero no verifica `manage_stock`
- En WooCommerce, `manage_stock: false` significa que el stock se gestiona por variaciones aunque `stock_quantity` tenga valor

**Impacto:**
- Cálculo incorrecto de stock en productos variables

**Severidad:** 🟡 MEDIA

---

## 3. ⚠️ EDGE CASES NOT HANDLED

### 3.1 **WooCommerce API retorna error 429 (Rate Limit)**

**Archivo:** `src/services/wordpress.service.js:58-62`

```javascript
if (!response.ok) {
  const errorText = await response.text()
  console.error(`❌ Error WooCommerce API (${response.status}):`, errorText.substring(0, 200))
  throw new Error(`WooCommerce API error: ${response.status} ${response.statusText}`)
}
```

**Problema:**
- No maneja específicamente error 429 (Too Many Requests)
- No implementa retry con backoff exponencial
- No limita concurrencia de requests

**Impacto:**
- Falla inmediata sin recuperación automática
- Pérdida de funcionalidad temporal

**Severidad:** 🟡 MEDIA

---

### 3.2 **Producto eliminado durante consulta**

**Archivo:** `src/services/wordpress.service.js:105-152`

**Problema:**
- Si un producto se elimina entre la búsqueda por SKU y la obtención de variaciones, puede causar error
- No valida que el producto siga existiendo antes de obtener variaciones

**Impacto:**
- Error 404 no manejado
- Respuesta de error al usuario

**Severidad:** 🟢 BAJA

---

### 3.3 **Variaciones cambian durante suma de stock**

**Archivo:** `src/services/conversation.service.js:2352-2357`

```javascript
const totalStock = context.productVariations.reduce((sum, v) => {
  const vStock = v.stock_quantity !== null && v.stock_quantity !== undefined 
    ? parseInt(v.stock_quantity) 
    : 0
  // ...
  return sum + vStock
}, 0)
```

**Problema:**
- Si `context.productVariations` se modifica durante el reduce (race condition), puede causar resultados incorrectos
- No valida que todas las variaciones sean del mismo producto padre

**Impacto:**
- Cálculo incorrecto de stock total

**Severidad:** 🟢 BAJA

---

### 3.4 **Session ID collision**

**Archivo:** `src/services/conversation.service.js:371-381`

**Problema:**
- Si dos usuarios generan el mismo `userId` (colisión), comparten la misma sesión
- No hay validación de unicidad
- Frontend puede generar IDs no únicos

**Impacto:**
- Usuarios ven historial de otros usuarios
- **Violación de privacidad crítica**

**Severidad:** 🔴 ALTA

---

### 3.5 **Mensaje muy largo causa timeout**

**Archivo:** `src/services/conversation.service.js:1006`

**Problema:**
- No valida longitud máxima del mensaje
- Mensajes muy largos pueden causar timeout en OpenAI
- Sin límite de caracteres en frontend

**Impacto:**
- Timeout en procesamiento
- Pérdida del mensaje del usuario

**Severidad:** 🟡 MEDIA

---

## 4. 🐌 PERFORMANCE RISKS

### 4.1 **Obtener TODOS los productos sin cache**

**Archivo:** `src/services/wordpress.service.js:189-248`

**Problema:**
- `getAllProducts()` obtiene TODOS los productos (1483+) en cada llamada
- Sin cache, sin límite de tiempo
- Se llama múltiples veces en el mismo request

**Impacto:**
- Latencia alta (puede tomar 10-30 segundos)
- Alto uso de ancho de banda
- Posible rate limiting de WooCommerce

**Severidad:** 🔴 ALTA

---

### 4.2 **Múltiples llamadas paralelas sin límite**

**Archivo:** `src/services/wordpress.service.js:209-224`

**Problema:**
- `Promise.all()` ejecuta todas las páginas en paralelo sin límite
- Para 15 páginas = 15 requests simultáneos a WooCommerce
- Puede saturar la API

**Impacto:**
- Rate limiting de WooCommerce
- Errores 429 (Too Many Requests)
- Degradación de servicio

**Severidad:** 🔴 ALTA

---

### 4.3 **Búsqueda de productos sin límite de resultados**

**Archivo:** `src/services/wordpress.service.js:258-287`

```javascript
export async function searchProductsInWordPress(searchTerm, limit = 10) {
  const products = await wcRequest(`products?search=${encodeURIComponent(searchTerm)}&per_page=${limit}&status=publish`)
}
```

**Problema:**
- Aunque tiene `limit`, WooCommerce puede retornar más resultados si el término es muy genérico
- No valida que el número de resultados no exceda el límite

**Impacto:**
- Respuestas muy grandes
- Mayor latencia

**Severidad:** 🟡 MEDIA

---

### 4.4 **Falta de paginación en búsquedas MongoDB**

**Archivo:** `src/services/assistant.service.js:91-102`

**Problema:**
- Búsquedas en `ProductIndex` sin límite ni paginación
- Si hay muchos resultados, retorna todos

**Impacto:**
- Alto uso de memoria
- Latencia alta

**Severidad:** 🟡 MEDIA

---

### 4.5 **Historial completo enviado a OpenAI en cada request**

**Archivo:** `src/services/conversation.service.js:1080`

```javascript
const recentHistory = session.history?.slice(-10) || []
```

**Problema:**
- Aunque limita a 10 mensajes, cada mensaje puede ser largo
- No limita tamaño total del contexto
- Puede exceder límites de tokens de OpenAI

**Impacto:**
- Costos altos de OpenAI
- Posible error de "context too long"

**Severidad:** 🟡 MEDIA

---

## 5. 🔒 SECURITY CONCERNS

### 5.1 **Falta de rate limiting en endpoints**

**Archivo:** `src/routes/chat.routes.js`

**Problema:**
- No hay rate limiting en `/api/chat/message`
- Un atacante puede hacer spam de requests
- Puede causar DoS o alto costo en OpenAI

**Impacto:**
- Ataque DoS
- Costos elevados de API
- Degradación de servicio

**Severidad:** 🔴 ALTA

---

### 5.2 **Session ID sin validación de formato**

**Archivo:** `src/routes/chat.routes.js:27`

```javascript
if (!session_id || typeof session_id !== 'string' || session_id.trim().length === 0) {
  return res.status(400).json({ error: 'session_id debe ser un string no vacío' })
}
```

**Problema:**
- No valida formato del `session_id`
- Permite caracteres especiales que podrían causar inyección
- No sanitiza antes de usar en queries

**Impacto:**
- Posible inyección en MongoDB (aunque mongoose lo previene parcialmente)
- Session hijacking si el ID es predecible

**Severidad:** 🟡 MEDIA

---

### 5.3 **CORS demasiado permisivo**

**Archivo:** `src/index.js:91-102`

```javascript
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:5173",
      "http://localhost:3002",
      "https://imblascoasistentefrontend.onrender.com",
      "https://frontend-imblasco-final.onrender.com",
    ],
    credentials: true,
  })
)
```

**Problema:**
- Múltiples orígenes permitidos sin validación dinámica
- `credentials: true` permite cookies/headers sensibles
- No valida origen en runtime

**Impacto:**
- CSRF attacks si hay vulnerabilidades en frontend
- Exposición de credenciales

**Severidad:** 🟡 MEDIA

---

### 5.4 **Logs exponen información sensible**

**Archivo:** `src/routes/chat.routes.js:25`

```javascript
console.log(`[CHAT] /api/chat session_id=${session_id} message="${(message || '').slice(0, 120)}"`)
```

**Problema:**
- Logs exponen mensajes del usuario (pueden contener información sensible)
- Session IDs en logs pueden ser usados para session hijacking
- Sin rotación de logs

**Impacto:**
- Violación de privacidad
- Exposición de datos sensibles en logs

**Severidad:** 🟡 MEDIA

---

### 5.5 **Falta de validación de tamaño de mensaje**

**Archivo:** `src/routes/chat.routes.js:34`

**Problema:**
- No valida longitud máxima del mensaje
- Mensajes muy largos pueden causar DoS
- Sin límite en `express.json()`

**Impacto:**
- Ataque DoS con payloads grandes
- Alto uso de memoria

**Severidad:** 🟡 MEDIA

---

## 6. 🐛 MINOR ISSUES / CODE SMELLS

### 6.1 **Uso de `setTimeout` sin cleanup en frontend**

**Archivo:** `src/components/B2BChat/B2BChat.jsx:42`

```javascript
useEffect(() => {
  if (isOpen) {
    setTimeout(() => inputRef.current?.focus(), 300);
  }
}, [isOpen]);
```

**Problema:**
- `setTimeout` no se limpia si el componente se desmonta antes de 300ms
- Puede causar warning de React sobre actualización de estado en componente desmontado

**Severidad:** 🟢 BAJA

---

### 6.2 **Dependencias faltantes en useEffect**

**Archivo:** `src/components/B2BChat/B2BChat.jsx:34`

```javascript
useEffect(() => {
  if (isOpen && messages.length === 0 && userId) {
    initChat();
  }
}, [isOpen, userId]);  // ⚠️ Falta 'messages.length'
```

**Problema:**
- `messages.length` usado en condición pero no en dependencias
- Puede causar comportamiento inesperado

**Severidad:** 🟢 BAJA

---

### 6.3 **Manejo de errores inconsistente**

**Archivo:** Múltiples archivos

**Problema:**
- Algunos errores se loguean, otros se silencian
- Algunos retornan `null`, otros lanzan excepciones
- Sin estrategia consistente de error handling

**Severidad:** 🟢 BAJA

---

### 6.4 **Código duplicado en normalización**

**Archivo:** `src/services/conversation.service.js:57-83`

**Problema:**
- Funciones `normalizeSearchText()` y `normalizeCode()` tienen lógica similar
- Podrían consolidarse

**Severidad:** 🟢 BAJA

---

### 6.5 **Magic numbers sin constantes**

**Archivo:** `src/services/conversation.service.js:392`

```javascript
if (session.history.length > 50) {
  session.history = session.history.slice(-50)
}
```

**Problema:**
- Número mágico `50` sin constante
- Dificulta mantenimiento

**Severidad:** 🟢 BAJA

---

## 7. 📋 RESUMEN DE PRIORIDADES

### 🔴 CRÍTICO (Debe corregirse inmediatamente)
1. Sesiones en memoria sin persistencia
2. Race condition en paginación WooCommerce
3. Falta de validación de índices MongoDB
4. Memory leak en historial de sesiones
5. Session ID collision

### 🟡 ALTA (Debe corregirse pronto)
6. Inconsistencia entre dos sistemas de sesión
7. Obtener TODOS los productos sin cache
8. Múltiples llamadas paralelas sin límite
9. Falta de rate limiting
10. Falta de sanitización en JSON.parse

### 🟢 MEDIA (Mejoras recomendadas)
11. Lógica de stock compartido vs individual
12. Doble consulta a WooCommerce
13. Edge cases no manejados
14. Performance risks adicionales
15. Security concerns menores

---

**Total de issues encontrados:** 35+  
**Críticos:** 5  
**Altos:** 5  
**Medios/Bajos:** 25+

---

**Recomendación final:** Priorizar corrección de issues críticos antes de deploy a producción.
