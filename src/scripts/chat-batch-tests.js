/**
 * Batería rápida de 100 casos con productos reales de WooCommerce.
 * Uso: node src/scripts/chat-batch-tests.js
 */
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'
import { getProductsSample } from '../services/wordpress.service.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const envPath = join(__dirname, '../../.env')
dotenv.config({ path: envPath })

const BASE_URL = 'http://localhost:3001/api/chat/message'
const TOTAL_CASES = Number(process.env.CHAT_TESTS_TOTAL || 100)
const REQUEST_DELAY_MS = 0
const CONCURRENCY = 2
const REQUEST_TIMEOUT_MS = 60000
const USER_ID = `batch-100-${Date.now()}`

const promptTemplates = [
  sku => `¿Tienen ${sku}?`,
  name => `Precio y stock de ${name}`,
  name => `¿Hay stock de ${name}?`,
  name => `¿Cuánto cuesta ${name}?`,
  name => `¿Qué características tiene ${name}?`
]

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function trimName(name) {
  if (!name) return ''
  return name.length > 80 ? `${name.slice(0, 77)}...` : name
}

async function sendMessage(message) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: USER_ID, message }),
      signal: controller.signal
    })
    const json = await response.json()
    return json?.botMessage || json?.message || JSON.stringify(json)
  } finally {
    clearTimeout(timeoutId)
  }
}

function getReportsPath() {
  const reportsDir = join(__dirname, '..', '..', 'reports')
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true })
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return join(reportsDir, `chat-batch-tests-${stamp}.jsonl`)
}

async function main() {
  console.log('🔍 Cargando productos reales desde WooCommerce...')
  const sampleSizes = [100, 50, 30]
  let products = []
  let lastError = null

  for (const size of sampleSizes) {
    try {
      products = await getProductsSample(size)
      if (products && products.length > 0) {
        break
      }
    } catch (error) {
      lastError = error
      console.warn(`⚠️ Error al obtener muestra (${size}): ${error.message}`)
      await sleep(1500)
    }
  }

  if (!products || products.length === 0) {
    if (lastError) {
      console.error(`❌ Error obteniendo muestra de productos: ${lastError.message}`)
    }
    console.error('❌ No se encontraron productos en WooCommerce')
    process.exit(1)
  }

  const validProducts = products.filter(p => p.name && (p.sku || p.name))
  if (validProducts.length === 0) {
    console.error('❌ No hay productos válidos para test')
    process.exit(1)
  }

  const logPath = process.env.CHAT_TESTS_LOG_PATH || getReportsPath()
  const logStream = fs.createWriteStream(logPath, { flags: 'a' })

  const messages = []
  let index = 0

  while (messages.length < TOTAL_CASES) {
    const product = validProducts[index % validProducts.length]
    const name = trimName(product.name)
    const sku = product.sku
    const template = promptTemplates[messages.length % promptTemplates.length]
    const message = sku && messages.length % 5 === 0 ? template(sku) : template(name)
    messages.push({ message, productId: product.id, sku: sku || null })
    index += 1
  }

  const summary = {
    total: 0,
    ok: 0,
    noMatch: 0,
    needSku: 0,
    errors: 0
  }

  let alreadyProcessed = 0
  if (process.env.CHAT_TESTS_LOG_PATH && fs.existsSync(logPath)) {
    const existingContent = fs.readFileSync(logPath, 'utf8')
    const existingLines = existingContent.trim().length > 0 ? existingContent.trim().split(/\n+/) : []
    alreadyProcessed = existingLines.filter(Boolean).length
  }

  if (alreadyProcessed > 0) {
    console.log(`🔁 Reanudando desde ${alreadyProcessed}/${TOTAL_CASES}`)
  }

  console.log(`✅ Iniciando batería de ${TOTAL_CASES} casos...`)
  console.log(`🧾 Log: ${logPath}`)

  let cursor = alreadyProcessed

  async function worker(workerId) {
    while (cursor < messages.length) {
      const currentIndex = cursor
      cursor += 1
      const item = messages[currentIndex]
      if (!item) continue

      let reply = ''
      let error = null
      try {
        reply = await sendMessage(item.message)
      } catch (err) {
        error = err.message || String(err)
      }

      const lower = (reply || '').toLowerCase()
      if (error) {
        summary.errors += 1
      } else if (lower.includes('no encontr')) {
        summary.noMatch += 1
      } else if (lower.includes('necesito el nombre completo') || lower.includes('sku del producto')) {
        summary.needSku += 1
      } else {
        summary.ok += 1
      }

      summary.total += 1

      const record = {
        timestamp: new Date().toISOString(),
        message: item.message,
        productId: item.productId,
        sku: item.sku,
        reply,
        error
      }

      logStream.write(`${JSON.stringify(record)}\n`)

      if (summary.total % 10 === 0) {
        console.log(`Progreso: ${summary.total}/${TOTAL_CASES}`)
      }

      await sleep(REQUEST_DELAY_MS)
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, idx) => worker(idx + 1)))

  logStream.end()

  console.log('\n--- Resumen ---')
  console.log(`Total: ${summary.total}`)
  console.log(`OK: ${summary.ok}`)
  console.log(`No match: ${summary.noMatch}`)
  console.log(`Pide SKU/nombre: ${summary.needSku}`)
  console.log(`Errores: ${summary.errors}`)
  console.log(`Log guardado en: ${logPath}`)
}

main().catch(err => {
  console.error('❌ Error en batería de pruebas:', err)
  process.exit(1)
})
