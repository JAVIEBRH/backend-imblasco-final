/**
 * Rate limit para POST /api/chat/message y /message/stream.
 * Límite por userId (body) o por IP si no hay userId.
 * Por defecto: 30 peticiones por minuto por clave.
 */

const WINDOW_MS = 60 * 1000 // 1 minuto
const MAX_REQUESTS_PER_WINDOW = 30

const store = new Map() // key -> { count, resetAt }

function getKey(req) {
  const userId = req.body?.userId
  if (userId && typeof userId === 'string' && userId.trim()) {
    return `user:${userId.trim()}`
  }
  const ip = req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown'
  return `ip:${ip}`
}

/**
 * Middleware: responde 429 si se supera el límite.
 */
export function chatRateLimit(req, res, next) {
  const key = getKey(req)
  const now = Date.now()
  let entry = store.get(key)

  if (!entry) {
    entry = { count: 1, resetAt: now + WINDOW_MS }
    store.set(key, entry)
    return next()
  }

  if (now >= entry.resetAt) {
    entry.count = 1
    entry.resetAt = now + WINDOW_MS
    return next()
  }

  entry.count += 1
  if (entry.count > MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({
      success: false,
      error: true,
      message: 'Demasiadas peticiones. Por favor, espera un momento antes de enviar más mensajes.',
      botMessage: '⚠️ Has enviado muchos mensajes seguidos. Espera un minuto e intenta de nuevo.'
    })
  }
  next()
}

/**
 * Limpieza periódica de entradas caducadas (evitar crecimiento indefinido del Map).
 */
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of store.entries()) {
    if (now >= v.resetAt) store.delete(k)
  }
}, WINDOW_MS)

export default { chatRateLimit }
