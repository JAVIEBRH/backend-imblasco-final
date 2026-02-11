/**
 * Normalización centralizada (extracción desde conversation.service.js y wordpress.service.js).
 * No modificar reglas: mismo comportamiento que el código original.
 */

/**
 * Normalizar texto para búsqueda (caracteres especiales, espacios, códigos)
 * @param {string} text - Texto a normalizar
 * @returns {string} - Texto normalizado
 */
export function normalizeSearchText(text) {
  if (!text || typeof text !== 'string') return ''

  return text
    .toLowerCase()
    .normalize('NFD')                       // Descomponer caracteres Unicode (á -> a + ´)
    .replace(/[\u0300-\u036f]/g, '')       // Eliminar diacríticos (tildes, acentos)
    // Normalizar caracteres especiales a espacios
    .replace(/[-_.,;:()\[\]{}'"!?¡¿]/g, ' ')   // Guiones, puntos, paréntesis, comillas, signos → espacio
    // Normalizar espacios múltiples a uno solo
    .replace(/\s+/g, ' ')                  // Múltiples espacios → un solo espacio
    .trim()
}

/**
 * Normalizar códigos/SKU (N35 = N-35 = N 35 = N.35 = N3,5 = N3?)
 * @param {string} code - Código/SKU a normalizar
 * @returns {string} - Código normalizado
 */
export function normalizeCode(code) {
  if (!code || typeof code !== 'string') return ''

  return code
    .toUpperCase()
    .replace(/[?¿!¡.,;:()\[\]{}'"\s_-]/g, '')  // Eliminar signos de interrogación, exclamación, puntuación, espacios, guiones
    .trim()
}

/**
 * Normalización conservadora de valor de atributo (espacios y unidades: "50 cms" ↔ "50cm").
 * @param {string} value - Valor a normalizar (ej. valorAtributo de OpenAI o attr.option/attr.value)
 * @returns {string} - Valor normalizado (lowercase, sin espacios internos, cms→cm al final)
 */
export function normalizeAttributeValue(value) {
  if (value == null) return ''
  const str = typeof value === 'string' ? value : String(value)
  let out = str.toLowerCase().trim()
  out = out.replace(/\s+/g, '')           // Quitar espacios
  out = out.replace(/cms$/i, 'cm')        // Unificar "cms" a "cm" (conservador: solo al final)
  return out
}
