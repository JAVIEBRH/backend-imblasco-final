/**
 * VALIDATION MIDDLEWARE
 * Validaciones reutilizables para endpoints
 */

/**
 * Validar que userId sea string no vacío
 */
export function validateUserId(req, res, next) {
  const userId = req.params.userId || req.body.userId
  
  if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
    return res.status(400).json({
      error: true,
      message: 'userId debe ser un string no vacío'
    })
  }
  
  // Sanitizar userId
  req.params.userId = userId.trim()
  if (req.body.userId) {
    req.body.userId = userId.trim()
  }
  
  next()
}

/**
 * Validar que SKU sea string no vacío
 */
export function validateSKU(req, res, next) {
  const sku = req.params.sku || req.body.sku
  
  if (!sku || typeof sku !== 'string' || sku.trim().length === 0) {
    return res.status(400).json({
      error: true,
      message: 'sku debe ser un string no vacío'
    })
  }
  
  // Sanitizar SKU (solo mayúsculas, alfanuméricos y guiones)
  const sanitized = sku.trim().toUpperCase().replace(/[^A-Z0-9\-]/g, '')
  
  if (sanitized.length === 0) {
    return res.status(400).json({
      error: true,
      message: 'sku contiene caracteres inválidos'
    })
  }
  
  req.params.sku = sanitized
  if (req.body.sku) {
    req.body.sku = sanitized
  }
  
  next()
}

/**
 * Validar que cantidad sea número positivo
 */
export function validateQuantity(req, res, next) {
  const cantidad = req.body.cantidad || req.body.quantity || req.body.value
  
  if (cantidad === undefined || cantidad === null) {
    return res.status(400).json({
      error: true,
      message: 'cantidad es requerida'
    })
  }
  
  const num = parseInt(cantidad, 10)
  
  if (isNaN(num) || num <= 0) {
    return res.status(400).json({
      error: true,
      message: 'cantidad debe ser un número mayor a 0'
    })
  }
  
  // Normalizar a cantidad
  if (req.body.quantity) {
    req.body.cantidad = num
    delete req.body.quantity
  }
  if (req.body.value && req.body.action === 'SET_QUANTITY') {
    req.body.cantidad = num
  }
  
  next()
}

/**
 * Validar formato de email
 */
export function validateEmail(req, res, next) {
  const email = req.body.email
  
  if (!email || typeof email !== 'string') {
    return res.status(400).json({
      error: true,
      message: 'email es requerido'
    })
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  
  if (!emailRegex.test(email.trim())) {
    return res.status(400).json({
      error: true,
      message: 'email tiene formato inválido'
    })
  }
  
  req.body.email = email.trim().toLowerCase()
  next()
}

/**
 * Validar estado de pedido
 */
export function validateOrderStatus(req, res, next) {
  const status = req.body.status || req.body.estado
  
  if (!status || typeof status !== 'string') {
    return res.status(400).json({
      error: true,
      message: 'status es requerido'
    })
  }
  
  const validStatuses = [
    'draft', 'confirmed', 'sent_to_erp', 'invoiced', 
    'error', 'cancelled', 'rejected'
  ]
  
  if (!validStatuses.includes(status.toLowerCase())) {
    return res.status(400).json({
      error: true,
      message: `status inválido. Válidos: ${validStatuses.join(', ')}`
    })
  }
  
  req.body.status = status.toLowerCase()
  if (req.body.estado) {
    delete req.body.estado
  }
  
  next()
}

/**
 * Validar límite de búsqueda (prevenir DoS)
 */
export function validateLimit(req, res, next) {
  const limit = req.query.limit || req.body.limit
  
  if (limit !== undefined) {
    const num = parseInt(limit, 10)
    
    if (isNaN(num) || num < 1) {
      return res.status(400).json({
        error: true,
        message: 'limit debe ser un número mayor a 0'
      })
    }
    
    // Limitar máximo a 1000 para prevenir queries lentas
    const maxLimit = 1000
    if (num > maxLimit) {
      req.query.limit = maxLimit
      if (req.body.limit) {
        req.body.limit = maxLimit
      }
    }
  }
  
  next()
}

/**
 * Validar offset
 */
export function validateOffset(req, res, next) {
  const offset = req.query.offset || req.body.offset
  
  if (offset !== undefined) {
    const num = parseInt(offset, 10)
    
    if (isNaN(num) || num < 0) {
      return res.status(400).json({
        error: true,
        message: 'offset debe ser un número mayor o igual a 0'
      })
    }
  }
  
  next()
}

/**
 * Validar acción del chat
 */
export function validateChatAction(req, res, next) {
  const { action } = req.body
  
  if (!action || typeof action !== 'string') {
    return res.status(400).json({
      error: true,
      message: 'action es requerido'
    })
  }
  
  const validActions = [
    'START_ORDER', 'SELECT_PRODUCT', 'SET_QUANTITY', 'ADD_MORE',
    'FINISH_ORDER', 'VIEW_CART', 'CANCEL_ORDER', 'SEARCH_PRODUCT'
  ]
  
  if (!validActions.includes(action)) {
    return res.status(400).json({
      error: true,
      message: `action inválido. Válidos: ${validActions.join(', ')}`
    })
  }
  
  next()
}

export default {
  validateUserId,
  validateSKU,
  validateQuantity,
  validateEmail,
  validateOrderStatus,
  validateLimit,
  validateOffset,
  validateChatAction
}

