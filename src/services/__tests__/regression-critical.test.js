/**
 * Tests de regresión críticos (plan SORA D).
 * getAttributeDisplayValue (attr.option vs attr.value),
 * buildAttributeOptionKey (clave única para mapa slug→nombre; mismo formato en wordpress y conversation).
 *
 * Ejecutar: npm run test:regression
 */

import { getAttributeDisplayValue, buildAttributeOptionKey } from '../../utils/attribute-value.js'

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

// Test 1: getAttributeDisplayValue — option tiene prioridad sobre value
assertEqual(getAttributeDisplayValue({ option: 'Rojo', value: null }), 'Rojo', 'getAttributeDisplayValue(option: Rojo, value: null) === Rojo')
assertEqual(getAttributeDisplayValue({ option: '', value: 'Azul' }), 'Azul', 'getAttributeDisplayValue(option: "", value: Azul) === Azul')
assertEqual(getAttributeDisplayValue({ option: null, value: 'Verde' }), 'Verde', 'getAttributeDisplayValue(option: null, value: Verde) === Verde')
assertEqual(getAttributeDisplayValue({}), '', 'getAttributeDisplayValue({}) === ""')
assertEqual(getAttributeDisplayValue(null), '', 'getAttributeDisplayValue(null) === ""')

// Test 2: buildAttributeOptionKey — misma clave al llenar y al consultar el mapa (slug→nombre)
assertEqual(buildAttributeOptionKey('pa_tamaño', '21'), 'pa_tamaño|21', 'buildAttributeOptionKey(pa_tamaño, 21)')
assertEqual(buildAttributeOptionKey('pa_talla', 'XL'), 'pa_talla|xl', 'buildAttributeOptionKey normaliza a minúsculas')
assertEqual(buildAttributeOptionKey('  pa_color  ', '  Rojo  '), 'pa_color|rojo', 'buildAttributeOptionKey recorta espacios')
const map = new Map()
map.set(buildAttributeOptionKey('pa_tamaño', '21'), '21 cm')
map.set(buildAttributeOptionKey('pa_talla', 'xl'), 'XL')
assertEqual(map.get(buildAttributeOptionKey('pa_tamaño', '21')), '21 cm', 'Mapa: pa_tamaño|21 → 21 cm')
assertEqual(map.get(buildAttributeOptionKey('pa_talla', 'XL')), 'XL', 'Mapa: pa_talla|XL (mayúscula) resuelve a XL')

console.log('\n--- Resumen ---')
console.log(`  Pasaron: ${passed}`)
console.log(`  Fallaron: ${failed}`)
if (failed > 0) {
  process.exit(1)
}
console.log('\n✅ Todos los tests de regresión pasaron.\n')
