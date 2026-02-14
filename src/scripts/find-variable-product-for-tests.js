/**
 * Consulta la API de WooCommerce y devuelve 1 producto variable adecuado para pruebas (variantes y atributos).
 * Uso: node src/scripts/find-variable-product-for-tests.js
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '../../.env') })

const WC_URL = process.env.WC_URL || 'https://imblasco.cl'
const WC_KEY = process.env.WC_KEY
const WC_SECRET = process.env.WC_SECRET

async function wcGet(endpoint) {
  const auth = Buffer.from(`${WC_KEY}:${WC_SECRET}`).toString('base64')
  const url = `${WC_URL}/wp-json/wc/v3/${endpoint}`
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' }
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`)
  return res.json()
}

async function main() {
  if (!WC_KEY || !WC_SECRET) {
    console.error('❌ WC_KEY o WC_SECRET no configuradas en .env')
    process.exit(1)
  }

  console.log('Consultando WooCommerce para un producto variable...\n')
  const auth = Buffer.from(`${WC_KEY}:${WC_SECRET}`).toString('base64')
  const res = await fetch(
    `${WC_URL}/wp-json/wc/v3/products?type=variable&per_page=20&page=1&status=publish`,
    {
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    }
  )
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`)
  const variableProducts = await res.json()

  if (variableProducts.length === 0) {
    console.log('No hay productos variables en el catálogo.')
    process.exit(0)
  }

  // Buscar uno con variaciones realmente cargadas (y preferiblemente con nombre/SKU claro)
  for (const p of variableProducts.slice(0, 15)) {
    const variations = await wcGet(`products/${p.id}/variations?per_page=10`)
    if (variations && variations.length >= 1) {
      const attrs = (p.attributes || []).map(a => a.name || a.slug || '').filter(Boolean)
      console.log('--- Producto recomendado para pruebas (variantes y atributos) ---')
      console.log('Nombre:', p.name)
      console.log('SKU:', p.sku || '(sin SKU)')
      console.log('ID:', p.id)
      console.log('Tipo:', p.type)
      console.log('Variaciones:', variations.length)
      console.log('Atributos:', attrs.length ? attrs.join(', ') : '(ninguno)')
      if (variations[0].attributes && variations[0].attributes.length) {
        console.log('Ej. variante:', variations[0].attributes.map(a => `${a.name}: ${a.option}`).join(', '), '| SKU:', variations[0].sku || 'N/A')
      }
      console.log('\nPuedes probar con:')
      console.log('  - "' + (p.name || p.sku || p.id) + '"')
      if (p.sku) console.log('  - SKU: ' + p.sku)
      const attrHint = attrs[0] ? `"¿Qué ${attrs[0]} tiene?"` : '"¿Qué variantes tiene?"'
      console.log('  - Luego: ' + attrHint + ' / "¿Cuántas unidades trae?"')
      process.exit(0)
    }
  }

  console.log('Hay productos variables pero sin variaciones cargadas. Primer variable encontrado:')
  const p = variableProducts[0]
  console.log('Nombre:', p.name, '| SKU:', p.sku || 'N/A', '| ID:', p.id)
  process.exit(0)
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
