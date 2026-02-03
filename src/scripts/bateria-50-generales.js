/**
 * Batería de 50 consultas generales para verificar que el sistema sigue funcionando
 * tras las fortificaciones (genéricos, saludos, gibberish, etc.).
 * Incluye: productos, SKU, info empresa, saludos, genéricos, variantes, búsquedas cortas.
 * Uso: node src/scripts/bateria-50-generales.js
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '../../.env') })

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001'
const MESSAGE_URL = `${BASE_URL}/api/chat/message`
const USER_ID = `bateria-50-generales-${Date.now()}`
const REQUEST_TIMEOUT_MS = 95000
const DELAY_BETWEEN_MS = Number(process.env.BATERIA_DELAY_MS) || 250

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function sendMessage(message) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(MESSAGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: USER_ID, message }),
      signal: controller.signal
    })
    const data = await res.json()
    clearTimeout(timeoutId)
    return {
      ok: res.ok,
      status: res.status,
      botMessage: data?.botMessage ?? data?.message ?? '',
      success: data?.success,
      error: data?.error
    }
  } catch (err) {
    clearTimeout(timeoutId)
    const msg = err.message || String(err)
    const hint = (msg === 'fetch failed' || err.cause?.code === 'ECONNREFUSED')
      ? ` (¿backend en ${BASE_URL}?)`
      : ''
    return { ok: false, botMessage: '', error: msg + hint }
  }
}

async function checkBackend() {
  try {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 5000)
    await fetch(BASE_URL, { method: 'GET', signal: controller.signal })
    return true
  } catch (err) {
    console.error(`\n❌ No se pudo conectar al backend en ${BASE_URL}\n`)
    return false
  }
}

function get50Consultas() {
  return [
    { cat: 'SALUDO', msg: 'hola' },
    { cat: 'SALUDO', msg: 'buenos días' },
    { cat: 'GENÉRICO', msg: 'ayuda' },
    { cat: 'GENÉRICO', msg: '¿Qué venden?' },
    { cat: 'INFO_EMPRESA', msg: '¿Dónde están ubicados?' },
    { cat: 'INFO_EMPRESA', msg: '¿A qué hora abren?' },
    { cat: 'INFO_EMPRESA', msg: '¿Horarios de atención?' },
    { cat: 'SKU', msg: '¿Tienen SKU B11-1?' },
    { cat: 'SKU', msg: 'tienen T13?' },
    { cat: 'SKU', msg: 'SKU: 591074100' },
    { cat: 'PRODUCTO', msg: 'llaveros' },
    { cat: 'PRODUCTO', msg: '¿tienen toallas faciales?' },
    { cat: 'PRODUCTO', msg: 'busco gorros' },
    { cat: 'PRODUCTO', msg: 'precio de mochila' },
    { cat: 'PRODUCTO', msg: 'L70' },
    { cat: 'PRODUCTO', msg: 'K62' },
    { cat: 'PRODUCTO', msg: '¿Tienen "Toalla Facial Microfibra T14"?' },
    { cat: 'PRODUCTO', msg: 'stock de Copa CRI 10A' },
    { cat: 'VARIANTES', msg: '¿Qué colores tiene el Gorro Jockey GR20?' },
    { cat: 'VARIANTES', msg: 'colores del B11-1' },
    { cat: 'INFO_EMPRESA', msg: '¿Despachan a regiones?' },
    { cat: 'INFO_EMPRESA', msg: '¿Cómo los contacto?' },
    { cat: 'GENÉRICO', msg: 'necesito algo' },
    { cat: 'GENÉRICO', msg: '¿Tienen productos?' },
    { cat: 'GIBBERISH', msg: '???' },
    { cat: 'PRODUCTO', msg: 'atomizadores' },
    { cat: 'PRODUCTO', msg: 'medallas acrílicas' },
    { cat: 'PRODUCTO', msg: 'posavasos' },
    { cat: 'SKU', msg: '591086278' },
    { cat: 'PRODUCTO', msg: '¿Cuánto cuesta la Copa DAN 7?' },
    { cat: 'INFO_EMPRESA', msg: '¿Tienen catálogo?' },
    { cat: 'PRODUCTO', msg: 'mochila porta notebook' },
    { cat: 'PRODUCTO', msg: 'taza' },
    { cat: 'SALUDO', msg: 'buenas tardes' },
    { cat: 'PRODUCTO', msg: '¿Hay stock de Llavero Acrílico NI50?' },
    { cat: 'PRODUCTO', msg: 'bolígrafo' },
    { cat: 'PRODUCTO', msg: 'gorro jockey' },
    { cat: 'INFO_EMPRESA', msg: 'email de contacto' },
    { cat: 'PRODUCTO', msg: '¿Tienen "Llavero Destapador Encobrizado K62"?' },
    { cat: 'GENÉRICO', msg: '¿Me pueden ayudar?' },
    { cat: 'PRODUCTO', msg: 'bandeja' },
    { cat: 'PRODUCTO', msg: 'cojin sublimable' },
    { cat: 'SKU', msg: 'GR10' },
    { cat: 'PRODUCTO', msg: 'precio y stock de toalla microfibra' },
    { cat: 'INFO_EMPRESA', msg: 'dirección' },
    { cat: 'PRODUCTO', msg: 'tienen vasos?' },
    { cat: 'PRODUCTO', msg: 'Dispensador spray' },
    { cat: 'PRODUCTO', msg: '¿Qué características tiene el Posavaso PO10?' },
    { cat: 'SALUDO', msg: 'hola!' },
    { cat: 'GENÉRICO', msg: 'info' }
  ]
}

function getReportPath() {
  const reportsDir = join(__dirname, '..', '..', 'reports')
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return join(reportsDir, `bateria-50-generales-${stamp}.jsonl`)
}

async function main() {
  const questions = get50Consultas()
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  BATERÍA 50 CONSULTAS GENERALES – Verificar que nada se rompió')
  console.log('═══════════════════════════════════════════════════════════')
  console.log(`  URL: ${MESSAGE_URL}`)
  console.log(`  userId: ${USER_ID}`)
  console.log(`  Total: ${questions.length} consultas`)
  console.log('═══════════════════════════════════════════════════════════\n')

  if (!(await checkBackend())) {
    process.exit(1)
  }
  console.log('✅ Backend alcanzable.\n')

  const reportPath = getReportPath()
  const logStream = fs.createWriteStream(reportPath, { flags: 'w' })
  const byCat = {}
  let errors = 0

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    if (!byCat[q.cat]) byCat[q.cat] = { total: 0, ok: 0, error: 0 }

    process.stdout.write(`[${i + 1}/${questions.length}] ${q.cat}: "${(q.msg || '').slice(0, 40)}${q.msg && q.msg.length > 40 ? '...' : ''}" → `)

    const result = await sendMessage(q.msg)
    const reply = result.botMessage || ''
    const isError = !result.ok || result.error

    if (isError) {
      byCat[q.cat].error++
      errors++
      console.log(`❌ ${(result.error || result.status || 'Error').slice(0, 50)}`)
    } else {
      byCat[q.cat].ok++
      const preview = reply.slice(0, 55).replace(/\n/g, ' ')
      console.log(`${preview}${reply.length > 55 ? '...' : ''}`)
    }
    byCat[q.cat].total++

    logStream.write(JSON.stringify({ i: i + 1, cat: q.cat, msg: q.msg, reply, ok: !isError, error: result.error || null }) + '\n')
    await sleep(DELAY_BETWEEN_MS)
  }

  logStream.end()

  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('  RESUMEN POR CATEGORÍA')
  console.log('═══════════════════════════════════════════════════════════')
  Object.entries(byCat).forEach(([c, s]) => {
    console.log(`  ${c}: ${s.ok}/${s.total} OK, ${s.error} errores`)
  })
  console.log(`  Total errores HTTP/red: ${errors}`)
  console.log('═══════════════════════════════════════════════════════════\n')
  console.log(`📁 Reporte: ${reportPath}`)
}

main().catch(err => {
  console.error('❌ Error:', err)
  process.exit(1)
})
