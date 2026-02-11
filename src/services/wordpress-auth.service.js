/**
 * WORDPRESS AUTH SERVICE (validación para chat)
 *
 * Responsable de decidir si el usuario del chat debe tratarse como "logueado"
 * (acceso a precios, stock, instrucciones de cotización). Pensado para que,
 * a futuro, la validación provenga de WordPress/WooCommerce.
 *
 * CONTEXTO DE INTEGRACIÓN FUTURA
 * ------------------------------
 * El frontend (sitio WordPress/WooCommerce) enviará una credencial de sesión
 * (token, cookie o aplicación password). Este servicio validará esa credencial
 * contra WordPress. Posibles mecanismos:
 *
 * 1. JWT emitido por WordPress (plugins: JWT Authentication for WP REST API,
 *    Simple JWT Auth). El frontend obtiene el token tras login y lo envía en
 *    Authorization: Bearer <token>. Aquí validaríamos firma y/o llamando a
 *    un endpoint tipo GET /wp-json/.../token/validate o GET /wp-json/wp/v2/users/me.
 *
 * 2. Application Passwords (WP 5.6+). El usuario genera una contraseña de
 *    aplicación; el backend podría validar haciendo una petición autenticada
 *    a la REST API de WP (p. ej. GET /wp-json/wp/v2/users/me con Basic Auth).
 *
 * 3. Cookie / nonce de sesión. Si el chat se sirve en la misma origen que WP,
 *    el frontend podría enviar cookie o nonce; este backend llamaría a un
 *    endpoint de WP que valide la sesión y devuelva el usuario.
 *
 * CONTRATO ACTUAL
 * ---------------
 * - Si se pasa options.isLoggedIn desde la ruta (tras validar token), se usa.
 * - Si no, se usa CHAT_AUTH_AS_LOGGED_IN (default: todos como logueados para pruebas).
 *
 * CONTRATO A FUTURO
 * -----------------
 * - validateTokenForChat({ token, userId }) llamará a WordPress (REST API o
 *   endpoint custom) para comprobar si el token es válido y si el usuario
 *   está registrado/revisado. Retornará { isLoggedIn, wpUser? }.
 */

/**
 * Valida la credencial/token para el chat y determina si el usuario debe
 * considerarse logueado (acceso a precios, stock, cotización).
 *
 * Ahora: usa variable de entorno CHAT_AUTH_AS_LOGGED_IN; si en el futuro
 * se recibe token, se puede llamar a WordPress para validarlo.
 *
 * @param {Object} params
 * @param {string} [params.token] - Token/credencial enviado por el cliente (Bearer, body.token, etc.)
 * @param {string} [params.userId] - Identificador de usuario/sesión del chat
 * @returns {Promise<{ isLoggedIn: boolean, wpUser?: Object }>}
 */
export async function validateTokenForChat({ token, userId } = {}) {
  // A FUTURO: si hay token, validarlo contra WordPress (REST API o JWT).
  // Ejemplo de flujo:
  // if (token) {
  //   const wpResult = await validateTokenWithWordPress(token);
  //   if (wpResult.valid && wpResult.user) {
  //     return { isLoggedIn: true, wpUser: wpResult.user };
  //   }
  //   return { isLoggedIn: false };
  // }

  const env = process.env.CHAT_AUTH_AS_LOGGED_IN
  const isLoggedIn = env !== 'false' && env !== '0'
  return { isLoggedIn }
}

/**
 * Extrae el token de la petición (header Authorization Bearer, body o query).
 * Útil para el middleware que alimenta validateTokenForChat.
 *
 * @param {Object} req - Objeto request de Express
 * @returns {string|null} Token o null si no se encuentra
 */
export function getTokenFromRequest(req) {
  if (!req) return null
  const authHeader = req.headers?.authorization
  if (authHeader && typeof authHeader === 'string' && /^\s*Bearer\s+/i.test(authHeader)) {
    return authHeader.replace(/^\s*Bearer\s+/i, '').trim() || null
  }
  const bodyToken = req.body?.token
  if (bodyToken && typeof bodyToken === 'string') return bodyToken.trim() || null
  const queryToken = req.query?.token
  if (queryToken && typeof queryToken === 'string') return queryToken.trim() || null
  return null
}

export default {
  validateTokenForChat,
  getTokenFromRequest
}
