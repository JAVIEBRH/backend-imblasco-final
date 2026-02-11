/**
 * CHAT AUTH MIDDLEWARE
 *
 * Resuelve si el usuario del chat debe tratarse como "logueado" (acceso a
 * precios, stock, cotización). Pensado para integración futura con WordPress:
 * el frontend enviará token (p. ej. Authorization: Bearer <token> o body.token)
 * y este middleware lo validará contra WordPress.
 *
 * No bloquea la petición: si no hay token o la validación falla, se trata
 * al usuario como no logueado (req.chatAuth.isLoggedIn = false) y el chat
 * sigue funcionando con respuestas restringidas.
 */

import * as wordpressAuthService from '../services/wordpress-auth.service.js'

/**
 * Middleware que resuelve la autenticación para el chat y adjunta
 * req.chatAuth = { isLoggedIn, wpUser? }.
 *
 * Origen del token (en orden): Authorization: Bearer <token>, body.token, query.token.
 * userId se toma de body.userId o params.userId según la ruta.
 */
export async function resolveChatAuth(req, res, next) {
  try {
    const token = wordpressAuthService.getTokenFromRequest(req)
    const userId = (req.body?.userId || req.params?.userId || '').toString().trim() || null

    const result = await wordpressAuthService.validateTokenForChat({ token, userId })

    req.chatAuth = {
      isLoggedIn: !!result.isLoggedIn,
      wpUser: result.wpUser || null
    }
  } catch (err) {
    console.warn('[ChatAuth] Error resolviendo auth, tratando como no logueado:', err?.message || err)
    req.chatAuth = {
      isLoggedIn: false,
      wpUser: null
    }
  }
  next()
}

export default { resolveChatAuth }
