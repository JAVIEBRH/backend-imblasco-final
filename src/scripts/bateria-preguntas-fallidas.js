/**
 * Batería de preguntas que FALLARON en el test anterior (100 preguntas).
 * Objetivo: validar que la fortificación del sistema corrige esos casos.
 * Uso: node src/scripts/bateria-preguntas-fallidas.js
 * Requiere: backend corriendo en http://localhost:3001
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
const USER_ID = `bateria-fallidas-${Date.now()}`
const REQUEST_TIMEOUT_MS = 95000
const DELAY_BETWEEN_MS = Number(process.env.BATERIA_DELAY_MS) || 300

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
      ? ` (¿backend corriendo en ${BASE_URL}?)`
      : ''
    return { ok: false, botMessage: '', error: msg + hint }
  }
}

/**
 * Lista fija de preguntas que fallaron o fueron problemáticas en el test anterior.
 * Categorías según el análisis post-test.
 */
function getPreguntasFallidas() {
  return [
    // --- Saludos (respondían con lista de productos en vez de saludo)
    { category: 'SALUDO', message: 'buenos días', esperado: 'saludo genérico, no productos' },
    { category: 'SALUDO', message: 'buenas tardes', esperado: 'saludo genérico, no productos' },
    { category: 'SALUDO', message: 'hola', esperado: 'saludo genérico, no productos' },
    { category: 'SALUDO', message: 'hola!!', esperado: 'saludo genérico, no productos' },
    // --- Genéricos de ayuda (respondían con producto del contexto en vez de "¿en qué te ayudo?")
    { category: 'GENERICO_AYUDA', message: 'ayuda', esperado: 'respuesta genérica de ayuda, no datos de producto' },
    { category: 'GENERICO_AYUDA', message: '¿Me pueden ayudar?', esperado: 'respuesta genérica de ayuda, no datos de producto' },
    { category: 'GENERICO_AYUDA', message: 'necesito algo', esperado: 'respuesta genérica, no producto del contexto' },
    { category: 'GENERICO_AYUDA', message: '¿Tienen productos?', esperado: 'respuesta genérica tipo "sí, ¿qué buscas?", no un producto concreto' },
    { category: 'GENERICO_AYUDA', message: '¿Qué venden?', esperado: 'respuesta genérica o catálogo, no producto del contexto' },
    { category: 'GENERICO_AYUDA', message: '¿Qué artículos tienen?', esperado: 'respuesta genérica o catálogo, no producto del contexto' },
    // --- Pregunta mixta (ubicación + producto: solo daba productos, no dirección)
    { category: 'MIXTA_UBICACION_PRODUCTO', message: '¿dónde están y tienen el L70?', esperado: 'dirección/ubicación Y productos L70' },
    // --- Gibberish (respondía con producto del contexto)
    { category: 'GIBBERISH', message: '?????????', esperado: '"no entendí" o similar, no datos de producto' },
    // --- VARIANTES que devolvían "error al procesar"
    { category: 'VARIANTES_ERROR', message: '¿En qué colores está Gorro Jockey Poliéster Esponja Malla Sublimable GR30?', esperado: 'lista de colores o mensaje claro, no error genérico' },
    { category: 'VARIANTES_ERROR', message: '¿El Toalla Facial Microfibra T14 viene en otros colores?', esperado: 'colores disponibles o mensaje claro, no error genérico' },
    // --- Valor en nombre (respondía "no está en color blanco" cuando el producto se llama "...Blanco...")
    { category: 'VALOR_EN_NOMBRE', message: '¿El Medalla Acrílico Sublimable Blanco MD 151 está en color blanco?', esperado: 'SÍ está disponible en blanco (nombre lo indica)' },
    // --- Nombre completo sin match (no encontraba por nombre pero sí por SKU)
    { category: 'NOMBRE_SIN_MATCH', message: '¿Tienen "Medalla Acrílico Transparente MD 150"?', esperado: 'encontrar producto (SKU 591074100) o mensaje claro' }
  ]
}

function getReportPath() {
  const reportsDir = join(__dirname, '..', '..', 'reports')
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return join(reportsDir, `bateria-preguntas-fallidas-${stamp}.jsonl`)
}

async function checkBackend() {
  try {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 5000)
    await fetch(BASE_URL, { method: 'GET', signal: controller.signal })
    return true
  } catch (err) {
    console.error(`\n❌ No se pudo conectar al backend en ${BASE_URL}`)
    console.error(`   Error: ${err.message || err}`)
    console.error('   Asegúrate de tener el backend corriendo (npm run dev) antes de ejecutar esta batería.\n')
    return false
  }
}

async function main() {
  const questions = getPreguntasFallidas()
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  BATERÍA DE PREGUNTAS FALLIDAS – Validar fortificación')
  console.log('═══════════════════════════════════════════════════════════')
  console.log(`  URL: ${MESSAGE_URL}`)
  console.log(`  userId: ${USER_ID}`)
  console.log(`  Total: ${questions.length} preguntas (las que fallaron en test anterior)`)
  console.log('═══════════════════════════════════════════════════════════\n')

  console.log('Comprobando conexión con el backend...')
  if (!(await checkBackend())) {
    process.exit(1)
  }
  console.log('✅ Backend alcanzable.\n')

  const reportPath = getReportPath()
  const logStream = fs.createWriteStream(reportPath, { flags: 'w' })

  const byCategory = {}
  let errors = 0
  const resultados = []

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    const cat = q.category || 'OTRO'
    if (!byCategory[cat]) byCategory[cat] = { total: 0, ok: 0, error: 0 }

    process.stdout.write(`[${i + 1}/${questions.length}] ${cat}: "${(q.message || '').slice(0, 45)}${q.message && q.message.length > 45 ? '...' : ''}" → `)

    const result = await sendMessage(q.message)
    const reply = result.botMessage || ''
    const isError = !result.ok || result.error

    if (isError) {
      byCategory[cat].error += 1
      errors += 1
      console.log(`❌ ${result.error || result.status || 'Error'}`)
    } else {
      byCategory[cat].ok += 1
      const preview = reply.slice(0, 70).replace(/\n/g, ' ')
      console.log(`${preview}${reply.length > 70 ? '...' : ''}`)
    }
    byCategory[cat].total += 1

    resultados.push({
      i: i + 1,
      category: cat,
      message: q.message,
      esperado: q.esperado,
      reply,
      ok: !isError,
      error: result.error || null
    })
    logStream.write(`${JSON.stringify(resultados[resultados.length - 1])}\n`)

    await sleep(DELAY_BETWEEN_MS)
  }

  logStream.end()

  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('  RESUMEN POR CATEGORÍA')
  console.log('═══════════════════════════════════════════════════════════')
  Object.entries(byCategory).forEach(([c, s]) => {
    console.log(`  ${c}: ${s.ok}/${s.total} OK, ${s.error} errores`)
  })
  console.log(`  Total errores HTTP/red: ${errors}`)
  console.log('═══════════════════════════════════════════════════════════\n')

  console.log(`📁 Reporte guardado: ${reportPath}`)
  console.log('\nRevisa manualmente que las respuestas cumplan lo "esperado" en cada categoría.')
}

main().catch(err => {
  console.error('❌ Error:', err)
  process.exit(1)
})
