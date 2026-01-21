/**
 * Batería de pruebas EXTREMA v2 - ROBUSTA Y ANTICONGELAMIENTO
 * Simula un tester de IA de empresa grande buscando errores de forma AGRESIVA
 * 700 preguntas variadas usando 800+ PRODUCTOS REALES del sistema
 * 
 * CARACTERÍSTICAS:
 * - Carga 800+ productos usando paginación
 * - 700 tests exhaustivos
 * - Manejo robusto de errores (no se congela)
 * - Guardado periódico de progreso
 * - Reintentos automáticos
 * - Timeouts configurados
 * - Logging detallado
 * 
 * Uso: node src/scripts/stress-test-chat-extreme-v2.js
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
const REQUEST_TIMEOUT_MS = 90000 // 90 segundos (reducido para evitar congelamiento)
const TOTAL_TESTS = 700
const DELAY_BETWEEN_TESTS = 100 // 100ms entre tests
const MAX_RETRIES = 3 // Reintentos máximos por petición
const RETRY_DELAY = 2000 // 2 segundos entre reintentos
const PROGRESS_SAVE_INTERVAL = 50 // Guardar progreso cada 50 tests

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
  const timestamp = new Date().toLocaleTimeString()
  console.log(`${colors[color]}[${timestamp}] ${message}${colors.reset}`)
}

// Variables globales para productos reales
let realProducts = []
let realSkus = []
let realVariableProducts = []
let realVariationSkus = []

/**
 * Cargar 800+ productos reales usando paginación
 */
async function loadRealProducts() {
  log('📦 Cargando 800+ productos reales del sistema (paginación)...', 'cyan')
  
  try {
    // Cargar todos los productos usando getAllProducts (ya maneja paginación internamente)
    log(`   Cargando todos los productos disponibles...`, 'blue')
    const allProducts = await wordpressService.getAllProducts()
    
    if (!allProducts || allProducts.length === 0) {
      log('⚠️ No se pudieron cargar productos reales', 'yellow')
      return false
    }
    
    // Limitar a 800 productos para el test
    realProducts = allProducts.slice(0, 800)
    log(`   ✅ ${realProducts.length} productos cargados (de ${allProducts.length} disponibles)`, 'green')
    
    if (realProducts.length === 0) {
      log('⚠️ No se pudieron cargar productos reales', 'yellow')
      return false
    }
    
    // Extraer SKUs únicos
    const skuSet = new Set()
    realProducts.forEach(p => {
      if (p.sku && p.sku.trim().length > 0) {
        skuSet.add(p.sku.trim())
      }
    })
    realSkus = Array.from(skuSet).slice(0, 600) // Top 600 SKUs únicos
    
    // Identificar productos variables
    realVariableProducts = realProducts.filter(p => p.type === 'variable')
    
    // Obtener SKUs de variaciones de algunos productos variables (muestra)
    log('   Cargando variaciones de productos variables...', 'blue')
    const sampleSize = Math.min(50, realVariableProducts.length)
    for (const product of realVariableProducts.slice(0, sampleSize)) {
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
        await new Promise(resolve => setTimeout(resolve, 100))
      } catch (error) {
        // Continuar con el siguiente
      }
    }
    
    log(`✅ Cargados ${realProducts.length} productos reales`, 'green')
    log(`✅ ${realSkus.length} SKUs únicos disponibles`, 'green')
    log(`✅ ${realVariableProducts.length} productos variables encontrados`, 'green')
    log(`✅ ${realVariationSkus.length} SKUs de variaciones encontrados`, 'green')
    
    return true
  } catch (error) {
    log(`❌ Error cargando productos reales: ${error.message}`, 'red')
    console.error(error)
    return false
  }
}

/**
 * Generar 700 preguntas basadas en productos reales
 */
function generateRealQuestions() {
  const questions = []
  
  // 1. SKUs reales explícitos (150 preguntas)
  realSkus.slice(0, 150).forEach(sku => {
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
  
  // 2. SKUs de variaciones reales (50 preguntas)
  realVariationSkus.slice(0, 50).forEach(({ sku, parentName }) => {
    questions.push(
      { question: `tienen sku ${sku}?`, category: 'skuVariationReal' },
      { question: `tienen ${sku}?`, category: 'skuVariationReal' },
      { question: `sku ${sku} disponible?`, category: 'skuVariationReal' },
      { question: `hay stock del ${sku}?`, category: 'skuVariationReal' },
      { question: `precio del ${sku}?`, category: 'skuVariationReal' }
    )
  })
  
  // 3. Nombres de productos reales (100 preguntas)
  realProducts.slice(0, 100).forEach(product => {
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
  
  // 4. Preguntas sobre variaciones SIN contexto previo (50 preguntas - CASOS CRÍTICOS)
  for (let i = 0; i < 50; i++) {
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
  
  // 5. SKUs con errores tipográficos (60 preguntas)
  realSkus.slice(0, 60).forEach(sku => {
    const errors = [
      sku.replace(/6/g, 'g'),
      sku.replace(/0/g, 'o'),
      sku.slice(0, -1),
      sku + 'x',
      sku.replace(/(\d)(\d)/g, '$1 $2')
    ]
    errors.forEach(errSku => {
      if (errSku !== sku && errSku.length > 0) {
        questions.push({ question: `tienen sku ${errSku}?`, category: 'skuRealTypos' })
      }
    })
  })
  
  // 6. Consultas de seguimiento sin contexto (50 preguntas)
  for (let i = 0; i < 50; i++) {
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
  
  // 7. SKUs muy cortos o problemáticos (40 preguntas)
  const shortSkus = realSkus.filter(sku => sku.length <= 5)
  shortSkus.slice(0, 40).forEach(sku => {
    questions.push(
      { question: `tienen ${sku}?`, category: 'skuShortReal' },
      { question: `tienen sku ${sku}?`, category: 'skuShortReal' },
      { question: `${sku} disponible?`, category: 'skuShortReal' },
      { question: `hay stock del ${sku}?`, category: 'skuShortReal' }
    )
  })
  
  // 8. Consultas con stock real (60 preguntas)
  realSkus.slice(0, 60).forEach(sku => {
    questions.push(
      { question: `cuanto stock tienen del sku ${sku}?`, category: 'stockReal' },
      { question: `hay stock del sku ${sku}?`, category: 'stockReal' },
      { question: `tienen stock del sku ${sku}?`, category: 'stockReal' },
      { question: `disponible sku ${sku}?`, category: 'stockReal' },
      { question: `stock del ${sku}?`, category: 'stockReal' }
    )
  })
  
  // 9. Consultas ambiguas con productos reales (60 preguntas)
  realProducts.slice(0, 60).forEach(product => {
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
  
  // 10. Consultas con caracteres especiales y formato extraño (60 preguntas)
  realSkus.slice(0, 60).forEach(sku => {
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
  
  // 11. Consultas muy largas con productos reales (40 preguntas)
  realSkus.slice(0, 40).forEach(sku => {
    questions.push(
      { question: `hola buenos dias necesito saber si tienen disponible el producto con sku ${sku} porque necesito hacer un pedido grande y quiero confirmar que tienen stock suficiente para mi pedido`, category: 'longQueriesReal' },
      { question: `me podrias ayudar a encontrar informacion sobre el producto con sku ${sku} porque estoy buscando hacer una compra y necesito saber si tienen stock disponible antes de hacer mi pedido`, category: 'longQueriesReal' },
      { question: `necesito informacion detallada sobre el producto con sku ${sku} especialmente sobre su disponibilidad en stock porque estoy interesado en hacer una compra grande`, category: 'longQueriesReal' }
    )
  })
  
  // 12. Consultas con múltiples preguntas (40 preguntas)
  realSkus.slice(0, 40).forEach(sku => {
    questions.push(
      { question: `tienen sku ${sku}? y cuanto cuesta?`, category: 'multipleQuestionsReal' },
      { question: `disponible? y precio?`, category: 'multipleQuestionsReal' },
      { question: `hay stock? y cuanto?`, category: 'multipleQuestionsReal' },
      { question: `tienen ${sku}? y que precio tiene?`, category: 'multipleQuestionsReal' },
      { question: `stock? precio? disponible?`, category: 'multipleQuestionsReal' }
    )
  })
  
  // 13. Consultas en mayúsculas/minúsculas (40 preguntas)
  realSkus.slice(0, 40).forEach(sku => {
    questions.push(
      { question: `TIENEN SKU ${sku.toUpperCase()}?`, category: 'caseVariationsReal' },
      { question: `tienen sku ${sku.toLowerCase()}?`, category: 'caseVariationsReal' },
      { question: `TiEnEn SkU ${sku}?`, category: 'caseVariationsReal' },
      { question: `SKU ${sku}`, category: 'caseVariationsReal' }
    )
  })
  
  // 14. Consultas con espacios extra (40 preguntas)
  realSkus.slice(0, 40).forEach(sku => {
    questions.push(
      { question: `tienen   sku   ${sku}   ?`, category: 'extraSpacesReal' },
      { question: `tienen  sku  ${sku}  ?`, category: 'extraSpacesReal' },
      { question: `  tienen sku ${sku}?  `, category: 'extraSpacesReal' },
      { question: `tienen sku  ${sku}?`, category: 'extraSpacesReal' }
    )
  })
  
  // 15. Consultas sin puntuación (40 preguntas)
  realSkus.slice(0, 40).forEach(sku => {
    questions.push(
      { question: `tienen sku ${sku}`, category: 'noPunctuationReal' },
      { question: `sku ${sku} disponible`, category: 'noPunctuationReal' },
      { question: `hay stock del sku ${sku}`, category: 'noPunctuationReal' },
      { question: `precio del sku ${sku}`, category: 'noPunctuationReal' }
    )
  })
  
  // Mezclar y limitar a TOTAL_TESTS
  const shuffled = questions.sort(() => Math.random() - 0.5)
  return shuffled.slice(0, TOTAL_TESTS)
}

const TEST_USER_ID = 'stress-test-user-v2'

/**
 * Inicializar sesión de chat con reintentos
 */
async function initChat(retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.post(
        INIT_URL, 
        { userId: TEST_USER_ID }, 
        { 
          timeout: REQUEST_TIMEOUT_MS,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )
      return TEST_USER_ID
    } catch (error) {
      if (attempt === retries) {
        log(`❌ Error inicializando chat después de ${retries} intentos: ${error.message}`, 'red')
        if (error.response) {
          log(`   Status: ${error.response.status}`, 'red')
          log(`   Data: ${JSON.stringify(error.response.data)}`, 'red')
        }
        throw error
      }
      log(`⚠️ Intento ${attempt}/${retries} falló, reintentando en ${RETRY_DELAY}ms...`, 'yellow')
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
    }
  }
}

/**
 * Enviar mensaje al chat con reintentos y manejo robusto de errores
 */
async function sendMessage(userId, message, retries = MAX_RETRIES) {
  const startTime = Date.now()
  
  for (let attempt = 1; attempt <= retries; attempt++) {
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
      
      if (error.response) {
        errorMessage = `HTTP ${error.response.status}: ${JSON.stringify(error.response.data)}`
        responseText = error.response.data?.botMessage || error.response.data?.message || ''
      }
      
      // Si es el último intento o es un error 400/500, retornar error
      if (attempt === retries || (error.response && [400, 500].includes(error.response.status))) {
        return {
          success: false,
          error: errorMessage,
          response: responseText,
          duration
        }
      }
      
      // Reintentar
      log(`   ⚠️ Intento ${attempt}/${retries} falló, reintentando...`, 'yellow')
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
    }
  }
}

/**
 * Detectar problemas en la respuesta
 */
function detectIssues(response, question, category) {
  const issues = []
  if (!response || response.length === 0) return issues
  
  const lowerResponse = response.toLowerCase()
  
  if (lowerResponse.includes('error') || lowerResponse.includes('erróneo') || lowerResponse.includes('errónea')) {
    issues.push({
      type: 'ERROR',
      message: 'Respuesta contiene palabra "error"'
    })
  }
  
  if (lowerResponse.includes('hubo un error') || lowerResponse.includes('error al procesar')) {
    issues.push({
      type: 'CRITICAL',
      message: 'Respuesta genérica de error detectada'
    })
  }
  
  if (category.includes('sku') && response.length < 50) {
    issues.push({
      type: 'WARNING',
      message: 'Respuesta muy corta para consulta de SKU'
    })
  }
  
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
 * Guardar progreso actual
 */
function saveProgress(results, reportPath) {
  try {
    const reportLines = results.map(r => JSON.stringify(r))
    fs.writeFileSync(reportPath, reportLines.join('\n'))
    log(`💾 Progreso guardado: ${results.length} tests completados`, 'cyan')
  } catch (error) {
    log(`⚠️ Error guardando progreso: ${error.message}`, 'yellow')
  }
}

/**
 * Ejecutar batería de pruebas
 */
async function runTests() {
  log('╔════════════════════════════════════════════════════════╗', 'bright')
  log('║   STRESS TEST EXTREMO v2 - BUSCANDO ERRORES            ║', 'bright')
  log('║   700 tests con 800+ productos reales                  ║', 'bright')
  log('╚════════════════════════════════════════════════════════╝', 'bright')
  console.log()
  
  // Preparar archivo de reporte
  const reportFile = `reports/stress-test-extreme-v2-${Date.now()}.jsonl`
  const reportDir = join(__dirname, '../../reports')
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true })
  }
  const reportPath = join(__dirname, '../../', reportFile)
  
  // Cargar productos reales
  const productsLoaded = await loadRealProducts()
  if (!productsLoaded) {
    log('⚠️ Continuando con datos limitados...', 'yellow')
  }
  console.log()
  
  // Generar preguntas
  log('📝 Generando 700 preguntas basadas en productos reales...', 'cyan')
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
    try {
      const test = questions[i]
      const testNumber = i + 1
      
      // Si necesita contexto, establecerlo primero
      if (test.needsContext && !currentContext) {
        try {
          const contextSku = realSkus[Math.floor(Math.random() * realSkus.length)]
          log(`[${testNumber}/${questions.length}] 🔄 Estableciendo contexto con SKU ${contextSku}...`, 'cyan')
          await sendMessage(userId, `tienen sku ${contextSku}?`)
          currentContext = contextSku
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_TESTS))
        } catch (error) {
          log(`   ⚠️ Error estableciendo contexto: ${error.message}`, 'yellow')
        }
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
      
      // Guardar progreso periódicamente
      if (testNumber % PROGRESS_SAVE_INTERVAL === 0) {
        saveProgress(results, reportPath)
      }
      
      // Delay entre tests
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_TESTS))
    } catch (error) {
      log(`\n❌ Error fatal en test #${i + 1}: ${error.message}`, 'red')
      // Continuar con el siguiente test
      results.push({
        testNumber: i + 1,
        category: questions[i]?.category || 'unknown',
        question: questions[i]?.question || 'unknown',
        success: false,
        duration: 0,
        responseLength: 0,
        issues: [{ type: 'CRITICAL', message: `Error fatal: ${error.message}` }],
        response: '',
        error: error.message
      })
    }
  }
  
  // Guardar reporte final
  saveProgress(results, reportPath)
  
  // Estadísticas
  console.log()
  log('╔════════════════════════════════════════════════════════╗', 'bright')
  log('║   REPORTE FINAL                                       ║', 'bright')
  log('╚════════════════════════════════════════════════════════╝', 'bright')
  console.log()
  
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

// Ejecutar con manejo de errores global
runTests().catch(error => {
  log(`❌ Error fatal: ${error.message}`, 'red')
  console.error(error)
  process.exit(1)
})
