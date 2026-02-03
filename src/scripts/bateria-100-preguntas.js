/**
 * Batería de 100 preguntas contra el backend (POST /api/chat/message)
 * Objetivo: detectar tipos de preguntas que responden mal tras las mejoras.
 * Incluye: productos reales, variantes, SKU, preguntas a medias, muy detalladas, información de empresa, ambiguas.
 * Uso: node src/scripts/bateria-100-preguntas.js
 * Requiere: backend corriendo en http://localhost:3001
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
const USER_ID = `bateria-100-${Date.now()}`
const REQUEST_TIMEOUT_MS = 95000
const DELAY_BETWEEN_MS = Number(process.env.BATERIA_DELAY_MS) || 200

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
    return { ok: false, botMessage: '', error: err.message || String(err) }
  }
}

/**
 * Construir lista de 100 preguntas variadas usando productos reales + fijas (empresa, ambiguas, edge).
 */
function buildQuestions(products) {
  const questions = []
  const withSku = products.filter(p => p.sku && String(p.sku).trim().length > 0)
  const withName = products.filter(p => p.name && p.name.length > 2)
  const take = (arr, n) => arr.slice(0, Math.min(n, arr.length))

  let idx = 0

  // --- SKU explícito (10)
  take(withSku, 10).forEach(p => {
    questions.push({ category: 'SKU_EXPLICITO', message: `¿Tienen SKU: ${p.sku}?`, sku: p.sku, name: p.name })
    idx++
  })
  if (questions.length < 10 && withSku.length >= 2) {
    withSku.slice(0, 5).forEach(p => {
      if (questions.filter(q => q.sku === p.sku).length === 0) {
        questions.push({ category: 'SKU_EXPLICITO', message: `tienen ${p.sku}?`, sku: p.sku, name: p.name })
        idx++
      }
    })
  }

  // --- Por nombre completo (15)
  take(withName, 15).forEach(p => {
    const name = (p.name || '').trim()
    if (name.length < 3) return
    questions.push({ category: 'NOMBRE_COMPLETO', message: `¿Tienen "${name}"?`, name })
  })

  // --- Por nombre parcial / a medias (15)
  const partialTemplates = [
    name => `Precio y stock de ${name}`,
    name => `¿Hay stock de ${name}?`,
    name => `¿Cuánto cuesta ${name}?`,
    name => `tienen ${name}?`,
    name => `el precio del ${name}`,
    name => `stock de ${name}`,
    name => `necesito ${name}`,
    name => `busco ${name}`,
    name => `¿Qué características tiene ${name}?`,
    name => `¿Tienen ${name} disponible?`
  ]
  take(withName, 15).forEach((p, i) => {
    const name = (p.name || '').trim().split(/\s+/).slice(0, 3).join(' ')
    if (!name) return
    const template = partialTemplates[i % partialTemplates.length]
    questions.push({ category: 'NOMBRE_PARCIAL', message: template(name), name: p.name })
  })

  // --- Variantes (10)
  take(withName, 10).forEach((p, i) => {
    const name = (p.name || '').trim()
    if (!name) return
    const variantQs = [
      `¿En qué colores está ${name}?`,
      `¿Qué tallas tiene ${name}?`,
      `¿Qué variantes tiene ${name}?`,
      `¿El ${name} viene en otros colores?`,
      `¿Tienen ${name} en tamaño grande?`,
      `colores del ${name}`,
      `variantes de ${name}`,
      `¿El ${name} está en color blanco?`,
      `tallas del ${name}`,
      `¿Qué modelos hay de ${name}?`
    ]
    questions.push({ category: 'VARIANTES', message: variantQs[i % variantQs.length], name })
  })

  // --- Muy detalladas (10)
  take(withName, 5).forEach(p => {
    const name = (p.name || '').trim()
    const sku = p.sku || 'N/A'
    questions.push({
      category: 'DETALLADA',
      message: `Necesito saber si tienen el producto ${name}, SKU ${sku}, y a qué precio está y si hay stock.`,
      name
    })
  })
  take(withName, 5).forEach(p => {
    const name = (p.name || '').trim()
    questions.push({
      category: 'DETALLADA',
      message: `Buenos días, quisiera cotizar el siguiente ítem: ${name}. ¿Podrían indicarme precio, stock y condiciones?`,
      name
    })
  })

  // --- Información de empresa (15)
  const infoEmpresa = [
    '¿Dónde están ubicados?',
    '¿A qué hora abren?',
    'a que hora abren?',
    '¿Cuál es su dirección?',
    '¿Horarios de atención?',
    '¿Hacen envíos a regiones?',
    '¿Cómo los contacto?',
    '¿Teléfono de ventas?',
    '¿Email de contacto?',
    '¿Cuáles son sus horarios?',
    '¿Atienden en la hora de almuerzo?',
    '¿Despachan a regiones?',
    '¿Qué garantía tienen los productos?',
    '¿Cómo realizo un pedido?',
    '¿Dónde está la empresa?'
  ]
  infoEmpresa.forEach(msg => {
    questions.push({ category: 'INFO_EMPRESA', message: msg })
  })

  // --- Ambiguas / genéricas (15)
  const ambiguas = [
    'hola',
    'buenos días',
    '¿Tienen productos?',
    'necesito saber si tienen un producto',
    'hola tienen productos?',
    '¿Qué venden?',
    'ayuda',
    'quisiera información',
    '¿Me pueden ayudar?',
    'hola!!',
    'buenas tardes',
    'necesito algo',
    'tienen algo de regalo?',
    '¿Tienen catálogo?',
    '¿Qué artículos tienen?'
  ]
  ambiguas.forEach(msg => {
    questions.push({ category: 'AMBIGUA', message: msg })
  })

  // --- Edge: mezcladas, typos, cortas (10)
  const edge = [
    'L70',
    'B11-1',
    '¿tienen llaveros?',
    'llaveros',
    'atomizadores de mano',
    'boligrafo',
    'mochila',
    '¿dónde están y tienen el L70?',
    'horario y precio del K62',
    '?????????'
  ]
  edge.forEach(msg => {
    questions.push({ category: 'EDGE', message: msg })
  })

  // Asegurar 100: rellenar con más productos si hace falta
  while (questions.length < 100 && withName.length > 0) {
    const p = withName[questions.length % withName.length]
    const name = (p.name || '').trim()
    if (name) {
      questions.push({ category: 'EXTRA', message: `¿Tienen ${name}?`, name })
    } else break
  }

  return questions.slice(0, 100)
}

function getReportPath() {
  const reportsDir = join(__dirname, '..', '..', 'reports')
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return join(reportsDir, `bateria-100-preguntas-${stamp}.jsonl`)
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  BATERÍA DE 100 PREGUNTAS – Backend local (tras mejoras)')
  console.log('═══════════════════════════════════════════════════════════')
  console.log(`  URL: ${MESSAGE_URL}`)
  console.log(`  userId: ${USER_ID}`)
  console.log('═══════════════════════════════════════════════════════════\n')

  console.log('🔍 Cargando productos reales desde WooCommerce...')
  let products = []
  try {
    products = await wordpressService.getProductsSample(100)
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
  console.log(`📋 Total preguntas a enviar: ${questions.length}\n`)

  const reportPath = getReportPath()
  const logStream = fs.createWriteStream(reportPath, { flags: 'w' })

  const byCategory = {}
  let errors = 0
  let suspicious = []

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    const cat = q.category || 'OTRO'
    if (!byCategory[cat]) byCategory[cat] = { total: 0, ok: 0, error: 0 }

    process.stdout.write(`[${i + 1}/${questions.length}] ${cat}: "${(q.message || '').slice(0, 50)}${q.message && q.message.length > 50 ? '...' : ''}" → `)

    const result = await sendMessage(q.message)
    const reply = result.botMessage || ''
    const isError = !result.ok || result.error

    if (isError) {
      byCategory[cat].error += 1
      errors += 1
      console.log(`❌ ${result.error || result.status || 'Error'}`)
    } else {
      byCategory[cat].ok += 1
      const preview = reply.slice(0, 80).replace(/\n/g, ' ')
      console.log(`${preview}${reply.length > 80 ? '...' : ''}`)
    }
    byCategory[cat].total += 1

    // Sospechoso: INFO_EMPRESA que responda "no encontramos productos"
    if (cat === 'INFO_EMPRESA' && reply.toLowerCase().includes('no encontramos productos')) {
      suspicious.push({ category: cat, message: q.message, reply: reply.slice(0, 200) })
    }
    // Sospechoso: SKU/NOMBRE que pida "nombre completo o SKU" cuando ya dimos SKU
    if ((cat === 'SKU_EXPLICITO' || cat === 'NOMBRE_COMPLETO') && reply.toLowerCase().includes('necesito el nombre completo') && (q.sku || q.name)) {
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
  Object.entries(byCategory).forEach(([cat, s]) => {
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
