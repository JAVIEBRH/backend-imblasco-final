/**
 * Test 300 preguntas – Mejoras de búsqueda y contexto
 *
 * - 300 preguntas contra el backend local (POST /api/chat/message).
 * - Productos reales extraídos de WooCommerce.
 * - 15 preguntas por cada una de las 5 mejoras + 225 preguntas generales.
 * - Salida en tiempo real: nº, categoría, pregunta y respuesta (para ver logs del backend en la otra terminal).
 *
 * Uso:
 *   1. En una terminal: npm run dev  (backend con logs en tiempo real)
 *   2. En otra terminal: node src/scripts/test-300-mejoras-busqueda.js
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import axios from 'axios'
import wordpressService from '../services/wordpress.service.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '../../.env') })

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001'
const MESSAGE_URL = `${BASE_URL}/api/chat/message`
const USER_ID = 'test-300-mejoras'
const REQUEST_TIMEOUT_MS = 60000
const DELAY_MS = 400

// Productos reales WC
let products = []
let skus = []
let productTypes = [] // ej. llavero, mochila, bolígrafo (primer palabra del nombre)

function log(msg, color = '') {
  const colors = { green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m', red: '\x1b[31m', cyan: '\x1b[36m', magenta: '\x1b[35m', bright: '\x1b[1m', reset: '\x1b[0m' }
  const c = colors[color] || colors.reset
  console.log(`${c}${msg}${colors.reset}`)
}

async function loadProducts() {
  log('\n📦 Cargando productos reales de WooCommerce...', 'cyan')
  try {
    products = await wordpressService.getAllProducts()
    if (!products || !products.length) {
      log('⚠️ No hay productos en WC. Usando datos de respaldo.', 'yellow')
      products = [{ name: 'Llavero Camion', sku: 'B85' }, { name: 'Bolígrafo Bamboo', sku: 'L39' }, { name: 'Mochila', sku: 'K78' }]
    }
    skus = [...new Set(products.map(p => p.sku).filter(Boolean))].slice(0, 200)
    const words = new Set()
    products.forEach(p => {
      const name = (p.name || '').trim()
      if (name.length > 2) {
        const first = name.split(/\s+/)[0].toLowerCase().replace(/[^a-záéíóúñ]/g, '')
        if (first.length >= 3) words.add(first)
      }
    })
    productTypes = [...words].filter(w => !['el', 'la', 'los', 'las', 'con', 'para', 'por', 'del', 'una', 'uno'].includes(w)).slice(0, 40)
    log(`   Productos: ${products.length}, SKUs: ${skus.length}, Tipos: ${productTypes.length}`, 'green')
    return true
  } catch (e) {
    log(`❌ Error cargando WC: ${e.message}`, 'red')
    return false
  }
}

function pick(arr, n = 1) {
  const out = []
  const copy = [...arr]
  for (let i = 0; i < n && copy.length; i++) {
    const idx = Math.floor(Math.random() * copy.length)
    out.push(copy.splice(idx, 1)[0])
  }
  return n === 1 ? out[0] : out
}

async function sendMessage(message) {
  try {
    const { data } = await axios.post(MESSAGE_URL, { userId: USER_ID, message }, { timeout: REQUEST_TIMEOUT_MS })
    return (data && data.botMessage) || (data && data.message) || '[sin texto]'
  } catch (e) {
    const msg = (e.response && e.response.data && e.response.data.message) || e.message || 'Error'
    return `[ERROR] ${msg}`
  }
}

function buildQuestions() {
  const list = []
  const p = (q, cat) => list.push({ question: q, category: cat })

  // ---- 1. AMBIGUA con término → PRODUCTOS (15)
  const tipos = productTypes.length ? productTypes : ['mochila', 'llavero', 'bolígrafo', 'lápiz', 'cuaderno', 'taza', 'polera', 'gorro', 'usb', 'marcador', 'corchetera', 'resaltador', 'libreta', 'vaso', 'cojín']
  for (let i = 0; i < 15; i++) {
    const term = tipos[i % tipos.length]
    p(`tienen ${term}?`, 'MEJORA1_AMBIGUA_TERMINO')
    p(`hay ${term}?`, 'MEJORA1_AMBIGUA_TERMINO')
    p(`tienen ${term}s?`, 'MEJORA1_AMBIGUA_TERMINO')
  }
  while (list.filter(x => x.category === 'MEJORA1_AMBIGUA_TERMINO').length < 15) {
    const term = pick(tipos)
    if (term) p(`tienen ${term}?`, 'MEJORA1_AMBIGUA_TERMINO')
  }
  const mejora1 = list.filter(x => x.category === 'MEJORA1_AMBIGUA_TERMINO').slice(0, 15)
  list.length = 0
  list.push(...mejora1)

  // ---- 2. AMBIGUA "variaciones" pero otro producto (15 pares = 30 mensajes)
  const skuA = skus[0] || 'B85'
  const otroTipo = productTypes.length >= 2 ? productTypes[1] : 'mochilas'
  for (let i = 0; i < 15; i++) {
    const tipo = productTypes[i % productTypes.length] || 'mochilas'
    if (tipo === (productTypes[0] || 'llavero')) continue
    list.push({ question: `tienen el ${skuA}?`, category: 'MEJORA2_AMBIGUA_VAR_CTX' })
    list.push({ question: `tienen ${tipo} en más colores?`, category: 'MEJORA2_AMBIGUA_VAR_OTRO' })
  }
  while (list.filter(x => x.category === 'MEJORA2_AMBIGUA_VAR_OTRO').length < 15) {
    const tipo = pick(productTypes) || 'mochilas'
    list.push({ question: `tienen el ${skuA}?`, category: 'MEJORA2_AMBIGUA_VAR_CTX' })
    list.push({ question: `tienen ${tipo} en más colores?`, category: 'MEJORA2_AMBIGUA_VAR_OTRO' })
  }
  const mejora2 = list.filter(x => x.category === 'MEJORA2_AMBIGUA_VAR_CTX' || x.category === 'MEJORA2_AMBIGUA_VAR_OTRO').slice(0, 30)
  list.length = 0
  list.push(...mejora1, ...mejora2)

  // ---- 3. VARIANTE otro producto (15 pares)
  const skuB = skus.length >= 2 ? skus[1] : (skuA === 'B85' ? 'K78' : 'B85')
  for (let i = 0; i < 15; i++) {
    list.push({ question: `cuánto cuesta el ${skuA}?`, category: 'MEJORA3_VARIANTE_CTX' })
    list.push({ question: `qué colores tiene el ${skuB}?`, category: 'MEJORA3_VARIANTE_OTRO' })
  }
  const mejora3 = list.filter(x => x.category === 'MEJORA3_VARIANTE_CTX' || x.category === 'MEJORA3_VARIANTE_OTRO').slice(-30)
  list.length = 0
  list.push(...mejora1, ...mejora2, ...mejora3)

  // ---- 4. CARACTERISTICAS otro producto (15 pares)
  for (let i = 0; i < 15; i++) {
    list.push({ question: `precio del ${skuA}?`, category: 'MEJORA4_CARACT_CTX' })
    list.push({ question: `qué tiene el ${skuB}?`, category: 'MEJORA4_CARACT_OTRO' })
  }
  const mejora4 = list.filter(x => x.category === 'MEJORA4_CARACT_CTX' || x.category === 'MEJORA4_CARACT_OTRO').slice(-30)
  list.length = 0
  list.push(...mejora1, ...mejora2, ...mejora3, ...mejora4)

  // ---- 5. Nombre + SKU (15)
  const nombres = ['llavero', 'mochila', 'bolígrafo', 'lapicero', 'libreta', 'producto', 'taza', 'polera', 'corchetera', 'usb', 'marcador', 'cuaderno', 'vaso', 'gorro', 'cojín']
  for (let i = 0; i < 15; i++) {
    const nombre = nombres[i % nombres.length]
    const sku = skus[i % skus.length] || 'B85'
    p(`${nombre} ${sku}`, 'MEJORA5_NOMBRE_SKU')
  }
  const mejora5 = list.filter(x => x.category === 'MEJORA5_NOMBRE_SKU').slice(0, 15)
  list.length = 0
  list.push(...mejora1, ...mejora2, ...mejora3, ...mejora4, ...mejora5)

  // ---- 6. General (180 para total 300: 15+30+30+30+15+180)
  const general = []
  general.push('hola', 'buenos días', 'buenas tardes', 'hola tienen productos?', 'horarios de atención', 'cuánto cuesta', 'qué colores tiene', 'tienes en más tallas?')
  skus.slice(0, 40).forEach(sku => {
    general.push(`tienen ${sku}?`, `sku ${sku}`, `precio del ${sku}?`, `stock del ${sku}?`, `tienen sku ${sku}?`)
  })
  productTypes.slice(0, 20).forEach(t => general.push(`tienen ${t}?`, `hay ${t}?`, `precio de ${t}?`))
  while (general.length < 200) general.push(`tienen ${pick(skus)}?`, `precio del ${pick(skus)}?`)
  for (let i = 0; i < 180; i++) {
    list.push({ question: general[i % general.length], category: 'GENERAL' })
  }

  return list.slice(0, 300)
}

async function run() {
  console.log('\n' + '='.repeat(60))
  log('  TEST 300 PREGUNTAS – MEJORAS DE BÚSQUEDA (backend local)', 'bright')
  log('  Los logs del backend se ven en la terminal donde corre npm run dev.', 'cyan')
  console.log('='.repeat(60))

  const ok = await loadProducts()
  if (!ok) {
    log('Continuando con datos limitados...', 'yellow')
  }

  const questions = buildQuestions()
  log(`\n✅ Total preguntas: ${questions.length}`, 'green')
  log(`   MEJORA1 (AMBIGUA término): 15`, 'blue')
  log(`   MEJORA2 (AMBIGUA var otro): 30 msgs (15 pares)`, 'blue')
  log(`   MEJORA3 (VARIANTE otro): 30 msgs (15 pares)`, 'blue')
  log(`   MEJORA4 (CARACT otro): 30 msgs (15 pares)`, 'blue')
  log(`   MEJORA5 (nombre+SKU): 15`, 'blue')
  log(`   GENERAL: 180`, 'blue')
  log('\nEnviando... (delay ' + DELAY_MS + ' ms entre cada una)\n', 'yellow')

  let okCount = 0
  let errCount = 0
  for (let i = 0; i < questions.length; i++) {
    const { question, category } = questions[i]
    const num = i + 1
    process.stdout.write(`[${num}/${questions.length}] ${category} | "${question.slice(0, 50)}${question.length > 50 ? '…' : ''}" → `)
    try {
      const response = await sendMessage(question)
      const preview = (response || '').slice(0, 120).replace(/\n/g, ' ')
      console.log(preview + (response && response.length > 120 ? '…' : ''))
      if (response.startsWith('[ERROR]')) errCount++; else okCount++
    } catch (e) {
      console.log('[ERROR] ' + (e.message || e))
      errCount++
    }
    if (num < questions.length) await new Promise(r => setTimeout(r, DELAY_MS))
  }

  log('\n' + '='.repeat(60), 'green')
  log(`  FIN: ${okCount} OK, ${errCount} errores`, errCount ? 'yellow' : 'green')
  log('  Revisa la otra terminal para los logs del backend.', 'cyan')
  console.log('='.repeat(60) + '\n')
}

run().catch(e => {
  console.error(e)
  process.exit(1)
})
