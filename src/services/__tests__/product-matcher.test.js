/**
 * EJEMPLOS Y PRUEBAS DEL PRODUCT MATCHER
 * 
 * Este archivo contiene ejemplos de uso y pruebas del sistema de matching determinístico
 * para demostrar su funcionamiento con diferentes casos de entrada y salida
 */

import { normalizeText, matchProduct, matchBySku, matchByName } from '../product-matcher.service.js'

// ============================================
// EJEMPLOS DE NORMALIZACIÓN
// ============================================

console.log('\n=== EJEMPLOS DE NORMALIZACIÓN ===\n')

const normalizationExamples = [
  { input: "Libreta White PU N35", expected: "libretawhitepun35" },
  { input: "N-35", expected: "n35" },
  { input: "Bolígrafo", expected: "boligrafo" },
  { input: "Bolígrafo Plástico", expected: "boligraplastico" },
  { input: "L 68", expected: "l68" },
  { input: "Libreta 035", expected: "libreta035" },
  { input: "PRODUCTO NÚMERO 1", expected: "productonumero1" }
]

normalizationExamples.forEach(({ input, expected }) => {
  const result = normalizeText(input)
  const status = result === expected ? '✅' : '❌'
  console.log(`${status} "${input}" => "${result}" ${result === expected ? '' : `(esperado: "${expected}")`}`)
})

// ============================================
// EJEMPLOS DE MATCHING POR SKU
// ============================================

console.log('\n=== EJEMPLOS DE MATCHING POR SKU ===\n')

const products = [
  { sku: "N35", name: "Libreta White PU N35", id: 30659 },
  { sku: "N42", name: "Libreta White PU N42", id: 30653 },
  { sku: "L68", name: "Bolígrafo Plástico blanco L68", id: 30576 },
  { sku: "601059030", name: "Otro producto", id: 30577 }
]

const skuExamples = [
  { input: "N35", expectedStatus: "FOUND", expectedSku: "N35" },
  { input: "n35", expectedStatus: "FOUND", expectedSku: "N35" },
  { input: "N-35", expectedStatus: "FOUND", expectedSku: "N35" },
  { input: "n 35", expectedStatus: "FOUND", expectedSku: "N35" },
  { input: "N99", expectedStatus: "NOT_FOUND" },
  { input: "L68", expectedStatus: "FOUND", expectedSku: "L68" },
  { input: "l68", expectedStatus: "FOUND", expectedSku: "L68" }
]

skuExamples.forEach(({ input, expectedStatus, expectedSku }) => {
  const result = matchBySku(input, products, p => p.sku)
  const status = result.status === expectedStatus ? '✅' : '❌'
  const skuMatch = expectedSku ? result.product?.sku === expectedSku : true
  const fullMatch = result.status === expectedStatus && skuMatch
  
  console.log(`${fullMatch ? '✅' : '❌'} Input: "${input}"`)
  console.log(`   Status: ${result.status} (esperado: ${expectedStatus})`)
  if (result.status === 'FOUND') {
    console.log(`   SKU encontrado: ${result.product.sku} (esperado: ${expectedSku})`)
  }
  console.log()
})

// ============================================
// EJEMPLOS DE MATCHING POR NOMBRE
// ============================================

console.log('\n=== EJEMPLOS DE MATCHING POR NOMBRE ===\n')

const nameExamples = [
  { input: "Libreta White PU N35", expectedStatus: "FOUND", expectedName: "Libreta White PU N35" },
  { input: "libreta white pu n35", expectedStatus: "FOUND", expectedName: "Libreta White PU N35" },
  { input: "Libreta White PU n35", expectedStatus: "FOUND", expectedName: "Libreta White PU N35" },
  { input: "Bolígrafo Plástico blanco L68", expectedStatus: "FOUND", expectedName: "Bolígrafo Plástico blanco L68" },
  { input: "boligrafo plastico blanco l68", expectedStatus: "FOUND", expectedName: "Bolígrafo Plástico blanco L68" },
  { input: "Producto que no existe", expectedStatus: "NOT_FOUND" }
]

nameExamples.forEach(({ input, expectedStatus, expectedName }) => {
  const result = matchByName(input, products, p => p.name)
  const status = result.status === expectedStatus ? '✅' : '❌'
  const nameMatch = expectedName ? result.product?.name === expectedName : true
  const fullMatch = result.status === expectedStatus && nameMatch
  
  console.log(`${fullMatch ? '✅' : '❌'} Input: "${input}"`)
  console.log(`   Status: ${result.status} (esperado: ${expectedStatus})`)
  if (result.status === 'FOUND') {
    console.log(`   Nombre encontrado: ${result.product.name} (esperado: ${expectedName})`)
  }
  console.log()
})

// ============================================
// EJEMPLOS DE MATCHING GENERAL (SKU o NOMBRE)
// ============================================

console.log('\n=== EJEMPLOS DE MATCHING GENERAL (SKU o NOMBRE) ===\n')

const generalExamples = [
  { input: "N35", expectedStatus: "FOUND", description: "SKU exacto" },
  { input: "n35", expectedStatus: "FOUND", description: "SKU en minúsculas" },
  { input: "Libreta White PU N35", expectedStatus: "FOUND", description: "Nombre exacto" },
  { input: "libreta white pu n35", expectedStatus: "FOUND", description: "Nombre en minúsculas" },
  { input: "Libreta", expectedStatus: "AMBIGUOUS", description: "Nombre parcial (múltiples productos)" },
  { input: "Producto inexistente", expectedStatus: "NOT_FOUND", description: "No existe" }
]

generalExamples.forEach(({ input, expectedStatus, description }) => {
  const result = matchProduct(input, products, p => p.sku, p => p.name)
  const status = result.status === expectedStatus ? '✅' : '❌'
  
  console.log(`${status} Input: "${input}" (${description})`)
  console.log(`   Status: ${result.status} (esperado: ${expectedStatus})`)
  if (result.status === 'FOUND') {
    console.log(`   Producto: ${result.product.name} (SKU: ${result.product.sku})`)
  } else if (result.status === 'AMBIGUOUS') {
    console.log(`   Productos ambiguos: ${result.ambiguousProducts.length}`)
  }
  console.log()
})

// ============================================
// CASOS ESPECIALES
// ============================================

console.log('\n=== CASOS ESPECIALES ===\n')

// Caso 1: Entrada vacía
const emptyResult = matchProduct("", products, p => p.sku, p => p.name)
console.log(`✅ Entrada vacía => Status: ${emptyResult.status} (esperado: NOT_FOUND)`)

// Caso 2: Lista vacía
const emptyListResult = matchProduct("N35", [], p => p.sku, p => p.name)
console.log(`✅ Lista vacía => Status: ${emptyListResult.status} (esperado: NOT_FOUND)`)

// Caso 3: Múltiples productos con mismo nombre normalizado (AMBIGUOUS)
const ambiguousProducts = [
  { sku: "A1", name: "Producto Test" },
  { sku: "A2", name: "Producto test" },  // Mismo nombre normalizado
  { sku: "A3", name: "PRODUCTO TEST" }   // Mismo nombre normalizado
]
const ambiguousResult = matchProduct("producto test", ambiguousProducts, p => p.sku, p => p.name)
console.log(`✅ Múltiples productos con mismo nombre => Status: ${ambiguousResult.status} (esperado: AMBIGUOUS)`)
console.log(`   Productos ambiguos: ${ambiguousResult.ambiguousProducts.length}`)

console.log('\n=== FIN DE EJEMPLOS ===\n')
