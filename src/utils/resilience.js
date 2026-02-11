/**
 * Timeout y reintentos para llamadas externas (plan SORA B).
 */

/**
 * Rechaza la promesa si no se resuelve en ms milisegundos.
 * @param {number} ms - Timeout en milisegundos
 * @param {Promise} promise - Promesa a envolver
 * @returns {Promise}
 */
export function withTimeout(ms, promise) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout después de ${ms}ms`))
    }, ms)
    promise
      .then((result) => {
        clearTimeout(timer)
        resolve(result)
      })
      .catch((err) => {
        clearTimeout(timer)
        reject(err)
      })
  })
}

/**
 * Ejecuta fn() (que devuelve una promesa); si falla, espera delayMs y reintenta hasta maxRetries veces.
 * @param {() => Promise} fn - Función que devuelve la promesa (se llama en cada intento)
 * @param {{ maxRetries?: number, delayMs?: number }} opts
 * @returns {Promise}
 */
export async function withRetry(fn, { maxRetries = 2, delayMs = 500 } = {}) {
  let lastError
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, delayMs))
      }
    }
  }
  throw lastError
}
