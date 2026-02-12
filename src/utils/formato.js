/**
 * Formato de datos para mostrar al cliente (precio, etc.).
 * Convención única para evitar NaN e inconsistencias entre listas y producto único.
 */

/** Texto cuando el precio no está disponible (unificado en todo el sistema). */
export const SIN_PRECIO_LABEL = 'Precio no disponible'

/**
 * Formatea el precio para mostrar al cliente.
 * @param {string|number|null|undefined} price - Valor de precio (WooCommerce puede enviar string o número).
 * @returns {string} - "$12.345" (es-CL) o SIN_PRECIO_LABEL si no es un número válido.
 */
export function formatPrecioParaCliente(price) {
  if (price == null || price === '') return SIN_PRECIO_LABEL
  const n = Number(price)
  if (Number.isNaN(n) || n < 0) return SIN_PRECIO_LABEL
  return `$${n.toLocaleString('es-CL')}`
}
