/**
 * Batería de 50 preguntas aleatorias con productos reales y múltiples casos.
 * Cubre: saludos, SKU, nombre, variantes, info empresa, ambiguas, fallback, gibberish,
 * contexto/cambio de producto, "busco X", mixtas, edge (L70, B11-1, typos).
 * Uso: node src/scripts/bateria-50-random.js
 * Requiere: backend en http://localhost:3001
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'
import * as wordpressService from '../services/wordpress.service.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '../../.env') })

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001'
const MESSAGE_URL = `${BASE_URL}/api/chat/message`
const USER_ID = `bateria-50-${Date.now()}`
const REQUEST_TIMEOUT_MS = 95000
const DELAY_BETWEEN_MS = Number(process.env.BATERIA_DELAY_MS) || 250
const TOTAL = 50

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
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
    return { ok: false, botMessage: '', error: err.message || String(err) }
  }
}

/**
 * Construye exactamente 50 preguntas variadas con productos reales y múltiples casos.
 */
function buildQuestions(products) {
  const questions = []
  const withSku = products.filter(p => p.sku && String(p.sku).trim().length > 0)
  const withName = products.filter(p => p.name && p.name.length > 2)
  const take = (arr, n) => arr.slice(0, Math.min(n, arr.length))
  const pick = arr => arr[Math.floor(Math.random() * arr.length)]

  // --- SALUDO (3)
  const saludos = ['hola', 'buenos días', 'buenas tardes', 'hola!!', 'hey']
  for (let i = 0; i < 3; i++) {
    questions.push({ category: 'SALUDO', message: pick(saludos) })
  }

  // --- SKU explícito (5)
  take(withSku, 8).forEach((p, i) => {
    if (i >= 5) return
    const msgs = [`¿Tienen ${p.sku}?`, `tienen ${p.sku}`, `precio del ${p.sku}`, `stock de ${p.sku}`, `¿Hay ${p.sku}?`]
    questions.push({ category: 'SKU', message: msgs[i % msgs.length], sku: p.sku, name: p.name })
  })

  // --- Nombre completo / parcial (6)
  take(withName, 8).forEach((p, i) => {
    if (i >= 6) return
    const name = (p.name || '').trim()
    const short = name.split(/\s+/).slice(0, 3).join(' ')
    const msgs = [
      `¿Tienen "${name}"?`,
      `Precio y stock de ${short}`,
      `¿Hay stock de ${short}?`,
      `busco ${short}`,
      `¿Cuánto cuesta ${short}?`,
      `tienen ${short}?`
    ]
    questions.push({ category: 'NOMBRE', message: msgs[i % msgs.length], name: p.name })
  })

  // --- VARIANTES – colores / tallas con productos reales (6)
  take(withName, 8).forEach((p, i) => {
    if (i >= 6) return
    const name = (p.name || '').trim()
    const short = name.split(/\s+/).slice(0, 2).join(' ')
    const variantMsgs = [
      `¿En qué colores está ${short}?`,
      `¿Qué tallas tiene ${short}?`,
      `colores del ${short}`,
      `¿El ${short} viene en otros colores?`,
      `¿Tienen ${short} en tamaño grande?`,
      `¿El ${short} está en color blanco?`
    ]
    questions.push({ category: 'VARIANTES', message: variantMsgs[i % variantMsgs.length], name: p.name })
  })

  // --- INFO EMPRESA (5)
  const infoEmpresa = [
    '¿Dónde están ubicados?',
    '¿A qué hora abren?',
    '¿Cuál es su dirección?',
    '¿Hacen envíos a regiones?',
    '¿Cómo los contacto?'
  ]
  infoEmpresa.forEach(msg => questions.push({ category: 'INFO_EMPRESA', message: msg }))

  // --- AMBIGUA / genérica (5)
  const ambiguas = [
    '¿Qué venden?',
    'ayuda',
    'necesito algo',
    '¿Tienen catálogo?',
    '¿Me pueden ayudar?'
  ]
  ambiguas.forEach(msg => questions.push({ category: 'AMBIGUA', message: msg }))

  // --- FALLBACK – reserva, descuento, futuro (3)
  const fallback = [
    '¿Puedo reservar un producto?',
    '¿Tienen descuentos por cantidad?',
    '¿Cuándo reponen stock?'
  ]
  fallback.forEach(msg => questions.push({ category: 'FALLBACK', message: msg }))

  // --- GIBBERISH (2)
  questions.push({ category: 'GIBBERISH', message: 'asdf qwerty zxc' })
  questions.push({ category: 'GIBBERISH', message: 'xyz 123 abc' })

  // --- Contexto / cambio de producto – término claro que no es del contexto (3)
  const contextoCambio = ['taza', 'busco gorros', 'quiero llaveros']
  contextoCambio.forEach(msg => questions.push({ category: 'CONTEXTO_CAMBIO', message: msg }))

  // --- BUSCO + término (2)
  questions.push({ category: 'BUSCO_TERMINO', message: 'busco mochila' })
  questions.push({ category: 'BUSCO_TERMINO', message: 'necesito bolígrafo' })

  // --- MIXTO – info empresa + producto (2)
  if (withSku.length > 0) {
    const p = pick(withSku)
    questions.push({ category: 'MIXTO', message: `¿Dónde están y tienen el ${p.sku}?`, sku: p.sku })
  }
  questions.push({ category: 'MIXTO', message: 'horario y precio del K62' })

  // --- EDGE – códigos, typos, términos cortos (4)
  const edge = [
    'L70',
    'B11-1',
    '¿tienen llaveros?',
    'atomizadores'
  ]
  edge.forEach(msg => questions.push({ category: 'EDGE', message: msg }))

  // --- DETALLADA (2)
  if (withName.length >= 2) {
    const [p1, p2] = [pick(withName), pick(withName)]
    const name = (p1.name || '').trim()
    questions.push({
      category: 'DETALLADA',
      message: `Necesito saber si tienen ${name}, precio y stock.`,
      name: p1.name
    })
    questions.push({
      category: 'DETALLADA',
      message: `Buenos días, quisiera cotizar: ${(p2.name || '').trim()}. ¿Precio y condiciones?`,
      name: p2.name
    })
  } else {
    questions.push({ category: 'DETALLADA', message: 'Necesito saber si tienen un producto, precio y stock.' })
    questions.push({ category: 'DETALLADA', message: 'Buenos días, quisiera cotizar un ítem. ¿Precio y condiciones?' })
  }

  // Ajustar a 50 exactas: si sobran, quitar de EXTRA; si faltan, rellenar con producto
  while (questions.length < TOTAL && withName.length > 0) {
    const p = pick(withName)
    const name = (p.name || '').trim().split(/\s+/).slice(0, 2).join(' ')
    questions.push({ category: 'EXTRA', message: `¿Tienen ${name}?`, name: p.name })
  }

  return shuffle(questions.slice(0, TOTAL))
}

function getReportPath() {
  const reportsDir = join(__dirname, '..', '..', 'reports')
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return join(reportsDir, `bateria-50-random-${stamp}.jsonl`)
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  BATERÍA 50 PREGUNTAS ALEATORIAS – Múltiples casos')
  console.log('═══════════════════════════════════════════════════════════')
  console.log(`  URL: ${MESSAGE_URL}`)
  console.log(`  userId: ${USER_ID}`)
  console.log('═══════════════════════════════════════════════════════════\n')

  console.log('🔍 Cargando productos reales desde WooCommerce...')
  let products = []
  try {
    products = await wordpressService.getProductsSample(80)
  } catch (err) {
    console.error('❌ Error cargando productos:', err.message)
    process.exit(1)
  }
  if (!products || products.length === 0) {
    console.error('❌ No se obtuvieron productos')
    process.exit(1)
  }
  console.log(`✅ ${products.length} productos cargados\n`)

  const questions = buildQuestions(products)
  console.log(`📋 ${questions.length} preguntas (orden aleatorio)\n`)

  const reportPath = getReportPath()
  const logStream = fs.createWriteStream(reportPath, { flags: 'w' })

  const byCategory = {}
  let errors = 0
  const suspicious = []

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    const cat = q.category || 'OTRO'
    if (!byCategory[cat]) byCategory[cat] = { total: 0, ok: 0, error: 0 }

    const msgPreview = (q.message || '').slice(0, 55)
    process.stdout.write(`[${i + 1}/${questions.length}] ${cat}: "${msgPreview}${q.message && q.message.length > 55 ? '...' : ''}" → `)

    const result = await sendMessage(q.message)
    const reply = result.botMessage || ''
    const isError = !result.ok || result.error

    if (isError) {
      byCategory[cat].error += 1
      errors += 1
      console.log(`❌ ${result.error || result.status || 'Error'}`)
    } else {
      byCategory[cat].ok += 1
      const preview = reply.slice(0, 75).replace(/\n/g, ' ')
      console.log(`${preview}${reply.length > 75 ? '...' : ''}`)
    }
    byCategory[cat].total += 1

    if (cat === 'INFO_EMPRESA' && reply.toLowerCase().includes('no encontramos productos')) {
      suspicious.push({ category: cat, message: q.message, reply: reply.slice(0, 200) })
    }
    if ((cat === 'SKU' || cat === 'NOMBRE') && reply.toLowerCase().includes('necesito el nombre completo') && (q.sku || q.name)) {
      suspicious.push({ category: cat, message: q.message, reply: reply.slice(0, 200) })
    }
    if (reply.includes('hubo un error al procesar')) {
      suspicious.push({ category: cat, message: q.message, reply: reply.slice(0, 200) })
    }

    const record = {
      i: i + 1,
      category: cat,
      message: q.message,
      reply,
      ok: !isError,
      error: result.error || null
    }
    logStream.write(`${JSON.stringify(record)}\n`)

    await sleep(DELAY_BETWEEN_MS)
  }

  logStream.end()

  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('  RESUMEN POR CATEGORÍA')
  console.log('═══════════════════════════════════════════════════════════')
  Object.entries(byCategory).sort((a, b) => a[0].localeCompare(b[0])).forEach(([cat, s]) => {
    console.log(`  ${cat}: ${s.ok}/${s.total} OK, ${s.error} errores`)
  })
  console.log(`  Total errores: ${errors}`)
  console.log('═══════════════════════════════════════════════════════════\n')

  if (suspicious.length > 0) {
    console.log('⚠️  POSIBLES FALLOS (revisar):')
    suspicious.forEach((s, i) => {
      console.log(`  ${i + 1}. [${s.category}] "${s.message}"`)
      console.log(`     → ${s.reply}`)
    })
    console.log('')
  }

  console.log(`📁 Log guardado: ${reportPath}`)
}

main().catch(err => {
  console.error('❌ Error:', err)
  process.exit(1)
})
