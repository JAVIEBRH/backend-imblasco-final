/**
 * Valor de atributo de variación WooCommerce: attr.option (preferido) vs attr.value.
 * Centralizado para tests de regresión y uso en conversation.service.js / wordpress.service.js
 */

/**
 * Obtiene el valor a mostrar de un atributo de variación (option tiene prioridad sobre value).
 * @param {{ option?: string | null, value?: string | null }} attr - Objeto atributo de WooCommerce
 * @returns {string}
 */
export function getAttributeDisplayValue(attr) {
  if (!attr || typeof attr !== 'object') return ''
  return (attr.option != null && attr.option !== '') ? String(attr.option) : (attr.value != null ? String(attr.value) : '')
}

/**
 * Clave única para el mapa atributo|opción (slug → nombre para mostrar).
 * DEBE usarse igual en wordpress.service (al llenar el mapa) y en conversation.service (al consultar).
 * @param {string} attrName - Nombre del atributo (ej. "pa_tamaño" o "pa_talla")
 * @param {string} optionValue - Valor de la opción (ej. "21", "xl")
 * @returns {string} Clave normalizada para el Map
 */
export function buildAttributeOptionKey(attrName, optionValue) {
  const a = (attrName != null ? String(attrName).trim() : '').toLowerCase()
  const o = (optionValue != null ? String(optionValue).trim() : '').toLowerCase()
  return `${a}|${o}`
}
