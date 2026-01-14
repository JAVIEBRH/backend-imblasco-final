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
 * Normalizar códigos/SKU (N35 = N-35 = N 35 = N.35)
 * @param {string} code - Código/SKU a normalizar
 * @returns {string} - Código normalizado
 */
function normalizeCode(code) {
  if (!code || typeof code !== 'string') return ''
  
  return code
    .toUpperCase()
    .replace(/[-.\s_]/g, '')               // Eliminar guiones, puntos, espacios, guiones bajos
    .trim()
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
 * Extraer término del producto del mensaje (sin stop words, sin prefijos)
 * @param {string} message - Mensaje del usuario
 * @returns {string} - Término del producto extraído
 */
function extractProductTerm(message) {
  // Lista completa de stop words (palabras a eliminar)
  const stopWords = [
    'hay', 'stock', 'del', 'de', 'producto', 'product', 'tienes', 'tiene', 
    'cuanto', 'cuánto', 'cuántas', 'cuántos', 'precio', 'cuesta', 'vale', 
    'que', 'unidades', 'disponible', 'disponibles', 'tienen', 'el', 'la', 'los', 'las', 
    'hola', 'busco', 'buscando', 'llamado', 'llamada', 'nombre', 'articulo', 
    'artículo', 'un', 'una', 'estoy', 'en', 'con', 'por', 'para', 'sobre',
    'desde', 'hasta', 'entre', 'durante', 'según', 'mediante', 'sin', 'bajo',
    'tiene', 'tienen', 'hay', 'existe', 'existen', 'tengas', 'tengamos'
  ]
  
  // Remover prefijos comunes y patrones específicos
  let cleaned = message
    .replace(/^hola[.\s,]+/gi, '') // Remover "hola" al inicio
    .replace(/^hay\s+stock\s+de[:\s]*/gi, '') // "HAY STOCK DE:"
    .replace(/^stock\s+de[:\s]*/gi, '') // "STOCK DE:"
    .replace(/cuanto\s+cuesta\s+(el|la|los|las)?/gi, '')
    .replace(/cuál\s+es\s+el\s+precio\s+(de|del)?/gi, '')
    .replace(/estoy\s+buscando\s+(un|una|el|la)?\s*/gi, '')
    .replace(/producto\s+(llamado|llamada|nombre)\s*/gi, '')
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
 * Detectar si el mensaje es sobre productos/stock/precios (TIPO B)
 * @param {string} message - Mensaje del usuario
 * @returns {boolean}
 */
function isProductQuery(message) {
  const lowerMessage = message.toLowerCase()
  const productKeywords = [
    'producto', 'productos', 'stock', 'disponible', 'disponibilidad',
    'precio', 'precios', 'cuanto', 'cuesta', 'catalogo', 'catálogo',
    'tienen', 'hay', 'existe', 'existencia', 'llegar', 'llegada',
    'cuando', 'cantidad', 'unidades'
  ]
  return productKeywords.some(keyword => lowerMessage.includes(keyword))
}

/**
 * Detectar si el mensaje es sobre información general (TIPO A)
 * @param {string} message - Mensaje del usuario
 * @returns {boolean}
 */
function isGeneralInfoQuery(message) {
  const lowerMessage = message.toLowerCase()
  const generalKeywords = [
    'horario', 'horarios', 'abren', 'cierran', 'apertura', 'cierre',
    'direccion', 'dirección', 'domicilio', 'ubicacion', 'ubicación',
    'contacto', 'telefono', 'teléfono', 'email', 'correo',
    'pago', 'pagos', 'devolucion', 'devolución', 'garantia', 'garantía',
    'politica', 'política', 'condiciones', 'empresa', 'informacion', 'información'
  ]
  return generalKeywords.some(keyword => lowerMessage.includes(keyword))
}

/**
 * Procesar mensaje de texto libre con IA
 * @param {string} userId - ID del usuario
 * @param {string} message - Mensaje del usuario
 * @param {Array} conversationHistory - Historial opcional (actualmente no usado, se obtiene de la sesión)
 * @returns {Promise<Object>} Respuesta con mensaje de IA
 */
export async function processMessageWithAI(userId, message, conversationHistory = []) {
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
    
    // Detectar tipo de consulta
    const isProduct = isProductQuery(message)
    const isGeneral = isGeneralInfoQuery(message)
    
    // El agente está autenticado con Consumer Key/Secret de WooCommerce
    // Puede consultar stock sin necesidad de que el usuario final esté logueado
    const isLoggedIn = true // El agente está autenticado
    const user = { email: 'cesar.barahona@conkavo.cl', role: 'agent' }
  
  // Construir contexto para el agente de IA
  const context = {
    state: session.state,
    cart: cart,
    currentProduct: session.currentProduct,
    isLoggedIn: isLoggedIn,
    user: user,
    companyInfo: companyInfoService.formatCompanyInfoForAgent(),
    queryType: isProduct ? 'PRODUCTOS' : (isGeneral ? 'INFORMACION_GENERAL' : 'OTRO')
  }
  
  // Si es consulta de productos, buscar en WooCommerce
  let productStockData = null
  let productSearchResults = []
  
  // Guardar referencias explícitas para mensajes de error (fuera del bloque para estar disponible en todo el scope)
  let providedExplicitSku = null
  let providedExplicitId = null
  
  if (isProduct) {
    try {
      console.log(`[WooCommerce] Buscando productos para consulta: "${message}"`)
      
      // Verificar si el mensaje es ambiguo (no tiene término de producto explícito)
      const quickExtractedTerm = extractProductTerm(message)
      const isAmbiguousQuery = !providedExplicitSku && !providedExplicitId && (!quickExtractedTerm || quickExtractedTerm.length === 0)
      
      console.log(`[WooCommerce] 🔍 Análisis de consulta: término extraído="${quickExtractedTerm}", esAmbiguo=${isAmbiguousQuery}, tieneSKU=${!!providedExplicitSku}, tieneID=${!!providedExplicitId}`)
      
        // Si es una consulta ambigua, verificar si hay contexto de productos anteriores
        if (isAmbiguousQuery) {
          // Verificar si hay un producto en el contexto de la sesión
          if (context.currentProduct) {
            console.log(`[WooCommerce] 🔍 Consulta ambigua detectada, pero hay producto en contexto: ${context.currentProduct.name || context.currentProduct.codigo || 'N/A'}`)
            // Usar el producto del contexto
            productStockData = context.currentProduct
            context.productStockData = productStockData
            // Actualizar currentProduct en la sesión para futuras referencias
            session.currentProduct = productStockData
          } else {
            // Buscar en el historial reciente si hay productos mencionados
            const recentHistory = session.history?.slice(-10) || [] // Últimos 10 mensajes
            for (const msg of recentHistory.reverse()) {
              if (msg.sender === 'bot' && msg.message) {
                // Buscar SKUs mencionados en respuestas anteriores
                const skuMatch = msg.message.match(/SKU[:\s]+([^\s\n]+)/i)
                if (skuMatch) {
                  const skuFromHistory = skuMatch[1].trim()
                  console.log(`[WooCommerce] 🔍 Consulta ambigua, pero encontré SKU en historial: "${skuFromHistory}"`)
                  try {
                    const productFromHistory = await wordpressService.getProductBySku(skuFromHistory)
                    if (productFromHistory) {
                      productStockData = productFromHistory
                      context.productStockData = productStockData
                      // Guardar en currentProduct para futuras referencias
                      session.currentProduct = productFromHistory
                      console.log(`[WooCommerce] ✅ Producto encontrado desde historial: ${productFromHistory.name}`)
                      break
                    }
                  } catch (error) {
                    console.log(`[WooCommerce] ⚠️ No se pudo obtener producto del historial: ${error.message}`)
                  }
                }
              }
            }
          }
        
        // Si después de buscar en contexto todavía no hay producto, pedir más información
        if (!productStockData) {
          console.log(`[WooCommerce] ⚠️ Consulta de producto sin término identificable y sin contexto. Se pedirá nombre o SKU al usuario.`)
          // Responder pidiendo nombre o SKU, sin bajar catálogo completo
          return createResponse(
            'Necesito el nombre completo o el SKU del producto para darte precio y stock. ¿Me lo confirmas?',
            session.state,
            null,
            cart
          )
        }
      }
      
      // ESTRATEGIA 0: Detectar si el usuario menciona explícitamente un SKU o ID
      // Patrón 1: "SKU: N35" o "SKU 601059110" o "SKU: 601059110" (cualquier SKU después de "SKU:")
      const explicitSkuMatch = message.match(/(?:sku|SKU)[:\s]+([^\s]+)/i)
      // Patrón 2: "ID: 30659" o "ID 30659"
      const explicitIdMatch = message.match(/(?:id|ID)[:\s]+(\d+)/i)
      
      // Detectar SKUs en el mensaje
      // Casos válidos:
      // 1. "SKU: N35" o "SKU N35" (explícito)
      // 2. "lapicero L88", "libreta N35" (SKU después de nombre de producto)
      // 3. "L88", "N35" (solo el SKU, mensaje corto)
      // 4. "601059110" (SKU numérico largo)
      const isVeryShortMessage = message.trim().split(/\s+/).length <= 2
      
      // Detectar y guardar referencias primero (para usar en mensajes de error)
      // IMPORTANTE: Puede haber múltiples SKUs en el mensaje (ej: "lapicero L88 o libreta N35")
      const detectedSkus = []
      
      if (explicitSkuMatch) {
        detectedSkus.push(explicitSkuMatch[1].trim())
        console.log(`[WooCommerce] 🔍 SKU explícito detectado con prefijo: "${explicitSkuMatch[1].trim()}"`)
      }
      
      // Detectar todos los SKUs que aparecen después de nombres de productos (ej: "lapicero L88", "libreta N35")
      const productNamePattern = /\b(lapicero|libreta|bolígrafo|boligrafo|producto|product|articulo|artículo|cuaderno|marcador|resaltador)\s+([A-Za-z]\d+[A-Za-z]?[-]?\d*)\b/gi
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
        
        // Buscar SKU numérico largo (ej: "601059110", "601050020") - sin restricción de longitud de mensaje
        // Los SKUs numéricos largos (6+ dígitos) son muy específicos y deben detectarse siempre
        if (detectedSkus.length === 0) {
          const numericSkuMatch = message.match(/\b(\d{6,})\b/)
          if (numericSkuMatch) {
            detectedSkus.push(numericSkuMatch[1].trim())
            console.log(`[WooCommerce] 🔍 SKU numérico largo detectado: "${numericSkuMatch[1]}"`)
          }
        }
      }
      
      // Usar el primer SKU detectado (o todos si hay múltiples)
      if (detectedSkus.length > 0) {
        providedExplicitSku = detectedSkus[0] // Usar el primero para búsqueda inicial
        if (detectedSkus.length > 1) {
          console.log(`[WooCommerce] ⚠️  Múltiples SKUs detectados: ${detectedSkus.join(', ')}. Buscando el primero: "${providedExplicitSku}"`)
        }
      }
      
      // Si no se detectó SKU con reglas, usar IA para detectar SKU numérico
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
      
      if (explicitIdMatch) {
        providedExplicitId = explicitIdMatch[1].trim()
        console.log(`[WooCommerce] 🔍 ID detectado: "${providedExplicitId}"`)
      }
      
      // Si ya tenemos un producto del contexto (consulta ambigua resuelta), omitir búsquedas adicionales
      if (productStockData) {
        console.log(`[WooCommerce] ✅ Producto ya encontrado desde contexto, omitiendo búsquedas adicionales`)
      } else {
      
      // Buscar por SKU primero
      if (providedExplicitSku) {
        try {
          // Normalizar el SKU proporcionado (N35 = N-35 = N 35)
          const normalizedSku = normalizeCode(providedExplicitSku)
          console.log(`[WooCommerce] SKU original: "${providedExplicitSku}" → normalizado: "${normalizedSku}"`)
          
          const productBySku = await wordpressService.getProductBySku(providedExplicitSku)
          if (productBySku) {
            productStockData = productBySku
            context.productStockData = productStockData
            session.currentProduct = productBySku // Guardar para futuras referencias
            console.log(`[WooCommerce] ✅ Producto encontrado por SKU explícito: ${productBySku.name} (SKU: ${productBySku.sku})`)
            console.log(`   Stock: ${productBySku.stock_quantity !== null ? productBySku.stock_quantity : 'N/A'}, Precio: ${productBySku.price ? '$' + productBySku.price : 'N/A'}`)
          } else {
            console.log(`[WooCommerce] ❌ No se encontró producto con SKU explícito: "${providedExplicitSku}"`)
            console.log(`   Se omite búsqueda masiva en variaciones para evitar demoras; se intentará localizar por nombre con el código proporcionado.`)
            try {
              const allProducts = await wordpressService.getAllProducts()
              const normalizedSku = normalizeCode(providedExplicitSku)
              const productsWithCode = allProducts.filter(p => {
                const productName = normalizeCode(p.name || '')
                const productSku = normalizeCode(p.sku || '')
                return productName.includes(normalizedSku) || productSku.includes(normalizedSku)
              })
              
              if (productsWithCode.length === 1) {
                productStockData = productsWithCode[0]
                context.productStockData = productStockData
                session.currentProduct = productsWithCode[0] // Guardar para futuras referencias
                console.log(`[WooCommerce] ✅ Producto encontrado por código en nombre/SKU: ${productStockData.name} (SKU real: ${productStockData.sku || 'N/A'})`)
              } else if (productsWithCode.length > 1) {
                productSearchResults = productsWithCode.slice(0, 10) // limitar para no saturar respuestas
                context.productSearchResults = productSearchResults
                console.log(`[WooCommerce] ✅ Encontrados ${productsWithCode.length} productos que contienen "${providedExplicitSku}" en nombre/SKU`)
              } else {
                console.log(`[WooCommerce] ❌ Tampoco se encontró "${providedExplicitSku}" en nombres/SKU normalizados`)
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
            console.log(`[WooCommerce] ✅ Producto encontrado por ID explícito: ${productById.name} (ID: ${productById.id})`)
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
          
          // PRIMERO: Intentar buscar por nombre completo antes de extraer SKU
          // Esto asegura que "Soporte Piocha Imán SOPI01" se busque como nombre completo
          try {
            const allProducts = await wordpressService.getAllProducts()
            
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
                console.log(`[WooCommerce] ✅ Producto encontrado por nombre completo: ${productStockData.name}`)
                
                // Si es un producto variable, consultar sus variaciones (lazy loading)
                if (productStockData.type === 'variable' && productStockData.id) {
                  console.log(`[WooCommerce] 🔄 Producto variable detectado, consultando variaciones...`)
                  try {
                    const variations = await wordpressService.getProductVariations(productStockData.id)
                    if (variations && variations.length > 0) {
                      context.productVariations = variations
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
            
            // Intentar cada patrón hasta encontrar un SKU
            for (const pattern of skuPatterns) {
              const skuMatch = cleanMessage.match(pattern)
              if (skuMatch) {
                detectedSkuFromName = skuMatch[1].trim()
                // Normalizar el SKU detectado (N-35 → N35, S.10 → S10, etc.)
                const normalizedDetectedSku = normalizeCode(detectedSkuFromName)
                console.log(`[WooCommerce] 🔍 SKU detectado en el nombre: "${detectedSkuFromName}" → normalizado: "${normalizedDetectedSku}"`)
                
                // Remover el SKU del mensaje para buscar por nombre (usar el original para el reemplazo)
                messageWithoutSku = cleanMessage.replace(new RegExp(`\\b${detectedSkuFromName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), '').trim()
                console.log(`[WooCommerce] Mensaje sin SKU: "${messageWithoutSku}"`)
                
                // Usar el SKU normalizado para la búsqueda
                detectedSkuFromName = normalizedDetectedSku
                break
              }
            }
            
            // Si se detectó un SKU, intentar buscarlo primero
            if (detectedSkuFromName) {
              try {
                const productBySku = await wordpressService.getProductBySku(detectedSkuFromName)
                if (productBySku) {
                  productStockData = productBySku
                  context.productStockData = productStockData
                  console.log(`[WooCommerce] ✅ Producto encontrado por SKU del nombre: ${productBySku.name} (SKU: ${productBySku.sku})`)
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
                      console.log(`[WooCommerce] ✅ Producto encontrado por código en nombre/SKU: ${productStockData.name} (SKU real: ${productStockData.sku || 'N/A'})`)
                    } else if (productsWithCode.length > 1) {
                      productSearchResults = productsWithCode.slice(0, 10)
                      context.productSearchResults = productSearchResults
                      console.log(`[WooCommerce] ✅ Encontrados ${productsWithCode.length} productos que contienen "${detectedSkuFromName}" en nombre/SKU`)
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
              // Extraer término del producto (sin stop words, sin prefijos)
              const productTerm = extractProductTerm(messageWithoutSku)
              console.log(`[WooCommerce] Término del producto extraído (sin SKU): "${productTerm}"`)
            
              if (productTerm.length > 0) {
                try {
                  // Obtener todos los productos de WooCommerce
                  const allProducts = await wordpressService.getAllProducts()
                  
                  if (allProducts && allProducts.length > 0) {
                      // Si el término incluye "hola" u otras palabras de saludo, limpiarlo más agresivamente
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
                      console.log(`[WooCommerce] ✅ Producto encontrado por matching determinístico: ${productStockData.name} (SKU: ${productStockData.sku || 'N/A'})`)
                      
                      // Si es un producto variable, consultar sus variaciones (lazy loading)
                      if (productStockData.type === 'variable' && productStockData.id) {
                        console.log(`[WooCommerce] 🔄 Producto variable detectado, consultando variaciones...`)
                        try {
                          const variations = await wordpressService.getProductVariations(productStockData.id)
                          if (variations && variations.length > 0) {
                            context.productVariations = variations
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
                      
                      // Generar variaciones de cada palabra (singular/plural)
                      const wordVariations = new Set()
                      termWords.forEach(word => {
                        // Agregar la palabra original
                        wordVariations.add(word)
                        
                        // Convertir a singular
                        const singular = pluralToSingular(word)
                        if (singular !== word && singular.length > 1) {
                          wordVariations.add(singular)
                        }
                        
                        // Convertir a plural (si la palabra original parece ser singular)
                        // Solo si la palabra original no termina en 's' o si es muy corta
                        if (!word.endsWith('s') || word.length <= 4) {
                          const plural = singularToPlural(word)
                          if (plural !== word && plural.length > 1) {
                            wordVariations.add(plural)
                          }
                        }
                        
                        // También generar plural del singular (para cubrir todos los casos)
                        if (singular !== word) {
                          const pluralFromSingular = singularToPlural(singular)
                          if (pluralFromSingular !== singular && pluralFromSingular.length > 1) {
                            wordVariations.add(pluralFromSingular)
                          }
                        }
                      })
                      
                      const allVariations = Array.from(wordVariations)
                      console.log(`[WooCommerce] Búsqueda con variaciones: ${allVariations.join(', ')}`)
                      console.log(`[WooCommerce] Total de productos a buscar: ${allProducts.length}`)
                      
                      // Buscar productos cuyo nombre contenga alguna de las palabras clave o sus variaciones
                      // Normalizar nombres de productos para comparación
                      const partialMatches = allProducts.filter(product => {
                        const productName = normalizeSearchText(product.name || '') // Normalizar nombre
                        const productSku = normalizeCode(product.sku || '')        // Normalizar SKU (código)
                        
                        // Verificar si alguna palabra clave o variación está en el nombre o SKU normalizado
                        return allVariations.some(word => 
                          productName.includes(word) || 
                          productSku.includes(word.toUpperCase())
                        )
                      })
                      
                      if (partialMatches.length > 0) {
                        // Ordenar por relevancia: productos que contengan más palabras clave primero
                        const scoredMatches = partialMatches.map(product => {
                          const productName = normalizeSearchText(product.name || '') // Normalizar nombre
                          const productSku = normalizeCode(product.sku || '')        // Normalizar SKU
                          let score = 0
                          
                          // Puntuar por cada variación encontrada
                          allVariations.forEach(word => {
                            const wordUpper = word.toUpperCase()
                            if (productSku.includes(wordUpper)) score += 3 // SKU tiene más peso
                            if (productName.includes(word)) score += 2
                            // Bonus si la palabra está al inicio del nombre
                            if (productName.startsWith(word + ' ')) score += 1
                          })
                          
                          return { product, score }
                        }).sort((a, b) => b.score - a.score)
                        
                        const topMatches = scoredMatches.slice(0, 10).map(m => m.product) // Top 10 más relevantes
                        
                        console.log(`[WooCommerce] ✅ Encontrados ${partialMatches.length} productos que contienen "${termToUse}" (mostrando top ${topMatches.length})`)
                        productSearchResults = topMatches
                        context.productSearchResults = productSearchResults
                        console.log(`[WooCommerce] Productos encontrados: ${topMatches.map(p => p.name).join(', ')}`)
                      } else {
                        console.log(`[WooCommerce] ❌ No se encontraron productos que contengan "${termToUse}"`)
                        console.log(`[WooCommerce] Debug: término normalizado="${normalizedTerm}", palabras=${termWords.join(',')}, variaciones=${allVariations.join(',')}`)
                        
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
        const fallbackTerm = extractProductTerm(message)
        
        // Solo usar fallback si:
        // 1. Hay un término extraído válido (más de 3 caracteres)
        // 2. El término no es genérico (no está en lista de términos genéricos)
        const genericTerms = ['producto', 'articulo', 'item', 'cosa', 'objeto', 'artículo']
        const isGenericTerm = genericTerms.includes(fallbackTerm.toLowerCase())
        const hasValidTerm = fallbackTerm && fallbackTerm.length >= 3 && !isGenericTerm
        
        if (hasValidTerm) {
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
      } // Cierra el else de "si ya tenemos producto del contexto, omitir búsquedas"
      
      // Verificar resultados finales (usar context para asegurar que tenemos los valores actualizados)
      const finalSearchResults = context.productSearchResults || productSearchResults || []
      if (!productStockData && !finalSearchResults.length) {
        console.log(`[WooCommerce] ⚠️ No se encontraron productos para: "${message}"`)
        console.log(`[WooCommerce] Debug final: productStockData=${!!productStockData}, productSearchResults.length=${productSearchResults.length}, context.productSearchResults.length=${context.productSearchResults?.length || 0}`)
      } else {
        console.log(`[WooCommerce] ✅ Resultados finales: productStockData=${!!productStockData}, resultados parciales=${finalSearchResults.length}`)
      }
      
    } catch (error) {
      console.error('❌ Error consultando WooCommerce:', error.message)
      console.error('   Stack:', error.stack)
      // Continuar sin datos de stock, el agente responderá genéricamente
    }
  }
  
  // Si es consulta de información general, siempre incluir info de la empresa
  if (isGeneral) {
    // La información de la empresa ya está en context.companyInfo
  }
  
  // El backend decide qué hacer y arma el texto para la IA
  let textoParaIA = ''
  let aiResponse = ''
  
  try {
    // DETECTAR TIPO DE CONSULTA Y ARMAR TEXTO PARA LA IA
    
    if (isGeneral) {
      // Consulta de información general - el backend ya tiene la info
      const companyInfo = companyInfoService.formatCompanyInfoForAgent()
      textoParaIA = `Redacta una respuesta clara y formal en español chileno para la siguiente consulta del cliente: "${message}". 
      
Información de la empresa disponible:
${companyInfo}

Responde de forma breve (máximo 3-4 líneas), profesional y cercana, estilo WhatsApp.`
      
    } else if (isProduct) {
      // Consulta de productos - el agente consultó WooCommerce
      if (productStockData) {
        // Se encontró información del producto en WooCommerce
        // Construir información de stock más detallada
        let stockInfo = ''
        if (productStockData.stock_quantity !== null && productStockData.stock_quantity !== undefined) {
          if (productStockData.stock_quantity > 0) {
            stockInfo = `${productStockData.stock_quantity} unidad${productStockData.stock_quantity > 1 ? 'es' : ''} disponible${productStockData.stock_quantity > 1 ? 's' : ''}`
          } else {
            stockInfo = 'Stock agotado (0 unidades)'
          }
        } else if (productStockData.stock_status === 'instock') {
          stockInfo = 'disponible en stock'
        } else {
          stockInfo = 'sin stock disponible'
        }
        
        const priceInfo = productStockData.price 
          ? `$${parseFloat(productStockData.price).toLocaleString('es-CL')}` 
          : 'Precio no disponible'
        
        // Si es una variación, incluir información del producto padre
        const isVariation = productStockData.is_variation
        const parentInfo = isVariation && productStockData.parent_product 
          ? `\n- Producto padre: ${productStockData.parent_product.name}`
          : ''
        
        // Si hay variaciones disponibles (producto variable), incluirlas
        let variationsInfo = ''
        if (context.productVariations && context.productVariations.length > 0 && !isVariation) {
          const variationsList = context.productVariations.slice(0, 5).map(v => {
            const vStock = v.stock_quantity !== null && v.stock_quantity !== undefined
              ? `${v.stock_quantity} unidad${v.stock_quantity !== 1 ? 'es' : ''}`
              : v.stock_status === 'instock' ? 'disponible' : 'sin stock'
            const vPrice = v.price ? `$${parseFloat(v.price).toLocaleString('es-CL')}` : 'Precio N/A'
            return `  - ${v.name}${v.sku ? ` (SKU: ${v.sku})` : ''} - ${vStock} - ${vPrice}`
          }).join('\n')
          
          variationsInfo = `\n\nVARIACIONES DISPONIBLES (${context.productVariations.length} total${context.productVariations.length > 5 ? ', mostrando 5' : ''}):\n${variationsList}`
        }
        
        // Determinar método de búsqueda y nivel de confianza
        const searchMethod = providedExplicitSku ? 'SKU exacto' : providedExplicitId ? 'ID exacto' : 'búsqueda por nombre'
        const confidenceLevel = providedExplicitSku || providedExplicitId ? 'ALTA (identificación exacta)' : 'MEDIA (coincidencia por nombre)'
        
        // Obtener historial reciente para contexto
        const recentHistory = session.history?.slice(-4) || []
        const historyContext = recentHistory.length > 0 
          ? `\n\nCONTEXTO DE CONVERSACIÓN RECIENTE:\n${recentHistory.map(msg => `- ${msg.sender === 'user' ? 'Cliente' : 'Bot'}: ${(msg.message || msg.text || '').substring(0, 100)}`).join('\n')}`
          : ''
        
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

INSTRUCCIONES OBLIGATORIAS - FORMATO EXACTO:
Responde EXACTAMENTE en este formato, con saltos de línea entre cada elemento:

1. Confirmación con nombre: "Sí, tenemos el ${productStockData.name} disponible."
2. SKU (en línea separada): "SKU: ${productStockData.sku || 'N/A'}."
3. Stock (en línea separada): "Stock: ${stockInfo}."
4. Precio (en línea separada): "Precio: ${priceInfo}."
${variationsInfo ? '5. Variaciones (en líneas separadas): Menciona las variaciones disponibles con sus SKUs, stock y precios.' : ''}
${variationsInfo ? '6. Pregunta de seguimiento (en línea separada): "¿Te gustaría saber algo más? 😊"' : '5. Pregunta de seguimiento (en línea separada): "¿Te gustaría saber algo más? 😊"'}

IMPORTANTE:
- Cada elemento debe estar en una línea separada (usa saltos de línea)
- El orden debe ser: Confirmación → SKU → Stock → Precio${variationsInfo ? ' → Variaciones' : ''} → Pregunta
- ${variationsInfo ? 'Si hay variaciones, listarlas con formato: "Variaciones disponibles: [lista con SKU, stock y precio de cada una]"\n- ' : ''}Usa el formato exacto mostrado arriba
- NO ofrezcas reservar ni agregar al carrito (esas funciones no están disponibles)
- NO digas "estoy verificando" - ya tienes la información real del producto
- NO inventes información que no esté arriba
- NO cambies nombres, SKUs, precios ni stock - usa EXACTAMENTE los valores proporcionados`
        
      } else if ((productSearchResults && productSearchResults.length > 0) || (context.productSearchResults && context.productSearchResults.length > 0)) {
        // Usar context.productSearchResults si está disponible, sino usar la variable local
        const finalSearchResults = context.productSearchResults || productSearchResults || []
        
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
          const productsList = finalSearchResults.slice(0, 5).map((p, index) => {
            const stockInfo = p.stock_quantity !== null && p.stock_quantity !== undefined
              ? `${p.stock_quantity} unidad${p.stock_quantity !== 1 ? 'es' : ''}`
              : p.stock_status === 'instock' ? 'disponible' : 'sin stock'
            return `${index + 1}. ${p.name}${p.sku ? ` (SKU: ${p.sku})` : ''}${p.price ? ` - $${p.price.toLocaleString('es-CL')}` : ''} - Stock: ${stockInfo}`
          }).join('\n')
          
          // Obtener historial reciente para contexto
          const recentHistory = session.history?.slice(-4) || []
          const historyContext = recentHistory.length > 0 
            ? `\n\nCONTEXTO DE CONVERSACIÓN RECIENTE:\n${recentHistory.map(msg => `- ${msg.sender === 'user' ? 'Cliente' : 'Bot'}: ${(msg.message || msg.text || '').substring(0, 100)}`).join('\n')}`
            : ''
          
          textoParaIA = `Redacta una respuesta clara y formal en español chileno informando al cliente sobre los productos encontrados.

PRODUCTOS ENCONTRADOS (información real de WooCommerce, matching determinístico - alta confianza):
${productsList}
${finalSearchResults.length > 5 ? `\n(Total: ${finalSearchResults.length} productos encontrados, mostrando los 5 más relevantes)` : ''}

El cliente preguntó: "${message}"${historyContext}

VALIDACIONES OBLIGATORIAS ANTES DE RESPONDER:
1. Verifica que solo menciones productos de la lista arriba
2. Verifica que los nombres, SKUs y precios coincidan EXACTAMENTE con los de la lista
3. NO agregues productos que no estén en la lista
4. NO inventes información adicional

INSTRUCCIONES OBLIGATORIAS:
- Menciona que encontraste ${finalSearchResults.length} producto(s) relacionado(s) con "${message}"
- Lista los productos en el orden mostrado arriba (1, 2, 3...)
- Para cada producto, incluye: nombre, SKU (si existe), precio (si existe) y stock
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
              // Resultados del matching determinístico: son confiables, listarlos
              const productsList = finalSearchResults.slice(0, 5).map((p, index) => {
                const stockInfo = p.stock_quantity !== null && p.stock_quantity !== undefined
                  ? `${p.stock_quantity} unidad${p.stock_quantity !== 1 ? 'es' : ''}`
                  : p.stock_status === 'instock' ? 'disponible' : 'sin stock'
                const priceInfo = p.price ? `$${parseFloat(p.price).toLocaleString('es-CL')}` : 'Precio no disponible'
                return `${index + 1}. ${p.name}${p.sku ? ` (SKU: ${p.sku})` : ''} - Stock: ${stockInfo} - Precio: ${priceInfo}`
              }).join('\n')
              
              // Obtener historial reciente para contexto
              const recentHistory = session.history?.slice(-4) || []
              const historyContext = recentHistory.length > 0 
                ? `\n\nCONTEXTO DE CONVERSACIÓN RECIENTE:\n${recentHistory.map(msg => `- ${msg.sender === 'user' ? 'Cliente' : 'Bot'}: ${(msg.message || msg.text || '').substring(0, 100)}`).join('\n')}`
                : ''
              
              textoParaIA = `Redacta una respuesta clara y profesional en español chileno informando al cliente sobre los productos encontrados.

PRODUCTOS ENCONTRADOS relacionados con "${message}" (información real de WooCommerce, matching determinístico - alta confianza):
${productsList}
${finalSearchResults.length > 5 ? `\n(Total: ${finalSearchResults.length} productos encontrados, mostrando los 5 más relevantes)` : ''}

El cliente preguntó: "${message}"${historyContext}

VALIDACIONES OBLIGATORIAS ANTES DE RESPONDER:
1. Verifica que solo menciones productos de la lista arriba (numerados 1, 2, 3...)
2. Verifica que los nombres, SKUs, stocks y precios coincidan EXACTAMENTE con los de la lista
3. NO agregues productos que no estén en la lista
4. NO inventes información adicional

INSTRUCCIONES OBLIGATORIAS:
- Menciona que encontraste ${finalSearchResults.length} producto(s) relacionado(s) con "${message}"
- Lista los productos en el orden mostrado arriba (1, 2, 3...)
- Para cada producto, incluye: nombre, SKU (si existe), stock y precio
- Indica cuáles tienen stock disponible
- Si hay más de 5 productos, menciona que hay más opciones disponibles
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
      // Otra consulta
      textoParaIA = `Redacta una respuesta clara y formal en español chileno para la siguiente consulta del cliente: "${message}".

Responde de forma breve (máximo 3-4 líneas), profesional y cercana, estilo WhatsApp.`
    } // Cierra el if (isGeneral) / else if (isProduct) / else
    
    // Obtener historial de conversación para contexto
    const conversationHistory = session.history || []
    
    // Llamar a la IA para que redacte la respuesta (con historial para contexto)
    aiResponse = await conkavoAI.redactarRespuesta(textoParaIA, conversationHistory)
    
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
  
  // Preparar opciones contextuales
  const options = []
  
  if (session.state === STATES.IDLE) {
    options.push({ type: 'action', value: ACTIONS.START_ORDER, label: '🛒 Iniciar Pedido' })
  }
  
  if (Object.keys(cart.items || {}).length > 0) {
    options.push({ type: 'action', value: ACTIONS.VIEW_CART, label: '📋 Ver Carrito' })
  }
  
  // Si el usuario no está logueado y pregunta por productos, sugerir login
  if (isProduct && !isLoggedIn) {
    // El agente ya le dirá que necesita login, pero podemos agregar opción
    // (esto se puede hacer desde el frontend también)
  }
  
  return createResponse(
      aiResponse,
      session.state,
      options.length > 0 ? options : null,
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
