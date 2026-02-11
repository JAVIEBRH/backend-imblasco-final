/**
 * Logging estructurado (plan SORA C). Una línea JSON por evento para observabilidad.
 */

/**
 * Escribe un evento en stdout como una línea JSON.
 * @param {Object} payload - { event, message, userId, queryType, latencyMs, error, ... }
 */
export function logEvent(payload) {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...payload
  })
  process.stdout.write(line + '\n')
}
