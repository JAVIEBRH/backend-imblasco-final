/**
 * Tests unitarios: getStockTextForListProduct y enrichStockForListProducts
 * (stock en listas de productos — criterio único, errores, NaN)
 *
 * Ejecutar: node src/services/__tests__/conversation-stock-list.test.js
 */

import { getStockTextForListProduct, enrichStockForListProducts } from '../conversation.service.js'

let passed = 0
let failed = 0

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

function assertDeepEqual(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
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

// ========== getStockTextForListProduct ==========

console.log('\n=== getStockTextForListProduct ===\n')

// Con stock_quantity numérico
assertEqual(
  getStockTextForListProduct({ id: 1, stock_quantity: 10, stock_status: 'instock' }, {}),
  '10 unidades',
  'stock_quantity 10 → "10 unidades"'
)
assertEqual(
  getStockTextForListProduct({ id: 1, stock_quantity: 1, stock_status: 'instock' }, {}),
  '1 unidad',
  'stock_quantity 1 → "1 unidad" (singular)'
)
assertEqual(
  getStockTextForListProduct({ id: 1, stock_quantity: 0, stock_status: 'outofstock' }, {}),
  'sin stock',
  'stock_quantity 0 → "sin stock"'
)

// Sin stock_quantity: usa stockByProductId
assertEqual(
  getStockTextForListProduct(
    { id: 42, stock_quantity: undefined, stock_status: 'instock' },
    { 42: { sum: 5, error: false } }
  ),
  '5 unidades',
  'sin stock_quantity + stockByProductId.sum 5 → "5 unidades"'
)
assertEqual(
  getStockTextForListProduct(
    { id: 42, stock_quantity: null, stock_status: 'instock' },
    { 42: { sum: 1, error: false } }
  ),
  '1 unidad',
  'sin stock_quantity + sum 1 → "1 unidad"'
)
assertEqual(
  getStockTextForListProduct(
    { id: 42, stock_quantity: undefined, stock_status: 'instock' },
    { 42: { sum: null, error: true } }
  ),
  'consultar stock',
  'stockByProductId.error true → "consultar stock"'
)
assertEqual(
  getStockTextForListProduct(
    { id: 42, stock_quantity: undefined, stock_status: 'instock' },
    { 42: { sum: 0, error: false } }
  ),
  'sin stock',
  'stockByProductId.sum 0 → "sin stock"'
)

// Sin dato en stockByProductId (fallback)
assertEqual(
  getStockTextForListProduct(
    { id: 99, stock_quantity: undefined, stock_status: 'instock' },
    {}
  ),
  'consultar stock',
  'sin entrada en mapa + instock → "consultar stock"'
)
assertEqual(
  getStockTextForListProduct(
    { id: 99, stock_quantity: undefined, stock_status: 'outofstock' },
    {}
  ),
  'sin stock',
  'sin entrada en mapa + outofstock → "sin stock"'
)

// NaN / no numérico: no debe mostrar "NaN unidades"
assertEqual(
  getStockTextForListProduct(
    { id: 1, stock_quantity: 'N/A', stock_status: 'instock' },
    {}
  ),
  'consultar stock',
  'stock_quantity "N/A" (NaN) + instock → "consultar stock"'
)
assertEqual(
  getStockTextForListProduct(
    { id: 1, stock_quantity: 'abc', stock_status: 'outofstock' },
    {}
  ),
  'sin stock',
  'stock_quantity "abc" (NaN) + outofstock → "sin stock"'
)

// ========== enrichStockForListProducts (sin llamar API) ==========

console.log('\n=== enrichStockForListProducts (casos sin API) ===\n')

// Lista vacía
const emptyResult = await enrichStockForListProducts([])
assertDeepEqual(emptyResult, {}, 'lista vacía → {}')

// null / undefined
const nullResult = await enrichStockForListProducts(null)
assertDeepEqual(nullResult, {}, 'null → {}')
const undefResult = await enrichStockForListProducts(undefined)
assertDeepEqual(undefResult, {}, 'undefined → {}')

// Todos con stock_quantity: no se enriquece, no se llama API
const allWithStock = [
  { id: 1, stock_quantity: 10, name: 'A' },
  { id: 2, stock_quantity: 0, name: 'B' }
]
const noEnrichResult = await enrichStockForListProducts(allWithStock)
assertDeepEqual(noEnrichResult, {}, 'todos con stock_quantity → {} (no llamada API)')

// Productos sin id válido (filtrados)
const noIds = [{ id: null, stock_quantity: undefined }, { id: undefined, stock_quantity: null }]
const noIdsResult = await enrichStockForListProducts(noIds)
assertDeepEqual(noIdsResult, {}, 'productos sin id → {}')

// ========== Resumen ==========

console.log('\n=== Resumen ===')
console.log(`  Aprobados: ${passed}`)
console.log(`  Fallidos:  ${failed}`)
process.exit(failed > 0 ? 1 : 0)
