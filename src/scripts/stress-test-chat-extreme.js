/**
 * Batería de pruebas EXTREMA contra el backend del chat
 * Simula un tester de IA de empresa grande buscando errores de forma AGRESIVA
 * 500 preguntas variadas usando PRODUCTOS REALES del sistema
 * Uso: node src/scripts/stress-test-chat-extreme.js
 */
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import axios from 'axios'
import fs from 'fs'
import wordpressService from '../services/wordpress.service.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const envPath = join(__dirname, '../../.env')
dotenv.config({ path: envPath })

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001'
const INIT_URL = `${BASE_URL}/api/chat/init`
const MESSAGE_URL = `${BASE_URL}/api/chat/message`
const REQUEST_TIMEOUT_MS = 120000 // 120 segundos para pruebas complejas
const TOTAL_TESTS = 500
const DELAY_BETWEEN_TESTS = 150 // 150ms entre tests (más rápido)

// Colores para la consola
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

// Variables globales para productos reales
let realProducts = []
let realSkus = []
let realVariableProducts = []
let realVariationSkus = []

/**
 * Cargar productos reales del sistema
 */
async function loadRealProducts() {
  log('📦 Cargando productos reales del sistema...', 'cyan')
  
  try {
    // Obtener muestra de productos (100 es el máximo permitido por WooCommerce)
    const products = await wordpressService.getProductsSample(100)
    
    if (!products || products.length === 0) {
      log('⚠️ No se pudieron cargar productos reales, usando datos de ejemplo', 'yellow')
      return false
    }
    
    realProducts = products
    realSkus = products
      .filter(p => p.sku && p.sku.trim().length > 0)
      .map(p => p.sku.trim())
      .slice(0, 100) // Top 100 SKUs
    
    // Identificar productos variables
    realVariableProducts = products.filter(p => p.type === 'variable')
    
    // Obtener SKUs de variaciones de algunos productos variables
    for (const product of realVariableProducts.slice(0, 20)) {
      try {
        const variations = await wordpressService.getProductVariations(product.id)
        if (variations && variations.length > 0) {
          variations.forEach(v => {
            if (v.sku && v.sku.trim().length > 0) {
              realVariationSkus.push({
                sku: v.sku.trim(),
                parentName: product.name,
                parentId: product.id
              })
            }
          })
        }
      } catch (error) {
        // Continuar con el siguiente
      }
    }
    
    log(`✅ Cargados ${realProducts.length} productos reales`, 'green')
    log(`✅ ${realSkus.length} SKUs reales disponibles`, 'green')
    log(`✅ ${realVariableProducts.length} productos variables encontrados`, 'green')
    log(`✅ ${realVariationSkus.length} SKUs de variaciones encontrados`, 'green')
    
    return true
  } catch (error) {
    log(`❌ Error cargando productos reales: ${error.message}`, 'red')
    return false
  }
}

/**
 * Generar preguntas basadas en productos reales
 */
function generateRealQuestions() {
  const questions = []
  
  // 1. SKUs reales explícitos (50 preguntas)
  realSkus.slice(0, 50).forEach(sku => {
    questions.push(
      { question: `tienen sku ${sku}?`, category: 'skuRealExplicit' },
      { question: `tienen SKU ${sku}?`, category: 'skuRealExplicit' },
      { question: `sku ${sku}`, category: 'skuRealExplicit' },
      { question: `tienen ${sku}?`, category: 'skuRealExplicit' },
      { question: `${sku} disponible?`, category: 'skuRealExplicit' },
      { question: `hay stock del sku ${sku}?`, category: 'skuRealExplicit' },
      { question: `cuanto stock hay del sku ${sku}?`, category: 'skuRealExplicit' },
      { question: `precio del sku ${sku}?`, category: 'skuRealExplicit' },
      { question: `tienen sku ${sku} en stock?`, category: 'skuRealExplicit' },
      { question: `el sku ${sku} esta disponible?`, category: 'skuRealExplicit' }
    )
  })
  
  // 2. SKUs de variaciones reales (30 preguntas)
  realVariationSkus.slice(0, 30).forEach(({ sku, parentName }) => {
    questions.push(
      { question: `tienen sku ${sku}?`, category: 'skuVariationReal' },
      { question: `tienen ${sku}?`, category: 'skuVariationReal' },
      { question: `sku ${sku} disponible?`, category: 'skuVariationReal' },
      { question: `hay stock del ${sku}?`, category: 'skuVariationReal' },
      { question: `precio del ${sku}?`, category: 'skuVariationReal' }
    )
  })
  
  // 3. Nombres de productos reales (50 preguntas)
  realProducts.slice(0, 50).forEach(product => {
    const name = product.name || ''
    if (name.length > 0) {
      const shortName = name.split(' ').slice(0, 2).join(' ')
      questions.push(
        { question: `tienen ${name}?`, category: 'productNameReal' },
        { question: `tienen ${shortName}?`, category: 'productNameReal' },
        { question: `${name} disponible?`, category: 'productNameReal' },
        { question: `hay stock de ${shortName}?`, category: 'productNameReal' },
        { question: `precio de ${shortName}?`, category: 'productNameReal' }
      )
    }
  })
  
  // 4. Preguntas sobre variaciones SIN contexto previo (20 preguntas - CASOS CRÍTICOS)
  for (let i = 0; i < 20; i++) {
    questions.push(
      { question: 'tienes en mas colores?', category: 'variationNoContext' },
      { question: 'tienes en otros colores?', category: 'variationNoContext' },
      { question: 'que colores disponibles?', category: 'variationNoContext' },
      { question: 'hay mas colores?', category: 'variationNoContext' },
      { question: 'que colores tiene?', category: 'variationNoContext' },
      { question: 'tienes en mas tallas?', category: 'variationNoContext' },
      { question: 'que tallas disponibles?', category: 'variationNoContext' },
      { question: 'hay mas tamaños?', category: 'variationNoContext' },
      { question: 'que variaciones tiene?', category: 'variationNoContext' },
      { question: 'tienes otras opciones?', category: 'variationNoContext' }
    )
  }
  
  // 5. SKUs con errores tipográficos (30 preguntas)
  realSkus.slice(0, 30).forEach(sku => {
    // Introducir errores comunes
    const errors = [
      sku.replace(/6/g, 'g'),
      sku.replace(/0/g, 'o'),
      sku.slice(0, -1), // Quitar último carácter
      sku + 'x', // Agregar carácter extra
      sku.replace(/(\d)(\d)/g, '$1 $2') // Espacios en medio
    ]
    errors.forEach(errSku => {
      if (errSku !== sku && errSku.length > 0) {
        questions.push({ question: `tienen sku ${errSku}?`, category: 'skuRealTypos' })
      }
    })
  })
  
  // 6. Consultas de seguimiento sin contexto (20 preguntas)
  for (let i = 0; i < 20; i++) {
    questions.push(
      { question: 'y ese?', category: 'followUpNoContext' },
      { question: 'y ese otro?', category: 'followUpNoContext' },
      { question: 'y los otros?', category: 'followUpNoContext' },
      { question: 'y mas?', category: 'followUpNoContext' },
      { question: 'y?', category: 'followUpNoContext' },
      { question: 'que mas tienen?', category: 'followUpNoContext' },
      { question: 'y los demas?', category: 'followUpNoContext' },
      { question: 'y otros productos?', category: 'followUpNoContext' },
      { question: 'y otras opciones?', category: 'followUpNoContext' },
      { question: 'y ese producto?', category: 'followUpNoContext' }
    )
  }
  
  // 7. SKUs muy cortos o problemáticos (20 preguntas)
  const shortSkus = realSkus.filter(sku => sku.length <= 5)
  shortSkus.slice(0, 20).forEach(sku => {
    questions.push(
      { question: `tienen ${sku}?`, category: 'skuShortReal' },
      { question: `tienen sku ${sku}?`, category: 'skuShortReal' },
      { question: `${sku} disponible?`, category: 'skuShortReal' },
      { question: `hay stock del ${sku}?`, category: 'skuShortReal' }
    )
  })
  
  // 8. Consultas con stock real (30 preguntas)
  realSkus.slice(0, 30).forEach(sku => {
    questions.push(
      { question: `cuanto stock tienen del sku ${sku}?`, category: 'stockReal' },
      { question: `hay stock del sku ${sku}?`, category: 'stockReal' },
      { question: `tienen stock del sku ${sku}?`, category: 'stockReal' },
      { question: `disponible sku ${sku}?`, category: 'stockReal' },
      { question: `stock del ${sku}?`, category: 'stockReal' }
    )
  })
  
  // 9. Consultas ambiguas con productos reales (30 preguntas)
  realProducts.slice(0, 30).forEach(product => {
    const name = product.name || ''
    if (name.length > 0) {
      const words = name.split(' ').filter(w => w.length > 3)
      if (words.length > 0) {
        questions.push(
          { question: `tienen ${words[0]}?`, category: 'ambiguousReal' },
          { question: `${words[0]} disponible?`, category: 'ambiguousReal' },
          { question: `hay ${words[0]}?`, category: 'ambiguousReal' }
        )
      }
    }
  })
  
  // 10. Consultas con caracteres especiales y formato extraño (30 preguntas)
  realSkus.slice(0, 30).forEach(sku => {
    questions.push(
      { question: `tienen sku ${sku}???`, category: 'specialCharsReal' },
      { question: `tienen sku ${sku}!!!`, category: 'specialCharsReal' },
      { question: `tienen sku ${sku}...`, category: 'specialCharsReal' },
      { question: `SKU ${sku}`, category: 'specialCharsReal' },
      { question: `sku:${sku}`, category: 'specialCharsReal' },
      { question: `sku-${sku}`, category: 'specialCharsReal' },
      { question: `sku_${sku}`, category: 'specialCharsReal' },
      { question: `tienen sku ${sku}? 😊`, category: 'specialCharsReal' },
      { question: `tienen sku ${sku}? 👍`, category: 'specialCharsReal' },
      { question: `tienen sku ${sku}? 💰`, category: 'specialCharsReal' }
    )
  })
  
  // 11. Consultas muy largas con productos reales (20 preguntas)
  realSkus.slice(0, 20).forEach(sku => {
    questions.push(
      { question: `hola buenos dias necesito saber si tienen disponible el producto con sku ${sku} porque necesito hacer un pedido grande y quiero confirmar que tienen stock suficiente para mi pedido`, category: 'longQueriesReal' },
      { question: `me podrias ayudar a encontrar informacion sobre el producto con sku ${sku} porque estoy buscando hacer una compra y necesito saber si tienen stock disponible antes de hacer mi pedido`, category: 'longQueriesReal' },
      { question: `necesito informacion detallada sobre el producto con sku ${sku} especialmente sobre su disponibilidad en stock porque estoy interesado en hacer una compra grande`, category: 'longQueriesReal' }
    )
  })
  
  // 12. Consultas con múltiples preguntas (20 preguntas)
  realSkus.slice(0, 20).forEach(sku => {
    questions.push(
      { question: `tienen sku ${sku}? y cuanto cuesta?`, category: 'multipleQuestionsReal' },
      { question: `disponible? y precio?`, category: 'multipleQuestionsReal' },
      { question: `hay stock? y cuanto?`, category: 'multipleQuestionsReal' },
      { question: `tienen ${sku}? y que precio tiene?`, category: 'multipleQuestionsReal' },
      { question: `stock? precio? disponible?`, category: 'multipleQuestionsReal' }
    )
  })
  
  // 13. Consultas en mayúsculas/minúsculas (20 preguntas)
  realSkus.slice(0, 20).forEach(sku => {
    questions.push(
      { question: `TIENEN SKU ${sku.toUpperCase()}?`, category: 'caseVariationsReal' },
      { question: `tienen sku ${sku.toLowerCase()}?`, category: 'caseVariationsReal' },
      { question: `TiEnEn SkU ${sku}?`, category: 'caseVariationsReal' },
      { question: `SKU ${sku}`, category: 'caseVariationsReal' }
    )
  })
  
  // 14. Consultas con espacios extra (20 preguntas)
  realSkus.slice(0, 20).forEach(sku => {
    questions.push(
      { question: `tienen   sku   ${sku}   ?`, category: 'extraSpacesReal' },
      { question: `tienen  sku  ${sku}  ?`, category: 'extraSpacesReal' },
      { question: `  tienen sku ${sku}?  `, category: 'extraSpacesReal' },
      { question: `tienen sku  ${sku}?`, category: 'extraSpacesReal' }
    )
  })
  
  // 15. Consultas sin puntuación (20 preguntas)
  realSkus.slice(0, 20).forEach(sku => {
    questions.push(
      { question: `tienen sku ${sku}`, category: 'noPunctuationReal' },
      { question: `sku ${sku} disponible`, category: 'noPunctuationReal' },
      { question: `hay stock del sku ${sku}`, category: 'noPunctuationReal' },
      { question: `precio del sku ${sku}`, category: 'noPunctuationReal' }
    )
  })
  
  // 16. Consultas con contexto previo simulado (30 preguntas)
  // Primero consultar un producto, luego preguntar por variaciones
  realVariableProducts.slice(0, 10).forEach(product => {
    const sku = product.sku || ''
    if (sku) {
      questions.push(
        { question: `tienen sku ${sku}?`, category: 'contextThenVariation', needsContext: true },
        { question: `tienes en mas colores?`, category: 'contextThenVariation', needsContext: true },
        { question: `que colores disponibles?`, category: 'contextThenVariation', needsContext: true }
      )
    }
  })
  
  // 17. Consultas con números mal formateados (20 preguntas)
  realSkus.slice(0, 20).forEach(sku => {
    // Intentar diferentes formatos incorrectos
    const malformed = [
      sku.replace(/\d/g, ''),
      sku.split('').reverse().join(''),
      sku + '000',
      '0' + sku
    ]
    malformed.forEach(mf => {
      if (mf !== sku && mf.length > 0) {
        questions.push({ question: `tienen sku ${mf}?`, category: 'malformedReal' })
      }
    })
  })
  
  // 18. Consultas con combinaciones de keywords (20 preguntas)
  realSkus.slice(0, 20).forEach(sku => {
    questions.push(
      { question: `disponible precio stock producto sku ${sku}`, category: 'combinationsReal' },
      { question: `sku ${sku} stock precio disponible`, category: 'combinationsReal' },
      { question: `producto ${sku} disponible stock`, category: 'combinationsReal' }
    )
  })
  
  // Mezclar y limitar a TOTAL_TESTS
  const shuffled = questions.sort(() => Math.random() - 0.5)
  return shuffled.slice(0, TOTAL_TESTS)
}

const TEST_USER_ID = 'stress-test-user'

/**
 * Inicializar sesión de chat
 */
async function initChat() {
  try {
    const response = await axios.post(
      INIT_URL, 
      { userId: TEST_USER_ID }, 
      { timeout: REQUEST_TIMEOUT_MS }
    )
    return TEST_USER_ID // El sistema usa userId, no sessionId
  } catch (error) {
    log(`❌ Error inicializando chat: ${error.message}`, 'red')
    if (error.response) {
      log(`   Status: ${error.response.status}`, 'red')
      log(`   Data: ${JSON.stringify(error.response.data)}`, 'red')
    }
    throw error
  }
}

/**
 * Enviar mensaje al chat
 */
async function sendMessage(userId, message) {
  const startTime = Date.now()
  try {
    const response = await axios.post(
      MESSAGE_URL,
      { userId, message },
      { 
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )
    const duration = Date.now() - startTime
    // El endpoint retorna botMessage, no response o message
    const responseText = response.data.botMessage || response.data.response || response.data.message || ''
    return {
      success: true,
      response: responseText,
      duration
    }
  } catch (error) {
    const duration = Date.now() - startTime
    let errorMessage = error.message
    let responseText = ''
    
    // Intentar obtener más información del error
    if (error.response) {
      errorMessage = `HTTP ${error.response.status}: ${JSON.stringify(error.response.data)}`
      responseText = error.response.data?.botMessage || error.response.data?.message || ''
    }
    
    return {
      success: false,
      error: errorMessage,
      response: responseText, // Incluir respuesta incluso si hay error
      duration
    }
  }
}

/**
 * Detectar problemas en la respuesta
 */
function detectIssues(response, question, category) {
  const issues = []
  const lowerResponse = response.toLowerCase()
  
  // Detectar palabra "error" en respuesta
  if (lowerResponse.includes('error') || lowerResponse.includes('erróneo') || lowerResponse.includes('errónea')) {
    issues.push({
      type: 'ERROR',
      message: 'Respuesta contiene palabra "error"'
    })
  }
  
  // Detectar respuestas genéricas problemáticas
  if (lowerResponse.includes('hubo un error') || lowerResponse.includes('error al procesar')) {
    issues.push({
      type: 'CRITICAL',
      message: 'Respuesta genérica de error detectada'
    })
  }
  
  // Detectar respuestas vacías o muy cortas para consultas específicas
  if (category.includes('sku') && response.length < 50) {
    issues.push({
      type: 'WARNING',
      message: 'Respuesta muy corta para consulta de SKU'
    })
  }
  
  // Detectar respuestas que no mencionan el SKU cuando se pregunta por uno
  if (category.includes('sku') && question.match(/sku\s+(\w+)/)) {
    const skuMatch = question.match(/sku\s+(\w+)/)
    if (skuMatch && !lowerResponse.includes(skuMatch[1].toLowerCase())) {
      issues.push({
        type: 'WARNING',
        message: `Respuesta no menciona el SKU consultado: ${skuMatch[1]}`
      })
    }
  }
  
  return issues
}

/**
 * Ejecutar batería de pruebas
 */
async function runTests() {
  log('╔════════════════════════════════════════════════════════╗', 'bright')
  log('║   STRESS TEST EXTREMO - BUSCANDO ERRORES                ║', 'bright')
  log('╚════════════════════════════════════════════════════════╝', 'bright')
  console.log()
  
  // Cargar productos reales
  const productsLoaded = await loadRealProducts()
  if (!productsLoaded) {
    log('⚠️ Continuando con datos limitados...', 'yellow')
  }
  console.log()
  
  // Generar preguntas
  log('📝 Generando preguntas basadas en productos reales...', 'cyan')
  const questions = generateRealQuestions()
  log(`✅ Generadas ${questions.length} preguntas`, 'green')
  console.log()
  
  // Inicializar chat
  log('🔌 Inicializando sesión de chat...', 'cyan')
  let userId
  try {
    userId = await initChat()
    log(`✅ Sesión inicializada para usuario: ${userId}`, 'green')
  } catch (error) {
    log(`❌ No se pudo inicializar el chat. Verifica que el backend esté corriendo.`, 'red')
    process.exit(1)
  }
  console.log()
  
  // Ejecutar pruebas
  log(`🚀 Iniciando ${questions.length} pruebas...`, 'bright')
  console.log()
  
  const results = []
  let currentContext = null
  
  for (let i = 0; i < questions.length; i++) {
    const test = questions[i]
    const testNumber = i + 1
    
    // Si necesita contexto, establecerlo primero
    if (test.needsContext && !currentContext) {
      // Usar un SKU real para establecer contexto
      const contextSku = realSkus[Math.floor(Math.random() * realSkus.length)]
      log(`[${testNumber}/${questions.length}] 🔄 Estableciendo contexto con SKU ${contextSku}...`, 'cyan')
      await sendMessage(userId, `tienen sku ${contextSku}?`)
      currentContext = contextSku
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_TESTS))
    }
    
    process.stdout.write(`[${testNumber}/${questions.length}] Probando: "${test.question.substring(0, 50)}${test.question.length > 50 ? '...' : ''}" ... `)
    
    const result = await sendMessage(userId, test.question)
    const issues = detectIssues(result.response || '', test.question, test.category)
    
    const testResult = {
      testNumber,
      category: test.category,
      question: test.question,
      success: result.success && issues.length === 0,
      duration: result.duration,
      responseLength: (result.response || '').length,
      issues: issues.length > 0 ? issues : [],
      response: result.response || '',
      error: result.error || null
    }
    
    results.push(testResult)
    
    if (!testResult.success || issues.length > 0) {
      log(`❌`, 'red')
      if (issues.length > 0) {
        issues.forEach(issue => {
          log(`   ⚠️ ${issue.type}: ${issue.message}`, 'yellow')
        })
      }
      if (result.error) {
        log(`   ❌ Error: ${result.error}`, 'red')
      }
    } else {
      log(`✅ (${result.duration}ms)`, 'green')
    }
    
    // Log crítico inmediato
    if (issues.some(i => i.type === 'CRITICAL' || i.type === 'ERROR')) {
      log(`\n🔴 CRÍTICO detectado en test #${testNumber}:`, 'red')
      log(`   Pregunta: "${test.question}"`, 'yellow')
      log(`   Categoría: ${test.category}`, 'yellow')
      log(`   Respuesta: ${result.response.substring(0, 200)}...`, 'yellow')
      console.log()
    }
    
    // Delay entre tests
    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_TESTS))
  }
  
  // Generar reporte
  console.log()
  log('╔════════════════════════════════════════════════════════╗', 'bright')
  log('║   GENERANDO REPORTE FINAL                               ║', 'bright')
  log('╚════════════════════════════════════════════════════════╝', 'bright')
  console.log()
  
  const reportFile = `reports/stress-test-extreme-${Date.now()}.jsonl`
  const reportDir = join(__dirname, '../../reports')
  
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true })
  }
  
  const reportPath = join(__dirname, '../../', reportFile)
  const reportLines = results.map(r => JSON.stringify(r))
  fs.writeFileSync(reportPath, reportLines.join('\n'))
  
  // Estadísticas
  const total = results.length
  const success = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length
  const withIssues = results.filter(r => r.issues.length > 0).length
  const criticalIssues = results.filter(r => r.issues.some(i => i.type === 'CRITICAL' || i.type === 'ERROR')).length
  
  log('📊 ESTADÍSTICAS FINALES', 'bright')
  console.log('='.repeat(80))
  log(`Total de pruebas: ${total}`, 'blue')
  log(`✅ Exitosas: ${success} (${((success / total) * 100).toFixed(1)}%)`, success === total ? 'green' : 'yellow')
  log(`❌ Fallidas: ${failed} (${((failed / total) * 100).toFixed(1)}%)`, failed > 0 ? 'red' : 'green')
  log(`⚠️  Con problemas: ${withIssues} (${((withIssues / total) * 100).toFixed(1)}%)`, withIssues > 0 ? 'yellow' : 'green')
  log(`🔴 Críticos: ${criticalIssues}`, criticalIssues > 0 ? 'red' : 'green')
  
  const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / total
  log(`⏱️  Duración promedio: ${avgDuration.toFixed(0)}ms`, 'blue')
  
  log(`\n📄 Reporte guardado en: ${reportFile}`, 'cyan')
  
  if (criticalIssues > 0) {
    log(`\n⚠️  ACCIÓN REQUERIDA: Se detectaron ${criticalIssues} problemas críticos!`, 'red')
  }
  
  console.log()
}

// Ejecutar
runTests().catch(error => {
  log(`❌ Error fatal: ${error.message}`, 'red')
  console.error(error)
  process.exit(1)
})
