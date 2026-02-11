/**
 * Tests de regresión críticos (plan SORA D).
 * Aseguran: stopWords (no buscar por transferencia/cuenta/depósito),
 * TERMINOS_GENERICOS (AMBIGUA→PRODUCTOS solo con término válido),
 * getAttributeDisplayValue (attr.option vs attr.value).
 *
 * Ejecutar: npm run test:regression
 */

import { stopWords, TERMINOS_GENERICOS } from '../conversation.service.js'
import { getAttributeDisplayValue } from '../../utils/attribute-value.js'

let passed = 0
let failed = 0

function assert(condition, label) {
  if (condition) {
    passed++
    console.log(`  ✅ ${label}`)
  } else {
    failed++
    console.log(`  ❌ ${label}`)
  }
}

function assertEqual(actual, expected, label) {
  const ok = actual === expected
  if (ok) {
    passed++
    console.log(`  ✅ ${label}`)
  } else {
    failed++
    console.log(`  ❌ ${label}`)
    console.log(`     Esperado: ${JSON.stringify(expected)}`)
    console.log(`     Actual:   ${JSON.stringify(actual)}`)
  }
}

console.log('\n=== Tests de regresión críticos ===\n')

// Test 1: stopWords incluye términos que no deben disparar búsqueda de productos
const requiredStopWords = ['cuenta', 'transferir', 'transferencia', 'depósito', 'deposito']
for (const term of requiredStopWords) {
  assert(stopWords.includes(term), `stopWords incluye "${term}"`)
}

// Test 2: TERMINOS_GENERICOS incluye producto/articulo; 'llavero' no es genérico
assert(TERMINOS_GENERICOS.includes('producto'), 'TERMINOS_GENERICOS incluye "producto"')
assert(TERMINOS_GENERICOS.includes('articulo') || TERMINOS_GENERICOS.includes('artículo'), 'TERMINOS_GENERICOS incluye articulo/artículo')
assert(!TERMINOS_GENERICOS.includes('llavero'), '"llavero" no está en TERMINOS_GENERICOS')

// Test 3: getAttributeDisplayValue — option tiene prioridad sobre value
assertEqual(getAttributeDisplayValue({ option: 'Rojo', value: null }), 'Rojo', 'getAttributeDisplayValue(option: Rojo, value: null) === Rojo')
assertEqual(getAttributeDisplayValue({ option: '', value: 'Azul' }), 'Azul', 'getAttributeDisplayValue(option: "", value: Azul) === Azul')
assertEqual(getAttributeDisplayValue({ option: null, value: 'Verde' }), 'Verde', 'getAttributeDisplayValue(option: null, value: Verde) === Verde')
assertEqual(getAttributeDisplayValue({}), '', 'getAttributeDisplayValue({}) === ""')
assertEqual(getAttributeDisplayValue(null), '', 'getAttributeDisplayValue(null) === ""')

console.log('\n--- Resumen ---')
console.log(`  Pasaron: ${passed}`)
console.log(`  Fallaron: ${failed}`)
if (failed > 0) {
  process.exit(1)
}
console.log('\n✅ Todos los tests de regresión pasaron.\n')
