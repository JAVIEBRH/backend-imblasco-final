/**
 * CONVERSATION ENGINE (PostgreSQL)
 * Motor conversacional basado en estados y ACCIONES
 * 
 * Estados:
 * - IDLE: Sin pedido activo
 * - WAITING_PRODUCT: Esperando selección de producto
 * - WAITING_QUANTITY: Esperando cantidad
 * - CONFIRMATION: Confirmando acción
 * - FINISHED: Pedido finalizado
 * 
 * Acciones:
 * - START_ORDER: Iniciar nuevo pedido
 * - SELECT_PRODUCT: Seleccionar producto (value: SKU)
 * - SET_QUANTITY: Establecer cantidad (value: número)
 * - ADD_MORE: Agregar más productos
 * - FINISH_ORDER: Finalizar pedido
 * - VIEW_CART: Ver carrito actual
 * - CANCEL_ORDER: Cancelar pedido
 * - SEARCH_PRODUCT: Buscar producto
 */

import * as stockService from './stock.service.js'
import * as cartService from './cart.service.js'
import * as orderService from './order.service.js'
import * as conkavoAI from './conkavo-ai.service.js'
import * as wordpressService from './wordpress.service.js'
import * as companyInfoService from './company-info.service.js'
import * as productMatcher from './product-matcher.service.js'

// Estados válidos
export const STATES = {
  IDLE: 'IDLE',
  WAITING_PRODUCT: 'WAITING_PRODUCT',
  WAITING_QUANTITY: 'WAITING_QUANTITY',
  CONFIRMATION: 'CONFIRMATION',
  FINISHED: 'FINISHED'
}

// Acciones válidas
export const ACTIONS = {
  START_ORDER: 'START_ORDER',
  SELECT_PRODUCT: 'SELECT_PRODUCT',
  SET_QUANTITY: 'SET_QUANTITY',
  ADD_MORE: 'ADD_MORE',
  FINISH_ORDER: 'FINISH_ORDER',
  VIEW_CART: 'VIEW_CART',
  CANCEL_ORDER: 'CANCEL_ORDER',
  SEARCH_PRODUCT: 'SEARCH_PRODUCT'
}

/**
 * Normaliza mensaje para comparación con el set de genéricos (puerta dura).
 * Lowercase, trim, colapsar espacios, quitar puntuación final.
 */
function normalizeForGenericGate(msg) {
  if (!msg || typeof msg !== 'string') return ''
  return msg
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[¿?¡!.\s]+|[?!.\s]+$/g, '')
    .trim()
}

/**
 * Set de frases genéricas (puerta dura): si el mensaje normalizado coincide exactamente,
 * no se llama a OpenAI ni WooCommerce → respuesta genérica de ayuda.
 * Regla: WooCommerce solo cuando hay señal fuerte; mensajes puramente genéricos se cortan aquí.
 */
const GENERIC_PHRASES_RAW = [
  'ayuda', 'help', 'necesito algo', 'info', 'consulta',
  'qué venden', 'que venden', 'qué vendes', 'que vendes',
  'me pueden ayudar', 'me ayudan', 'pueden ayudarme', 'podrían ayudarme',
  'tienen productos', 'tienen algo', 'qué productos tienen', 'que productos tienen',
  'qué artículos tienen', 'que articulos tienen', 'qué tienen', 'que tienen'
]
const GENERIC_PHRASES_SET = new Set(GENERIC_PHRASES_RAW.map(normalizeForGenericGate))

/**
 * Mapa abreviatura/sinónimo → palabra canónica que puede aparecer en nombre del producto.
 * Solo se usa en userAsksForDifferentProduct para "término en contexto". Ampliar según CANDIDATO_SINONIMO en logs.
 */
const TERMINO_SINONIMOS_CONTEXTO = {
  boli: 'boligrafo',
  boligrafo: 'boligrafo',
  bamboo: 'bambu',
  bambu: 'bambu',
  libreta: 'libreta',
  cuaderno: 'cuaderno'
}

/**
 * Normalizar texto para búsqueda (caracteres especiales, espacios, códigos)
 * @param {string} text - Texto a normalizar
 * @returns {string} - Texto normalizado
 */
function normalizeSearchText(text) {
  if (!text || typeof text !== 'string') return ''
  
  return text
    .toLowerCase()
    .normalize('NFD')                       // Descomponer caracteres Unicode (á -> a + ´)
    .replace(/[\u0300-\u036f]/g, '')       // Eliminar diacríticos (tildes, acentos)
    // Normalizar caracteres especiales a espacios
    .replace(/[-_.,;:()\[\]{}'"!?¡¿]/g, ' ')   // Guiones, puntos, paréntesis, comillas, signos → espacio
    // Normalizar espacios múltiples a uno solo
    .replace(/\s+/g, ' ')                  // Múltiples espacios → un solo espacio
    .trim()
}

/**
 * Normalizar códigos/SKU (N35 = N-35 = N 35 = N.35 = N3,5 = N3?)
 * @param {string} code - Código/SKU a normalizar
 * @returns {string} - Código normalizado
 */
function normalizeCode(code) {
  if (!code || typeof code !== 'string') return ''
  
  return code
    .toUpperCase()
    .replace(/[?¿!¡.,;:()\[\]{}'"\s_-]/g, '')  // Eliminar signos de interrogación, exclamación, puntuación, espacios, guiones
    .trim()
}

/**
 * Resuelve si el usuario debe tratarse como logueado (acceso a precios, stock, cotización).
 * - Pruebas/Producción actual: variable de entorno CHAT_AUTH_AS_LOGGED_IN (por defecto true = todos como logueados).
 * - A futuro: la ruta validará token contra BD y pasará options.isLoggedIn; entonces se ignora el env.
 * @param {Object} options - Opciones del mensaje (p. ej. { isLoggedIn: true } desde validación de token)
 * @returns {boolean}
 */
function resolveIsLoggedIn(options = {}) {
  if (typeof options.isLoggedIn === 'boolean') return options.isLoggedIn
  const env = process.env.CHAT_AUTH_AS_LOGGED_IN
  return env !== 'false' && env !== '0'
}

/**
 * Detecta si el mensaje pregunta por cotización o cómo comprar (info sensible para no registrados).
 */
function isPreguntaCotizacionOComoComprar(msg) {
  if (!msg || typeof msg !== 'string') return false
  const m = msg.toLowerCase().trim()
  return /\b(cotizaci[oó]n|cotizar|precio|precios|comprar|pedido|como\s+comprar|c[oó]mo\s+comprar|realizar\s+pedido|hacer\s+pedido)\b/.test(m)
}

/**
 * Genera el prompt para la IA cuando el usuario no está logueado y pide productos/precios/stock.
 * Redirige a solicitud de cuenta sin revelar información sensible.
 */
function getMessageNecesitasCuentaParaPreciosStock(message, paso1SolicitarCuenta) {
  return `Redacta una respuesta breve y profesional en español chileno.
El cliente preguntó por productos, precios o stock: "${message}"

INSTRUCCIONES:
- NO des precios, stock ni instrucciones de cotización. Esa información es solo para clientes con cuenta aprobada.
- Indica que para acceder a precios, stock y cotizaciones debe tener una cuenta. Dirige al flujo de solicitud de cuenta.
- Usa EXACTAMENTE esta información para solicitud de cuenta: ${paso1SolicitarCuenta}
- Sé amable y profesional.`
}

/**
 * Genera el prompt para la IA cuando el usuario no está logueado y pide cotización/cómo comprar.
 * No revelar correo de cotización ni pasos con precios.
 */
function getMessageNecesitasCuentaParaCotizacion(message, paso1SolicitarCuenta) {
  return `Redacta una respuesta breve y profesional en español chileno.
El cliente preguntó por cotización o cómo comprar: "${message}"

INSTRUCCIONES:
- NO des el correo de cotización ni los pasos de compra con precios. Esa información es solo para clientes con cuenta aprobada.
- Indica que para acceder a cotizaciones e instrucciones de compra debe tener una cuenta. Dirige al flujo de solicitud de cuenta.
- Usa EXACTAMENTE esta información: ${paso1SolicitarCuenta}
- Sé amable y profesional.`
}

/**
 * Comprueba si el texto contiene la palabra como palabra completa (límite de palabra).
 * Evita que "mano" coincida con "manual" o "Sunderland".
 * @param {string} text - Texto normalizado (sin acentos, minúsculas)
 * @param {string} word - Palabra a buscar
 * @returns {boolean}
 */
function containsWholeWord(text, word) {
  if (!text || !word || word.length < 2) return false
  const escaped = String(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`\\b${escaped}\\b`, 'i')
  return re.test(text)
}

/**
 * Comprueba si un producto hace match exacto con el término de búsqueda (código/SKU).
 * Match exacto: SKU normalizado igual al término, o nombre con la palabra completa del código.
 * Ej: "K33" hace match con "Llavero Metal Madera K33" pero no con "Mochila SK33".
 * @param {Object} product - Producto con .sku y .name
 * @param {string} searchTerm - Término de búsqueda (ej. "K33")
 * @returns {boolean}
 */
function productMatchesCodeExactly(product, searchTerm) {
  if (!searchTerm || typeof searchTerm !== 'string' || !product) return false
  const termNorm = normalizeCode(searchTerm)
  if (!termNorm) return false
  const skuNorm = normalizeCode(product.sku || '')
  if (skuNorm && skuNorm === termNorm) return true
  const name = product.name || ''
  if (name && containsWholeWord(name, searchTerm)) return true
  return false
}

/**
 * Convertir plural a singular en español (robusto y general)
 * @param {string} word - Palabra en plural
 * @returns {string} - Palabra en singular
 */
function pluralToSingular(word) {
  if (!word || word.length < 3) return word
  
  const lowerWord = word.toLowerCase()
  
  // Casos especiales con cambio de consonante: terminan en -es
  if (lowerWord.endsWith('es') && word.length > 4) {
    // Cambio c → z: lápices -> lápiz, peces -> pez, luces -> luz
    if (lowerWord.endsWith('ices')) {
      return word.slice(0, -4) + 'iz' // lapices -> lapiz, peces -> pez
    }
    // Cambio z → c: veces -> vez (menos común)
    if (lowerWord.endsWith('ezes')) {
      return word.slice(0, -3) + 'z' // veces -> vez
    }
    // Terminaciones -ones: cartones -> cartón, leones -> león
    if (lowerWord.endsWith('ones')) {
      return word.slice(0, -2) // cartones -> carton, leones -> leon
    }
    // Terminaciones -anes: panes -> pan, planes -> plan
    if (lowerWord.endsWith('anes')) {
      return word.slice(0, -2) // panes -> pan
    }
    // Terminaciones -enes: frenes -> fren (menos común)
    if (lowerWord.endsWith('enes')) {
      return word.slice(0, -2) // frenes -> fren
    }
    // Terminaciones -eras: corcheteras -> corchetera
    if (lowerWord.endsWith('eras')) {
      return word.slice(0, -1) // corcheteras -> corchetera
    }
    // Terminaciones -ilas: mochilas -> mochila
    if (lowerWord.endsWith('ilas')) {
      return word.slice(0, -1) // mochilas -> mochila
    }
    // Terminaciones -ores: colores -> color, sabores -> sabor
    if (lowerWord.endsWith('ores')) {
      return word.slice(0, -2) // colores -> color
    }
    // General para palabras que terminan en -es: quitar "es"
    return word.slice(0, -2)
  }
  
  // Palabras que terminan solo en -s (no -es)
  if (lowerWord.endsWith('s') && !lowerWord.endsWith('es') && word.length > 3) {
    // Terminaciones -as: mesas -> mesa, casas -> casa, libretas -> libreta
    if (lowerWord.endsWith('as')) {
      return word.slice(0, -1) // mesas -> mesa
    }
    // Terminaciones -os: libros -> libro, cuadernos -> cuaderno, boligrafos -> boligrafo
    if (lowerWord.endsWith('os')) {
      return word.slice(0, -1) // libros -> libro
    }
    // Terminaciones -is: lapices -> lapiz (ya cubierto arriba, pero por si acaso)
    if (lowerWord.endsWith('is')) {
      return word.slice(0, -1) // lapices -> lapiz (aunque normalmente es lapices)
    }
    // General: quitar "s"
    return word.slice(0, -1)
  }
  
  return word
}

/**
 * Convertir singular a plural en español (para generar variaciones)
 * @param {string} word - Palabra en singular
 * @returns {string} - Palabra en plural
 */
function singularToPlural(word) {
  if (!word || word.length < 2) return word
  
  const lowerWord = word.toLowerCase()
  
  // Casos especiales con cambio de consonante
  // Cambio z → c: lápiz -> lápices, pez -> peces, luz -> luces
  if (lowerWord.endsWith('iz')) {
    return word.slice(0, -2) + 'ices' // lapiz -> lapices, pez -> peces
  }
  if (lowerWord.endsWith('z') && !lowerWord.endsWith('iz')) {
    return word.slice(0, -1) + 'ces' // luz -> luces, cruz -> cruces
  }
  
  // Terminaciones -ón: cartón -> cartones, león -> leones
  if (lowerWord.endsWith('on')) {
    return word + 'es' // carton -> cartones
  }
  
  // Terminaciones -an: pan -> panes, plan -> planes
  if (lowerWord.endsWith('an')) {
    return word + 'es' // pan -> panes
  }
  
  // Terminaciones -en: fren -> frenes (menos común)
  if (lowerWord.endsWith('en')) {
    return word + 'es' // fren -> frenes
  }
  
  // Terminaciones -or: color -> colores, sabor -> sabores
  if (lowerWord.endsWith('or')) {
    return word + 'es' // color -> colores
  }
  
  // Terminaciones -a: mesa -> mesas, casa -> casas, libreta -> libretas
  if (lowerWord.endsWith('a')) {
    return word + 's' // mesa -> mesas
  }
  
  // Terminaciones -o: libro -> libros, cuaderno -> cuadernos
  if (lowerWord.endsWith('o')) {
    return word + 's' // libro -> libros
  }
  
  // Terminaciones -e: clase -> clases, corte -> cortes
  if (lowerWord.endsWith('e')) {
    return word + 's' // clase -> clases
  }
  
  // Terminaciones -i o -u: menú -> menús (mantener tilde si existe, pero ya está normalizado)
  if (lowerWord.endsWith('i') || lowerWord.endsWith('u')) {
    return word + 's' // menu -> menus
  }
  
  // General: agregar "s"
  return word + 's'
}

/**
 * Quitar saludo al inicio del mensaje para no usarlo como término de búsqueda ni mostrarlo en "relacionados con".
 * Ej: "hola! tienes mochilas?" → "tienes mochilas?"
 */
function stripLeadingGreeting(msg) {
  if (!msg || typeof msg !== 'string') return ''
  const trimmed = msg.trim()
  const withoutGreeting = trimmed
    .replace(/^(hola|hi|hello|hey|buenos\s+d[ií]as|buenas\s+tardes|buenas\s+noches|buen\s+d[ií]a|saludos)[\s.!?¡¿,]*/gi, '')
    .trim()
  return withoutGreeting.length > 0 ? withoutGreeting : trimmed
}

/** Detección temprana: pide hablar con una persona/ejecutivo (evitar tratarlo como búsqueda). */
function isHumanoRequest(msg) {
  if (!msg || typeof msg !== 'string') return false
  const t = msg.trim().toLowerCase()
  const patterns = [
    /quiero\s+hablar\s+con\s+(una\s+persona|un\s+ejecutivo|alguien|un\s+humano)/i,
    /hablar\s+con\s+una\s+persona/i,
    /necesito\s+hablar\s+con\s+(un\s+ejecutivo|una\s+persona|alguien)/i,
    /necesito\s+que\s+me\s+llame\s+(un\s+)?ejecutivo/i,
    /(puedo|podr[ií]a)\s+hablar\s+con\s+(un\s+ejecutivo|una\s+persona|alguien)/i,
    /atenci[oó]n\s+humana/i,
    /que\s+me\s+llame\s+(alguien|un\s+ejecutivo)/i
  ]
  return patterns.some(p => p.test(t))
}

/** Detección temprana: queja o reclamo (evitar tratarlo como búsqueda). */
function isReclamoRequest(msg) {
  if (!msg || typeof msg !== 'string') return false
  const t = msg.trim().toLowerCase()
  const patterns = [
    /\bqueja\b/i,
    /\bquejas\b/i,
    /una\s+queja/i,
    /tengo\s+una\s+queja/i,
    /tegno\s+una\s+queja/i,
    /tengo\s+un\s+reclamo/i,
    /quiero\s+reclamar/i,
    /me\s+quejo\s+de/i,
    /tengo\s+un\s+problema\s+con\s+(mi\s+pedido|el\s+pedido)/i
  ]
  return patterns.some(p => p.test(t))
}

/** Detección temprana: devolución de producto (responder con garantía, sin pedir datos ni contactaremos). */
function isDevolucionRequest(msg) {
  if (!msg || typeof msg !== 'string') return false
  const t = msg.trim().toLowerCase()
  const patterns = [
    /quiero\s+devolver/i,
    /necesito\s+devolver/i,
    /devolver\s+(un\s+)?producto/i,
    /devoluci[oó]n/i,
    /hacer\s+una\s+devoluci[oó]n/i
  ]
  return patterns.some(p => p.test(t))
}

/**
 * Extraer término del producto del mensaje (sin stop words, sin prefijos)
 * @param {string} message - Mensaje del usuario
 * @returns {string} - Término del producto extraído
 */
function extractProductTerm(message) {
  // Lista completa de stop words (palabras a eliminar)
  const stopWords = [
    'hay', 'stock', 'del', 'de', 'producto', 'productos', 'product', 'products', 'tienes', 'tiene', 
    'cuanto', 'cuánto', 'cuántas', 'cuántos', 'precio', 'precios', 'cuesta', 'vale', 
    'que', 'unidades', 'disponible', 'disponibles', 'tienen', 'el', 'la', 'los', 'las', 
    'hola', 'busco', 'buscando', 'llamado', 'llamada', 'nombre', 'articulo', 'articulos',
    'artículo', 'artículos', 'un', 'una', 'estoy', 'en', 'con', 'por', 'para', 'sobre',
    'desde', 'hasta', 'entre', 'durante', 'según', 'mediante', 'sin', 'bajo',
    'tiene', 'tienen', 'hay', 'existe', 'existen', 'tengas', 'tengamos',
    'necesito', 'necesita', 'necesitas', 'saber', 'si', 'quiero', 'quieres', 'quiere',
    'podria', 'podrías', 'podría', 'puedo', 'puedes', 'puede', 'me', 'te', 'le'
  ]
  
  // Detectar consultas genéricas sin término de producto específico
  const genericPatterns = [
    /necesito\s+saber\s+si\s+tienen\s+(un|el|la|los|las)?\s*producto/i,
    /quiero\s+saber\s+si\s+tienen\s+(un|el|la|los|las)?\s*producto/i,
    /tienen\s+(un|el|la|los|las)?\s*producto\s*$/i, // "tienen un producto" sin más contexto
    /hay\s+(un|el|la|los|las)?\s*producto\s*$/i, // "hay un producto" sin más contexto
    /tienen\s+productos?\s*$/i, // "tienen productos" o "tienen producto"
    /hola\s+tienen\s+productos?\s*$/i, // "hola tienen productos"
    /hay\s+productos?\s*$/i, // "hay productos" o "hay producto"
  ]
  
  // Si coincide con un patrón genérico, retornar vacío
  if (genericPatterns.some(pattern => pattern.test(message))) {
    return ''
  }
  
  // Remover prefijos comunes y patrones específicos (incl. "hola!" "hola?" para no tomar saludo como búsqueda)
  let cleaned = message
    .replace(/^hola[\s.!?¡¿,]+/gi, '') // Remover "hola" + puntuación al inicio
    .replace(/^hay\s+stock\s+de[:\s]*/gi, '') // "HAY STOCK DE:"
    .replace(/^stock\s+de[:\s]*/gi, '') // "STOCK DE:"
    .replace(/cuanto\s+cuesta\s+(el|la|los|las)?/gi, '')
    .replace(/cuál\s+es\s+el\s+precio\s+(de|del)?/gi, '')
    .replace(/estoy\s+buscando\s+(un|una|el|la)?\s*/gi, '')
    .replace(/producto\s+(llamado|llamada|nombre)\s*/gi, '')
    .replace(/necesito\s+saber\s+si\s+tienen\s*/gi, '') // Remover "necesito saber si tienen"
    .replace(/quiero\s+saber\s+si\s+tienen\s*/gi, '') // Remover "quiero saber si tienen"
    .replace(/^de\s+/gi, '') // Remover "de" al inicio
    .trim()
  
  // Normalizar texto (caracteres especiales, espacios múltiples)
  let normalized = normalizeSearchText(cleaned)
  
  // Dividir en palabras y filtrar
  let result = normalized
    .split(/\s+/)
    .filter(word => {
      // Mantener palabras que:
      // 1. Tienen más de 1 carácter
      // 2. No están en stop words
      // 3. No son solo números (a menos que sean parte de un SKU)
      return word.length > 1 && !stopWords.includes(word.toLowerCase())
    })
    .map(word => pluralToSingular(word)) // Convertir plurales a singulares
    .join(' ')
    .trim()
  
  // Remover "de" y otras preposiciones que puedan quedar al inicio después de la limpieza
  result = result.replace(/^(de|del|en|con|por|para)\s+/gi, '').trim()
  
  return result
}

/**
 * Detectar consultas específicas sobre la hora de almuerzo
 * DETECCIÓN REFORZADA: Captura todas las variaciones posibles de preguntas sobre hora de almuerzo
 * Incluye variaciones con/sin acentos, diferentes formas de preguntar, etc.
 * @param {string} message - Mensaje del usuario
 * @returns {boolean}
 */
function isLunchHoursQuery(message) {
  if (!message || typeof message !== 'string') return false;
  const text = message.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // Normalizar acentos
  
  // Palabras clave que deben aparecer (al menos una)
  const lunchKeywords = ['almuerzo', 'colacion', 'colación', 'break', 'lunch'];
  
  // Verificar si menciona alguna palabra clave relacionada con almuerzo
  const hasLunchKeyword = lunchKeywords.some(keyword => text.includes(keyword));
  
  if (!hasLunchKeyword) return false;
  
  // Patrones reforzados que capturan todas las variaciones posibles
  const lunchSpecificPatterns = [
    // Patrones directos con "almuerzo"
    /hora\s+de\s+almuerzo/i,
    /horario\s+de\s+almuerzo/i,
    /almuerzo/i,
    
    // Patrones con verbos de atención + almuerzo
    /(atienden|atendemos|atendeis|atenden|atendes|atendemos|atendeis)\s+(durante|en|a\s+la\s+hora\s+de|en\s+la\s+hora\s+de|al\s+momento\s+del)\s+.*almuerzo/i,
    /(atienden|atendemos|atendeis|atenden|atendes|atendemos|atendeis).*almuerzo/i,
    /almuerzo.*(atienden|atendemos|atendeis|atenden|atendes)/i,
    
    // Patrones con preguntas sobre atención
    /(se\s+atiende|se\s+atende|atienden|atendemos|atendeis)\s+(durante|en|a\s+la\s+hora\s+de|en\s+la\s+hora\s+de)\s+.*almuerzo/i,
    /(se\s+atiende|se\s+atende|atienden|atendemos|atendeis).*almuerzo/i,
    
    // Patrones con "hora" + "almuerzo" (en cualquier orden)
    /hora.*almuerzo|almuerzo.*hora/i,
    
    // Patrones con "colación" - REFORZADOS para capturar todas las variaciones
    /colaci[oó]n/i,
    /(atienden|atendemos|atendeis|se\s+atiende|se\s+atende).*colaci[oó]n/i,
    /colaci[oó]n.*(atienden|atendemos|atendeis|se\s+atiende|se\s+atende)/i,
    /hora\s+de\s+colaci[oó]n/i,
    /horario.*colaci[oó]n|colaci[oó]n.*horario/i,
    /(durante|en|a\s+la\s+hora\s+de|en\s+la\s+hora\s+de).*colaci[oó]n/i,
    /colaci[oó]n.*(durante|en|a\s+la\s+hora|en\s+la\s+hora)/i,
    /horario\s+de\s+atencion.*colaci[oó]n|colaci[oó]n.*horario\s+de\s+atencion/i,
    /atencion.*colaci[oó]n|colaci[oó]n.*atencion/i,
    
    // Patrones con preguntas directas
    /(atienden|atendemos|atendeis)\s+a\s+la\s+hora\s+de\s+almuerzo/i,
    /(atienden|atendemos|atendeis)\s+en\s+la\s+hora\s+de\s+almuerzo/i,
    /(atienden|atendemos|atendeis)\s+durante\s+el\s+almuerzo/i,
    /(atienden|atendemos|atendeis)\s+durante\s+la\s+hora\s+de\s+almuerzo/i,
    
    // Patrones con "si" (preguntas condicionales)
    /si\s+(atienden|atendemos|atendeis).*almuerzo/i,
    /si\s+se\s+(atiende|atende).*almuerzo/i,
    /si\s+(atienden|atendemos|atendeis).*colaci[oó]n/i,
    /si\s+se\s+(atiende|atende).*colaci[oó]n/i,
  ];
  
  return lunchSpecificPatterns.some(pattern => pattern.test(text));
}

/**
 * Respuesta fija y ENFÁTICA sobre horarios de atención
 * RESPUESTA REFORZADA: Debe ser clara que NO se atiende durante la hora de almuerzo
 * @returns {string}
 */
function getLunchHoursResponse() {
  return 'Atendemos de lunes a viernes de 9:42 a 14:00 y de 15:30 a 19:00 hrs. Los sábados de 10:00 a 13:00 hrs.\n\n⚠️ **IMPORTANTE: NO atendemos durante la hora de almuerzo (entre las 14:00 y 15:30 hrs).**';
}

// Sesiones de usuarios (en memoria, solo para estado conversacional)
const sessions = new Map()

/**
 * Obtener o crear sesión de usuario
 */
function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, {
      userId,
      state: STATES.IDLE,
      currentProduct: null,
      history: []
    })
  }
  return sessions.get(userId)
}

/**
 * Guardar mensaje en historial
 */
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

/**
 * Crear respuesta estándar
 */
function createResponse(message, state, options = null, cart = null) {
  // Formatear carrito para la respuesta
  const cartFormatted = cart && cart.items ? Object.values(cart.items) : (cart || {})
  
  return {
    botMessage: message,
    state,
    options,
    cart: cartFormatted
  }
}

/**
 * Determina si el usuario está pidiendo OTRO producto (SKU/término distinto al del contexto).
 * Si es así, no debemos reutilizar el producto en contexto y hay que hacer búsqueda real.
 * @param {string} message - Mensaje del usuario
 * @param {Object|null} contextProduct - Producto actual en contexto (session/context)
 * @param {Object} analisisOpenAI - Análisis de OpenAI (tipo, terminoProducto, sku, id)
 * @param {string|null} providedExplicitSku - SKU explícito detectado en el mensaje
 * @param {string|null} providedExplicitId - ID explícito detectado en el mensaje
 * @returns {boolean} - true si el usuario pide un producto distinto (no usar contexto)
 */
function userAsksForDifferentProduct(message, contextProduct, analisisOpenAI, providedExplicitSku, providedExplicitId) {
  if (!contextProduct) return false

  const contextSku = normalizeCode(contextProduct.sku || '')
  const contextId = String(contextProduct.id ?? '').trim()
  const contextNameNorm = normalizeSearchText(contextProduct.name || '')
  const contextSkuNorm = normalizeSearchText(contextProduct.sku || '')

  // Usuario menciona un SKU distinto al del producto en contexto → pedir búsqueda
  if (providedExplicitSku && normalizeCode(providedExplicitSku) !== contextSku) {
    // Si el producto en contexto no tiene SKU (ej. padre variable) pero el nombre contiene el SKU del mensaje → mismo producto
    if (!contextSku && contextNameNorm) {
      const providedNorm = normalizeSearchText(providedExplicitSku)
      if (providedNorm.length >= 2 && (contextNameNorm.includes(providedNorm) || contextSkuNorm.includes(providedNorm))) {
        return false
      }
    }
    return true
  }
  if (providedExplicitId && String(providedExplicitId).trim() !== contextId) {
    return true
  }
  if (analisisOpenAI?.sku && normalizeCode(analisisOpenAI.sku) !== contextSku) {
    if (!contextSku && contextNameNorm) {
      const skuNorm = normalizeSearchText(analisisOpenAI.sku)
      if (skuNorm.length >= 2 && (contextNameNorm.includes(skuNorm) || contextSkuNorm.includes(skuNorm))) {
        return false
      }
    }
    return true
  }
  if (analisisOpenAI?.id && String(analisisOpenAI.id).trim() !== contextId) {
    return true
  }

  // Término de búsqueda que no coincide con el producto en contexto → pedir búsqueda real
  const terminosGenericos = ['producto', 'productos', 'articulo', 'articulos', 'artículo', 'artículos', 'item', 'items', 'cosa', 'cosas', 'objeto', 'objetos']
  const term = (analisisOpenAI?.terminoProducto || extractProductTerm(message)).trim().toLowerCase()
  if (!term || terminosGenericos.includes(term)) return false

  const termNorm = normalizeSearchText(term)
  const combiContexto = `${contextNameNorm} ${contextSkuNorm}`.trim()
  let termInContext = combiContexto.length > 0 && (combiContexto.includes(termNorm) || termNorm.split(/\s+/).every(p => combiContexto.includes(p)))
  // Si no coincide literalmente, comprobar mapa de sinónimos/abreviaturas (solo para "término en contexto")
  if (!termInContext && combiContexto.length > 0 && TERMINO_SINONIMOS_CONTEXTO[termNorm]) {
    const canonicaNorm = normalizeSearchText(TERMINO_SINONIMOS_CONTEXTO[termNorm])
    if (canonicaNorm && combiContexto.includes(canonicaNorm)) {
      termInContext = true
    }
  }
  if (!termInContext) {
    console.log(`[WooCommerce] CANDIDATO_SINONIMO term="${termNorm}" contextProductName="${(contextProduct.name || '').substring(0, 60)}" contextProductSku="${contextProduct.sku || ''}" message="${(message || '').substring(0, 80)}"`)
    return true
  }
  // Filosofía: si el mensaje contiene un término de producto explícito (ej. "taza", "gorros") que NO está en el contexto, no usar contexto
  const termFromMessage = extractProductTerm(message).trim().toLowerCase()
  if (termFromMessage && !terminosGenericos.includes(termFromMessage)) {
    const termNormMsg = normalizeSearchText(termFromMessage)
    const inContextFromMsg = combiContexto.length > 0 && (combiContexto.includes(termNormMsg) || termNormMsg.split(/\s+/).every(p => combiContexto.includes(p)))
    if (!inContextFromMsg) {
      console.log(`[WooCommerce] Término explícito en mensaje ("${termFromMessage}") no coincide con contexto → búsqueda real`)
      return true
    }
  }
  return false
}

/**
 * Obtener contexto de historial reciente formateado para prompts de IA
 * @param {Object} session - Sesión del usuario
 * @param {number} limit - Número de mensajes recientes a incluir (default: 4)
 * @returns {string} - Contexto formateado o string vacío
 */
function getHistoryContext(session, limit = 4) {
  const recentHistory = session.history?.slice(-limit) || []
  if (recentHistory.length === 0) return ''
  
  return `\n\nCONTEXTO DE CONVERSACIÓN RECIENTE:\n${recentHistory.map(msg => 
    `- ${msg.sender === 'user' ? 'Cliente' : 'Bot'}: ${(msg.message || msg.text || '').substring(0, 100)}`
  ).join('\n')}`
}

/**
 * Formatear información de stock de un producto
 * @param {Object} product - Producto con stock_quantity y stock_status
 * @returns {string} - Información de stock formateada
 */
function formatStockInfo(product) {
  if (product.stock_quantity !== null && product.stock_quantity !== undefined) {
    const stockQty = parseStockQuantity(product.stock_quantity)
    return stockQty > 0 
      ? `${stockQty} unidad${stockQty !== 1 ? 'es' : ''}`
      : 'sin stock'
  }
  return product.stock_status === 'instock' ? 'disponible' : 'sin stock'
}

/** Devuelve true si el valor es un número válido (entero o decimal). Usado para stock y precio en prompts. */
function validarDatoNumerico(val) {
  if (val == null) return false
  const n = Number(val)
  return Number.isFinite(n)
}

/**
 * Parsea cantidad de stock a entero para mostrar (siempre unidades enteras).
 * Usa Number + Math.floor para que "5.5" → 5 de forma consistente; evita parseInt que solo trunca.
 * @param {*} val - stock_quantity (string o número)
 * @returns {number} Entero >= 0, o 0 si no es un número válido
 */
function parseStockQuantity(val) {
  if (val == null) return 0
  const n = Number(val)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.floor(n)
}

/** Límite de productos a enriquecer con stock de variaciones en listas (evita exceso de llamadas API) */
const MAX_PRODUCTS_TO_ENRICH_STOCK = 5

/**
 * Obtener texto de stock para un producto en una lista, usando dato precalculado de variaciones si existe.
 * Criterio único: si hay stock_quantity usarlo; si no, usar stockByProductId (suma variaciones o error).
 * @param {Object} p - Producto con id, stock_quantity, stock_status
 * @param {Object} stockByProductId - Map id -> { sum, error } (suma de variaciones o error al cargar)
 * @returns {string} - "X unidades", "sin stock" o "consultar stock"
 */
function getStockTextForListProduct(p, stockByProductId) {
  if (p.stock_quantity != null && p.stock_quantity !== undefined) {
    const q = parseStockQuantity(p.stock_quantity)
    const isValidNumber = Number.isFinite(Number(p.stock_quantity)) && Number(p.stock_quantity) >= 0
    if (isValidNumber) return q > 0 ? `${q} unidad${q !== 1 ? 'es' : ''}` : 'sin stock'
    // Valor no numérico (ej. "N/A"): usar stock_status o stockByProductId como fallback
  }
  const computed = stockByProductId[p.id]
  if (computed) {
    if (computed.error) return 'consultar stock'
    if (computed.sum > 0) return `${computed.sum} unidad${computed.sum !== 1 ? 'es' : ''}`
    return 'sin stock'
  }
  return p.stock_status === 'instock' ? 'consultar stock' : 'sin stock'
}

/**
 * Enriquecer stock para una lista de productos: en paralelo obtiene suma de variaciones para los que no tienen stock_quantity.
 * Límite: solo se enriquecen hasta MAX_PRODUCTS_TO_ENRICH_STOCK productos (evita exceso de llamadas API). Errores por producto no rompen la lista.
 * @param {Array} productListSlice - Subarray de productos (ej. finalSearchResults.slice(0, MAX_PRODUCTS_TO_ENRICH_STOCK))
 * @returns {Promise<Object>} stockByProductId: { [id]: { sum, error } }
 */
async function enrichStockForListProducts(productListSlice) {
  const stockByProductId = {}
  const toEnrich = (productListSlice || [])
    .filter(p => p && (p.stock_quantity == null || p.stock_quantity === undefined) && p.id)
    .slice(0, MAX_PRODUCTS_TO_ENRICH_STOCK)
  if (toEnrich.length === 0) return stockByProductId
  try {
    const stockResults = await Promise.all(
      toEnrich.map(p =>
        wordpressService.getProductVariations(p.id)
          .then(variations => {
            const sum = (variations || []).reduce((acc, v) => acc + parseStockQuantity(v.stock_quantity), 0)
            return { id: p.id, sum, error: false }
          })
          .catch(err => {
            console.error(`[WooCommerce] Error obteniendo variaciones para lista (producto ${p.id}):`, err?.message)
            return { id: p.id, sum: null, error: true }
          })
      )
    )
    stockResults.forEach(r => { stockByProductId[r.id] = r })
  } catch (err) {
    console.error('[WooCommerce] Error en enriquecimiento de stock para lista:', err?.message)
  }
  return stockByProductId
}

/**
 * Formatear lista de productos para prompts de IA
 * @param {Array} products - Array de productos o items con productos
 * @param {Object} options - Opciones de formateo
 * @returns {string} - Lista de productos formateada
 */
function formatProductsList(products, options = {}) {
  const {
    includeVariants = false,
    variantAttribute = null,
    variantValues = null,
    startIndex = 1
  } = options
  
  return products.map((item, index) => {
    const p = item.product || item
    const stockInfo = formatStockInfo(p)
    const baseInfo = `${index + startIndex}. ${p.name}${p.sku ? ` (SKU: ${p.sku})` : ''}${p.price ? ` - $${parseFloat(p.price).toLocaleString('es-CL')}` : ''} - Stock: ${stockInfo}`
    
    if (includeVariants && variantAttribute && variantValues) {
      const variantsStr = Array.isArray(variantValues) ? variantValues.join(', ') : variantValues
      return `${baseInfo}\n   ${variantAttribute.charAt(0).toUpperCase() + variantAttribute.slice(1)}s disponibles: ${variantsStr}`
    }
    
    return baseInfo
  }).join(includeVariants ? '\n\n' : '\n')
}

/**
 * Inicializar chat para usuario (ASYNC)
 */
export async function initChat(userId) {
  const session = getSession(userId)
  const cart = await cartService.getCart(userId)
  
  // Verificar si hay stock cargado
  const stockLoaded = await stockService.isStockLoaded()
  if (!stockLoaded) {
    return createResponse(
      '¡Hola! 👋 Soy tu asistente de pedidos B2B.\n\n¿Qué deseas hacer?',
      session.state,
      null,
      cart
    )
  }
  
  let welcomeMessage = '¡Hola! 👋 Soy tu asistente de pedidos B2B.\n\n'
  
  if (session.state === STATES.IDLE) {
    welcomeMessage += '¿Qué deseas hacer?'
    
    const options = [
      { type: 'action', value: ACTIONS.START_ORDER, label: '🛒 Iniciar Pedido' }
    ]
    
    const cartItems = cart.items || {}
    if (Object.keys(cartItems).length > 0) {
      welcomeMessage = `¡Hola! 👋 Tienes ${Object.keys(cartItems).length} producto(s) en tu carrito.\n\n¿Qué deseas hacer?`
      options.push({ type: 'action', value: ACTIONS.VIEW_CART, label: '📋 Ver Carrito' })
      options.push({ type: 'action', value: ACTIONS.FINISH_ORDER, label: '✅ Finalizar Pedido' })
    }
    
    addToHistory(session, 'bot', welcomeMessage)
    return createResponse(welcomeMessage, session.state, options, cart)
  }
  
  welcomeMessage += `Tienes un pedido en curso.\n¿Deseas continuar o cancelar?`
  
  addToHistory(session, 'bot', welcomeMessage)
  return createResponse(
    welcomeMessage,
    session.state,
    [
      { type: 'action', value: ACTIONS.VIEW_CART, label: '📋 Ver Carrito' },
      { type: 'action', value: ACTIONS.CANCEL_ORDER, label: '❌ Cancelar Pedido' }
    ],
    cart
  )
}

/**
 * Procesar acción del usuario (ASYNC)
 */
export async function processAction(userId, actionType, value = null) {
  const session = getSession(userId)
  const cart = await cartService.getCart(userId)
  
  // Validar acción
  if (!Object.values(ACTIONS).includes(actionType)) {
    return createResponse(
      `Acción no reconocida: ${actionType}`,
      session.state,
      null,
      cart
    )
  }
  
  // Registrar acción
  addToHistory(session, 'user', `${actionType}${value ? `: ${value}` : ''}`)
  
  // Acciones globales
  if (actionType === ACTIONS.VIEW_CART) {
    return await handleViewCart(session, cart)
  }
  
  if (actionType === ACTIONS.CANCEL_ORDER) {
    return await handleCancelOrder(session, userId)
  }
  
  // Procesar según estado
  switch (session.state) {
    case STATES.IDLE:
      return await handleIdleState(session, actionType, value, cart, userId)
    
    case STATES.WAITING_PRODUCT:
      return await handleWaitingProductState(session, actionType, value, cart, userId)
    
    case STATES.WAITING_QUANTITY:
      return await handleWaitingQuantityState(session, actionType, value, cart, userId)
    
    case STATES.CONFIRMATION:
      return await handleConfirmationState(session, actionType, value, cart, userId)
    
    case STATES.FINISHED:
      session.state = STATES.IDLE
      return await handleIdleState(session, actionType, value, cart, userId)
    
    default:
      return createResponse(
        'Estado desconocido. Reiniciando...',
        STATES.IDLE,
        [{ type: 'action', value: ACTIONS.START_ORDER, label: '🛒 Iniciar Pedido' }],
        cart
      )
  }
}

/**
 * Manejar estado IDLE (ASYNC)
 */
async function handleIdleState(session, actionType, value, cart, userId) {
  if (actionType === ACTIONS.START_ORDER) {
    session.state = STATES.WAITING_PRODUCT
    
    try {
      const products = await stockService.getAllProducts()
      
      if (!products || products.length === 0) {
        const message = `⚠️ No hay productos disponibles en este momento.\n\nPor favor contacta al administrador para cargar el stock.`
        addToHistory(session, 'bot', message)
        session.state = STATES.IDLE
        return createResponse(
          message,
          session.state,
          [{ type: 'action', value: ACTIONS.START_ORDER, label: '🔄 Reintentar' }],
          cart
        )
      }
      
      const productOptions = products.slice(0, 8).map(p => ({
        type: 'product',
        value: p.codigo || p.sku,
        label: `${p.codigo || p.sku} - ${p.nombre || p.name}`,
        stock: p.stock || 0
      }))
      
      const message = `¡Perfecto! Iniciemos tu pedido.\n\nSelecciona un producto:`
      addToHistory(session, 'bot', message)
      
      return createResponse(
        message,
        session.state,
        [
          ...productOptions,
          { type: 'action', value: ACTIONS.SEARCH_PRODUCT, label: '🔍 Buscar otro' }
        ],
        cart
      )
    } catch (error) {
      console.error('Error obteniendo productos:', error)
      const message = `❌ Error al cargar productos: ${error.message}\n\nPor favor intenta más tarde.`
      addToHistory(session, 'bot', message)
      session.state = STATES.IDLE
      return createResponse(
        message,
        session.state,
        [{ type: 'action', value: ACTIONS.START_ORDER, label: '🔄 Reintentar' }],
        cart
      )
    }
  }
  
  const cartItems = cart.items || {}
  if (actionType === ACTIONS.FINISH_ORDER && Object.keys(cartItems).length > 0) {
    return await handleFinishOrder(session, userId, cart)
  }
  
  return createResponse(
    'Para comenzar, inicia un nuevo pedido.',
    session.state,
    [{ type: 'action', value: ACTIONS.START_ORDER, label: '🛒 Iniciar Pedido' }],
    cart
  )
}

/**
 * Manejar estado WAITING_PRODUCT (ASYNC)
 */
async function handleWaitingProductState(session, actionType, value, cart, userId) {
  if (actionType === ACTIONS.SELECT_PRODUCT && value) {
    const product = await stockService.getProduct(value)
    
    if (!product) {
      const message = `❌ Producto "${value}" no encontrado.\n\nIntenta con otro:`
      addToHistory(session, 'bot', message)
      
      return createResponse(message, session.state, await getProductOptions(), cart)
    }
    
    session.currentProduct = product
    session.state = STATES.WAITING_QUANTITY
    
    const message = `📦 **${product.codigo || product.sku}**\n${product.nombre || product.name}\n\n✅ Stock disponible: ${product.stock.toLocaleString()} unidades\n\n¿Cuántas unidades deseas?`
    addToHistory(session, 'bot', message)
    
    const suggestedQtys = [10, 50, 100, 500].filter(q => q <= product.stock)
    
    return createResponse(
      message,
      session.state,
      [
        ...suggestedQtys.map(q => ({
          type: 'quantity',
          value: q,
          label: `${q.toLocaleString()} unidades`
        })),
        { type: 'action', value: ACTIONS.CANCEL_ORDER, label: '❌ Cancelar' }
      ],
      cart
    )
  }
  
  if (actionType === ACTIONS.SEARCH_PRODUCT && value) {
    const results = await stockService.searchProducts(value)
    
    if (results.length === 0) {
      const message = `No encontré productos para "${value}".\n\nIntenta con otro término:`
      addToHistory(session, 'bot', message)
      return createResponse(message, session.state, await getProductOptions(), cart)
    }
    
    const productOptions = results.slice(0, 8).map(p => ({
      type: 'product',
      value: p.codigo || p.sku,
      label: `${p.codigo || p.sku} - ${p.nombre || p.name}`,
      stock: p.stock
    }))
    
    const message = `Encontré ${results.length} producto(s):\n\nSelecciona uno:`
    addToHistory(session, 'bot', message)
    
    return createResponse(message, session.state, productOptions, cart)
  }
  
  return createResponse(
    'Selecciona un producto de la lista o busca por código.',
    session.state,
    await getProductOptions(),
    cart
  )
}

/**
 * Manejar estado WAITING_QUANTITY (ASYNC)
 */
async function handleWaitingQuantityState(session, actionType, value, cart, userId) {
  if (actionType === ACTIONS.SET_QUANTITY && value) {
    const cantidad = parseInt(value, 10)
    
    if (isNaN(cantidad) || cantidad <= 0) {
      const message = '❌ Cantidad inválida. Ingresa un número mayor a 0:'
      addToHistory(session, 'bot', message)
      
      return createResponse(
        message,
        session.state,
        [
          { type: 'quantity', value: 10, label: '10 unidades' },
          { type: 'quantity', value: 50, label: '50 unidades' },
          { type: 'quantity', value: 100, label: '100 unidades' }
        ],
        cart
      )
    }
    
    const product = session.currentProduct
    const stockCheck = await stockService.checkStock(product.codigo || product.sku, cantidad)
    
    if (!stockCheck.available) {
      const availableStock = stockCheck.stockDisponible || stockCheck.currentStock || 0
      const message = `⚠️ ${stockCheck.message}\n\n¿Deseas agregar ${availableStock.toLocaleString()} unidades (todo el disponible)?`
      addToHistory(session, 'bot', message)
      
      return createResponse(
        message,
        session.state,
        [
          { type: 'quantity', value: availableStock, label: `✅ Agregar ${availableStock.toLocaleString()}` },
          { type: 'action', value: ACTIONS.CANCEL_ORDER, label: '❌ Elegir otro' }
        ],
        cart
      )
    }
    
    // Agregar al carrito
    await cartService.addToCart(
      userId, 
      product.codigo || product.sku, 
      product.nombre || product.name, 
      cantidad
    )
    const updatedCart = await cartService.getCart(userId)
    
    session.currentProduct = null
    session.state = STATES.CONFIRMATION
    
    const cartItems = updatedCart.items || {}
    const totalItems = Object.values(cartItems).reduce((sum, item) => sum + (item.cantidad || 0), 0)
    
    const message = `✅ Agregado al carrito:\n${cantidad.toLocaleString()} x ${product.codigo || product.sku}\n\n📋 Total: ${totalItems.toLocaleString()} unidades\n\n¿Qué deseas hacer?`
    addToHistory(session, 'bot', message)
    
    return createResponse(
      message,
      session.state,
      [
        { type: 'action', value: ACTIONS.ADD_MORE, label: '➕ Agregar otro producto' },
        { type: 'action', value: ACTIONS.VIEW_CART, label: '📋 Ver carrito' },
        { type: 'action', value: ACTIONS.FINISH_ORDER, label: '✅ Finalizar pedido' }
      ],
      updatedCart
    )
  }
  
  return createResponse(
    'Ingresa la cantidad deseada:',
    session.state,
    [
      { type: 'quantity', value: 10, label: '10 unidades' },
      { type: 'quantity', value: 50, label: '50 unidades' },
      { type: 'quantity', value: 100, label: '100 unidades' }
    ],
    cart
  )
}

/**
 * Manejar estado CONFIRMATION (ASYNC)
 */
async function handleConfirmationState(session, actionType, value, cart, userId) {
  if (actionType === ACTIONS.ADD_MORE) {
    session.state = STATES.WAITING_PRODUCT
    
    const message = 'Perfecto, agreguemos otro producto.\n\nSelecciona o busca:'
    addToHistory(session, 'bot', message)
    
    return createResponse(message, session.state, await getProductOptions(), cart)
  }
  
  if (actionType === ACTIONS.FINISH_ORDER) {
    return await handleFinishOrder(session, userId, cart)
  }
  
  return createResponse(
    '¿Qué deseas hacer?',
    session.state,
    [
      { type: 'action', value: ACTIONS.ADD_MORE, label: '➕ Agregar otro' },
      { type: 'action', value: ACTIONS.FINISH_ORDER, label: '✅ Finalizar pedido' }
    ],
    cart
  )
}

/**
 * Finalizar pedido (ASYNC)
 */
async function handleFinishOrder(session, userId, cart) {
  const cartItems = cart.items || {}
  if (Object.keys(cartItems).length === 0) {
    const message = '❌ Tu carrito está vacío. Agrega productos primero.'
    addToHistory(session, 'bot', message)
    
    session.state = STATES.IDLE
    return createResponse(
      message,
      session.state,
      [{ type: 'action', value: ACTIONS.START_ORDER, label: '🛒 Iniciar Pedido' }],
      cart
    )
  }
  
  // Obtener items para el pedido
  const items = await cartService.getItemsForOrder(userId)
  
  // Generar pedido
  const order = await orderService.createOrder(userId, items)
  
  // Limpiar carrito
  await cartService.clearCart(userId)
  
  // Resetear sesión
  session.state = STATES.FINISHED
  session.currentProduct = null
  
  // Formatear resumen
  const itemsSummary = items
    .map(item => `• ${item.cantidad.toLocaleString()} x ${item.codigo}`)
    .join('\n')
  
  const message = `🎉 ¡Pedido confirmado!\n\n📄 N° Pedido: ${order.orderId}\n\n${itemsSummary}\n\n📧 Recibirás confirmación por email.\n\n¡Gracias por tu pedido!`
  addToHistory(session, 'bot', message)
  
  return createResponse(
    message,
    STATES.IDLE,
    [{ type: 'action', value: ACTIONS.START_ORDER, label: '🛒 Nuevo Pedido' }],
    {}
  )
}

/**
 * Ver carrito (ASYNC)
 */
async function handleViewCart(session, cart) {
  const cartItems = cart.items || {}
  if (Object.keys(cartItems).length === 0) {
    const message = '🛒 Tu carrito está vacío.'
    addToHistory(session, 'bot', message)
    
    return createResponse(
      message,
      session.state,
      [{ type: 'action', value: ACTIONS.START_ORDER, label: '🛒 Iniciar Pedido' }],
      cart
    )
  }
  
  const items = Object.values(cartItems)
  const totalItems = items.reduce((sum, item) => sum + (item.cantidad || 0), 0)
  
  const cartSummary = items
    .map(item => `• ${item.cantidad.toLocaleString()} x ${item.codigo || item.sku} - ${item.nombre || item.name}`)
    .join('\n')
  
  const message = `📋 **Tu Carrito:**\n\n${cartSummary}\n\n📦 Total: ${totalItems.toLocaleString()} unidades`
  addToHistory(session, 'bot', message)
  
  return createResponse(
    message,
    session.state,
    [
      { type: 'action', value: ACTIONS.ADD_MORE, label: '➕ Agregar más' },
      { type: 'action', value: ACTIONS.FINISH_ORDER, label: '✅ Finalizar pedido' },
      { type: 'action', value: ACTIONS.CANCEL_ORDER, label: '❌ Vaciar carrito' }
    ],
    cart
  )
}

/**
 * Cancelar pedido (ASYNC)
 */
async function handleCancelOrder(session, userId) {
  await cartService.clearCart(userId)
  session.state = STATES.IDLE
  session.currentProduct = null
  
  const message = '❌ Pedido cancelado. Carrito vaciado.\n\n¿Deseas iniciar uno nuevo?'
  addToHistory(session, 'bot', message)
  
  return createResponse(
    message,
    STATES.IDLE,
    [{ type: 'action', value: ACTIONS.START_ORDER, label: '🛒 Iniciar Pedido' }],
    {}
  )
}

/**
 * Obtener opciones de productos (ASYNC)
 */
async function getProductOptions() {
  try {
    const products = await stockService.getAllProducts()
    
    if (!products || products.length === 0) {
      return [
        { type: 'action', value: ACTIONS.SEARCH_PRODUCT, label: '🔍 Buscar producto' }
      ]
    }
    
    return [
      ...products.slice(0, 8).map(p => ({
        type: 'product',
        value: p.codigo || p.sku,
        label: `${p.codigo || p.sku} - ${p.nombre || p.name}`,
        stock: p.stock || 0
      })),
      { type: 'action', value: ACTIONS.SEARCH_PRODUCT, label: '🔍 Buscar otro' }
    ]
  } catch (error) {
    console.error('Error en getProductOptions:', error)
    return [
      { type: 'action', value: ACTIONS.SEARCH_PRODUCT, label: '🔍 Buscar producto' }
    ]
  }
}

/**
 * Obtener historial del chat
 */
export function getChatHistory(userId) {
  const session = getSession(userId)
  return session.history
}

/**
 * Obtener estado actual
 */
export function getState(userId) {
  const session = getSession(userId)
  return {
    state: session.state,
    currentProduct: session.currentProduct
  }
}

// Legacy exports para compatibilidad (ASYNC)
export async function processMessage(userId, message, data = {}) {
  // Convertir mensaje antiguo a acción
  if (message === '/start') {
    return await processAction(userId, ACTIONS.START_ORDER)
  }
  if (data.sku) {
    return await processAction(userId, ACTIONS.SELECT_PRODUCT, data.sku)
  }
  if (data.cantidad) {
    return await processAction(userId, ACTIONS.SET_QUANTITY, data.cantidad)
  }
  return await processAction(userId, message)
}

export async function resetSession(userId) {
  return await processAction(userId, ACTIONS.CANCEL_ORDER)
}

/**
 * Procesar mensaje de texto libre con IA
 * OpenAI analiza la intención y el backend ejecuta según la decisión
 * @param {string} userId - ID del usuario
 * @param {string} message - Mensaje del usuario
 * @returns {Promise<Object>} Respuesta con mensaje de IA
 */
export async function processMessageWithAI(userId, message, options = {}) {
  try {
    const session = getSession(userId)
    let cart = { items: {} } // Carrito vacío por defecto
    
    // Intentar obtener carrito de la base de datos (si PostgreSQL está disponible)
    try {
      cart = await cartService.getCart(userId)
    } catch (error) {
      // Si falla la conexión a PostgreSQL, usar carrito vacío
      // El chat básico puede funcionar sin base de datos
      console.warn('⚠️ No se pudo obtener carrito (PostgreSQL no disponible):', error.message)
      cart = { items: {} }
    }
    
    // Agregar mensaje del usuario al historial
    addToHistory(session, 'user', message)
    
    // Detección temprana de corrección/queja: si el usuario corrige o se queja y hay producto en contexto, responder con disculpa y aclaración
    const msgLower = (typeof message === 'string' ? message : '').toLowerCase().trim()
    const looksLikeCorrectionOrComplaint = /\b(no es eso|es un lápiz|es un lapiz|no te pedí|no te pedi|info errónea|info erronea|por qué diste|por que diste|reiteré|reitero|aún así|aun asi|diste info errónea|no tiene nada que ver|no tiene nada que ver\.|por qué me la das|por que me la das)\b/i.test(msgLower) ||
      /no te pedí la descripción|te dije que el producto|lo reiteré/i.test(msgLower)
    if (looksLikeCorrectionOrComplaint && session.currentProduct) {
      const nombreProd = session.currentProduct.name || 'el producto'
      const skuProd = session.currentProduct.sku || ''
      const respuesta = skuProd
        ? `Entendido, disculpa la confusión. En nuestro sistema el producto "${nombreProd}" está registrado con SKU ${skuProd}. Si buscas otro producto distinto, ¿me das el nombre o SKU?`
        : `Entendido, disculpa la confusión. En nuestro sistema el producto está registrado como "${nombreProd}". Si buscas otro producto distinto, ¿me das el nombre o SKU?`
      addToHistory(session, 'bot', respuesta)
      return createResponse(respuesta, session.state, null, cart)
    }
    
    // Verificación temprana de consultas específicas sobre hora de almuerzo (RESPUESTA FIJA)
    // Esta verificación debe ser ANTES del procesamiento con IA para evitar respuestas incorrectas
    if (isLunchHoursQuery(message)) {
      const lunchResponse = getLunchHoursResponse()
      addToHistory(session, 'bot', lunchResponse)
      return createResponse(lunchResponse, session.state, null, cart)
    }
    
    // Validación de acceso: precios, stock y cotización solo para usuarios con cuenta aprobada.
    // Pruebas: CHAT_AUTH_AS_LOGGED_IN !== 'false' → todos como logueados. A futuro: options.isLoggedIn desde validación de token.
    const isLoggedIn = resolveIsLoggedIn(options)
    const user = { email: 'cesar.barahona@conkavo.cl', role: 'agent' }
  
    // Construir contexto para el agente de IA
    const context = {
      state: session.state,
      cart: cart,
      currentProduct: session.currentProduct,
      isLoggedIn: isLoggedIn,
      user: user,
      companyInfo: companyInfoService.formatCompanyInfoForAgent()
    }
    
    // ============================================
    // ARQUITECTURA: OpenAI como ORQUESTADOR
    // ============================================
    // 1. Detectar SKU/ID explícito por regex (rápido, sin IA)
    // 2. Para todo lo demás, OpenAI analiza y decide
    // 3. Backend ejecuta según decisión de OpenAI
    // ============================================
    
    const explicitSkuMatch = message.match(/(?:sku|SKU)[:\s]+([^\s]+)/i)
    const explicitIdMatch = message.match(/(?:id|ID)[:\s]+(\d+)/i)
    
    let providedExplicitSku = null
    let rawExplicitSku = null // SKU sin normalizar (para B11-1, etc.)
    let providedExplicitId = null
    let analisisOpenAI = null
    let queryType = 'OTRO' // PRODUCTOS, INFORMACION_GENERAL, AMBIGUA, OTRO
    
    // Si hay SKU/ID explícito por regex, usarlo directamente (rápido, sin IA)
    if (explicitSkuMatch) {
      const rawSku = explicitSkuMatch[1].trim().replace(/[?¿!.,]+$/g, '').trim()
      rawExplicitSku = rawSku
      // Normalizar para comparaciones; búsqueda puede probar raw si tiene guión/punto
      providedExplicitSku = normalizeCode(rawSku)
      queryType = 'PRODUCTOS'
      console.log(`[WooCommerce] 🔍 SKU explícito detectado: "${rawSku}" → normalizado: "${providedExplicitSku}" → Consulta directa sin análisis de IA`)
    }
    if (explicitIdMatch) {
      providedExplicitId = explicitIdMatch[1].trim()
      queryType = 'PRODUCTOS'
      console.log(`[WooCommerce] 🔍 ID explícito detectado por regex: "${providedExplicitId}" → Consulta directa sin análisis de IA`)
    }
    
    // Fortificación: mensaje incomprensible (solo puntuación/símbolos o sin palabras útiles) → respuesta fija; no tratar códigos tipo L70, K62, B11-1 como gibberish
    const msgTrim = (typeof message === 'string' ? message : '').trim()
    const alphaOnly = msgTrim.replace(/[^a-zA-ZáéíóúñÁÉÍÓÚÑüÜ]/g, '')
    const onlyPunctuationOrSymbols = /^[\s\p{P}\?¿!…]+$/u.test(msgTrim)
    const looksLikeProductCode = msgTrim.length >= 2 && msgTrim.length <= 15 && (
      /\b[A-Za-z]\d+[A-Za-z]?[-.]?\d*\b/.test(msgTrim) || // L70, K62, B11-1
      /\b\d{5,}\b/.test(msgTrim) // 591074100
    )
    if (msgTrim.length > 0 && (onlyPunctuationOrSymbols || (alphaOnly.length < 2 && !looksLikeProductCode))) {
      console.log(`[WooCommerce] ⚠️ Mensaje no interpretable detectado (gibberish) → respuesta genérica`)
      return createResponse(
        'No entendí tu mensaje. ¿Puedes repetirlo o decirme en qué te ayudo?',
        session.state,
        null,
        cart
      )
    }
    
    // Puerta dura de genéricos: sin SKU/ID explícito, si el mensaje es puramente genérico → respuesta de ayuda, sin OpenAI ni WooCommerce
    if (!providedExplicitSku && !providedExplicitId) {
      const normGeneric = normalizeForGenericGate(message)
      if (normGeneric.length > 0 && GENERIC_PHRASES_SET.has(normGeneric)) {
        console.log(`[WooCommerce] ⚠️ Mensaje genérico (puerta dura) → respuesta de ayuda sin OpenAI/WP`)
        return createResponse(
          '¡Hola! ¿En qué puedo ayudarte? Puedes preguntarme por un producto (nombre o SKU), stock, precios, o información de la empresa.',
          session.state,
          null,
          cart
        )
      }
    }
    
    // Sin bypass por regex: la IA siempre clasifica cuando no hay SKU/ID explícito (prioridad: respuestas correctas)
    if (!providedExplicitSku && !providedExplicitId) {
      const msgStr = (typeof message === 'string' ? message : '').trim()
      if (isDevolucionRequest(msgStr)) {
        queryType = 'DEVOLUCION'
        console.log(`[WooCommerce] Detección temprana: DEVOLUCION`)
      } else if (isHumanoRequest(msgStr)) {
        queryType = 'DERIVACION_HUMANO'
        console.log(`[WooCommerce] Detección temprana: DERIVACION_HUMANO`)
      } else if (isReclamoRequest(msgStr)) {
        queryType = 'RECLAMO'
        console.log(`[WooCommerce] Detección temprana: RECLAMO`)
      }
      if (queryType !== 'DERIVACION_HUMANO' && queryType !== 'RECLAMO' && queryType !== 'DEVOLUCION') {
      console.log(`[WooCommerce] 🤖 Consulta sin SKU/ID explícito → OpenAI analizará intención...`)
      
      try {
        const recentHistory = session.history?.slice(-10) || []
        const currentProductForAI = context.currentProduct || session.currentProduct || null
        analisisOpenAI = await conkavoAI.analizarIntencionConsulta(message, recentHistory, currentProductForAI)
        
        // Validar que el análisis de OpenAI sea válido
        if (!analisisOpenAI || typeof analisisOpenAI !== 'object') {
          throw new Error('Análisis de OpenAI inválido: respuesta no es objeto')
        }
        
        const tiposValidos = ['PRODUCTO', 'INFORMACION_GENERAL', 'AMBIGUA', 'VARIANTE', 'CARACTERISTICAS', 'FALLBACK', 'RECLAMO', 'DERIVACION_HUMANO', 'RECOMENDACION']
        if (!tiposValidos.includes(analisisOpenAI.tipo)) {
          console.error(`[WooCommerce] ⚠️ Tipo de consulta inválido de OpenAI: "${analisisOpenAI.tipo}"`)
          analisisOpenAI.tipo = 'AMBIGUA' // Fallback conservador
          analisisOpenAI.necesitaMasInfo = true
        }
        
        // Mapear tipos de OpenAI a queryType interno
        queryType = analisisOpenAI.tipo === 'PRODUCTO' ? 'PRODUCTOS' : 
                   analisisOpenAI.tipo === 'INFORMACION_GENERAL' ? 'INFORMACION_GENERAL' : 
                   analisisOpenAI.tipo === 'VARIANTE' ? 'VARIANTE' :
                   analisisOpenAI.tipo === 'CARACTERISTICAS' ? 'CARACTERISTICAS' :
                   analisisOpenAI.tipo === 'FALLBACK' ? 'FALLBACK' :
                   analisisOpenAI.tipo === 'RECLAMO' ? 'RECLAMO' :
                   analisisOpenAI.tipo === 'DERIVACION_HUMANO' ? 'DERIVACION_HUMANO' :
                   analisisOpenAI.tipo === 'RECOMENDACION' ? 'RECOMENDACION' :
                   'AMBIGUA'
        
        console.log(`[WooCommerce] 🤖 OpenAI decidió: tipo=${queryType}, término=${analisisOpenAI.terminoProducto || 'N/A'}, SKU=${analisisOpenAI.sku || 'N/A'}, ID=${analisisOpenAI.id || 'N/A'}, necesitaMásInfo=${analisisOpenAI.necesitaMasInfo}`)
        
        // No usar SKU/ID del contexto si el mensaje actual NO los menciona (evita "bamboo" → responder con Llavero anterior)
        const msgNorm = (typeof message === 'string' ? message : '').trim().toLowerCase()
        if (analisisOpenAI.sku && msgNorm.length > 0) {
          const skuStr = String(analisisOpenAI.sku).trim()
          if (!msgNorm.includes(skuStr.toLowerCase())) {
            analisisOpenAI.sku = null
            console.log(`[WooCommerce] ⚠️ SKU "${skuStr}" no está en el mensaje; usando solo término "${analisisOpenAI.terminoProducto || 'N/A'}" para búsqueda`)
          }
        }
        if (analisisOpenAI.id && msgNorm.length > 0) {
          const idStr = String(analisisOpenAI.id).trim()
          if (!msgNorm.includes(idStr.toLowerCase())) {
            analisisOpenAI.id = null
            console.log(`[WooCommerce] ⚠️ ID "${idStr}" no está en el mensaje; ignorando`)
          }
        }
        
        // Si OpenAI detectó SKU/ID que el regex no detectó, usarlo (ya validado contra el mensaje)
        if (analisisOpenAI.sku && !providedExplicitSku) {
          providedExplicitSku = analisisOpenAI.sku
          if (/[-.\s]/.test(String(analisisOpenAI.sku))) {
            rawExplicitSku = analisisOpenAI.sku
          }
          console.log(`[WooCommerce] ✅ OpenAI detectó SKU: "${providedExplicitSku}"`)
        }
        if (analisisOpenAI.id && !providedExplicitId) {
          providedExplicitId = analisisOpenAI.id
          console.log(`[WooCommerce] ✅ OpenAI detectó ID: "${providedExplicitId}"`)
        }
        
        // Guardar análisis en context para uso posterior
        context.analisisOpenAI = analisisOpenAI
        context.terminoProductoParaBuscar = analisisOpenAI.terminoProducto || null
        
      } catch (error) {
        console.error(`[WooCommerce] ❌ Error crítico analizando con OpenAI:`, error.message)
        // Fallback conservador: tratar como ambigua y pedir más información
        queryType = 'AMBIGUA'
        analisisOpenAI = {
          tipo: 'AMBIGUA',
          terminoProducto: null,
          sku: null,
          id: null,
          atributo: null,
          valorAtributo: null,
          tipoFallback: null,
          necesitaMasInfo: true,
          razon: 'Error al analizar, se requiere más información para evitar errores'
        }
        context.analisisOpenAI = analisisOpenAI
      }
      }
    }
    
    // Actualizar queryType en context
    context.queryType = queryType
    
    // Variables para resultados de productos
    // CRÍTICO: Usar producto del contexto si existe (para preguntas de seguimiento como "tienes en mas colores?")
    let productStockData = session.currentProduct || context.currentProduct || null
    let productSearchResults = []
    // Si el usuario preguntó por SKU/ID explícito, solo limpiar contexto si es un SKU/ID DISTINTO al producto actual (mantener contexto si confirma el mismo)
    const skuMatchesContext = providedExplicitSku && productStockData?.sku && normalizeCode(providedExplicitSku) === normalizeCode(productStockData.sku)
    const idMatchesContext = providedExplicitId && productStockData?.id != null && String(providedExplicitId).trim() === String(productStockData.id).trim()
    if (providedExplicitSku || providedExplicitId) {
      if (skuMatchesContext || idMatchesContext) {
        console.log(`[WooCommerce] 🔄 SKU/ID coincide con producto en contexto → manteniendo contexto (${productStockData?.name || 'N/A'})`)
        // Mantener productStockData; no limpiar
      } else {
        productStockData = null
        context.productStockData = null
        context.productVariations = null
        console.log(`[WooCommerce] 🔄 SKU/ID explícito distinto al contexto → búsqueda por SKU/ID (no contexto)`)
      }
    }
    // Si hay producto en contexto, comprobar si el usuario pide OTRO producto (SKU/término distinto)
    // No aplicar cuando la IA ya clasificó como INFORMACION_GENERAL: así no desviamos "¿dirección?" a búsqueda de productos
    if (queryType !== 'INFORMACION_GENERAL' && productStockData && userAsksForDifferentProduct(message, productStockData, analisisOpenAI, providedExplicitSku, providedExplicitId)) {
      console.log(`[WooCommerce] 🔄 Usuario pide producto distinto al del contexto (${productStockData.sku || productStockData.name}); se hará búsqueda real`)
      productStockData = null
      context.productStockData = null
      context.productVariations = null
      session.currentProduct = null
      session.productVariations = null
    }
    if (productStockData) {
      context.productStockData = productStockData
      // CRÍTICO: Cargar variaciones de sesión solo si pertenecen al producto actual (evitar usar variaciones de otro producto)
      // Si el producto en contexto es una variación, comparar por parent_id; si es padre, por id.
      const productId = productStockData.parent_id || productStockData.id
      const sessionVariationsBelongToProduct = session.productVariations && session.productVariations.length > 0 &&
        (session.productVariations[0].parent_id === productId || session.productVariations[0].parent === productId)
      if (sessionVariationsBelongToProduct && !context.productVariations) {
        context.productVariations = session.productVariations
        console.log(`[WooCommerce] 🔄 Cargadas ${session.productVariations.length} variaciones de sesión para producto del contexto`)
      }
      console.log(`[WooCommerce] 🔄 Usando producto del contexto: ${productStockData.name || 'N/A'} (SKU: ${productStockData.sku || 'N/A'})`)
    }
    
    // Inicializar flags de validación de variantes (para evitar undefined)
    if (queryType === 'VARIANTE') {
      context.varianteValidada = undefined // Se establecerá en el bloque de validación
    }
    
    // Reclasificar a PRODUCTOS SOLO cuando haya SKU/ID o patrón SKU en el mensaje. No por listas de palabras: confiamos en la IA.
    if (queryType === 'FALLBACK' || queryType === 'INFORMACION_GENERAL') {
      const tieneSkuOId = !!(providedExplicitSku || providedExplicitId || analisisOpenAI?.sku || analisisOpenAI?.id)
      // Detectar patrón de SKU en el mensaje (ej. "precio del 591086278" mal clasificado como info general)
      const mensajeTienePatronSku = /\b\d{6,}\b/.test(message) || /\b[A-Za-z]\d+[A-Za-z]?[-.]?\d*\b/i.test(message)
      if (tieneSkuOId || mensajeTienePatronSku) {
        // Fortificación: si era INFORMACION_GENERAL (p. ej. "¿dónde están y tienen el L70?"), marcar para incluir info empresa en la respuesta
        if (queryType === 'INFORMACION_GENERAL') {
          context.alsoAnswerInfoGeneral = true
        }
        queryType = 'PRODUCTOS'
        console.log(`[WooCommerce] 🔄 Reclasificado a PRODUCTOS (SKU/ID o patrón SKU en mensaje)`)
      }
      // Ya no reclasificamos INFORMACION_GENERAL/FALLBACK por "término" ni listas de palabras: confiamos en la IA.
    }
    
    // ============================================
    // EJECUTAR SEGÚN DECISIÓN DE OpenAI/Regex
    // ============================================
    
    // Si es FALLBACK, responder directamente con mensaje fijo + contacto (unificado con derivación a humano)
    if (queryType === 'FALLBACK' && analisisOpenAI?.tipoFallback) {
      console.log(`[WooCommerce] ⚠️ Consulta de fallback detectada: ${analisisOpenAI.tipoFallback}`)
      const contacto = companyInfoService.getCompanyInfo().contacto
      const lineaContacto = `Puedes escribir a ${contacto.email} o llamar al ${contacto.telefono}.`
      let fallbackMessage = ''
      switch (analisisOpenAI.tipoFallback) {
        case 'FUTURO':
          fallbackMessage = `No contamos con información de fechas de reposición.\n${lineaContacto}`
          break
        case 'RESERVA':
          fallbackMessage = `Para reservas o compras puedes usar el sitio web o contactar a un ejecutivo.\n${lineaContacto}`
          break
        case 'DESCUENTO':
          fallbackMessage = `Los precios son los publicados.\nPara condiciones comerciales: ${lineaContacto}`
          break
        default:
          fallbackMessage = `Para esa consulta: ${lineaContacto}`
      }
      
      return createResponse(
        fallbackMessage,
        session.state,
        null,
        cart
      )
    }
    
    // Si es AMBIGUA, verificar si es una pregunta sobre variaciones del producto en contexto
    if (queryType === 'AMBIGUA') {
      console.log(`[WooCommerce] ⚠️ Consulta ambigua detectada → Verificando si es pregunta sobre variaciones...`)
      
      // Distinguir entre saludos genéricos y consultas ambiguas reales (fortificación: incluir "días" con/sin tilde y margen de longitud)
      const normalizedMessage = normalizeSearchText(message).toLowerCase().trim()
      const isGreeting = /^(hola|hi|hello|buenos\s+d[ií]as|buenas\s+tardes|buenas\s+noches|buen\s+d[ií]a|buen\s+día|hey|saludos)/i.test(message) && (normalizedMessage.length < 25 || /^(hola|hi|hello|buenos|buenas|hey|saludos)[\s!.,]*$/i.test(message))
      
      if (isGreeting) {
        // Saludo genérico: responder amigablemente y ofrecer ayuda
        return createResponse(
          '¡Hola! 👋 ¿En qué puedo ayudarte hoy? Si tienes alguna pregunta sobre nuestros productos o servicios, no dudes en decírmelo.',
          session.state,
          null,
          cart
        )
      }
      
      // CRÍTICO: Si hay producto en contexto y la pregunta parece ser sobre variaciones, tratarla como VARIANTE
      const tieneProductoEnContexto = session.currentProduct || context.currentProduct || productStockData
      const palabrasVariaciones = ['color', 'colores', 'talla', 'tallas', 'tamaño', 'tamaños', 'variacion', 'variaciones', 'variante', 'variantes', 'modelo', 'modelos', 'acabado', 'acabados']
      const esPreguntaVariaciones = palabrasVariaciones.some(palabra => normalizedMessage.includes(palabra))
      
      if (esPreguntaVariaciones) {
        if (tieneProductoEnContexto) {
          // CRÍTICO: Si el usuario pide OTRO producto (ej. "mochilas en colores"), no usar contexto → buscar o pedir SKU
          const productoContextoParaVariante = session.currentProduct || context.currentProduct || productStockData
          if (userAsksForDifferentProduct(message, productoContextoParaVariante, analisisOpenAI, providedExplicitSku, providedExplicitId)) {
            const terminoParaBuscar = (analisisOpenAI?.terminoProducto || extractProductTerm(message)).trim()
            const terminosGenericosAmb = ['producto', 'productos', 'articulo', 'articulos', 'artículo', 'artículos', 'item', 'items', 'cosa', 'cosas', 'objeto', 'objetos']
            const termValido = terminoParaBuscar && terminoParaBuscar.length >= 2 && !terminosGenericosAmb.includes(terminoParaBuscar.toLowerCase()) && !palabrasVariaciones.includes(terminoParaBuscar.toLowerCase())
            if (termValido) {
              queryType = 'PRODUCTOS'
              context.terminoProductoParaBuscar = terminoParaBuscar
              console.log(`[WooCommerce] 🔄 AMBIGUA "variaciones" pero usuario pide otro producto → PRODUCTOS: "${terminoParaBuscar}"`)
            } else {
              return createResponse(
                'Necesito el nombre completo o el SKU del producto para mostrarte variaciones. ¿Me lo confirmas?',
                session.state,
                null,
                cart
              )
            }
          } else {
          console.log(`[WooCommerce] 🔄 Consulta ambigua detectada como pregunta de variaciones con producto en contexto`)
          // Usar producto del contexto
          productStockData = session.currentProduct || context.currentProduct || productStockData
          context.productStockData = productStockData
          
          // Detectar atributo (color, talla, etc.)
          let atributoDetectado = null
          if (normalizedMessage.includes('color') || normalizedMessage.includes('colores')) {
            atributoDetectado = 'color'
          } else if (normalizedMessage.includes('talla') || normalizedMessage.includes('tallas')) {
            atributoDetectado = 'talla'
          } else if (normalizedMessage.includes('tamaño') || normalizedMessage.includes('tamaños')) {
            atributoDetectado = 'tamaño'
          } else if (normalizedMessage.includes('acabado') || normalizedMessage.includes('acabados')) {
            atributoDetectado = 'acabado'
          }
          
          // Cambiar queryType a VARIANTE para que se procese correctamente
          if (atributoDetectado) {
            queryType = 'VARIANTE'
            // Crear análisisOpenAI simulado para VARIANTE
            if (!analisisOpenAI) {
              analisisOpenAI = {
                tipo: 'VARIANTE',
                atributo: atributoDetectado,
                valorAtributo: null, // Sin valor específico, listar todos
                terminoProducto: null,
                sku: null,
                id: null,
                necesitaMasInfo: false
              }
              context.analisisOpenAI = analisisOpenAI
            } else {
              analisisOpenAI.tipo = 'VARIANTE'
              analisisOpenAI.atributo = atributoDetectado
              analisisOpenAI.valorAtributo = null
            }
            console.log(`[WooCommerce] ✅ Convertida a VARIANTE: atributo="${atributoDetectado}", producto del contexto: ${productStockData.name || 'N/A'}`)
            // Continuar con el flujo de VARIANTE (no retornar aquí)
          } else {
            // Consulta ambigua real: pedir más información específica
            return createResponse(
              'Necesito el nombre completo o el SKU del producto para darte precio y stock. ¿Me lo confirmas?',
              session.state,
              null,
              cart
            )
          }
          }
        } else {
          // Pregunta sobre variaciones pero SIN producto en contexto - usar lastShownResults si existe
          const lastShownAmb = session.lastShownResults || []
          if (lastShownAmb.length === 1) {
            productStockData = lastShownAmb[0]
            context.productStockData = productStockData
            session.currentProduct = lastShownAmb[0]
            session.productVariations = null
            session.lastShownResults = null
            session.lastSearchTerm = null
            let atributoDetectado = null
            if (normalizedMessage.includes('color') || normalizedMessage.includes('colores')) atributoDetectado = 'color'
            else if (normalizedMessage.includes('talla') || normalizedMessage.includes('tallas')) atributoDetectado = 'talla'
            else if (normalizedMessage.includes('tamaño') || normalizedMessage.includes('tamaños')) atributoDetectado = 'tamaño'
            if (atributoDetectado) {
              queryType = 'VARIANTE'
              if (!analisisOpenAI) analisisOpenAI = { tipo: 'VARIANTE', atributo: atributoDetectado, valorAtributo: null, terminoProducto: null, sku: null, id: null, necesitaMasInfo: false }
              else { analisisOpenAI.tipo = 'VARIANTE'; analisisOpenAI.atributo = atributoDetectado; analisisOpenAI.valorAtributo = null }
              context.analisisOpenAI = analisisOpenAI
              console.log(`[WooCommerce] ✅ AMBIGUA variaciones + 1 resultado en lastShown → VARIANTE con ${productStockData.name || 'N/A'}`)
            }
          } else if (lastShownAmb.length > 1) {
            let atributoNombre = 'colores'
            if (normalizedMessage.includes('talla') || normalizedMessage.includes('tallas')) atributoNombre = 'tallas'
            else if (normalizedMessage.includes('tamaño') || normalizedMessage.includes('tamaños')) atributoNombre = 'tamaños'
            const ejemploSku = lastShownAmb[0]?.sku || 'el SKU'
            return createResponse(
              `¿De cuál de los productos que te mostré quieres ver los ${atributoNombre}? Indica el nombre o el SKU (por ejemplo ${ejemploSku}). 😊`,
              session.state,
              null,
              cart
            )
          } else {
            console.log(`[WooCommerce] ⚠️ Pregunta sobre variaciones sin producto en contexto ni lastShown`)
            let atributoNombre = 'variaciones'
            if (normalizedMessage.includes('color') || normalizedMessage.includes('colores')) atributoNombre = 'colores'
            else if (normalizedMessage.includes('talla') || normalizedMessage.includes('tallas')) atributoNombre = 'tallas'
            else if (normalizedMessage.includes('tamaño') || normalizedMessage.includes('tamaños')) atributoNombre = 'tamaños'
            return createResponse(
              `Para poder mostrarte los ${atributoNombre} disponibles, necesito que me indiques el nombre completo o el SKU del producto. ¿Me lo puedes confirmar? 😊`,
              session.state,
              null,
              cart
            )
          }
        }
      } else {
        // AMBIGUA sin palabras de variaciones: si hay término de producto no genérico → promover a PRODUCTOS y buscar
        const terminoAmb = (analisisOpenAI?.terminoProducto || extractProductTerm(message)).trim()
        const terminosGenericosAmb2 = ['producto', 'productos', 'articulo', 'articulos', 'artículo', 'artículos', 'item', 'items', 'cosa', 'cosas', 'objeto', 'objetos']
        const palabrasSoloVariacion = ['color', 'colores', 'talla', 'tallas', 'tamaño', 'tamaños', 'variacion', 'variaciones', 'variante', 'variantes', 'modelo', 'modelos', 'acabado', 'acabados']
        // Fortificación: no promover a PRODUCTOS si el término extraído es saludo (evita "buenos días" → "bueno dia"/"as")
        const terminoEsSaludo = ['bueno', 'buenos', 'dias', 'días', 'tardes', 'noches', 'hola', 'buen', 'buenas', 'dia', 'día'].includes(terminoAmb.toLowerCase())
        const termValidoParaBuscar = terminoAmb && terminoAmb.length >= 2 &&
          !terminosGenericosAmb2.includes(terminoAmb.toLowerCase()) &&
          !palabrasSoloVariacion.includes(terminoAmb.toLowerCase()) &&
          !terminoEsSaludo
        if (termValidoParaBuscar) {
          queryType = 'PRODUCTOS'
          context.terminoProductoParaBuscar = terminoAmb
          console.log(`[WooCommerce] 🔄 AMBIGUA con término de producto → promovido a PRODUCTOS: "${terminoAmb}"`)
        } else if (terminoEsSaludo) {
          return createResponse(
            '¡Hola! 👋 ¿En qué puedo ayudarte hoy? Si tienes alguna pregunta sobre nuestros productos o servicios, no dudes en decírmelo.',
            session.state,
            null,
            cart
          )
        } else {
          return createResponse(
            'Necesito el nombre completo o el SKU del producto para darte precio y stock. ¿Me lo confirmas?',
            session.state,
            null,
            cart
          )
        }
      }
    }
    
    // Si es consulta de PRODUCTOS o RECOMENDACION y el usuario está logueado, buscar en WooCommerce.
    // Si no está logueado, no se consulta catálogo; más abajo se arma texto "necesitas cuenta" (info sensible).
    // VARIANTE tiene flujo propio y también se restringe por isLoggedIn en el bloque de textoParaIA.
    if ((queryType === 'PRODUCTOS' || queryType === 'RECOMENDACION') && isLoggedIn) {
      try {
        const decisionSource = providedExplicitSku || providedExplicitId ? 'regex' : 'OpenAI'
        console.log(`[WooCommerce] Buscando productos para consulta: "${message}" (tipo decidido por: ${decisionSource})`)
        
        // Obtener término de producto a usar (de OpenAI si está disponible, sino extraer del mensaje)
        let terminoProductoParaBuscar = context.terminoProductoParaBuscar || extractProductTerm(message)
        
        // VALIDACIÓN CRÍTICA: Verificar que el término no sea genérico antes de buscar
        const terminosGenericos = ['producto', 'productos', 'articulo', 'articulos', 'artículo', 'artículos', 'item', 'items', 'cosa', 'cosas', 'objeto', 'objetos']
        if (terminoProductoParaBuscar && terminosGenericos.includes(terminoProductoParaBuscar.toLowerCase().trim())) {
          console.log(`[WooCommerce] ⚠️ Término genérico detectado: "${terminoProductoParaBuscar}" → No se buscará para evitar falsos positivos`)
          terminoProductoParaBuscar = null
        }
        
        // Si después del análisis todavía no hay SKU/ID, intentar detección adicional con regex
        // (solo para SKUs sin prefijo explícito, como "K62" en "tienen el producto K62?")
        if (!providedExplicitSku && !providedExplicitId) {
        // Detectar SKUs en el mensaje (sin prefijo explícito)
        // Casos válidos:
        // 1. "lapicero L88", "libreta N35" (SKU después de nombre de producto)
        // 2. "L88", "N35" (solo el SKU, mensaje corto)
        // 3. "601059110" (SKU numérico largo)
        const isVeryShortMessage = message.trim().split(/\s+/).length <= 2
        const detectedSkus = []
        
        // Detectar todos los SKUs que aparecen después de nombres de productos (ej: "lapicero L88", "llavero B85", "mochila K78")
        const productNamePattern = /\b(lapicero|libreta|bolígrafo|boligrafo|producto|product|articulo|artículo|cuaderno|marcador|resaltador|llavero|mochila|usb|pendrive|corchetera|capsula|cápsula|taza|vaso|polera|polerón|gorro|cojin|cojín|mouse|teclado|memoria|stick)\s+([A-Za-z]\d+[A-Za-z]?[-]?\d*)\b/gi
        const allProductNameMatches = [...message.matchAll(productNamePattern)]
        for (const match of allProductNameMatches) {
          const sku = match[2].trim()
          if (!detectedSkus.includes(sku)) {
            detectedSkus.push(sku)
            console.log(`[WooCommerce] 🔍 SKU detectado después de nombre de producto: "${sku}"`)
          }
        }
        
        // Si no hay SKUs detectados por nombre de producto, buscar SKUs standalone
        if (detectedSkus.length === 0) {
          // Buscar SKU standalone con letra (ej: "N35", "L88")
          const standaloneSkuMatch = message.match(/\b([A-Za-z]\d+[A-Za-z]?[-]?\d*)\b/i)
          if (standaloneSkuMatch && isVeryShortMessage) {
            detectedSkus.push(standaloneSkuMatch[1].trim())
            console.log(`[WooCommerce] 🔍 SKU detectado (standalone): "${standaloneSkuMatch[1]}"`)
          }
          
          // Buscar SKU solo con letras (ej: "Gal", "ABA1") cuando el mensaje es muy corto
          // Esto es para casos especiales donde el SKU no tiene dígitos o tiene formato no estándar
          // No tratar como SKU la primera palabra cuando el mensaje es "verbo + producto" (ej. "busco gorros", "quiero taza")
          const words = message.trim().split(/\s+/).filter(Boolean)
          const firstWordIsSearchIntent = words.length >= 2 && ['busco', 'quiero', 'necesito', 'dame', 'muestra', 'muestrame', 'ver', 'encuentra', 'buscar', 'encontrar'].includes(words[0].toLowerCase())
          if (detectedSkus.length === 0 && isVeryShortMessage && !firstWordIsSearchIntent) {
            // Patrón para SKUs que son solo letras (2-5 caracteres)
            const lettersOnlySkuMatch = message.match(/\b([A-Za-z]{2,5})\b/i)
            if (lettersOnlySkuMatch) {
              const potentialSku = lettersOnlySkuMatch[1].trim()
              // Lista mínima solo para evitar llamar IA en casos obvios; el resto lo decide la IA (evita encasillar)
              const blacklistMinima = ['el', 'la', 'los', 'las', 'un', 'una', 'que', 'qué', 'qu', 'hola', 'como', 'donde', 'dónde', 'tiene', 'tienen', 'hay']
              if (blacklistMinima.includes(potentialSku.toLowerCase())) {
                // No llamar IA para estas; nunca son SKU
              } else {
                try {
                  const esCodigo = await conkavoAI.esCodigoProductoEnMensaje(message, potentialSku)
                  if (esCodigo) {
                    detectedSkus.push(potentialSku)
                    console.log(`[WooCommerce] 🔍 SKU solo letras validado por IA: "${potentialSku}"`)
                  }
                } catch (err) {
                  console.warn('[WooCommerce] ⚠️ Error validando candidato con IA, no se usa como SKU:', err?.message)
                }
              }
            }
          }
          
          // Buscar SKU numérico (6+ dígitos o 5 dígitos) - sin restricción de longitud de mensaje
          if (detectedSkus.length === 0) {
            const numericLongMatch = message.match(/\b(\d{6,})\b/)
            const numericFiveMatch = message.match(/\b(\d{5})\b/)
            if (numericLongMatch) {
              detectedSkus.push(numericLongMatch[1].trim())
              console.log(`[WooCommerce] 🔍 SKU numérico largo detectado: "${numericLongMatch[1]}"`)
            } else if (numericFiveMatch) {
              detectedSkus.push(numericFiveMatch[1].trim())
              console.log(`[WooCommerce] 🔍 SKU numérico 5 dígitos detectado: "${numericFiveMatch[1]}"`)
            }
          }
          if (detectedSkus.length > 0) {
            // Si ya hay candidatos (ej. "usb" por lettersOnly) pero el mensaje tiene un SKU numérico, priorizarlo
            const numericInMessage = message.match(/\b(\d{6,})\b/)
            const letterDigitInMessage = message.match(/\b([A-Za-z]\d+[A-Za-z]?[-.]?\d*)\b/i)
            if (numericInMessage && !detectedSkus.includes(numericInMessage[1])) {
              detectedSkus.unshift(numericInMessage[1].trim())
              console.log(`[WooCommerce] 🔍 SKU numérico priorizado sobre otros: "${numericInMessage[1]}"`)
            } else if (letterDigitInMessage && !detectedSkus.includes(letterDigitInMessage[1])) {
              const hasOnlyLetters = detectedSkus.every(s => !/\d/.test(s))
              if (hasOnlyLetters) {
                detectedSkus.unshift(letterDigitInMessage[1].trim())
                console.log(`[WooCommerce] 🔍 SKU tipo código priorizado: "${letterDigitInMessage[1]}"`)
              }
            }
          }
        }
        
        // Usar el primer SKU detectado
        if (detectedSkus.length > 0) {
          providedExplicitSku = detectedSkus[0]
          if (/[-.\s]/.test(String(detectedSkus[0]))) {
            rawExplicitSku = detectedSkus[0]
          }
          if (detectedSkus.length > 1) {
            console.log(`[WooCommerce] ⚠️  Múltiples SKUs detectados: ${detectedSkus.join(', ')}. Buscando el primero: "${providedExplicitSku}"`)
          }
        }
        
        // Si todavía no hay SKU, usar IA para detectar SKU numérico (prioridad: respuestas correctas)
        if (!providedExplicitSku) {
          console.log(`[WooCommerce] 🤖 Consultando IA para detectar SKU numérico en el mensaje...`)
          try {
            const skuDetectadoPorIA = await conkavoAI.detectarSkuNumerico(message)
            if (skuDetectadoPorIA) {
              providedExplicitSku = skuDetectadoPorIA
              console.log(`[WooCommerce] ✅ IA detectó SKU numérico: "${providedExplicitSku}"`)
            } else {
              console.log(`[WooCommerce] ⚠️ IA no detectó SKU numérico en el mensaje`)
            }
          } catch (error) {
            console.error(`[WooCommerce] ❌ Error consultando IA para detectar SKU:`, error.message)
            // Continuar con flujo normal si falla la detección por IA
          }
        }
      }
      
      if (explicitIdMatch) {
        providedExplicitId = explicitIdMatch[1].trim()
        console.log(`[WooCommerce] 🔍 ID detectado: "${providedExplicitId}"`)
      }
      
      // Regla "señal fuerte": si hay producto en contexto pero el mensaje o el término es genérico (sin SKU/ID), no usar contexto → respuesta genérica
      const msgNormHelp = (typeof message === 'string' ? message : '').trim().toLowerCase()
      const termParaBuscar = (context.terminoProductoParaBuscar || '').trim().toLowerCase()
      const mensajeEsGenerico = GENERIC_PHRASES_SET.has(normalizeForGenericGate(message))
      const terminoEsGenerico = termParaBuscar.length < 2 || GENERIC_PHRASES_SET.has(termParaBuscar) || GENERIC_PHRASES_SET.has(normalizeForGenericGate(termParaBuscar))
      if (productStockData && !providedExplicitSku && !providedExplicitId && (mensajeEsGenerico || terminoEsGenerico)) {
        console.log(`[WooCommerce] ⚠️ Sin señal fuerte (mensaje/término genérico) con producto en contexto → respuesta genérica (no usar contexto)`)
        return createResponse(
          '¡Hola! ¿En qué puedo ayudarte? Puedes preguntarme por un producto (nombre o SKU), stock, precios, o información de la empresa.',
          session.state,
          null,
          cart
        )
      }
      
      // Si ya tenemos un producto del contexto (consulta ambigua resuelta), omitir búsquedas adicionales
      if (productStockData) {
        console.log(`[WooCommerce] ✅ Producto ya encontrado desde contexto, omitiendo búsquedas adicionales`)
      } else {
        const currentSearchTermRaw = providedExplicitSku || terminoProductoParaBuscar || ''
        const currentSearchTermNorm = normalizeCode(currentSearchTermRaw)
        let resolvedFromLastShown = false
        const lastShown = session.lastShownResults || []
        const isShortMessage = message.trim().length <= 50 && message.trim().split(/\s+/).filter(Boolean).length <= 8

        // Alta prioridad IA: mensaje corto + lista recién mostrada → interpretar si elige uno o repite búsqueda
        if (!resolvedFromLastShown && lastShown.length > 0 && isShortMessage) {
          try {
            const tipoSeguimiento = await conkavoAI.detectarTipoSeguimiento(message, session.lastSearchTerm || '', lastShown.length)
            if (tipoSeguimiento === 'ELIGE_UNO') {
              const idx = await conkavoAI.interpretarSeguimientoCorto(message, lastShown)
              if (idx >= 1 && idx <= lastShown.length) {
                productStockData = lastShown[idx - 1]
                context.productStockData = productStockData
                session.currentProduct = lastShown[idx - 1]
                session.productVariations = null
                session.lastShownResults = null
                session.lastSearchTerm = null
                context.productSearchResults = []
                resolvedFromLastShown = true
                console.log(`[WooCommerce] ✅ IA: usuario eligió producto ${idx} de la lista - ${productStockData.name || 'N/A'}`)
              }
            }
          } catch (err) {
            console.warn('[WooCommerce] ⚠️ Error en detectarTipoSeguimiento/interpretarSeguimientoCorto:', err?.message)
          }
        }

        // Repetición del mismo término: si el usuario repite el mismo código y ya mostramos una lista, usar match exacto si hay solo uno
        if (!resolvedFromLastShown && currentSearchTermNorm && lastShown.length > 0 && session.lastSearchTerm && session.lastSearchTerm === currentSearchTermNorm) {
          const exactInLast = lastShown.filter(p => productMatchesCodeExactly(p, currentSearchTermRaw))
          if (exactInLast.length === 1) {
            productStockData = exactInLast[0]
            context.productStockData = productStockData
            session.currentProduct = exactInLast[0]
            session.productVariations = null
            session.lastShownResults = null
            session.lastSearchTerm = null
            context.productSearchResults = []
            resolvedFromLastShown = true
            console.log(`[WooCommerce] ✅ Repetición del mismo término: un solo match exacto en lista ya mostrada - ${productStockData.name || 'N/A'}`)
          }
        }
        if (!resolvedFromLastShown) {
      
      // Buscar por SKU primero
      if (providedExplicitSku) {
        try {
          const normalizedSku = providedExplicitSku
          // Prioridad 1: rawExplicitSku (solo cuando viene de "sku: X"). Prioridad 2: si el SKU ya tiene guión/punto (OpenAI o detectado), usarlo tal cual. Prioridad 3: normalizado.
          const skuTieneGuionPunto = /[-.\s]/.test(String(providedExplicitSku || ''))
          const skuToTryFirst = (rawExplicitSku && /[-.\s]/.test(rawExplicitSku)) ? rawExplicitSku : (skuTieneGuionPunto ? providedExplicitSku : normalizedSku)
          const skusToTry = skuToTryFirst !== normalizedSku ? [skuToTryFirst, normalizedSku] : [skuToTryFirst]
          console.log(`[WooCommerce] Buscando SKU en paralelo: ${skusToTry.map(s => `"${s}"`).join(', ')}`)
          const [byRaw, byNorm] = skusToTry.length === 2
            ? await Promise.all([
                wordpressService.getProductBySku(skusToTry[0]),
                wordpressService.getProductBySku(skusToTry[1])
              ])
            : [await wordpressService.getProductBySku(skusToTry[0]), null]
          const productBySku = byRaw || byNorm
          if (productBySku) {
            // CRÍTICO: Si el producto encontrado es una variación (tiene parent_id), obtener el producto padre
            let finalProduct = productBySku
            if (productBySku.parent_id) {
              const parentId = productBySku.parent_id
              console.log(`[WooCommerce] 🔄 Producto encontrado es una variación (parent_id: ${parentId}), obteniendo producto padre y variaciones en paralelo...`)
              try {
                const [parentProduct, variations] = await Promise.all([
                  wordpressService.getProductById(parentId),
                  wordpressService.getProductVariations(parentId)
                ])
                if (parentProduct) {
                  finalProduct = parentProduct
                  console.log(`[WooCommerce] ✅ Producto padre obtenido: ${parentProduct.name || 'N/A'} (ID: ${parentProduct.id})`)
                  if (Array.isArray(variations) && variations.length > 0) {
                    context.productVariations = variations
                    session.productVariations = variations
                    console.log(`[WooCommerce] ✅ ${variations.length} variaciones cargadas para "${parentProduct.name}"`)
                  }
                } else {
                  console.log(`[WooCommerce] ⚠️ No se pudo obtener producto padre, usando variación encontrada`)
                }
              } catch (error) {
                console.error(`[WooCommerce] ⚠️ Error obteniendo producto padre/variaciones: ${error.message}`)
                // Continuar con la variación si falla
              }
            }
            
            productStockData = finalProduct
            context.productStockData = productStockData
            session.currentProduct = finalProduct // Guardar producto padre (o el producto si no es variación) para futuras referencias
            console.log(`[WooCommerce] ✅ Producto encontrado por SKU explícito: ${finalProduct.name || 'N/A'} (SKU: ${finalProduct.sku || 'N/A'})`)
            console.log(`   Stock: ${finalProduct.stock_quantity !== null ? finalProduct.stock_quantity : 'N/A'}, Precio: ${finalProduct.price ? '$' + finalProduct.price : 'N/A'}`)
            
            // Si es un producto variable (y no es variación), cargar variaciones automáticamente
            if (finalProduct.type === 'variable' && finalProduct.id && !finalProduct.parent_id) {
              console.log(`[WooCommerce] 🔄 Producto variable detectado, cargando variaciones automáticamente...`)
              try {
                const variations = await wordpressService.getProductVariations(finalProduct.id)
                if (variations && variations.length > 0) {
                  context.productVariations = variations
                  // CRÍTICO: Guardar también en sesión para que persistan entre mensajes
                  session.productVariations = variations
                  console.log(`[WooCommerce] ✅ ${variations.length} variaciones cargadas para "${finalProduct.name}"`)
                }
              } catch (error) {
                console.error(`[WooCommerce] ⚠️ Error cargando variaciones: ${error.message}`)
              }
            }
          } else {
            console.log(`[WooCommerce] ❌ No se encontró producto con SKU explícito: "${providedExplicitSku}"`)
            console.log(`   Intentando localizar por búsqueda API y luego por nombre/código si hace falta.`)
            try {
              const normalizedSkuForFilter = normalizeCode(providedExplicitSku)
              let productsWithCode = []

              // Prioridad: búsqueda por API (rápida) antes que getAllProducts (costosa). Misma lógica de filtro.
              const searchResults = await wordpressService.searchProductsInWordPress(providedExplicitSku, 30)
              if (searchResults && searchResults.length > 0) {
                productsWithCode = searchResults.filter(p => {
                  const productName = normalizeCode(p.name || '')
                  const productSku = normalizeCode(p.sku || '')
                  return productName.includes(normalizedSkuForFilter) || productSku.includes(normalizedSkuForFilter)
                })
                if (productsWithCode.length > 0) {
                  console.log(`[WooCommerce] ✅ Encontrado(s) por búsqueda API: ${productsWithCode.length} producto(s) que coinciden con "${providedExplicitSku}"`)
                }
              }

              if (productsWithCode.length === 0) {
                const allProducts = await wordpressService.getAllProducts()
                productsWithCode = allProducts.filter(p => {
                  const productName = normalizeCode(p.name || '')
                  const productSku = normalizeCode(p.sku || '')
                  return productName.includes(normalizedSkuForFilter) || productSku.includes(normalizedSkuForFilter)
                })
              }

              if (productsWithCode.length === 1) {
                productStockData = productsWithCode[0]
                context.productStockData = productStockData
                session.currentProduct = productsWithCode[0] // Guardar para futuras referencias
                console.log(`[WooCommerce] ✅ Producto encontrado por código en nombre/SKU: ${productStockData.name} (SKU real: ${productStockData.sku || 'N/A'})`)
              } else if (productsWithCode.length === 0) {
                // CRÍTICO: Si no se encuentra el producto, limpiar contexto y retornar mensaje amigable
                session.currentProduct = null
                session.productVariations = null
                console.log(`[WooCommerce] ⚠️ No se encontró producto con SKU "${providedExplicitSku}" - contexto limpiado`)
                return createResponse(
                  `No encontré un producto con el SKU "${providedExplicitSku}". ¿Podrías confirmarme el SKU correcto o el nombre completo del producto? 😊`,
                  session.state,
                  null,
                  cart
                )
              } else if (productsWithCode.length > 1) {
                const exactMatches = productsWithCode.filter(p => productMatchesCodeExactly(p, providedExplicitSku))
                if (exactMatches.length === 1) {
                  productStockData = exactMatches[0]
                  context.productStockData = productStockData
                  session.currentProduct = exactMatches[0]
                  console.log(`[WooCommerce] ✅ Un solo match exacto para "${providedExplicitSku}": ${productStockData.name} (SKU: ${productStockData.sku || 'N/A'})`)
                } else {
                  const sorted = [...productsWithCode].sort((a, b) => {
                    const aExact = productMatchesCodeExactly(a, providedExplicitSku) ? 1 : 0
                    const bExact = productMatchesCodeExactly(b, providedExplicitSku) ? 1 : 0
                    return bExact - aExact
                  })
                  productSearchResults = sorted.slice(0, 10)
                  context.productSearchResults = productSearchResults
                  console.log(`[WooCommerce] ✅ Encontrados ${productsWithCode.length} productos que contienen "${providedExplicitSku}" en nombre/SKU`)
                }
              }
            } catch (error) {
              console.log(`[WooCommerce] ⚠️  Error buscando código en nombres/SKU: ${error.message}`)
            }
          }
        } catch (error) {
          console.error(`[WooCommerce] ❌ Error buscando por SKU explícito "${providedExplicitSku}":`, error.message)
          console.error(`   Stack:`, error.stack?.substring(0, 500))
        }
      }
      
      // Si no se encontró por SKU, intentar por ID (aunque también esté en el mensaje)
      if (providedExplicitId && !productStockData) {
        console.log(`[WooCommerce] 🔍 ID explícito detectado: "${providedExplicitId}"`)
        console.log(`   Intentando buscar por ID...`)
        try {
          const productById = await wordpressService.getProductStock(providedExplicitId)
          if (productById) {
            productStockData = productById
            context.productStockData = productStockData
            session.currentProduct = productById // Guardar para futuras referencias
            console.log(`[WooCommerce] ✅ Producto encontrado por ID explícito: ${productById.name || 'N/A'} (ID: ${productById.id || 'N/A'})`)
            console.log(`   Stock: ${productById.stock_quantity !== null ? productById.stock_quantity : 'N/A'}, Precio: ${productById.price ? '$' + productById.price : 'N/A'}`)
          } else {
            console.log(`[WooCommerce] ❌ No se encontró producto con ID explícito: "${providedExplicitId}"`)
          }
        } catch (error) {
          console.error(`[WooCommerce] ❌ Error buscando por ID explícito "${providedExplicitId}":`, error.message)
          console.error(`   Stack:`, error.stack?.substring(0, 500))
        }
      }
      
      // Si ya encontramos el producto por SKU/ID explícito, terminamos aquí
      if (!productStockData) {
        // No se encontró por SKU/ID explícito, buscar por nombre usando matching determinístico
        
        // Extraer palabras clave del producto del mensaje
        let cleanMessage = message
          .replace(/cuanto\s+(cuesta|vale|es\s+el\s+precio)\s+(el|la|los|las|del|de|del\s+producto)?[:\s]*/gi, '')
          .replace(/cuánto\s+(cuesta|vale|es\s+el\s+precio)\s+(el|la|los|las|del|de|del\s+producto)?[:\s]*/gi, '')
          .replace(/cuanto\s+stock\s+hay\s+de[:\s]*/gi, '')
          .replace(/cuántas?\s+unidades?\s+(de\s+)?/gi, '')
          .replace(/cuánto\s+stock\s+(hay|tienes|tienen)\s+(de\s+)?/gi, '')
          .replace(/precio\s+(de|del|del\s+producto)\s+/gi, '')
          .replace(/stock\s+(de|del|del\s+producto)\s+/gi, '')
          .replace(/producto[:\s]*/gi, '')
          .replace(/(?:sku|SKU)[:\s]*[^\s]+/gi, '') // Remover referencias explícitas de SKU ya procesadas (cualquier cosa después de SKU:)
          .replace(/(?:id|ID)[:\s]*\d+/gi, '') // Remover referencias explícitas de ID ya procesadas
          .trim()
        
        if (cleanMessage.length > 3) {
          console.log(`[WooCommerce] Buscando por nombre usando matching determinístico`)
          
          // Rápido: búsqueda WooCommerce primero; catálogo completo si 0 resultados o 100 (puede haber más)
          try {
            const SEARCH_LIMIT_NAME = 100
            let allProducts = await wordpressService.searchProductsInWordPress(cleanMessage, SEARCH_LIMIT_NAME)
            if (!allProducts || allProducts.length === 0) {
              allProducts = await wordpressService.getAllProducts()
            } else if (allProducts.length >= SEARCH_LIMIT_NAME) {
              allProducts = await wordpressService.getAllProducts()
            }
            if (allProducts && allProducts.length > 0) {
              console.log(`[WooCommerce] ✅ Obtenidos ${allProducts.length} productos de WooCommerce`)
              
              // Buscar primero por nombre completo (sin extraer SKU)
              // Usar normalizeText (sin espacios) para coincidir con matchProduct
              const fullNameNormalized = productMatcher.normalizeText(cleanMessage)
              console.log(`[WooCommerce] 🔍 Buscando primero por nombre completo: "${fullNameNormalized}"`)
              
              const fullNameMatch = productMatcher.matchProduct(
                cleanMessage, // Pasar el texto original, matchProduct lo normaliza internamente
                allProducts,
                p => p.sku || '',
                p => p.name || ''
              )
              
              if (fullNameMatch.status === 'FOUND') {
                productStockData = fullNameMatch.product.originalProduct
                context.productStockData = productStockData
                session.currentProduct = productStockData
                console.log(`[WooCommerce] ✅ Producto encontrado por nombre completo: ${productStockData.name}`)
                
                // Si es un producto variable, consultar sus variaciones (lazy loading)
                if (productStockData.type === 'variable' && productStockData.id) {
                  console.log(`[WooCommerce] 🔄 Producto variable detectado, consultando variaciones...`)
                  try {
                    const variations = await wordpressService.getProductVariations(productStockData.id)
                    if (variations && variations.length > 0) {
                      context.productVariations = variations
                      // CRÍTICO: Guardar también en sesión para que persistan entre mensajes
                      session.productVariations = variations
                      console.log(`[WooCommerce] ✅ ${variations.length} variaciones encontradas para "${productStockData.name}"`)
                    }
                  } catch (error) {
                    console.error(`[WooCommerce] ⚠️  Error obteniendo variaciones: ${error.message}`)
                  }
                }
                
                context.productStockData = productStockData
              } else if (fullNameMatch.status === 'AMBIGUOUS') {
                productSearchResults = fullNameMatch.ambiguousProducts.map(m => m.originalProduct)
                context.productSearchResults = productSearchResults
                console.log(`[WooCommerce] ⚠️  Múltiples productos con nombre completo (${productSearchResults.length})`)
              }
            }
          } catch (error) {
            console.error(`[WooCommerce] ❌ Error buscando por nombre completo:`, error.message)
          }
          
          // Si no se encontró por nombre completo, detectar SKU y buscar por partes
          if (!productStockData && !productSearchResults.length) {
            // Detectar SKU en cualquier parte del mensaje (al inicio, medio o final)
            // Patrones: 
            // - Letra seguida de números: "S10", "N35", "L88", "SOPI01"
            // - Letra-números-letra opcional: "A1B", "X2Y"
            // - Con guiones: "S-10", "N-35", "S.10", "N 35"
            // - Al final: "CORCHETERA CAPSULA S10"
            // - Al inicio: "S10 CORCHETERA"
            // - En medio: "CORCHETERA S10 CAPSULA"
            const skuPatterns = [
              /\b([A-Za-z]\d+[A-Za-z]?[-.\s]?\d*)\b/i,  // Patrón general: letra + números (con guión/punto/espacio opcional)
              /\b([A-Za-z][-.\s]\d+[A-Za-z]?)\b/i,      // Con guión/punto/espacio: "S-10", "S.10", "S 10"
              /\b([A-Za-z]\d+[-.\s]\d+)\b/i             // Con guión/punto/espacio en medio: "S10-20", "S10.20", "S10 20"
            ]
            
            let detectedSkuFromName = null
            let messageWithoutSku = cleanMessage
            
            let rawDetectedSku = null
            let normalizedDetectedSkuForName = null
            // Intentar cada patrón hasta encontrar un SKU
            for (const pattern of skuPatterns) {
              const skuMatch = cleanMessage.match(pattern)
              if (skuMatch) {
                rawDetectedSku = skuMatch[1].trim()
                // Normalizar el SKU detectado (N-35 → N35, S.10 → S10, etc.)
                normalizedDetectedSkuForName = normalizeCode(rawDetectedSku)
                detectedSkuFromName = normalizedDetectedSkuForName
                console.log(`[WooCommerce] 🔍 SKU detectado en el nombre: "${rawDetectedSku}" → normalizado: "${normalizedDetectedSkuForName}"`)
                
                // Remover el SKU del mensaje para buscar por nombre (usar el original para el reemplazo)
                messageWithoutSku = cleanMessage.replace(new RegExp(`\\b${rawDetectedSku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), '').trim()
                console.log(`[WooCommerce] Mensaje sin SKU: "${messageWithoutSku}"`)
                break
              }
            }
            
            // Si se detectó un SKU, intentar buscarlo primero (raw y normalizado en paralelo)
            if (detectedSkuFromName) {
              try {
                const [byRaw, byNorm] = await Promise.all([
                  rawDetectedSku && /[-.\s]/.test(rawDetectedSku) ? wordpressService.getProductBySku(rawDetectedSku) : Promise.resolve(null),
                  wordpressService.getProductBySku(detectedSkuFromName)
                ])
                const productBySku = byRaw || byNorm
                if (productBySku) {
                  productStockData = productBySku
                  context.productStockData = productStockData
                  session.currentProduct = productBySku
                  console.log(`[WooCommerce] ✅ Producto encontrado por SKU del nombre: ${productBySku.name || 'N/A'} (SKU: ${productBySku.sku || 'N/A'})`)
                  console.log(`   Stock: ${productBySku.stock_quantity !== null ? productBySku.stock_quantity : 'N/A'}, Precio: ${productBySku.price ? '$' + productBySku.price : 'N/A'}`)
                } else {
                  console.log(`[WooCommerce] ⚠️  No se encontró producto con SKU "${detectedSkuFromName}", buscando código en nombres/SKU...`)
                  // Fallback: buscar el código detectado en nombres/SKU normalizados
                  try {
                    const allProducts = await wordpressService.getAllProducts()
                    const normalizedCode = normalizeCode(detectedSkuFromName)
                    const productsWithCode = allProducts.filter(p => {
                      const productName = normalizeCode(p.name || '')
                      const productSku = normalizeCode(p.sku || '')
                      return productName.includes(normalizedCode) || productSku.includes(normalizedCode)
                    })
                    
                    if (productsWithCode.length === 1) {
                      productStockData = productsWithCode[0]
                      context.productStockData = productStockData
                      session.currentProduct = productsWithCode[0]
                      console.log(`[WooCommerce] ✅ Producto encontrado por código en nombre/SKU: ${productStockData.name} (SKU real: ${productStockData.sku || 'N/A'})`)
                    } else if (productsWithCode.length > 1) {
                      const exactMatchesName = productsWithCode.filter(p => productMatchesCodeExactly(p, detectedSkuFromName))
                      if (exactMatchesName.length === 1) {
                        productStockData = exactMatchesName[0]
                        context.productStockData = productStockData
                        session.currentProduct = exactMatchesName[0]
                        console.log(`[WooCommerce] ✅ Un solo match exacto para "${detectedSkuFromName}": ${productStockData.name} (SKU: ${productStockData.sku || 'N/A'})`)
                      } else {
                        const sortedName = [...productsWithCode].sort((a, b) => {
                          const aExact = productMatchesCodeExactly(a, detectedSkuFromName) ? 1 : 0
                          const bExact = productMatchesCodeExactly(b, detectedSkuFromName) ? 1 : 0
                          return bExact - aExact
                        })
                        productSearchResults = sortedName.slice(0, 10)
                        context.productSearchResults = productSearchResults
                        console.log(`[WooCommerce] ✅ Encontrados ${productsWithCode.length} productos que contienen "${detectedSkuFromName}" en nombre/SKU`)
                      }
                    } else {
                      console.log(`[WooCommerce] ❌ Tampoco se encontró "${detectedSkuFromName}" en nombres/SKU normalizados`)
                    }
                  } catch (error) {
                    console.log(`[WooCommerce] ⚠️  Error buscando código en nombres/SKU: ${error.message}`)
                  }
                }
              } catch (error) {
                console.log(`[WooCommerce] ⚠️  Error buscando SKU "${detectedSkuFromName}": ${error.message}, continuando con búsqueda por nombre`)
              }
            }
            
            // Si no se encontró por SKU, buscar por nombre sin SKU
            if (!productStockData && !productSearchResults.length) {
              // Usar término de OpenAI si está disponible, sino extraer del mensaje
              let productTerm = context.terminoProductoParaBuscar || extractProductTerm(messageWithoutSku)
              
              // VALIDACIÓN CRÍTICA: Verificar que el término no sea genérico
              const terminosGenericos = ['producto', 'productos', 'articulo', 'articulos', 'artículo', 'artículos', 'item', 'items', 'cosa', 'cosas', 'objeto', 'objetos']
              if (productTerm && terminosGenericos.includes(productTerm.toLowerCase().trim())) {
                console.log(`[WooCommerce] ⚠️ Término genérico detectado: "${productTerm}" → No se buscará para evitar falsos positivos`)
                productTerm = ''
              }
              
              console.log(`[WooCommerce] Término del producto a usar: "${productTerm}" ${context.terminoProductoParaBuscar ? '(de OpenAI)' : '(extraído del mensaje)'}`)
            
              if (productTerm && productTerm.length > 0) {
                try {
                  // Limpiar término antes de usarlo (hola, busco, etc.)
                  let termToUse = productTerm
                  if (productTerm.includes('hola') || productTerm.includes('busco') || productTerm.includes('buscando') || productTerm.includes('llamado')) {
                    const cleanedTerm = productTerm
                      .replace(/\bhola\b/gi, '')
                      .replace(/\bbusco\b/gi, '')
                      .replace(/\bbuscando\b/gi, '')
                      .replace(/\bllamado\b/gi, '')
                      .replace(/\bun\b/gi, '')
                      .replace(/\buna\b/gi, '')
                      .trim()
                    if (cleanedTerm.length > 0) {
                      console.log(`[WooCommerce] Término limpiado adicionalmente: "${cleanedTerm}"`)
                      termToUse = cleanedTerm
                    }
                  }
                  // Rápido: búsqueda WooCommerce (1 petición). Catálogo completo solo si hace falta (0 resultados o 100 = puede haber más).
                  const SEARCH_LIMIT = 100
                  let allProducts = await wordpressService.searchProductsInWordPress(termToUse, SEARCH_LIMIT)
                  if (!allProducts || allProducts.length === 0) {
                    console.log(`[WooCommerce] Búsqueda rápida sin resultados → obteniendo catálogo completo...`)
                    allProducts = await wordpressService.getAllProducts()
                  } else if (allProducts.length >= SEARCH_LIMIT) {
                    console.log(`[WooCommerce] Búsqueda rápida devolvió ${SEARCH_LIMIT} (puede haber más) → catálogo completo para no perder coincidencias`)
                    allProducts = await wordpressService.getAllProducts()
                  } else {
                    console.log(`[WooCommerce] Búsqueda rápida: ${allProducts.length} productos para "${termToUse}"`)
                  }
                  if (allProducts && allProducts.length > 0) {
                      // Aplicar matching determinístico sobre el término extraído
                      const matchResult = productMatcher.matchProduct(
                        termToUse,                    // ✅ Término del producto (limpio)
                        allProducts,                    // Muestra de productos de WooCommerce
                        p => p.sku || '',                // Función para obtener SKU
                        p => p.name || ''                // Función para obtener nombre
                      )
                  
                    console.log(`[WooCommerce] Resultado del matching determinístico: ${matchResult.status}`)
                    
                    if (matchResult.status === 'FOUND') {
                      // Coincidencia exacta única: usar el producto encontrado
                      productStockData = matchResult.product.originalProduct
                      context.productStockData = productStockData
                      session.currentProduct = productStockData
                      console.log(`[WooCommerce] ✅ Producto encontrado por matching determinístico: ${productStockData.name} (SKU: ${productStockData.sku || 'N/A'})`)
                      
                      // Si es un producto variable, consultar sus variaciones (lazy loading)
                      if (productStockData.type === 'variable' && productStockData.id) {
                        console.log(`[WooCommerce] 🔄 Producto variable detectado, consultando variaciones...`)
                        try {
                          const variations = await wordpressService.getProductVariations(productStockData.id)
                          if (variations && variations.length > 0) {
                            context.productVariations = variations
                            // CRÍTICO: Guardar también en sesión para que persistan entre mensajes
                            session.productVariations = variations
                            console.log(`[WooCommerce] ✅ ${variations.length} variaciones encontradas para "${productStockData.name}"`)
                          }
                        } catch (error) {
                          console.error(`[WooCommerce] ⚠️  Error obteniendo variaciones: ${error.message}`)
                        }
                      }
                      
                      context.productStockData = productStockData
                      context.productSearchResults = [productStockData]
                    } else if (matchResult.status === 'AMBIGUOUS') {
                      // Múltiples coincidencias exactas: listar productos ambiguos
                      console.log(`[WooCommerce] ⚠️  Múltiples productos con coincidencia exacta (${matchResult.ambiguousProducts.length}), se listarán para confirmación`)
                      productSearchResults = matchResult.ambiguousProducts.map(m => m.originalProduct)
                      context.productSearchResults = productSearchResults
                    } else {
                    // NOT_FOUND: no hay coincidencia exacta, buscar productos que contengan el término
                    console.log(`[WooCommerce] ❌ No se encontró coincidencia exacta con término: "${termToUse}"`)
                    console.log(`[WooCommerce] 🔍 Buscando productos que contengan el término parcialmente...`)
                    
                    // Normalizar término para búsqueda parcial (caracteres especiales, espacios)
                    const normalizedTerm = normalizeSearchText(termToUse)
                    let termWords = normalizedTerm.split(/\s+/).filter(w => w.length > 1) // Palabras de más de 1 carácter (más permisivo)
                    
                    // Si no hay palabras separadas pero el término tiene contenido, usarlo completo
                    if (termWords.length === 0 && normalizedTerm.length > 2) {
                      termWords = [normalizedTerm]
                    }
                    
                    // Siempre intentar búsqueda parcial si hay al menos una palabra
                    if (termWords.length > 0) {
                      console.log(`[WooCommerce] Palabras a buscar: ${termWords.join(', ')}`)
                      
                      // Por cada término, generar sus variaciones (singular/plural) y guardar qué término representa
                      const termWordToVariations = []
                      const wordVariations = new Set()
                      termWords.forEach(word => {
                        const variations = new Set([word])
                        wordVariations.add(word)
                        
                        const singular = pluralToSingular(word)
                        if (singular !== word && singular.length > 1) {
                          variations.add(singular)
                          wordVariations.add(singular)
                        }
                        if (!word.endsWith('s') || word.length <= 4) {
                          const plural = singularToPlural(word)
                          if (plural !== word && plural.length > 1) {
                            variations.add(plural)
                            wordVariations.add(plural)
                          }
                        }
                        if (singular !== word) {
                          const pluralFromSingular = singularToPlural(singular)
                          if (pluralFromSingular !== singular && pluralFromSingular.length > 1) {
                            variations.add(pluralFromSingular)
                            wordVariations.add(pluralFromSingular)
                          }
                        }
                        termWordToVariations.push({ termWord: word, variations: Array.from(variations) })
                      })
                      
                      const allVariations = Array.from(wordVariations)
                      // Relevancia: si el usuario buscó 2+ palabras, exigir que coincidan al menos 2 (evita "mano" → Sunderland)
                      const minTermsRequired = Math.min(2, termWords.length)
                      console.log(`[WooCommerce] Búsqueda con variaciones: ${allVariations.join(', ')} (mín. ${minTermsRequired} términos)`)
                      console.log(`[WooCommerce] Total de productos a buscar: ${allProducts.length}`)
                      
                      // Buscar productos: nombre con palabra completa (evita "mano" en "manual"); SKU puede ser substring
                      const partialMatches = allProducts.filter(product => {
                        const productName = normalizeSearchText(product.name || '')
                        const productSku = normalizeCode(product.sku || '')
                        let termsMatched = 0
                        for (const { variations } of termWordToVariations) {
                          const match = variations.some(v =>
                            containsWholeWord(productName, v) ||
                            (productSku && productSku.includes(v.toUpperCase()))
                          )
                          if (match) termsMatched++
                        }
                        return termsMatched >= minTermsRequired
                      })

                      const hasPartialMatches = partialMatches.length > 0
                      if (hasPartialMatches) {
                        // Ordenar por relevancia: más términos coincidentes y más puntuación primero
                        const scoredMatches = partialMatches.map(product => {
                          const productName = normalizeSearchText(product.name || '')
                          const productSku = normalizeCode(product.sku || '')
                          let score = 0
                          let termsMatched = 0
                          for (const { variations } of termWordToVariations) {
                            let termScore = 0
                            for (const word of variations) {
                              const wordUpper = word.toUpperCase()
                              if (productSku && productSku.includes(wordUpper)) termScore = Math.max(termScore, 3)
                              if (containsWholeWord(productName, word)) termScore = Math.max(termScore, 2)
                              if (productName.startsWith(word + ' ')) termScore = Math.max(termScore, 1)
                            }
                            if (termScore > 0) termsMatched++
                            score += termScore
                          }
                          return { product, score, termsMatched }
                        }).sort((a, b) => b.termsMatched - a.termsMatched || b.score - a.score)
                        const topMatches = scoredMatches.slice(0, 10).map(m => m.product)
                        console.log(`[WooCommerce] ✅ Encontrados ${partialMatches.length} productos relevantes para "${termToUse}" (mostrando top ${topMatches.length})`)
                        productSearchResults = topMatches
                        context.productSearchResults = productSearchResults
                        console.log(`[WooCommerce] Productos encontrados: ${topMatches.map(p => p.name).join(', ')}`)
                      } else {
                        console.log(`[WooCommerce] ❌ No se encontraron productos que contengan "${termToUse}"`)
                        
                        // Fallback: usar búsqueda nativa de WooCommerce (full-text) para no perder coincidencias simples
                        try {
                          const wpFallbackResults = await wordpressService.searchProductsInWordPress(termToUse, 10)
                          if (wpFallbackResults?.length) {
                            productSearchResults = wpFallbackResults
                            context.productSearchResults = wpFallbackResults
                            console.log(`[WooCommerce] ✅ Fallback WP search: ${wpFallbackResults.length} productos para "${termToUse}"`)
                          } else {
                            console.log(`[WooCommerce] ⚠️ Fallback WP search sin resultados para "${termToUse}"`)
                          }
                        } catch (fallbackError) {
                          console.error(`[WooCommerce] ❌ Error en fallback WP search:`, fallbackError.message)
                        }
                      }
                    } else {
                      console.log(`[WooCommerce] ⚠️  No se pueden buscar palabras: término="${termToUse}", normalizado="${normalizedTerm}", palabras extraídas=${termWords.length}`)
                    }
                    } // Cierra el else del matchResult.status === 'NOT_FOUND'
                  } else {
                    console.log(`[WooCommerce] ⚠️  No se pudieron obtener productos de WooCommerce`)
                  }
                } catch (error) {
                  console.error(`[WooCommerce] ❌ Error en matching determinístico:`, error.message)
                  console.error(`   Stack:`, error.stack?.substring(0, 500))
                }
              } else {
                console.log(`[WooCommerce] ⚠️  No se pudo extraer término del producto del mensaje`)
              }
            } // Cierra el if (!productStockData) de la línea 1245
          } // Cierra el if (!productStockData && !productSearchResults.length) de la línea 1190
        } else {
          console.log(`[WooCommerce] ⚠️  Mensaje muy corto después de limpieza, no se puede buscar por nombre`)
        } // Cierra el if (cleanMessage.length > 3) de la línea 1137
      } else {
        console.log(`[WooCommerce] ✅ Producto encontrado por referencia explícita, omitiendo búsqueda adicional`)
      } // Cierra el if (!productStockData) de la línea 1120
      
      // Fallback adicional: SOLO usar si hay un término muy específico y claro
      // Preferimos pedir más información antes que devolver productos erróneos
      if (!productStockData && (!productSearchResults.length && !(context.productSearchResults?.length))) {
        // Usar término de OpenAI si está disponible, sino extraer del mensaje
        const fallbackTerm = context.terminoProductoParaBuscar || extractProductTerm(message)
        
        // VALIDACIÓN ESTRICTA: Solo usar fallback si hay término específico y válido
        // 1. Hay un término extraído válido (más de 3 caracteres)
        // 2. El término no es genérico (no está en lista de términos genéricos)
        const genericTerms = ['producto', 'productos', 'articulo', 'articulos', 'artículo', 'artículos', 'item', 'items', 'cosa', 'cosas', 'objeto', 'objetos']
        const isGenericTerm = fallbackTerm && genericTerms.includes(fallbackTerm.toLowerCase().trim())
        const hasValidTerm = fallbackTerm && fallbackTerm.trim().length >= 3 && !isGenericTerm
        
        // Validación adicional: si el término es muy corto o solo contiene palabras genéricas, no usar fallback
        let puedeUsarFallback = hasValidTerm
        if (fallbackTerm) {
          const palabras = fallbackTerm.toLowerCase().trim().split(/\s+/)
          const todasGenericas = palabras.every(palabra => genericTerms.includes(palabra) || palabra.length < 3)
          if (todasGenericas) {
            console.log(`[WooCommerce] ⚠️ Término del fallback contiene solo palabras genéricas: "${fallbackTerm}" → No se usará fallback`)
            puedeUsarFallback = false
          }
        }
        
        if (puedeUsarFallback) {
          console.log(`[WooCommerce] 🔍 Fallback usando término específico: "${fallbackTerm}"`)
          try {
            const wpFallbackResults = await wordpressService.searchProductsInWordPress(fallbackTerm, 10)
            if (wpFallbackResults?.length) {
              // Solo aceptar resultados del fallback si hay un término muy específico
              // Si hay múltiples resultados, listarlos pero pedir confirmación
              if (wpFallbackResults.length === 1) {
                // Un solo resultado: verificar que el nombre contenga el término buscado
                const productName = normalizeSearchText(wpFallbackResults[0].name || '')
                const searchTerm = normalizeSearchText(fallbackTerm)
                if (productName.includes(searchTerm) || searchTerm.length >= 5) {
                  // Solo aceptar si el nombre contiene el término o el término es largo (más específico)
                  productStockData = wpFallbackResults[0]
                  context.productStockData = productStockData
                  session.currentProduct = wpFallbackResults[0]
                  console.log(`[WooCommerce] ✅ Fallback WP search: producto único y relevante encontrado - ${productStockData.name}`)
                } else {
                  console.log(`[WooCommerce] ⚠️ Fallback encontró producto pero no es relevante, se pedirá más información`)
                }
              } else {
                // Múltiples resultados: listarlos pero marcar que se necesita confirmación
                productSearchResults = wpFallbackResults
                context.productSearchResults = wpFallbackResults
                context.needsConfirmation = true // Marcar que necesita confirmación del cliente
                console.log(`[WooCommerce] ⚠️ Fallback encontró ${wpFallbackResults.length} productos, se pedirá confirmación`)
              }
            } else {
              console.log(`[WooCommerce] ⚠️ Fallback WP search sin resultados para "${fallbackTerm}"`)
            }
          } catch (fallbackError) {
            console.error(`[WooCommerce] ❌ Error en fallback WP search:`, fallbackError.message)
          }
        } else {
          console.log(`[WooCommerce] ⚠️ Término no suficientemente específico para fallback (término: "${fallbackTerm}"), se pedirá más información al cliente`)
        }
      }
        } // cierra if (!resolvedFromLastShown)
      } // Cierra el else de "si ya tenemos producto del contexto, omitir búsquedas"
      
      // Verificar resultados finales (usar context para asegurar que tenemos los valores actualizados)
      const finalSearchResults = context.productSearchResults || productSearchResults || []
      // Un solo resultado: afirmar producto y fijar contexto (no pedir confirmación)
      if (!productStockData && finalSearchResults.length === 1) {
        productStockData = finalSearchResults[0]
        context.productStockData = productStockData
        session.currentProduct = finalSearchResults[0]
        session.productVariations = null
        session.lastShownResults = null
        session.lastSearchTerm = null
        console.log(`[WooCommerce] ✅ Un solo resultado: afirmando producto y fijando contexto - ${productStockData.name || 'N/A'}`)
      } else if (!productStockData && finalSearchResults.length > 0) {
        let listToStore = finalSearchResults
        if (finalSearchResults.length > 1) {
          try {
            const suggestedIdx = await conkavoAI.desambiguarProductos(message, finalSearchResults)
            if (suggestedIdx >= 1 && suggestedIdx <= finalSearchResults.length) {
              listToStore = [finalSearchResults[suggestedIdx - 1], ...finalSearchResults.filter((_, i) => i !== suggestedIdx - 1)]
              context.productSearchResults = listToStore.slice(0, 10)
              console.log(`[WooCommerce] ✅ IA desambiguación: producto más probable puesto primero (${finalSearchResults[suggestedIdx - 1]?.name || 'N/A'})`)
            }
          } catch (err) {
            console.warn('[WooCommerce] ⚠️ Error desambiguarProductos:', err?.message)
          }
        }
        session.lastShownResults = listToStore
        session.lastSearchTerm = normalizeCode(providedExplicitSku || context.terminoProductoParaBuscar || '')
        console.log(`[WooCommerce] 📋 Lista de ${listToStore.length} resultados guardada para contexto de seguimiento`)
      } else if (productStockData) {
        session.lastShownResults = null
        session.lastSearchTerm = null
      }
      if (!productStockData && !finalSearchResults.length) {
        console.log(`[WooCommerce] ⚠️ No se encontraron productos para: "${message}"`)
      } else {
        console.log(`[WooCommerce] ✅ Resultados finales: productStockData=${!!productStockData}, resultados parciales=${finalSearchResults.length}`)
      }
      
    } catch (error) {
      console.error('❌ Error consultando WooCommerce:', error.message)
      console.error('   Stack:', error.stack)
      // Continuar sin datos de stock, el agente responderá genéricamente
    }
  }
  
  // Si es VARIANTE, manejar consultas sobre variantes (con o sin valorAtributo específico)
  // Ejemplos: "tienes en mas colores?" (sin valorAtributo) o "tienes en rojo?" (con valorAtributo)
  if (queryType === 'VARIANTE' && analisisOpenAI?.atributo) {
    console.log(`[WooCommerce] 🔍 Validando variante: atributo="${analisisOpenAI?.atributo || 'N/A'}", valor="${analisisOpenAI?.valorAtributo || 'N/A'}"`)
    // Inicializar para que el flujo posterior nunca asuma undefined
    context.variantesDisponibles = context.variantesDisponibles || null
    context.variantePidioListar = context.variantePidioListar || false

    // CRÍTICO: Validación MUY TEMPRANA - Si no hay producto en contexto NI en analisisOpenAI, usar lastShownResults si existe
    const tieneProductoEnContexto = session.currentProduct || context.currentProduct || productStockData
    const tieneSkuOTermino = analisisOpenAI?.sku || analisisOpenAI?.terminoProducto
    const lastShown = session.lastShownResults || []
    
    // Si no hay producto en contexto pero acabamos de mostrar una lista: 1 resultado = usarlo; varios = pedir "de cuál"
    if (!tieneProductoEnContexto && !tieneSkuOTermino && lastShown.length > 0) {
      if (lastShown.length === 1) {
        productStockData = lastShown[0]
        context.productStockData = productStockData
        session.currentProduct = lastShown[0]
        session.productVariations = null
        session.lastShownResults = null
        session.lastSearchTerm = null
        console.log(`[WooCommerce] ✅ VARIANTE: usando único producto de la lista mostrada - ${productStockData.name || 'N/A'}`)
      } else {
        const atributoNombre = analisisOpenAI.atributo === 'color' ? 'colores' : 
                               analisisOpenAI.atributo === 'talla' ? 'tallas' : 
                               analisisOpenAI.atributo === 'tamaño' ? 'tamaños' : 
                               `${analisisOpenAI.atributo}s`
        return createResponse(
          `¿De cuál de los productos que te mostré quieres ver los ${atributoNombre}? Indica el nombre o el SKU (por ejemplo ${lastShown[0]?.sku || 'el SKU'}). 😊`,
          session.state,
          null,
          cart
        )
      }
    }
    
    if (!tieneProductoEnContexto && !tieneSkuOTermino && !productStockData) {
      console.log(`[WooCommerce] ⚠️ VARIANTE sin producto ni SKU/término - retornando mensaje amigable inmediatamente`)
      
      // CRÍTICO: Detectar si es palabra simple sin contexto (ej: "color", "colores", "talla")
      const palabrasSimples = ['color', 'colores', 'talla', 'tallas', 'tamaño', 'tamaños', 'variacion', 'variaciones']
      const esPalabraSimple = palabrasSimples.includes(message.toLowerCase().trim())
      
      if (esPalabraSimple) {
        session.currentProduct = null
        session.productVariations = null
        console.log(`[WooCommerce] 🔄 Palabra simple detectada sin contexto - contexto limpiado`)
      }
      
      const atributoNombre = analisisOpenAI.atributo === 'color' ? 'colores' : 
                             analisisOpenAI.atributo === 'talla' ? 'tallas' : 
                             analisisOpenAI.atributo === 'tamaño' ? 'tamaños' : 
                             `${analisisOpenAI.atributo}s`
      return createResponse(
        `Para poder mostrarte los ${atributoNombre} disponibles, necesito que me indiques el nombre completo o el SKU del producto. ¿Me lo puedes confirmar? 😊`,
        session.state,
        null,
        cart
      )
    }
    
    try {
      // CRÍTICO: Si no tenemos el producto aún, primero usar el del contexto (solo si el usuario NO pide otro producto), luego buscar
      if (!productStockData) {
        // Primero intentar usar producto del contexto (para preguntas de seguimiento)
        if (session.currentProduct || context.currentProduct) {
          const productoContexto = session.currentProduct || context.currentProduct
          // CRÍTICO: No usar contexto si el usuario pide OTRO producto (ej. "qué colores tiene el K78?" con contexto B85)
          if (!userAsksForDifferentProduct(message, productoContexto, analisisOpenAI, providedExplicitSku, providedExplicitId)) {
          // CRÍTICO: Validar que el producto en contexto tenga el atributo solicitado
          // Si el producto no tiene el atributo (ej: L39 no tiene "talla", solo tiene "color"),
          // limpiar contexto y pedir producto específico
          if (analisisOpenAI?.atributo && productoContexto.attributes && Array.isArray(productoContexto.attributes)) {
            const tieneAtributo = productoContexto.attributes.some(attr => {
              const attrName = (attr.name || '').toLowerCase().trim()
              const atributoSolicitado = (analisisOpenAI.atributo || '').toLowerCase().trim()
              return attrName === atributoSolicitado
            })
            
            if (!tieneAtributo) {
              // El producto en contexto no tiene el atributo solicitado
              // Limpiar contexto y continuar sin contexto (se pedirá producto)
              console.log(`[WooCommerce] ⚠️ Producto en contexto "${productoContexto.name || 'N/A'}" no tiene atributo "${analisisOpenAI.atributo}" - limpiando contexto`)
              session.currentProduct = null
              session.productVariations = null
              productStockData = null
            } else {
              // El producto tiene el atributo, usarlo
              productStockData = productoContexto
              console.log(`[WooCommerce] ✅ Usando producto del contexto para variante: ${productStockData.name || 'N/A'}`)
            }
          } else {
            // No hay atributo en analisisOpenAI o no hay attributes en producto, usar contexto directamente
            productStockData = productoContexto
            console.log(`[WooCommerce] ✅ Usando producto del contexto para variante: ${productStockData.name || 'N/A'}`)
          }
          } else {
            console.log(`[WooCommerce] 🔄 VARIANTE: usuario pide otro producto, no usar contexto → buscar por SKU/término`)
          }
        }
        if (!productStockData && analisisOpenAI) {
          // Si no hay producto en contexto, buscar por SKU o término (raw y normalizado en paralelo)
          const skuToSearch = analisisOpenAI.sku || analisisOpenAI.terminoProducto
          if (skuToSearch) {
            const normalizedSkuSearch = normalizeCode(skuToSearch)
            const [byRaw, byNorm] = await Promise.all([
              /[-.\s]/.test(String(skuToSearch)) ? wordpressService.getProductBySku(skuToSearch) : Promise.resolve(null),
              wordpressService.getProductBySku(normalizedSkuSearch)
            ])
            productStockData = byRaw || byNorm
            if (!productStockData) {
              // Intentar por término
              const termino = analisisOpenAI.terminoProducto || extractProductTerm(message)
              if (termino) {
                const searchResults = await wordpressService.searchProductsInWordPress(termino, 5)
                if (searchResults && searchResults.length > 0) {
                  productStockData = searchResults[0]
                }
              }
            }
          }
        }
      }
      
      // CRÍTICO: Validación temprana - Si después de buscar no tenemos producto, retornar mensaje amigable
      if (!productStockData) {
        console.log(`[WooCommerce] ⚠️ No hay producto en contexto para consultar variaciones`)
        const atributoNombre = analisisOpenAI.atributo === 'color' ? 'colores' : 
                               analisisOpenAI.atributo === 'talla' ? 'tallas' : 
                               analisisOpenAI.atributo === 'tamaño' ? 'tamaños' : 
                               `${analisisOpenAI.atributo}s`
        return createResponse(
          `Para poder mostrarte los ${atributoNombre} disponibles, necesito que me indiques el nombre completo o el SKU del producto. ¿Me lo puedes confirmar? 😊`,
          session.state,
          null,
          cart
        )
      }
      
      // CRÍTICO: Si el producto es una variación (tiene parent_id), obtener el producto padre y variaciones en paralelo
      if (productStockData && productStockData.parent_id) {
        const parentId = productStockData.parent_id
        console.log(`[WooCommerce] 🔄 Producto en contexto es una variación (parent_id: ${parentId}), obteniendo producto padre y variaciones en paralelo...`)
        try {
          const [parentProduct, variationsFromParent] = await Promise.all([
            wordpressService.getProductById(parentId),
            wordpressService.getProductVariations(parentId)
          ])
          if (parentProduct) {
            productStockData = parentProduct
            console.log(`[WooCommerce] ✅ Producto padre obtenido: ${parentProduct.name || 'N/A'} (ID: ${parentProduct.id})`)
            if (Array.isArray(variationsFromParent) && variationsFromParent.length > 0) {
              context.productVariations = variationsFromParent
              session.productVariations = variationsFromParent
              console.log(`[WooCommerce] ✅ ${variationsFromParent.length} variaciones cargadas`)
            }
          } else {
            console.log(`[WooCommerce] ⚠️ No se pudo obtener producto padre, usando variación encontrada`)
          }
        } catch (error) {
          console.error(`[WooCommerce] ⚠️ Error obteniendo producto padre/variaciones: ${error.message}`)
        }
      }
      
      if (productStockData) {
        context.productStockData = productStockData
        session.currentProduct = productStockData
        
        // CRÍTICO: Verificar si es producto variable y cargar variaciones SIEMPRE cuando se pregunta por variantes
        // Esto aplica tanto para consultas con valorAtributo específico como sin él (listar todas)
        if (productStockData.type === 'variable' && productStockData.id && analisisOpenAI?.atributo) {
          // Usar variaciones ya cargadas (por parent_id en paralelo) o de sesión; si no hay, cargar
          if (!context.productVariations) {
            if (session.productVariations) {
              context.productVariations = session.productVariations
              console.log(`[WooCommerce] 🔄 Usando variaciones de sesión: ${session.productVariations.length} variaciones`)
            } else {
              console.log(`[WooCommerce] 🔄 Cargando variaciones para producto variable...`)
              try {
                const variations = await wordpressService.getProductVariations(productStockData.id)
                if (variations && variations.length > 0) {
                  context.productVariations = variations
                  session.productVariations = variations
                  console.log(`[WooCommerce] ✅ ${variations.length} variaciones cargadas`)
                }
              } catch (error) {
                console.error(`[WooCommerce] ⚠️ Error cargando variaciones: ${error.message}`)
              }
            }
          }
          
          const tieneValorAtributo = analisisOpenAI?.valorAtributo && analisisOpenAI.valorAtributo.trim().length > 0
          
          if (tieneValorAtributo) {
          // Normalizar atributo y valor para búsqueda (ya validados en el if)
          const atributoNormalizado = (analisisOpenAI.atributo || '').toLowerCase().trim()
          const valorNormalizado = (analisisOpenAI.valorAtributo || '').toLowerCase().trim()
          
          // OPTIMIZACIÓN: Primero verificar en attributes del producto padre si existe el atributo
          let atributoExisteEnPadre = false
          if (productStockData.attributes && Array.isArray(productStockData.attributes)) {
            atributoExisteEnPadre = productStockData.attributes.some(attr => {
              const attrName = (attr.name || '').toLowerCase().trim()
              if (attrName === atributoNormalizado && attr.options && Array.isArray(attr.options)) {
                // Verificar si el valor existe en las opciones
                return attr.options.some(opt => {
                  const optValue = (opt || '').toLowerCase().trim()
                  return optValue === valorNormalizado
                })
              }
              return false
            })
          }
          
          if (!atributoExisteEnPadre) {
            // El atributo/valor no existe en el producto padre, no puede existir en variaciones
            context.varianteValidada = false
            context.varianteNoEncontrada = {
              atributo: analisisOpenAI?.atributo || 'atributo',
              valor: analisisOpenAI?.valorAtributo || 'valor',
              razon: 'Atributo/valor no existe en el producto'
            }
            console.log(`[WooCommerce] ❌ Atributo/valor no existe en producto padre: ${atributoNormalizado}="${valorNormalizado}"`)
          } else {
            // El atributo existe, ahora consultar variaciones para validar
            let variations = await wordpressService.getProductVariations(productStockData.id)
            if (!Array.isArray(variations)) variations = []
            context.productVariations = variations
            // CRÍTICO: Guardar también en sesión para que persistan entre mensajes
            session.productVariations = variations

            // Buscar variación que coincida con el atributo y valor solicitados
            const varianteEncontrada = variations.find(variation => {
              if (!variation || !variation.attributes || !Array.isArray(variation.attributes)) return false

              return variation.attributes.some(attr => {
                const attrName = (attr.name || '').toLowerCase().trim()
                const attrValue = (attr.option || '').toLowerCase().trim()
                
                // Verificar coincidencia exacta de atributo y valor (ya normalizados)
                return attrName === atributoNormalizado && attrValue === valorNormalizado
              })
            })
            
            if (varianteEncontrada) {
              // Variante existe, usar esta variación como producto
              productStockData = {
                ...varianteEncontrada,
                name: productStockData.name, // Mantener nombre del padre
                parent_id: productStockData.id
              }
              context.productStockData = productStockData
              context.varianteValidada = true
              console.log(`[WooCommerce] ✅ Variante encontrada: ${atributoNormalizado}="${valorNormalizado}"`)
            } else {
              // Variante no existe en las variaciones (aunque el atributo existe en el padre)
              context.varianteValidada = false
              context.varianteNoEncontrada = {
                atributo: analisisOpenAI?.atributo || 'atributo',
                valor: analisisOpenAI?.valorAtributo || 'valor',
                razon: 'Atributo existe pero variante específica no encontrada'
              }
              console.log(`[WooCommerce] ❌ Variante no encontrada en variaciones: ${atributoNormalizado}="${valorNormalizado}"`)
            }
          }
        } else {
            // CASO 2: NO tiene valorAtributo → Listar todas las variantes disponibles del atributo
            // Ejemplo: "qué color tiene T60?" o "en que colores?" → listar todos los colores disponibles
            const atributoNormalizado = (analisisOpenAI.atributo || '').toLowerCase().trim()
            console.log(`[WooCommerce] 🔍 Consultando variantes disponibles para atributo: "${atributoNormalizado}"`)
            
            // Las variaciones ya deberían estar cargadas arriba, pero verificar
            if (!context.productVariations && productStockData.id) {
              // Primero intentar usar variaciones de sesión si están disponibles
              if (session.productVariations) {
                context.productVariations = session.productVariations
                console.log(`[WooCommerce] 🔄 Usando variaciones de sesión: ${session.productVariations.length} variaciones`)
              } else {
                console.log(`[WooCommerce] 🔄 Cargando variaciones para listar ${atributoNormalizado}s...`)
                try {
                  let variations = await wordpressService.getProductVariations(productStockData.id)
                  if (!Array.isArray(variations)) variations = []
                  if (variations.length > 0) {
                    context.productVariations = variations
                    // CRÍTICO: Guardar también en sesión para que persistan entre mensajes
                    session.productVariations = variations
                    console.log(`[WooCommerce] ✅ ${variations.length} variaciones cargadas`)
                  }
                } catch (error) {
                  console.error(`[WooCommerce] ⚠️ Error cargando variaciones: ${error.message}`)
                  context.productVariations = []
                }
              }
            }
            
            // Extraer valores únicos del atributo solicitado (WooCommerce puede usar "pa_color", "pa_talla", etc.)
            const valoresDisponibles = new Set()
            const attrNameMatches = (name) => {
              const n = (name || '').toLowerCase().trim()
              if (n === atributoNormalizado) return true
              if (n.replace(/^pa_/, '') === atributoNormalizado) return true
              if (atributoNormalizado.length >= 2 && n.includes(atributoNormalizado)) return true
              return false
            }
            if (context.productVariations && Array.isArray(context.productVariations)) {
              context.productVariations.forEach(variation => {
                if (variation && variation.attributes && Array.isArray(variation.attributes)) {
                  variation.attributes.forEach(attr => {
                    const attrName = (attr.name || '').toLowerCase().trim()
                    if (attrNameMatches(attrName) && attr.option) {
                      valoresDisponibles.add(attr.option.trim())
                    }
                  })
                }
              })
            }
            // Si no hubo match en variaciones, intentar en attributes del producto padre
            if (valoresDisponibles.size === 0 && productStockData.attributes && Array.isArray(productStockData.attributes)) {
              productStockData.attributes.forEach(attr => {
                const attrName = (attr.name || '').toLowerCase().trim()
                if (attrNameMatches(attrName) && attr.options && Array.isArray(attr.options)) {
                  attr.options.forEach(opt => {
                    if (opt && String(opt).trim()) valoresDisponibles.add(String(opt).trim())
                  })
                }
              })
            }
            
            // Guardar valores REALES disponibles (validados de WooCommerce)
            const valoresArray = Array.from(valoresDisponibles).sort()
            
            // ⚠️ VALIDACIÓN: Solo guardar si hay valores REALES
            if (valoresArray.length > 0) {
              context.variantesDisponibles = {
                atributo: analisisOpenAI.atributo,
                valores: valoresArray // Valores REALES de WooCommerce
              }
              
              console.log(`[WooCommerce] ✅ Variantes REALES disponibles para "${atributoNormalizado}": ${valoresArray.join(', ')}`)
              context.varianteValidada = true
              context.variantePidioListar = false
              // Mantener productStockData REAL para que la IA tenga contexto
              context.productStockData = productStockData
            } else {
              // No hay variantes REALES - usuario pidió listar pero no pudimos (no decir "valor")
              console.log(`[WooCommerce] ⚠️ No se encontraron variantes REALES para "${atributoNormalizado}"`)
              context.varianteValidada = false
              context.variantePidioListar = true
              context.variantesDisponibles = { atributo: analisisOpenAI?.atributo || 'atributo', valores: [] }
            }
          }
        } else {
          // Producto no es variable, no puede tener variantes
          context.varianteValidada = false
          context.varianteNoEncontrada = {
            atributo: analisisOpenAI?.atributo || 'atributo',
            valor: analisisOpenAI?.valorAtributo || 'valor',
            razon: 'Producto no es variable'
          }
          context.variantesDisponibles = { atributo: analisisOpenAI?.atributo || 'atributo', valores: [] }
          context.variantePidioListar = true
          console.log(`[WooCommerce] ⚠️ Producto no es variable, no puede tener variantes`)
        }
      } else {
        // Producto no encontrado
        context.varianteValidada = false
        context.variantesDisponibles = { atributo: analisisOpenAI?.atributo || 'atributo', valores: [] }
        console.log(`[WooCommerce] ⚠️ Producto no encontrado para validar variante`)
      }
    } catch (error) {
      console.error(`[WooCommerce] ❌ Error validando variante:`, error.message)
      context.varianteValidada = false
      // Dejar contexto coherente para que la construcción de textoParaIA no dependa de undefined
      context.variantesDisponibles = {
        atributo: analisisOpenAI?.atributo || 'atributo',
        valores: []
      }
      context.variantePidioListar = true

      // CRÍTICO: Si hay error y no hay producto válido, limpiar contexto y retornar mensaje amigable
      // Esto previene errores genéricos cuando hay problemas procesando variantes
      const productoValido = productStockData && productStockData.id && productStockData.name
      if (!productoValido) {
        session.currentProduct = null
        session.productVariations = null
        const atributoNombre = analisisOpenAI?.atributo === 'color' ? 'colores' : 
                               analisisOpenAI?.atributo === 'talla' ? 'tallas' : 
                               analisisOpenAI?.atributo === 'tamaño' ? 'tamaños' : 
                               analisisOpenAI?.atributo ? `${analisisOpenAI.atributo}s` : 'variaciones'
        return createResponse(
          `Para poder mostrarte los ${atributoNombre} disponibles, necesito que me indiques el nombre completo o el SKU del producto. ¿Me lo puedes confirmar? 😊`,
          session.state,
          null,
          cart
        )
      }
    }
  }
  
  // Si es CARACTERISTICAS, preparar información de características
  if (queryType === 'CARACTERISTICAS') {
    console.log(`[WooCommerce] 🔍 Consulta de características`)
    
    try {
      // CRÍTICO: Si no tenemos el producto aún, usar contexto solo si el usuario NO pide otro producto, luego buscar
      if (!productStockData) {
        if (session.currentProduct || context.currentProduct) {
          const productoContextoCar = session.currentProduct || context.currentProduct
          // CRÍTICO: No usar contexto si el usuario pide OTRO producto (ej. "qué tiene el K78?" con contexto B85)
          if (!userAsksForDifferentProduct(message, productoContextoCar, analisisOpenAI, providedExplicitSku, providedExplicitId)) {
            productStockData = productoContextoCar
            console.log(`[WooCommerce] ✅ Usando producto del contexto para características: ${productStockData.name || 'N/A'}`)
          } else {
            console.log(`[WooCommerce] 🔄 CARACTERISTICAS: usuario pide otro producto, no usar contexto → buscar por SKU/término`)
          }
        }
        if (!productStockData) {
          // Si no hay producto en contexto (o no debemos usarlo), buscar por SKU o término (raw y normalizado en paralelo)
          const skuToSearch = analisisOpenAI?.sku || analisisOpenAI?.terminoProducto
          if (skuToSearch) {
            const normalizedSkuSearch = normalizeCode(skuToSearch)
            const [byRaw, byNorm] = await Promise.all([
              /[-.\s]/.test(String(skuToSearch)) ? wordpressService.getProductBySku(skuToSearch) : Promise.resolve(null),
              wordpressService.getProductBySku(normalizedSkuSearch)
            ])
            productStockData = byRaw || byNorm
            if (!productStockData) {
              // Intentar por término
              const termino = analisisOpenAI?.terminoProducto || extractProductTerm(message)
              if (termino) {
                const searchResults = await wordpressService.searchProductsInWordPress(termino, 5)
                if (searchResults && searchResults.length > 0) {
                  productStockData = searchResults[0]
                }
              }
            }
          }
        }
      }
      
      if (productStockData) {
        context.productStockData = productStockData
        session.currentProduct = productStockData
        console.log(`[WooCommerce] ✅ Producto encontrado para características: ${productStockData.name || 'N/A'}`)
      }
    } catch (error) {
      console.error(`[WooCommerce] ❌ Error obteniendo producto para características:`, error.message)
    }
  }
  
  // Si es consulta de información general, siempre incluir info de la empresa
  // (La información de la empresa ya está en context.companyInfo)
  
  // El backend decide qué hacer y arma el texto para la IA
  let textoParaIA = ''
  let aiResponse = ''
  
  try {
    // DETECTAR TIPO DE CONSULTA Y ARMAR TEXTO PARA LA IA
    // queryType ya fue decidido por OpenAI o regex arriba
    // Usuario no logueado pidiendo productos/precios/stock/variantes: no revelar info sensible; derivar a solicitud de cuenta
    const queryTypeSensible = queryType === 'PRODUCTOS' || queryType === 'RECOMENDACION' || queryType === 'VARIANTE'
    if (!isLoggedIn && queryTypeSensible) {
      const info = companyInfoService.getCompanyInfo()
      textoParaIA = getMessageNecesitasCuentaParaPreciosStock(message, info.comoRealizarPedido.paso1)
    } else if (queryType === 'DERIVACION_HUMANO') {
      const companyInfo = companyInfoService.formatCompanyInfoForAgent()
      textoParaIA = `Redacta una respuesta breve y profesional en español chileno.

El cliente pidió hablar con una persona o ejecutivo: "${message}"

INSTRUCCIONES:
- Indica que puede escribir al correo ventas@imblasco.cl o llamar a los teléfonos de contacto para hablar con un ejecutivo (usa la sección CONTACTO de la información abajo).
- PROHIBIDO: NO digas que "un ejecutivo lo contactará", NO pidas "dejar datos para que los llamemos". Nosotros NO hacemos eso.
- Sé empático y profesional, estilo WhatsApp.
- NO busques productos ni des información de catálogo.

INFORMACIÓN DE CONTACTO (usa solo esto):
${companyInfo}`
    } else if (queryType === 'RECLAMO') {
      textoParaIA = `Redacta una respuesta breve y profesional en español chileno.

El cliente expresó una queja o reclamo: "${message}"

INSTRUCCIONES:
- Reconoce su malestar y agradece que lo comunique.
- Indica que puede escribir al correo ventas@imblasco.cl para que el equipo revise su caso.
- PROHIBIDO: NO digas que "un ejecutivo se hará cargo" ni que "te contactaremos". NO pidas "dejar datos para que los llamemos". Nosotros NO hacemos eso.
- Sé empático y profesional, estilo WhatsApp.
- NO busques productos ni des información de catálogo.`
    } else if (queryType === 'DEVOLUCION') {
      const info = companyInfoService.getCompanyInfo()
      const garantiaTexto = `GARANTÍA Y DEVOLUCIONES:
- Productos nuevos: ${info.garantia.productosNuevos}
- Perecibles o uso breve: ${info.garantia.pereciblesUsoBreve}
- ${info.garantia.requisitos}

DERECHO A RETRACTO (devoluciones):
- ${info.derechoRetracto.aplica}
- ${info.derechoRetracto.costos}
- ${info.derechoRetracto.noAplica}`
      textoParaIA = `Redacta una respuesta breve y profesional en español chileno.

El cliente quiere devolver un producto: "${message}"

INSTRUCCIONES:
- Responde SOLO con la política de garantía y devoluciones. Usa EXACTAMENTE la información siguiente.
- PROHIBIDO: NO digas que "un ejecutivo se pondrá en contacto", NO pidas "dejar datos" ni "te llamaremos". Nosotros NO hacemos eso.
- Sé claro y profesional, estilo WhatsApp.

INFORMACIÓN OBLIGATORIA A INCLUIR:
${garantiaTexto}`
    } else if (queryType === 'INFORMACION_GENERAL') {
      // VALIDACIÓN CRÍTICA: Verificar que NO sea un saludo mal clasificado
      const normalizedMessage = normalizeSearchText(message).toLowerCase().trim()
      const isGreeting = /^(hola|hi|hello|buenos\s+dias|buenas\s+tardes|buenas\s+noches|buen\s+dia|buen\s+día|hey|saludos)/i.test(message) && 
        (normalizedMessage.length < 25 || /^(hola|hi|hello|buenos|buenas|hey|saludos)[\s!.,]*$/i.test(message))
      
      if (isGreeting) {
        // Es un saludo, no información general - responder como saludo
        console.log(`[WooCommerce] ⚠️ Saludo detectado en INFORMACION_GENERAL → Corrigiendo a saludo genérico`)
        return createResponse(
          '¡Hola! 👋 ¿En qué puedo ayudarte hoy? Si tienes alguna pregunta sobre nuestros productos o servicios, no dudes en decírmelo.',
          session.state,
          null,
          cart
        )
      }
      
      // Usuario no logueado preguntando por cotización/cómo comprar: no revelar correo ni pasos; derivar a solicitud de cuenta
      if (!isLoggedIn && isPreguntaCotizacionOComoComprar(message)) {
        const info = companyInfoService.getCompanyInfo()
        textoParaIA = getMessageNecesitasCuentaParaCotizacion(message, info.comoRealizarPedido.paso1)
      } else {
      // Consulta de información general - el backend ya tiene la info
      const companyInfo = companyInfoService.formatCompanyInfoForAgent()
      // Obtener historial reciente para contexto
      const historyContext = getHistoryContext(session)
      
      textoParaIA = `Redacta una respuesta clara y profesional en español chileno para la siguiente consulta del cliente: "${message}". 
      
Información de la empresa disponible:
${companyInfo}${historyContext}

🎯 OBJETIVO:
Responde de forma apropiada según la consulta del cliente. Usa tu criterio para determinar:
- Si la consulta es simple (ej: "horarios"), sé breve y directo
- Si la consulta requiere más detalle (ej: "cómo realizar un pedido"), proporciona información completa
- Adapta el tono según el contexto de la conversación

✅ DATOS QUE DEBES USAR:
- Usa SOLO la información proporcionada arriba sobre la empresa
- Si la información no está disponible, dilo claramente
- Si la consulta es solo un saludo o muy genérica, responde amigablemente sin dar información no solicitada

💡 LIBERTAD PARA REDACTAR:
- Puedes variar la longitud según la complejidad de la consulta
- Puedes priorizar información más relevante para la pregunta específica
- Puedes ser más conversacional o formal según el contexto
- Puedes ofrecer información adicional relacionada si es útil

🚫 RESTRICCIONES:
- NO inventes información que no esté en la base de conocimiento proporcionada
- NO ofrezcas funciones que no existen (reservas, carrito)
- NO reveles procesos técnicos internos
- NO respondas con información de empresa si la consulta es solo un saludo genérico`
      }
    } else if (queryType === 'VARIANTE') {
      try {
      // Consulta sobre variante específica (color, tamaño, etc.)
      // Fortificación: guards para evitar accesos undefined (productStockData, context.variantesDisponibles, context.varianteValidada)
      const varianteProductoValido = productStockData && typeof productStockData === 'object'
      const variantesDisponiblesValido = context.variantesDisponibles && context.variantesDisponibles.valores && Array.isArray(context.variantesDisponibles.valores)
      // CASO 1: Listar variantes disponibles (cuando se pregunta "qué colores tiene" sin especificar color)
      if (variantesDisponiblesValido && context.variantesDisponibles.valores.length > 0) {
        // Validar que el producto sea REAL (tiene id y name)
        const productoValido = varianteProductoValido && productStockData.id && productStockData.name
        if (!productoValido) {
          textoParaIA = `Redacta una respuesta clara y profesional en español chileno para el cliente.

SITUACIÓN:
El cliente preguntó: "${message}"
No se encontró el producto en WooCommerce.

🎯 OBJETIVO:
Informa al cliente de forma empática que no se encontró el producto.

💡 LIBERTAD PARA REDACTAR:
- Puedes ser empático y ofrecer ayuda
- Puedes sugerir que verifique el nombre o SKU del producto
- Adapta el tono según el contexto

🚫 RESTRICCIONES:
- NO inventes productos o información`
        } else {
          // Producto REAL - construir respuesta con datos REALES
          // Para producto variable usar suma de variaciones (coherente con PRODUCTOS); si no, stock_quantity del producto
          let stockInfo = ''
          if (context.productVariations && context.productVariations.length > 0 && productStockData.type === 'variable') {
            const totalFromVars = context.productVariations.reduce((s, v) => s + parseStockQuantity(v.stock_quantity), 0)
            stockInfo = totalFromVars > 0
              ? `${totalFromVars} unidad${totalFromVars !== 1 ? 'es' : ''} disponible${totalFromVars !== 1 ? 's' : ''}`
              : 'Stock agotado (0 unidades)'
          } else if (validarDatoNumerico(productStockData.stock_quantity)) {
            const stockQty = parseStockQuantity(productStockData.stock_quantity)
            stockInfo = stockQty > 0 
              ? `${stockQty} unidad${stockQty > 1 ? 'es' : ''} disponible${stockQty > 1 ? 's' : ''}`
              : 'Stock agotado (0 unidades)'
          } else if (productStockData.stock_status === 'instock') {
            stockInfo = 'disponible en stock'
          } else {
            stockInfo = 'N/A'
          }
          
          const priceInfo = validarDatoNumerico(productStockData.price) 
            ? `$${parseFloat(productStockData.price).toLocaleString('es-CL')}` 
            : 'N/A'
          
          const atributo = context.variantesDisponibles.atributo || 'atributo'
          const valores = context.variantesDisponibles.valores
          const valoresStr = valores.join(', ')
          
          const historyContext = getHistoryContext(session)
          
          textoParaIA = `Redacta una respuesta clara y profesional en español chileno para el cliente.

📦 DATOS REALES DEL PRODUCTO (consultados desde WooCommerce en tiempo real):
- Nombre: ${productStockData.name || 'N/A'}
- SKU: ${productStockData.sku || 'N/A'}
- Stock: ${stockInfo}
- Precio: ${priceInfo}
- ${atributo.charAt(0).toUpperCase() + atributo.slice(1)}s disponibles: ${valoresStr}

El cliente preguntó: "${message}"${historyContext}

🎯 OBJETIVO:
Presenta los ${atributo}s disponibles con jerarquía visual clara (formato chat-friendly).

FORMATO SUGERIDO:
- Línea de confirmación: "Sí, tenemos el [producto] disponible."
- 📦 Stock: [valor exacto]
- 💰 Precio: [valor si está disponible]
- 🎨 ${atributo.charAt(0).toUpperCase() + atributo.slice(1)}s disponibles: lista con viñetas • (una por valor). Usa SOLO: ${valoresStr}
- 👉 Cierre: "Dime qué ${atributo} y cantidad necesitas y lo reviso al tiro" o similar.

✅ DATOS QUE DEBES USAR (OBLIGATORIO):
- Lista SOLO los ${atributo}s proporcionados arriba: ${valoresStr}
- Incluye stock: ${stockInfo} (usa este valor exacto)
- Incluye precio si está disponible: ${priceInfo}
- NO cambies nombres, SKUs, precios ni valores de ${atributo}

🚫 RESTRICCIONES CRÍTICAS:
- NO inventes ${atributo}s que no estén en la lista: ${valoresStr}
- NO cambies los valores de stock, precio, SKU o ${atributo}
- NO digas "disponible" si el stock es 0 o "Stock agotado (0 unidades)"`
        }
      } else if (varianteProductoValido && context.varianteValidada === true) {
        // Variante existe y está validada
        let stockInfo = ''
        const varianteQty = parseStockQuantity(productStockData.stock_quantity)
        if (productStockData.stock_quantity !== null && productStockData.stock_quantity !== undefined) {
          if (varianteQty > 0) {
            stockInfo = `${varianteQty} unidad${varianteQty > 1 ? 'es' : ''} disponible${varianteQty > 1 ? 's' : ''}`
          } else {
            stockInfo = 'Stock agotado (0 unidades)'
          }
        } else if (productStockData.stock_status === 'instock') {
          stockInfo = 'disponible en stock'
        } else {
          stockInfo = 'Stock agotado (0 unidades)'
        }
        
        const atributo = analisisOpenAI?.atributo || 'atributo'
        const valorAtributo = analisisOpenAI?.valorAtributo || 'valor'
        
        textoParaIA = `Redacta una respuesta clara y profesional en español chileno para el cliente.

INFORMACIÓN REAL DEL PRODUCTO (consultada desde WooCommerce en tiempo real):
- Nombre del producto: ${productStockData.name}
${productStockData.sku ? `- SKU: ${productStockData.sku}` : ''}
- ${atributo.charAt(0).toUpperCase() + atributo.slice(1)}: ${valorAtributo}
- Stock: ${stockInfo}
${productStockData.price ? `- Precio: $${parseFloat(productStockData.price).toLocaleString('es-CL')}` : ''}

El cliente preguntó: "${message}"

INSTRUCCIONES OBLIGATORIAS:
- Responde confirmando que el producto SÍ está disponible en ${atributo} ${valorAtributo}
- Formato: "Sí, el ${productStockData.name} está disponible en ${atributo} ${valorAtributo}."
- Incluye stock y precio si están disponibles
- Responde de forma breve y profesional, estilo WhatsApp
- NO inventes información que no esté arriba`
        
      } else if (context.varianteValidada === false) {
        // Variante no existe o no pudimos listar (evitar decir "no disponible en color valor")
        const atributo = analisisOpenAI?.atributo || 'atributo'
        const nombreProducto = productStockData?.name || analisisOpenAI?.terminoProducto || 'el producto'
        const pidioListar = context.variantePidioListar === true
        const valorConcreto = analisisOpenAI?.valorAtributo && String(analisisOpenAI.valorAtributo).trim()
        
        if (pidioListar || !valorConcreto) {
          textoParaIA = `Redacta una respuesta clara y profesional en español chileno para el cliente.

SITUACIÓN:
El cliente preguntó: "${message}"
El producto ${nombreProducto} no tiene variaciones de ${atributo} que podamos listar (o no aplican para este producto).

INSTRUCCIONES OBLIGATORIAS:
- Responde que este producto no tiene opciones de ${atributo} disponibles para mostrar
- NO uses la palabra "valor" como si fuera un color o talla
- Sé claro y directo
- Responde de forma breve y profesional, estilo WhatsApp`
        } else {
          // Fortificación: si el nombre del producto ya incluye el valor preguntado (ej. "Blanco" en "Medalla Acrílico Sublimable Blanco"), responder que SÍ está disponible
          const nombreNorm = (productStockData?.name || '').toLowerCase().trim()
          const valorNorm = (valorConcreto || '').toLowerCase().trim()
          const valorEnNombre = valorNorm.length >= 2 && nombreNorm.includes(valorNorm)
          if (valorEnNombre) {
            textoParaIA = `Redacta una respuesta clara y profesional en español chileno para el cliente.

INFORMACIÓN REAL:
- Nombre del producto: ${nombreProducto}
- El cliente preguntó si está disponible en ${atributo} ${valorConcreto}.
- El nombre del producto YA incluye "${valorConcreto}" (ej. en el nombre aparece ese ${atributo}).

INSTRUCCIONES OBLIGATORIAS:
- Responde que SÍ está disponible en ${atributo} ${valorConcreto}, y menciona que el nombre del producto lo indica.
- Formato sugerido: "Sí, el ${nombreProducto} está disponible en ${atributo} ${valorConcreto} (el nombre del producto lo incluye)."
- Sé breve y profesional, estilo WhatsApp`
          } else {
            textoParaIA = `Redacta una respuesta clara y profesional en español chileno para el cliente.

SITUACIÓN:
El cliente preguntó: "${message}"
El producto ${nombreProducto} NO está disponible en ${atributo} ${valorConcreto}.

INSTRUCCIONES OBLIGATORIAS:
- Responde que el producto NO está disponible en esa variante específica (${atributo} ${valorConcreto})
- Formato: "No, el ${nombreProducto} no está disponible en ${atributo} ${valorConcreto}."
- Sé claro y directo
- NO inventes otras variantes disponibles
- Responde de forma breve y profesional, estilo WhatsApp`
          }
        }
      } else {
        // Producto no encontrado o validación no completada
        textoParaIA = `Redacta una respuesta clara y profesional en español chileno para el cliente.

SITUACIÓN:
El cliente preguntó: "${message}"
${productStockData ? 'No se pudo validar la variante solicitada.' : 'No se encontró el producto para validar la variante.'}

INSTRUCCIONES OBLIGATORIAS:
- Pide más información (SKU o nombre completo del producto)
- Sé profesional y cercano, estilo WhatsApp`
      }
      } catch (errVariante) {
        console.error('[VARIANTE] Error construyendo textoParaIA:', errVariante?.message)
        const atributoNombre = (analisisOpenAI?.atributo === 'color' ? 'colores' : analisisOpenAI?.atributo === 'talla' ? 'tallas' : analisisOpenAI?.atributo === 'tamaño' ? 'tamaños' : (analisisOpenAI?.atributo || 'atributo') + 's')
        textoParaIA = `Redacta una respuesta breve en español chileno. El cliente preguntó: "${message}". Responde que para mostrar los ${atributoNombre} disponibles necesitas el nombre completo o SKU del producto. Sé amable y profesional.`
      }
      
    } else if (queryType === 'CARACTERISTICAS') {
      // Consulta sobre características del producto
      if (productStockData) {
        // Construir información de características disponibles
        let caracteristicasInfo = ''
        
        // Prioridad: short_description > description > attributes > categories
        if (productStockData.short_description && productStockData.short_description.trim().length > 0) {
          caracteristicasInfo += `\n- Descripción corta: ${productStockData.short_description.substring(0, 200)}`
        } else if (productStockData.description && productStockData.description.trim().length > 0) {
          caracteristicasInfo += `\n- Descripción: ${productStockData.description.substring(0, 200)}`
        }
        
        // Agregar atributos si existen
        if (productStockData.attributes && Array.isArray(productStockData.attributes) && productStockData.attributes.length > 0) {
          const atributosList = productStockData.attributes
            .filter(attr => attr.name && attr.options && attr.options.length > 0)
            .map(attr => {
              const opciones = Array.isArray(attr.options) ? attr.options.join(', ') : attr.options
              return `  - ${attr.name}: ${opciones}`
            })
            .join('\n')
          
          if (atributosList) {
            caracteristicasInfo += `\n\n- Atributos disponibles:\n${atributosList}`
          }
        }
        
        // Agregar categorías si existen
        if (productStockData.categories && Array.isArray(productStockData.categories) && productStockData.categories.length > 0) {
          const categoriasList = productStockData.categories
            .filter(cat => cat.name)
            .map(cat => cat.name)
            .join(', ')
          
          if (categoriasList) {
            caracteristicasInfo += `\n- Categorías: ${categoriasList}`
          }
        }
        
        if (!caracteristicasInfo || caracteristicasInfo.trim().length === 0) {
          caracteristicasInfo = '\n- No hay información adicional disponible sobre este producto.'
        }
        
        textoParaIA = `Redacta una respuesta clara y profesional en español chileno para el cliente.

INFORMACIÓN REAL DEL PRODUCTO (consultada desde WooCommerce en tiempo real):
- Nombre del producto: ${productStockData.name}
${productStockData.sku ? `- SKU: ${productStockData.sku}` : ''}${caracteristicasInfo}

El cliente preguntó: "${message}"

INSTRUCCIONES OBLIGATORIAS:
- Responde sobre las características del producto basándote SOLO en la información proporcionada arriba
- Si hay descripción, úsala para responder
- Si hay atributos, menciónalos
- Si hay categorías, menciónalos si es relevante
- Formato: "El ${productStockData.name} es [características según información disponible]."
- Responde de forma breve y profesional, estilo WhatsApp
- NO inventes características que no estén en la información proporcionada
- Si no hay información adicional, di: "No hay información adicional disponible sobre este producto."`
      } else {
        // Producto no encontrado
        textoParaIA = `Redacta una respuesta clara y profesional en español chileno para el cliente.

SITUACIÓN:
El cliente preguntó: "${message}"
No se encontró el producto para consultar características.

INSTRUCCIONES OBLIGATORIAS:
- Pide más información (SKU o nombre completo del producto)
- Sé profesional y cercano, estilo WhatsApp`
      }
      
    } else if (queryType === 'PRODUCTOS' || queryType === 'RECOMENDACION') {
      // Consulta de productos o recomendaciones - el agente consultó WooCommerce
      if (productStockData) {
        // CRÍTICO: Si el producto viene de lastShownResults (ej. "el primero") o de un solo resultado,
        // las variaciones pueden no estar cargadas → stock incorrecto (padre en vez de suma variaciones).
        if (productStockData.parent_id) {
          const parentId = productStockData.parent_id
          try {
            const [parentProduct, variationsFromParent] = await Promise.all([
              wordpressService.getProductById(parentId),
              wordpressService.getProductVariations(parentId)
            ])
            if (parentProduct) {
              productStockData = parentProduct
              context.productStockData = productStockData
              session.currentProduct = parentProduct
              if (Array.isArray(variationsFromParent) && variationsFromParent.length > 0) {
                context.productVariations = variationsFromParent
                session.productVariations = variationsFromParent
                console.log(`[WooCommerce] ✅ PRODUCTOS: producto era variación → padre + ${variationsFromParent.length} variaciones cargadas`)
              }
            }
          } catch (e) {
            console.warn('[WooCommerce] ⚠️ Error cargando padre/variaciones para variación:', e?.message)
          }
        } else if (productStockData.type === 'variable' && productStockData.id && (!context.productVariations || context.productVariations.length === 0)) {
          try {
            const variations = await wordpressService.getProductVariations(productStockData.id)
            if (variations && variations.length > 0) {
              context.productVariations = variations
              session.productVariations = variations
              console.log(`[WooCommerce] ✅ PRODUCTOS: variaciones cargadas para producto variable (${variations.length})`)
            }
          } catch (e) {
            console.warn('[WooCommerce] ⚠️ Error cargando variaciones para producto variable:', e?.message)
          }
        }

        // Se encontró información del producto en WooCommerce
        // Construir información de stock más detallada
        // CRÍTICO: Siempre mostrar stock, incluso si es 0
        const isVariation = productStockData.is_variation
        let stockInfo = ''
        // Si es producto variable con variaciones, el stock total es la SUMA de las variaciones (no el valor del padre)
        if (context.productVariations && context.productVariations.length > 0 && !isVariation) {
          const totalFromVariations = context.productVariations.reduce((sum, v) => sum + parseStockQuantity(v.stock_quantity), 0)
          if (totalFromVariations > 0) {
            stockInfo = `${totalFromVariations} unidad${totalFromVariations !== 1 ? 'es' : ''} disponible${totalFromVariations !== 1 ? 's' : ''}`
          } else {
            stockInfo = 'Stock agotado (0 unidades)'
          }
        } else if (productStockData.stock_quantity !== null && productStockData.stock_quantity !== undefined) {
          const qty = parseStockQuantity(productStockData.stock_quantity)
          if (qty > 0) {
            stockInfo = `${qty} unidad${qty > 1 ? 'es' : ''} disponible${qty > 1 ? 's' : ''}`
          } else {
            stockInfo = 'Stock agotado (0 unidades)'
          }
        } else if (productStockData.stock_status === 'instock') {
          stockInfo = 'disponible en stock'
        } else if (productStockData.stock_status === 'outofstock') {
          stockInfo = 'Stock agotado (0 unidades)'
        } else {
          stockInfo = 'Stock agotado (0 unidades)'
        }
        
        const priceInfo = productStockData.price 
          ? `$${parseFloat(productStockData.price).toLocaleString('es-CL')}` 
          : 'Precio no disponible'
        
        // Si es una variación, incluir información del producto padre
        const parentInfo = isVariation && productStockData.parent_product 
          ? `\n- Producto padre: ${productStockData.parent_product.name}`
          : ''
        
        // Si hay variaciones disponibles (producto variable), incluirlas
        let variationsInfo = ''
        let allVariationsZeroStock = false
        if (context.productVariations && context.productVariations.length > 0 && !isVariation) {
          // Coherente con vStock más abajo: variación "cero stock" solo si cantidad explícita 0 o (sin cantidad y outofstock)
          allVariationsZeroStock = context.productVariations.every(v => {
            const qty = parseStockQuantity(v.stock_quantity)
            return (qty === 0 && (v.stock_quantity != null || v.stock_status === 'outofstock')) ||
              (v.stock_quantity == null && v.stock_status === 'outofstock')
          })
          if (allVariationsZeroStock && stockInfo !== 'Stock agotado (0 unidades)') {
            stockInfo = 'sin stock en variantes (0 unidades en cada variante por el momento)'
          }
          const variationsList = context.productVariations.slice(0, 5).map(v => {
            const vQty = parseStockQuantity(v.stock_quantity)
            const vStock = v.stock_quantity != null
              ? `${vQty} unidad${vQty !== 1 ? 'es' : ''}`
              : v.stock_status === 'instock' ? 'disponible' : 'sin stock'
            const vPrice = v.price ? `$${parseFloat(v.price).toLocaleString('es-CL')}` : 'Precio N/A'
            return `  - ${v.name}${v.sku ? ` (SKU: ${v.sku})` : ''} - ${vStock} - ${vPrice}`
          }).join('\n')
          
          variationsInfo = `\n\nVARIACIONES DISPONIBLES (${context.productVariations.length} total${context.productVariations.length > 5 ? ', mostrando 5' : ''}):\n${variationsList}`
          if (allVariationsZeroStock) {
            variationsInfo += '\n\n⚠️ REGLA: Todas las variantes tienen 0 unidades. NO digas "disponible en stock" para el producto; di claramente que no hay stock en las variantes por el momento.'
          }
        }
        
        // Número de unidades a citar en instrucciones (producto variable = suma variaciones; si no, stock_quantity del producto)
        const stockNumberForPrompt = (context.productVariations && context.productVariations.length > 0 && !isVariation)
          ? context.productVariations.reduce((s, v) => s + parseStockQuantity(v.stock_quantity), 0)
          : (productStockData.stock_quantity != null ? parseStockQuantity(productStockData.stock_quantity) : null)
        
        // Determinar método de búsqueda y nivel de confianza
        const searchMethod = providedExplicitSku ? 'SKU exacto' : providedExplicitId ? 'ID exacto' : 'búsqueda por nombre'
        const confidenceLevel = providedExplicitSku || providedExplicitId ? 'ALTA (identificación exacta)' : 'MEDIA (coincidencia por nombre)'
        
        // Obtener historial reciente para contexto
        const historyContext = getHistoryContext(session)
        
        textoParaIA = `Redacta una respuesta clara y profesional en español chileno para el cliente.

INFORMACIÓN REAL DEL PRODUCTO (consultada desde WooCommerce en tiempo real):
- Nombre del producto: ${productStockData.name}
${productStockData.sku ? `- SKU: ${productStockData.sku}` : ''}
- Stock: ${stockInfo}
- Precio: ${priceInfo}${parentInfo}${variationsInfo}

MÉTODO DE BÚSQUEDA: ${searchMethod}
NIVEL DE CONFIANZA: ${confidenceLevel}

El cliente preguntó: "${message}"${historyContext}

VALIDACIONES OBLIGATORIAS ANTES DE RESPONDER:
1. Verifica que el nombre del producto mencionado en tu respuesta coincida EXACTAMENTE con "${productStockData.name}"
2. Verifica que el SKU mencionado sea "${productStockData.sku || 'N/A'}" (si existe)
3. Verifica que el stock mencionado sea "${stockInfo}"
4. Verifica que el precio mencionado sea "${priceInfo}"
5. Si algún dato no coincide, NO lo uses y marca "N/A" o "no disponible"

INSTRUCCIONES OBLIGATORIAS - FORMATO CHAT-FRIENDLY (jerarquía visual):
Responde con formato humano y fácil de leer en chat. Saltos de línea entre bloques.

1. Confirmación con nombre: "Sí, tenemos el ${productStockData.name} disponible."
2. SKU (en línea separada): "SKU: ${productStockData.sku || 'N/A'}."
3. Stock (en línea separada, OBLIGATORIO): "Stock: ${stockInfo}."
   CRÍTICO: Siempre incluye el stock con número exacto. Si preguntan "¿Cuántas unidades hay?" responde: ${stockNumberForPrompt != null ? stockNumberForPrompt : 'N/A'} unidades disponibles.
4. Precio (en línea separada): "Precio: ${priceInfo}."
${variationsInfo ? '5. Variaciones (línea en blanco antes): Título 🎨 "Colores disponibles" (o el atributo) y precio c/u si aplica. Lista con viñetas • (una por variante: nombre y unidades). Usa SOLO datos de VARIACIONES DISPONIBLES arriba. 6. Cierre: "Dime qué color y cantidad necesitas y lo reviso al tiro" o similar. 👉' : '5. Cierre: "¿Te gustaría saber algo más? 😊" o similar.'}

⚠️ REGLA ABSOLUTA: NUNCA omitas el stock en tu respuesta, incluso si el cliente pregunta solo por precio o solo por stock.
⚠️ REGLA CRÍTICA: Si stock_quantity existe, SIEMPRE muestra el número exacto de unidades, no solo "disponible en stock".

IMPORTANTE:
- Cada elemento debe estar en una línea separada (usa saltos de línea)
- El orden debe ser: Confirmación → SKU → Stock → Precio${variationsInfo ? ' → Variaciones' : ''} → Pregunta
- ${variationsInfo ? 'Si hay variaciones, listarlas con formato: "Variaciones disponibles: [lista con SKU, stock y precio de cada una]"\n- ' : ''}Usa el formato exacto mostrado arriba
- NO ofrezcas reservar ni agregar al carrito (esas funciones no están disponibles)
- NO digas "estoy verificando" - ya tienes la información real del producto
- NO inventes información que no esté arriba
- NO cambies nombres, SKUs, precios ni stock - usa EXACTAMENTE los valores proporcionados
- NO menciones "producto padre", "SKU padre" ni "SKU hijo"`
        
      } else if ((productSearchResults && productSearchResults.length > 0) || (context.productSearchResults && context.productSearchResults.length > 0)) {
        // Usar context.productSearchResults si está disponible, sino usar la variable local
        const finalSearchResults = context.productSearchResults || productSearchResults || []
        // Para no mostrar "hola! tienes X?" en "relacionados con": usar término buscado o mensaje sin saludo
        const displayQuery = (context.terminoProductoParaBuscar && String(context.terminoProductoParaBuscar).trim()) || stripLeadingGreeting(message) || message
        
        // Si necesita confirmación (resultados del fallback genérico), pedir más información
        if (context.needsConfirmation) {
          textoParaIA = `Redacta una respuesta clara y profesional en español chileno para el cliente.

SITUACIÓN:
El cliente preguntó: "${message}"
Encontré varios productos que podrían coincidir, pero necesito más información para asegurarme de darte la respuesta correcta.

INSTRUCCIONES OBLIGATORIAS:
- Pide amablemente más información específica (SKU, modelo, nombre completo del producto)
- Explica que prefieres confirmar antes de dar información incorrecta
- Sé profesional y cercano, estilo WhatsApp
- NO listes productos genéricos
- NO inventes información`
        } else {
          // Resultados del matching determinístico: son confiables, listarlos
          // Criterio único: mismo límite y enriquecimiento que el otro bloque de listas (errores y límites en enrichStockForListProducts)
          const sliceForList = finalSearchResults.slice(0, MAX_PRODUCTS_TO_ENRICH_STOCK)
          const stockByProductId = await enrichStockForListProducts(sliceForList)
          const productsList = sliceForList.map((p, index) => {
            const stockInfo = getStockTextForListProduct(p, stockByProductId)
            return `${index + 1}. ${p.name}${p.sku ? ` (SKU: ${p.sku})` : ''}${p.price ? ` - $${p.price.toLocaleString('es-CL')}` : ''} - Stock: ${stockInfo}`
          }).join('\n')
          
          // Obtener historial reciente para contexto
          const historyContext = getHistoryContext(session)
          
          textoParaIA = `Redacta una respuesta clara y profesional en español chileno informando al cliente sobre los productos encontrados.

PRODUCTOS ENCONTRADOS (información real de WooCommerce, matching determinístico - alta confianza):
${productsList}
${finalSearchResults.length > MAX_PRODUCTS_TO_ENRICH_STOCK ? `\n(Total: ${finalSearchResults.length} productos encontrados, mostrando los ${MAX_PRODUCTS_TO_ENRICH_STOCK} más relevantes)` : ''}

El cliente preguntó: "${message}"${historyContext}

VALIDACIONES OBLIGATORIAS ANTES DE RESPONDER:
1. Verifica que solo menciones productos de la lista arriba
2. Verifica que los nombres, SKUs y precios coincidan EXACTAMENTE con los de la lista
3. NO agregues productos que no estén en la lista
4. NO inventes información adicional

FORMATO CHAT-FRIENDLY (obligatorio para listas):
- Para cada producto usa: nombre (y SKU si existe), luego 📦 Stock: [valor], luego 💰 Precio: [valor]. Deja una línea en blanco entre cada producto.
- Cierre amable en una línea al final: 👉 "Dime cuál te interesa (por número, SKU o nombre) y te doy más detalles."

INSTRUCCIONES OBLIGATORIAS:
- Menciona que encontraste ${finalSearchResults.length} producto(s) relacionado(s) con "${displayQuery}"
- Lista los productos en el orden mostrado arriba (1, 2, 3...)
- Para cada producto, incluye: nombre, SKU (si existe), precio (si existe) y stock
- Después de la línea del precio de cada producto, deja siempre una línea en blanco (punto aparte) antes de la frase descriptiva de ese producto
- Pide al cliente que confirme cuál es el producto que busca (por número, SKU o nombre exacto)
- Responde máximo 4-5 líneas, profesional, estilo WhatsApp
- NO inventes información que no esté en la lista arriba
- NO cambies nombres, SKUs, precios ni stock - usa EXACTAMENTE los valores proporcionados`
        }
        
      } else {
        // No se encontró información del producto
        // Verificar si el usuario proporcionó un SKU o ID explícito pero no se encontró el producto
        // Usar las variables guardadas anteriormente
        const hasExplicitReference = providedExplicitSku || providedExplicitId
        
        if (hasExplicitReference) {
          // CRÍTICO: Limpiar contexto cuando producto no se encuentra con referencia explícita
          // Esto previene que el contexto de productos anteriores persista incorrectamente
          session.currentProduct = null
          session.productVariations = null
          console.log(`[WooCommerce] ⚠️ Producto no encontrado con referencia explícita - contexto limpiado`)
          
          // El usuario proporcionó un SKU/ID explícito pero no se encontró el producto
          textoParaIA = `Redacta una respuesta clara y profesional en español chileno para el cliente.

SITUACIÓN:
El cliente proporcionó ${providedExplicitSku && providedExplicitId ? `SKU: ${providedExplicitSku} e ID: ${providedExplicitId}` : providedExplicitSku ? `SKU: ${providedExplicitSku}` : providedExplicitId ? `ID: ${providedExplicitId}` : 'referencias de producto'} pero NO se encontró el producto en el sistema después de buscar exhaustivamente.

El cliente preguntó: "${message}"

INSTRUCCIONES OBLIGATORIAS:
- Responde de forma breve (máximo 3-4 líneas), profesional y cercana, estilo WhatsApp
- Indica amablemente que no se encontró el producto con ${providedExplicitSku && providedExplicitId ? `ese SKU (${providedExplicitSku}) e ID (${providedExplicitId})` : providedExplicitSku ? `ese SKU (${providedExplicitSku})` : providedExplicitId ? `ese ID (${providedExplicitId})` : 'esas referencias'}
- Pide que el cliente verifique el SKU o nombre del producto
- Ofrece ayuda para buscar el producto con otra información (nombre completo, otro SKU, etc.)
- NO digas "estoy verificando" - ya se verificó exhaustivamente y no se encontró
- NO digas "te respondo enseguida" - ya se verificó
- Sé empático y útil`
        } else {
          // No se encontró información del producto y no había referencia explícita
          // Si hay resultados de búsqueda parcial, verificar si necesitan confirmación
          const finalSearchResults = context.productSearchResults || productSearchResults || []
          if (finalSearchResults.length > 0) {
            // Si necesita confirmación (resultados del fallback genérico), pedir más información
            if (context.needsConfirmation) {
              textoParaIA = `Redacta una respuesta clara y profesional en español chileno para el cliente.

SITUACIÓN:
El cliente preguntó: "${message}"
Encontré algunos productos que podrían coincidir, pero necesito más información para asegurarme de darte la respuesta correcta.

INSTRUCCIONES OBLIGATORIAS:
- Pide amablemente más información específica (SKU, modelo, nombre completo del producto)
- Explica que prefieres confirmar antes de dar información incorrecta
- Sé profesional y cercano, estilo WhatsApp
- NO listes productos genéricos o que no estés seguro
- NO inventes información`
            } else {
              // Criterio único: mismo límite, enriquecimiento y texto de stock que el otro bloque de listas
              const displayQueryInner = (context.terminoProductoParaBuscar && String(context.terminoProductoParaBuscar).trim()) || stripLeadingGreeting(message) || message
              const sliceForList = finalSearchResults.slice(0, MAX_PRODUCTS_TO_ENRICH_STOCK)
              const stockByProductId = await enrichStockForListProducts(sliceForList)
              const productsList = sliceForList.map((p, index) => {
                const stockInfo = getStockTextForListProduct(p, stockByProductId)
                const priceInfo = p.price ? `$${parseFloat(p.price).toLocaleString('es-CL')}` : 'Precio no disponible'
                return `${index + 1}. ${p.name}${p.sku ? ` (SKU: ${p.sku})` : ''} - Stock: ${stockInfo} - Precio: ${priceInfo}`
              }).join('\n')
              
              // Obtener historial reciente para contexto
              const recentHistory = session.history?.slice(-4) || []
              const historyContext = recentHistory.length > 0 
                ? `\n\nCONTEXTO DE CONVERSACIÓN RECIENTE:\n${recentHistory.map(msg => `- ${msg.sender === 'user' ? 'Cliente' : 'Bot'}: ${(msg.message || msg.text || '').substring(0, 100)}`).join('\n')}`
                : ''
              
              textoParaIA = `Redacta una respuesta clara y profesional en español chileno informando al cliente sobre los productos encontrados.

PRODUCTOS ENCONTRADOS relacionados con "${displayQueryInner}" (información real de WooCommerce, matching determinístico - alta confianza):
${productsList}
${finalSearchResults.length > MAX_PRODUCTS_TO_ENRICH_STOCK ? `\n(Total: ${finalSearchResults.length} productos encontrados, mostrando los ${MAX_PRODUCTS_TO_ENRICH_STOCK} más relevantes)` : ''}

El cliente preguntó: "${message}"${historyContext}

VALIDACIONES OBLIGATORIAS ANTES DE RESPONDER:
1. Verifica que solo menciones productos de la lista arriba (numerados 1, 2, 3...)
2. Verifica que los nombres, SKUs, stocks y precios coincidan EXACTAMENTE con los de la lista
3. NO agregues productos que no estén en la lista
4. NO inventes información adicional

FORMATO CHAT-FRIENDLY (obligatorio para listas):
- Para cada producto usa: nombre (y SKU si existe), luego 📦 Stock: [valor], luego 💰 Precio: [valor]. Deja una línea en blanco entre cada producto.
- Cierre amable en una línea al final: 👉 "Dime cuál te interesa (por número, SKU o nombre) y te doy más detalles."

INSTRUCCIONES OBLIGATORIAS:
- Menciona que encontraste ${finalSearchResults.length} producto(s) relacionado(s) con "${displayQueryInner}"
- Lista los productos en el orden mostrado arriba (1, 2, 3...)
- Para cada producto, incluye: nombre, SKU (si existe), stock y precio
- Después de la línea del precio de cada producto, deja siempre una línea en blanco (punto aparte) antes de la frase descriptiva de ese producto
- Indica cuáles tienen stock disponible
- Si hay más de ${MAX_PRODUCTS_TO_ENRICH_STOCK} productos, menciona que hay más opciones disponibles
- Pide al cliente que confirme cuál es el producto que busca (por número, SKU o nombre exacto)
- Responde máximo 4-5 líneas, profesional, estilo WhatsApp
- Ofrece ayuda para buscar un producto más específico si el cliente necesita más detalles
- NO digas "estoy verificando" - ya tienes la información real de los productos
- NO inventes información que no esté en la lista arriba
- NO cambies nombres, SKUs, precios ni stock - usa EXACTAMENTE los valores proporcionados`
            }
        } else {
          // No se encontró nada, pedir más información
          textoParaIA = `Redacta una respuesta clara y profesional en español chileno informando al cliente.

El cliente preguntó: "${message}"

SITUACIÓN:
No se encontraron productos que coincidan con "${message}" después de buscar en todo el catálogo.

INSTRUCCIONES OBLIGATORIAS:
- Responde de forma breve (máximo 3-4 líneas), profesional y cercana, estilo WhatsApp
- Indica amablemente que no se encontraron productos con ese nombre
- Pide que el cliente sea más específico con el nombre completo o SKU del producto
- Ofrece ayuda para buscar el producto correcto
- NO digas "estoy verificando" - ya se buscó exhaustivamente
- Sé empático y útil`
        }
      } // Cierra el if (hasExplicitReference) / else sin referencia explícita
    } // Cierra el bloque cuando no se encontró información del producto
    
    } else {
      // Otra consulta (queryType no es INFORMACION_GENERAL, PRODUCTOS, VARIANTE, CARACTERISTICAS ni FALLBACK)
      // Esto solo debería ocurrir si queryType es 'OTRO' o un valor inesperado
      // Por seguridad, tratarlo como consulta genérica
      textoParaIA = `Redacta una respuesta clara y profesional en español chileno para la siguiente consulta del cliente: "${message}".

Responde de forma breve (máximo 3-4 líneas), profesional y cercana, estilo WhatsApp.`
    } // Cierra el if (queryType === 'INFORMACION_GENERAL') / else if (queryType === 'VARIANTE') / else if (queryType === 'CARACTERISTICAS') / else if (queryType === 'PRODUCTOS' || 'RECOMENDACION') / else
    
    // Fortificación: si la consulta era mixta (info general + producto), incluir info empresa al inicio de la respuesta
    if (context.alsoAnswerInfoGeneral && textoParaIA && textoParaIA.trim().length > 0) {
      const companyInfo = companyInfoService.formatCompanyInfoForAgent()
      textoParaIA = `El cliente también preguntó por información de la empresa (ubicación, horarios, etc.). Incluye al INICIO de tu respuesta un párrafo breve con esta información:\n\n${companyInfo}\n\nLuego, en un segundo párrafo, presenta la información de productos que se indica más abajo.\n\n---\n\n${textoParaIA}`
      delete context.alsoAnswerInfoGeneral
    }
    
    // Historial reciente (últimos 12 mensajes) para reducir tokens y latencia sin perder contexto
    const conversationHistory = (session.history || []).slice(-12)
    
    if (options.stream && typeof options.onChunk === 'function') {
      aiResponse = await conkavoAI.redactarRespuestaStream(textoParaIA, conversationHistory, options.onChunk)
    } else {
      aiResponse = await conkavoAI.redactarRespuesta(textoParaIA, conversationHistory)
    }
    
  } catch (error) {
    console.error('❌ Error al obtener respuesta de Conkavo:', error)
    console.error('   Tipo:', error?.constructor?.name || 'Unknown')
    console.error('   Mensaje:', error?.message || 'No message')
    console.error('   Stack:', error?.stack || 'No stack')
    
    // Si el error ya tiene un mensaje de usuario, usarlo; si no, usar genérico
    if (error?.message && error.message.includes('⚠️')) {
      aiResponse = error.message
    } else {
      aiResponse = '⚠️ Lo siento, hubo un error al procesar tu mensaje. Por favor, intenta de nuevo.'
    }
  }
  
  // Agregar respuesta al historial
  addToHistory(session, 'bot', aiResponse)
  
  // Preparar opciones contextuales (botones del chat)
  const responseOptions = []
  
  if (session.state === STATES.IDLE) {
    responseOptions.push({ type: 'action', value: ACTIONS.START_ORDER, label: '🛒 Iniciar Pedido' })
  }
  
  if (Object.keys(cart.items || {}).length > 0) {
    responseOptions.push({ type: 'action', value: ACTIONS.VIEW_CART, label: '📋 Ver Carrito' })
  }
  
  return createResponse(
      aiResponse,
      session.state,
      responseOptions.length > 0 ? responseOptions : null,
      cart
    )
  } catch (error) {
    console.error('❌ Error en processMessageWithAI:', error)
    console.error('   Stack:', error.stack)
    console.error('   userId:', userId)
    console.error('   message:', message)
    
    // Retornar respuesta de error
    return createResponse(
      '⚠️ Lo siento, hubo un error al procesar tu mensaje. Por favor, intenta de nuevo.',
      'IDLE',
      null,
      { items: {} }
    )
  }
}

export { getStockTextForListProduct, enrichStockForListProducts }

export default {
  STATES,
  ACTIONS,
  initChat,
  processAction,
  getChatHistory,
  getState,
  processMessage,
  resetSession,
  processMessageWithAI
}