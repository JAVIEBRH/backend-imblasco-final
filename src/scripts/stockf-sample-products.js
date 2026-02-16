/**
 * Script de prueba: lista productos con próxima llegada y con características (solo lectura).
 * Ejecutar: node src/scripts/stockf-sample-products.js
 * Requiere .env con MONGO_URI_STOCKF_READ
 */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const { getStockfConnectionReady } = await import('../config/stockf-database.js')
const conn = await getStockfConnectionReady()
if (!conn) {
  console.log('MONGO_URI_STOCKF_READ no definida o conexión falló.')
  process.exit(1)
}
const col = conn.db.collection('productos')
const limit = 10

const comingSoon = await col
  .find({ 'coming_soon.activo': true, 'flags.visible': { $ne: false } })
  .project({ titulo: 1, sku: 1, mysql_id: 1, coming_soon: 1 })
  .limit(limit)
  .toArray()

const withCaracteristicas = await col
  .find({ caracteristicas: { $exists: true, $ne: null }, 'flags.visible': { $ne: false } })
  .project({ titulo: 1, sku: 1, mysql_id: 1, caracteristicas: 1 })
  .limit(limit)
  .toArray()

console.log('=== PRÓXIMA LLEGADA (coming_soon.activo = true) ===\n')
comingSoon.forEach((p, i) => {
  console.log(`${i + 1}. ${p.titulo || '(sin título)'}`)
  console.log(`   SKU: ${p.sku ?? 'N/A'} | mysql_id: ${p.mysql_id ?? 'N/A'}`)
  console.log(`   coming_soon: ${JSON.stringify(p.coming_soon)}`)
  console.log(`   Pregunta para el chat: "¿Tienen ${(p.titulo || p.sku || '').toString().trim() || p.mysql_id}?"\n`)
})

console.log('\n=== CON CARACTERÍSTICAS (enriquecimiento) ===\n')
withCaracteristicas.forEach((p, i) => {
  const keys = p.caracteristicas ? Object.keys(p.caracteristicas) : []
  console.log(`${i + 1}. ${p.titulo || '(sin título)'}`)
  console.log(`   SKU: ${p.sku ?? 'N/A'} | mysql_id: ${p.mysql_id ?? 'N/A'}`)
  console.log(`   Características: ${keys.length ? keys.join(', ') : 'ninguna'}`)
  console.log(`   Pregunta para el chat: "¿Info del ${(p.titulo || p.sku || '').toString().trim() || p.mysql_id}?"\n`)
})

process.exit(0)
