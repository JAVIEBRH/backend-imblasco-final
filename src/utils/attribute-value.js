/**
 * Valor de atributo de variación WooCommerce: attr.option (preferido) vs attr.value.
 * Centralizado para tests de regresión y uso en conversation.service.js
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
