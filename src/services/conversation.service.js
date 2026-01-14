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
 * Extraer término del producto del mensaje (sin stop words, sin prefijos)
 * @param {string} message - Mensaje del usuario
 * @returns {string} - Término del producto extraído
 */
function extractProductTerm(message) {
  // Lista completa de stop words (palabras a eliminar)
  const stopWords = [
    'hay', 'stock', 'del', 'de', 'producto', 'product', 'tienes', 'tiene', 
    'cuanto', 'cuánto', 'cuántas', 'cuántos', 'precio', 'cuesta', 'vale', 
    'que', 'unidades', 'disponible', 'tienen', 'el', 'la', 'los', 'las', 
    'hola', 'busco', 'buscando', 'llamado', 'llamada', 'nombre', 'articulo', 
    'artículo', 'un', 'una', 'estoy', 'en', 'con', 'por', 'para', 'sobre',
    'desde', 'hasta', 'entre', 'durante', 'según', 'mediante', 'sin', 'bajo'
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
  
  // Convertir a minúsculas y limpiar
  let result = cleaned
    .toLowerCase()
    .replace(/[¿?¡!.,:;]/g, ' ')
    .split(/\s+/)
    .filter(word => {
      // Mantener palabras que:
      // 1. Tienen más de 1 carácter
      // 2. No están en stop words
      // 3. No son solo números (a menos que sean parte de un SKU)
      return word.length > 1 && !stopWords.includes(word.toLowerCase())
    })
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
      '⚠️ El sistema aún no tiene stock cargado. Contacte al administrador.',
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
        
        // Buscar SKU numérico largo (ej: "601059110")
        const isShortMessage = message.trim().split(/\s+/).length <= 3
        if (detectedSkus.length === 0 && isShortMessage) {
          const numericSkuMatch = message.match(/\b(\d{6,})\b/)
          if (numericSkuMatch) {
            detectedSkus.push(numericSkuMatch[1].trim())
            console.log(`[WooCommerce] 🔍 SKU numérico detectado: "${numericSkuMatch[1]}"`)
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
      
      if (explicitIdMatch) {
        providedExplicitId = explicitIdMatch[1].trim()
        console.log(`[WooCommerce] 🔍 ID detectado: "${providedExplicitId}"`)
      }
      
      // Buscar por SKU primero
      if (providedExplicitSku) {
        try {
          const productBySku = await wordpressService.getProductBySku(providedExplicitSku)
          if (productBySku) {
            productStockData = productBySku
            context.productStockData = productStockData
            console.log(`[WooCommerce] ✅ Producto encontrado por SKU explícito: ${productBySku.name} (SKU: ${productBySku.sku})`)
            console.log(`   Stock: ${productBySku.stock_quantity !== null ? productBySku.stock_quantity : 'N/A'}, Precio: ${productBySku.price ? '$' + productBySku.price : 'N/A'}`)
          } else {
            console.log(`[WooCommerce] ❌ No se encontró producto con SKU explícito: "${providedExplicitSku}"`)
            console.log(`   Intentando buscar por ID si está disponible...`)
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
          
          // Detectar si hay un SKU al final del mensaje (ej: "Kit de supervivencia SU01")
          // Patrón: palabra con letra seguida de números al final
          const skuAtEndMatch = cleanMessage.match(/\s+([A-Za-z]\d+[A-Za-z]?[-]?\d*)\s*$/i)
          let detectedSkuFromName = null
          let messageWithoutSku = cleanMessage
          
          if (skuAtEndMatch) {
            detectedSkuFromName = skuAtEndMatch[1].trim()
            messageWithoutSku = cleanMessage.replace(/\s+[A-Za-z]\d+[A-Za-z]?[-]?\d*\s*$/i, '').trim()
            console.log(`[WooCommerce] 🔍 SKU detectado al final del nombre: "${detectedSkuFromName}"`)
            
            // Intentar buscar por este SKU primero
            try {
              const productBySku = await wordpressService.getProductBySku(detectedSkuFromName)
              if (productBySku) {
                productStockData = productBySku
                context.productStockData = productStockData
                console.log(`[WooCommerce] ✅ Producto encontrado por SKU del nombre: ${productBySku.name} (SKU: ${productBySku.sku})`)
                console.log(`   Stock: ${productBySku.stock_quantity !== null ? productBySku.stock_quantity : 'N/A'}, Precio: ${productBySku.price ? '$' + productBySku.price : 'N/A'}`)
              }
            } catch (error) {
              console.log(`[WooCommerce] ⚠️  No se encontró producto con SKU "${detectedSkuFromName}", continuando con búsqueda por nombre`)
            }
          }
          
          // Si no se encontró por SKU, buscar por nombre
          if (!productStockData) {
            // Extraer término del producto (sin stop words, sin prefijos)
            const productTerm = extractProductTerm(messageWithoutSku)
            console.log(`[WooCommerce] Término del producto extraído: "${productTerm}"`)
          
            if (productTerm.length > 0) {
              try {
                // Obtener muestra de productos de WooCommerce (sin búsqueda fuzzy)
                console.log(`[WooCommerce] Obteniendo muestra de productos de WooCommerce...`)
                const allProducts = await wordpressService.getProductsSample(50)
                
                if (allProducts && allProducts.length > 0) {
                  console.log(`[WooCommerce] ✅ Obtenidos ${allProducts.length} productos de WooCommerce`)
                  
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
                    context.productStockData = productStockData
                    context.productSearchResults = [productStockData]
                  } else if (matchResult.status === 'AMBIGUOUS') {
                    // Múltiples coincidencias exactas: listar productos ambiguos
                    console.log(`[WooCommerce] ⚠️  Múltiples productos con coincidencia exacta (${matchResult.ambiguousProducts.length}), se listarán para confirmación`)
                    productSearchResults = matchResult.ambiguousProducts.map(m => m.originalProduct)
                    context.productSearchResults = productSearchResults
                  } else {
                    // NOT_FOUND: no hay coincidencia exacta
                    console.log(`[WooCommerce] ❌ No se encontró coincidencia exacta con término: "${termToUse}"`)
                  }
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
          }
        } else {
          console.log(`[WooCommerce] ⚠️  Mensaje muy corto después de limpieza, no se puede buscar por nombre`)
        }
      } else {
        console.log(`[WooCommerce] ✅ Producto encontrado por referencia explícita, omitiendo búsqueda adicional`)
      }
      
      if (!productStockData && !productSearchResults.length) {
        console.log(`[WooCommerce] ⚠️ No se encontraron productos para: "${message}"`)
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
        
        textoParaIA = `Redacta una respuesta clara y profesional en español chileno para el cliente.

INFORMACIÓN REAL DEL PRODUCTO (consultada desde WooCommerce en tiempo real):
- Nombre del producto: ${productStockData.name}
${productStockData.sku ? `- SKU: ${productStockData.sku}` : ''}
- Stock: ${stockInfo}
- Precio: ${priceInfo}

El cliente preguntó: "${message}"

INSTRUCCIONES OBLIGATORIAS:
- Responde directamente con la información del producto ENCONTRADO
- Menciona el nombre completo del producto: "${productStockData.name}"
${productStockData.sku ? `- Menciona el SKU: ${productStockData.sku}` : ''}
- Menciona el stock exacto: "${stockInfo}"
- Menciona el precio exacto: "${priceInfo}"
- Responde en máximo 3-4 líneas, profesional, estilo WhatsApp
- NO ofrezcas reservar ni agregar al carrito (esas funciones no están disponibles)
- NO digas "estoy verificando" - ya tienes la información real del producto
- NO inventes información que no esté arriba`
        
      } else if (productSearchResults && productSearchResults.length > 0) {
        // Se encontraron varios productos, mencionar el primero o lista
        const productsList = productSearchResults.slice(0, 3).map(p => 
          `- ${p.name}${p.sku ? ` (SKU: ${p.sku})` : ''}${p.price ? ` - $${p.price.toLocaleString('es-CL')}` : ''}`
        ).join('\n')
        
        textoParaIA = `Redacta una respuesta clara y formal en español chileno informando al cliente sobre los productos encontrados.

PRODUCTOS ENCONTRADOS (información real de WooCommerce):
${productsList}

El cliente preguntó: "${message}"

INSTRUCCIONES OBLIGATORIAS:
- Menciona que encontraste ${productSearchResults.length} producto(s) relacionado(s)
- Lista los productos con su nombre, precio (si está disponible) y SKU
- Indica cuáles tienen stock disponible
- Responde máximo 3-4 líneas, profesional, estilo WhatsApp
- Si el cliente pregunta por un producto específico, ofrécete a buscar más detalles por SKU o nombre exacto
- NO inventes información que no esté en la lista arriba`
        
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
          textoParaIA = `Redacta una respuesta clara y formal en español chileno informando al cliente que estás verificando la información del producto.

El cliente preguntó: "${message}"

IMPORTANTE:
- Responde de forma breve (máximo 3-4 líneas), profesional y cercana, estilo WhatsApp
- Indica que estás consultando la información del producto
- Pide que el cliente sea más específico con el nombre o SKU del producto si es necesario
- Ofrece ayuda para encontrar el producto correcto`
        }
      }
      
    } else {
      // Otra consulta
      textoParaIA = `Redacta una respuesta clara y formal en español chileno para la siguiente consulta del cliente: "${message}".

Responde de forma breve (máximo 3-4 líneas), profesional y cercana, estilo WhatsApp.`
    }
    
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
