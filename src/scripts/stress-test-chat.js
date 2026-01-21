/**
 * Batería de pruebas exhaustiva contra el backend del chat
 * Simula un tester de IA de empresa grande buscando errores
 * 500 preguntas variadas con faltas ortográficas, poco contexto, etc.
 * Uso: node src/scripts/stress-test-chat.js
 */
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import axios from 'axios'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const envPath = join(__dirname, '../../.env')
dotenv.config({ path: envPath })

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001'
const INIT_URL = `${BASE_URL}/api/chat/init`
const MESSAGE_URL = `${BASE_URL}/api/chat/message`
const REQUEST_TIMEOUT_MS = 90000 // 90 segundos para pruebas complejas
const TOTAL_TESTS = 500
const CONCURRENCY = 1 // Secuencial para evitar sobrecarga
const DELAY_BETWEEN_TESTS = 200 // 200ms entre tests

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

// Plantillas de preguntas con variaciones
const questionTemplates = {
  // SKU explícito con variaciones
  skuExplicit: [
    'tienen sku 601062670?',
    'tienen SKU 601062670?',
    'tienen sku 601062670',
    'tienen sku601062670?',
    'sku 601062670',
    'SKU: 601062670',
    'tienes el sku 601062670?',
    'me puedes decir si tienen sku 601062670?',
    'necesito saber si tienen sku 601062670',
    'sku 601062670 disponible?',
    'tienen sku 601062670 disponible?',
    'el sku 601062670 esta disponible?',
    '601062670',
    'producto 601062670',
    'articulo 601062670',
    'tienen el producto con sku 601062670?',
    'hay stock del sku 601062670?',
    'cuanto stock hay del sku 601062670?',
    'precio del sku 601062670?',
    'tienen sku 601062670 en stock?'
  ],
  
  // SKU con faltas ortográficas
  skuTypos: [
    'tienen scu 601062670?',
    'tienen suku 601062670?',
    'tienen sk 601062670?',
    'tienen sku 601062670?',
    'tienen sku 601062670?',
    'tienen sku 601062670?',
    'tienen sku 601062670?',
    'tienen sku 601062670?',
    'tienen sku 601062670?',
    'tienen sku 601062670?'
  ],
  
  // Nombres de productos (ejemplos comunes)
  productNames: [
    'tienen mochilas?',
    'tienen mochila?',
    'mochilas disponibles?',
    'que mochilas tienen?',
    'tienen libretas?',
    'libretas en stock?',
    'tienen lapiceros?',
    'lapiceros disponibles?',
    'tienen cuadernos?',
    'cuadernos?',
    'tienen marcadores?',
    'marcadores disponibles?',
    'tienen resaltadores?',
    'resaltadores?',
    'tienen bolsas?',
    'bolsas disponibles?',
    'tienen termos?',
    'termos?',
    'tienen tazas?',
    'tazas disponibles?'
  ],
  
  // Nombres con faltas ortográficas
  productNamesTypos: [
    'tienen mochilas?',
    'tienen mochilas?',
    'mochilas disponibles?',
    'que mochilas tienen?',
    'tienen libretas?',
    'libretas en stock?',
    'tienen lapiceros?',
    'lapiceros disponibles?',
    'tienen cuadernos?',
    'cuadernos?'
  ],
  
  // Consultas de stock
  stockQueries: [
    'cuanto stock tienen?',
    'que stock tienen?',
    'hay stock?',
    'tienen stock?',
    'cuanto hay disponible?',
    'hay disponible?',
    'esta disponible?',
    'cuanto stock hay?',
    'hay unidades disponibles?',
    'cuantas unidades tienen?',
    'tienen en stock?',
    'esta en stock?',
    'hay en stock?',
    'disponible en stock?',
    'cuanto stock disponible?'
  ],
  
  // Consultas con poco contexto
  lowContext: [
    'tienen?',
    'disponible?',
    'hay?',
    'stock?',
    'precio?',
    'cuanto?',
    'que tienen?',
    'que hay?',
    'que disponible?',
    'que stock?',
    'me puedes ayudar?',
    'necesito informacion',
    'busco algo',
    'tienen algo?',
    'que productos tienen?'
  ],
  
  // Consultas de precio
  priceQueries: [
    'cuanto cuesta?',
    'cual es el precio?',
    'precio?',
    'cuanto vale?',
    'cual es el valor?',
    'que precio tiene?',
    'cuanto sale?',
    'precio disponible?',
    'cual es el costo?',
    'cuanto es el precio?'
  ],
  
  // Consultas de variaciones
  variationQueries: [
    'tienes en mas colores?',
    'que colores tiene?',
    'tienes en otros colores?',
    'hay mas colores?',
    'que colores disponibles?',
    'tienes en mas tallas?',
    'que tallas tiene?',
    'hay mas tallas?',
    'que tallas disponibles?',
    'tienes en otros tamaños?',
    'que tamaños tiene?',
    'hay variaciones?',
    'que variaciones tiene?',
    'tienes variaciones?'
  ],
  
  // Consultas ambiguas
  ambiguous: [
    'hola',
    'buenos dias',
    'buenas tardes',
    'que tal',
    'como estas',
    'ayuda',
    'necesito ayuda',
    'informacion',
    'mas informacion',
    'detalles',
    'mas detalles',
    'que me puedes decir',
    'dime algo',
    'hablame',
    'conversemos'
  ],
  
  // Consultas con caracteres especiales
  specialChars: [
    'tienen sku 601062670???',
    'tienen sku 601062670!!!',
    'tienen sku 601062670...',
    'tienen sku 601062670??',
    'tienen sku 601062670!!',
    'tienen sku 601062670...?',
    'tienen sku 601062670?!!!',
    'tienen sku 601062670???!!!',
    'tienen sku 601062670...?',
    'tienen sku 601062670?'
  ],
  
  // Consultas muy largas
  longQueries: [
    'hola buenos dias necesito saber si tienen disponible el producto con sku 601062670 porque necesito hacer un pedido grande y quiero confirmar que tienen stock suficiente para mi pedido',
    'me podrias ayudar a encontrar informacion sobre productos disponibles en stock porque estoy buscando hacer una compra y necesito saber que tienen disponible antes de hacer mi pedido',
    'necesito informacion detallada sobre los productos que tienen disponibles especialmente aquellos que tienen buen stock porque estoy interesado en hacer una compra grande',
    'hola estoy buscando productos especificos y necesito saber si tienen disponibles en stock porque tengo que hacer un pedido urgente y necesito confirmar disponibilidad',
    'me gustaria saber que productos tienen disponibles y cuales tienen buen stock porque estoy interesado en hacer una compra y necesito esta informacion antes de proceder'
  ],
  
  // Consultas con números mal formateados
  malformedNumbers: [
    'tienen sku 601062670?',
    'tienen sku 601062670?',
    'tienen sku 601062670?',
    'tienen sku 601062670?',
    'tienen sku 601062670?'
  ],
  
  // Consultas de seguimiento sin contexto previo
  followUpNoContext: [
    'y ese?',
    'y ese producto?',
    'y ese otro?',
    'y los otros?',
    'y mas?',
    'y?',
    'que mas tienen?',
    'y los demas?',
    'y otros productos?',
    'y otras opciones?'
  ],
  
  // Consultas con emojis
  withEmojis: [
    'tienen sku 601062670? 😊',
    'tienen sku 601062670? 👍',
    'tienen sku 601062670? ❓',
    'tienen sku 601062670? 🤔',
    'tienen sku 601062670? 💰',
    'tienen sku 601062670? 🛒',
    'tienen sku 601062670? 📦',
    'tienen sku 601062670? ✅',
    'tienen sku 601062670? ❌',
    'tienen sku 601062670? 🎉'
  ],
  
  // Consultas en mayúsculas
  uppercase: [
    'TIENEN SKU 601062670?',
    'TIENEN SKU 601062670',
    'SKU 601062670',
    'TIENEN MOCHILAS?',
    'TIENEN STOCK?',
    'CUANTO STOCK TIENEN?',
    'QUE PRODUCTOS TIENEN?',
    'PRECIO?',
    'DISPONIBLE?',
    'HAY STOCK?'
  ],
  
  // Consultas en minúsculas sin puntuación
  lowercaseNoPunctuation: [
    'tienen sku 601062670',
    'tienen mochilas',
    'cuanto stock tienen',
    'que productos tienen',
    'precio',
    'disponible',
    'hay stock',
    'tienen disponible',
    'que tienen',
    'informacion'
  ],
  
  // Consultas con múltiples preguntas
  multipleQuestions: [
    'tienen sku 601062670? y cuanto cuesta?',
    'tienen stock? y cual es el precio?',
    'que productos tienen? y cuanto stock?',
    'tienen disponible? y cuanto cuesta?',
    'hay stock? y que precio tiene?',
    'tienen? precio? stock?',
    'disponible? cuanto? precio?',
    'que tienen? cuanto stock? que precio?',
    'productos? stock? precio?',
    'tienen? hay? disponible?'
  ],
  
  // Consultas con palabras clave mezcladas
  mixedKeywords: [
    'sku producto 601062670 stock disponible precio',
    'producto sku 601062670 disponible stock precio',
    'stock disponible producto sku 601062670 precio',
    'precio stock disponible producto sku 601062670',
    'disponible precio stock producto sku 601062670',
    'sku stock precio disponible 601062670 producto',
    'producto disponible stock precio sku 601062670',
    'stock precio disponible sku 601062670 producto',
    'precio disponible stock producto sku 601062670',
    'disponible stock precio producto sku 601062670'
  ],
  
  // Consultas con espacios extra
  extraSpaces: [
    'tienen   sku   601062670?',
    'tienen  sku  601062670?',
    'tienen sku  601062670 ?',
    'tienen  sku 601062670 ?',
    'tienen   sku   601062670  ?',
    'tienen    sku    601062670    ?',
    'tienen sku 601062670  ?',
    'tienen  sku  601062670  ?',
    'tienen   sku   601062670   ?',
    'tienen    sku    601062670     ?'
  ],
  
  // Consultas con caracteres Unicode
  unicode: [
    'tienen sku 601062670?',
    'tienen sku 601062670?',
    'tienen sku 601062670?',
    'tienen sku 601062670?',
    'tienen sku 601062670?'
  ],
  
  // Consultas de productos específicos conocidos
  specificProducts: [
    'tienen ABA1?',
    'tienen N35?',
    'tienen L88?',
    'tienen T60?',
    'tienen R02?',
    'tienen Gal?',
    'tienen AL02?',
    'tienen SU01?',
    'tienen E70?',
    'tienen E47?'
  ],
  
  // Consultas de combinaciones
  combinations: [
    'tienen sku 601062670 y cuanto cuesta?',
    'tienen mochilas y cuanto stock?',
    'sku 601062670 precio y stock?',
    'producto 601062670 disponible y precio?',
    'tienen stock del sku 601062670 y cuanto cuesta?',
    'hay disponible el sku 601062670 y cual es el precio?',
    'tienen el producto con sku 601062670 y cuanto stock tienen?',
    'disponible el sku 601062670 y que precio tiene?',
    'stock del sku 601062670 y cuanto vale?',
    'tienen sku 601062670 disponible y cuanto cuesta?'
  ]
}

// Generar lista de 500 preguntas variadas
function generateTestQuestions() {
  const questions = []
  const categories = Object.keys(questionTemplates)
  
  // Distribuir las 500 preguntas entre las categorías
  const questionsPerCategory = Math.floor(TOTAL_TESTS / categories.length)
  const remainder = TOTAL_TESTS % categories.length
  
  categories.forEach((category, index) => {
    const count = questionsPerCategory + (index < remainder ? 1 : 0)
    const templates = questionTemplates[category]
    
    for (let i = 0; i < count; i++) {
      const template = templates[i % templates.length]
      questions.push({
        category,
        question: template,
        testNumber: questions.length + 1
      })
    }
  })
  
  // Mezclar aleatoriamente
  for (let i = questions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [questions[i], questions[j]] = [questions[j], questions[i]]
  }
  
  return questions
}

async function initChat(userId) {
  try {
    const response = await axios.post(INIT_URL, { userId }, {
      timeout: REQUEST_TIMEOUT_MS,
      headers: { 'Content-Type': 'application/json' }
    })
    return response.data
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      throw new Error('No se pudo conectar al backend. Verifica que esté corriendo en ' + BASE_URL)
    }
    if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
      throw new Error('Timeout al inicializar chat')
    }
    if (error.response) {
      throw new Error(`HTTP ${error.response.status}: ${JSON.stringify(error.response.data)}`)
    }
    throw error
  }
}

async function sendMessage(userId, message) {
  try {
    const response = await axios.post(MESSAGE_URL, { userId, message }, {
      timeout: REQUEST_TIMEOUT_MS,
      headers: { 'Content-Type': 'application/json' }
    })
    return response.data
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      throw new Error('No se pudo conectar al backend')
    }
    if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
      throw new Error('Timeout al enviar mensaje')
    }
    if (error.response) {
      throw new Error(`HTTP ${error.response.status}: ${JSON.stringify(error.response.data)}`)
    }
    throw error
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Analizar respuesta para detectar problemas
function analyzeResponse(question, response, duration) {
  const issues = []
  const responseText = typeof response === 'string' ? response : (response.botMessage || response.message || JSON.stringify(response))
  const responseLower = responseText.toLowerCase()
  
  // Verificar timeout
  if (duration > REQUEST_TIMEOUT_MS - 10000) {
    issues.push({ type: 'PERFORMANCE', message: `Respuesta muy lenta: ${duration}ms` })
  }
  
  // Verificar errores en la respuesta
  if (responseLower.includes('error') || responseLower.includes('erróneo')) {
    issues.push({ type: 'ERROR', message: 'Respuesta contiene palabra "error"' })
  }
  
  // Verificar si la respuesta es muy genérica
  const genericResponses = ['no entiendo', 'no comprendo', 'no puedo ayudar', 'necesito más información']
  if (genericResponses.some(gr => responseLower.includes(gr))) {
    issues.push({ type: 'GENERIC', message: 'Respuesta muy genérica' })
  }
  
  // Verificar si pregunta por SKU pero no lo encuentra
  if (question.includes('sku') && question.match(/\d{6,}/) && !responseLower.includes('disponible') && !responseLower.includes('encontrado') && !responseLower.includes('stock')) {
    issues.push({ type: 'MISSING_SKU', message: 'Pregunta por SKU pero respuesta no menciona disponibilidad' })
  }
  
  // Verificar si la respuesta está vacía o es muy corta
  if (responseText.length < 10) {
    issues.push({ type: 'SHORT_RESPONSE', message: `Respuesta muy corta: ${responseText.length} caracteres` })
  }
  
  // Verificar si la respuesta es muy larga (posible error)
  if (responseText.length > 5000) {
    issues.push({ type: 'LONG_RESPONSE', message: `Respuesta muy larga: ${responseText.length} caracteres` })
  }
  
  // Verificar formato JSON si es objeto
  if (typeof response === 'object' && !response.botMessage && !response.message) {
    issues.push({ type: 'FORMAT', message: 'Respuesta en formato inesperado' })
  }
  
  return {
    success: issues.length === 0,
    issues,
    responseLength: responseText.length,
    duration
  }
}

async function runTest(testCase, userId) {
  const { question, category, testNumber } = testCase
  
  try {
    const startTime = Date.now()
    const response = await sendMessage(userId, question)
    const duration = Date.now() - startTime
    
    const analysis = analyzeResponse(question, response, duration)
    
    return {
      testNumber,
      category,
      question,
      success: analysis.success,
      duration,
      responseLength: analysis.responseLength,
      issues: analysis.issues,
      response: typeof response === 'string' ? response : (response.botMessage || response.message || JSON.stringify(response))
    }
  } catch (error) {
    return {
      testNumber,
      category,
      question,
      success: false,
      duration: 0,
      responseLength: 0,
      issues: [{ type: 'EXCEPTION', message: error.message }],
      response: null,
      error: error.message
    }
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗')
  console.log('║   BATERÍA DE PRUEBAS EXHAUSTIVA - STRESS TEST          ║')
  console.log('║   Simulando tester de IA de empresa grande            ║')
  console.log('╚════════════════════════════════════════════════════════╝')
  console.log()
  
  log(`🌐 Backend URL: ${BASE_URL}`, 'blue')
  log(`📋 Total de pruebas: ${TOTAL_TESTS}`, 'blue')
  log(`⏰ Timeout por request: ${REQUEST_TIMEOUT_MS}ms`, 'blue')
  log(`⏱️  Delay entre tests: ${DELAY_BETWEEN_TESTS}ms\n`, 'blue')
  
  const userId = `stress-test-${Date.now()}`
  log(`👤 User ID: ${userId}\n`, 'cyan')
  
  // Generar preguntas de prueba
  log('🔧 Generando casos de prueba...', 'yellow')
  const testCases = generateTestQuestions()
  log(`✅ ${testCases.length} casos de prueba generados\n`, 'green')
  
  // Inicializar chat
  try {
    log('🔄 Inicializando chat...', 'yellow')
    await initChat(userId)
    log('✅ Chat inicializado correctamente\n', 'green')
  } catch (error) {
    log(`❌ ERROR: ${error.message}`, 'red')
    log('\n❌ No se pudo inicializar el chat. Verifica que el backend esté corriendo.', 'red')
    process.exit(1)
  }
  
  // Ejecutar pruebas
  log('🚀 Iniciando batería de pruebas...\n', 'bright')
  
  const results = []
  const startTime = Date.now()
  let successCount = 0
  let failureCount = 0
  let issueCount = 0
  
  // Crear archivo de reporte
  const reportDir = join(__dirname, '../../reports')
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true })
  }
  const reportPath = join(reportDir, `stress-test-${Date.now()}.jsonl`)
  const reportStream = fs.createWriteStream(reportPath)
  
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i]
    const progress = `[${i + 1}/${testCases.length}]`
    
    // Mostrar progreso cada 50 tests
    if (i % 50 === 0 || i === testCases.length - 1) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      const rate = (i / elapsed).toFixed(1)
      const remaining = testCases.length - i
      const eta = remaining > 0 ? ((remaining / rate) / 60).toFixed(1) : 0
      
      log(`${progress} Progreso: ${((i / testCases.length) * 100).toFixed(1)}% | Éxitos: ${successCount} | Fallos: ${failureCount} | Problemas: ${issueCount} | Tiempo: ${elapsed}s | ETA: ${eta}min`, 'cyan')
    }
    
    const result = await runTest(testCase, userId)
    results.push(result)
    
    if (result.success) {
      successCount++
    } else {
      failureCount++
    }
    
    if (result.issues && result.issues.length > 0) {
      issueCount += result.issues.length
      
      // Mostrar problemas críticos inmediatamente
      if (result.issues.some(issue => issue.type === 'EXCEPTION' || issue.type === 'ERROR')) {
        log(`\n⚠️  ${progress} PROBLEMA CRÍTICO detectado:`, 'red')
        log(`   Pregunta: "${result.question}"`, 'yellow')
        log(`   Categoría: ${result.category}`, 'yellow')
        result.issues.forEach(issue => {
          log(`   - ${issue.type}: ${issue.message}`, 'red')
        })
        console.log()
      }
    }
    
    // Guardar en reporte
    reportStream.write(JSON.stringify(result) + '\n')
    
    // Delay entre tests
    if (i < testCases.length - 1) {
      await sleep(DELAY_BETWEEN_TESTS)
    }
  }
  
  reportStream.end()
  
  // Resumen final
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)
  const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length
  
  console.log('\n' + '='.repeat(80))
  log('RESUMEN FINAL DE PRUEBAS', 'bright')
  console.log('='.repeat(80) + '\n')
  
  log(`✅ Tests exitosos: ${successCount}/${TOTAL_TESTS} (${((successCount / TOTAL_TESTS) * 100).toFixed(1)}%)`, successCount === TOTAL_TESTS ? 'green' : 'yellow')
  log(`❌ Tests fallidos: ${failureCount}/${TOTAL_TESTS} (${((failureCount / TOTAL_TESTS) * 100).toFixed(1)}%)`, failureCount > 0 ? 'red' : 'green')
  log(`⚠️  Problemas detectados: ${issueCount}`, issueCount > 0 ? 'yellow' : 'green')
  log(`⏱️  Tiempo total: ${totalTime}s (${(totalTime / 60).toFixed(1)}min)`, 'blue')
  log(`📊 Duración promedio: ${avgDuration.toFixed(0)}ms`, 'blue')
  log(`📄 Reporte guardado en: ${reportPath}\n`, 'cyan')
  
  // Análisis por categoría
  const categoryStats = {}
  results.forEach(result => {
    if (!categoryStats[result.category]) {
      categoryStats[result.category] = { total: 0, success: 0, failures: 0, issues: 0 }
    }
    categoryStats[result.category].total++
    if (result.success) {
      categoryStats[result.category].success++
    } else {
      categoryStats[result.category].failures++
    }
    if (result.issues) {
      categoryStats[result.category].issues += result.issues.length
    }
  })
  
  console.log('📊 Estadísticas por categoría:')
  console.log('-'.repeat(80))
  Object.keys(categoryStats).sort().forEach(category => {
    const stats = categoryStats[category]
    const successRate = ((stats.success / stats.total) * 100).toFixed(1)
    log(`  ${category}:`, 'cyan')
    log(`    Total: ${stats.total} | Éxitos: ${stats.success} (${successRate}%) | Fallos: ${stats.failures} | Problemas: ${stats.issues}`, 
      stats.success === stats.total ? 'green' : stats.failures > 0 ? 'red' : 'yellow')
  })
  console.log()
  
  // Top problemas
  const allIssues = []
  results.forEach(result => {
    if (result.issues) {
      result.issues.forEach(issue => {
        allIssues.push({
          type: issue.type,
          message: issue.message,
          question: result.question,
          testNumber: result.testNumber
        })
      })
    }
  })
  
  if (allIssues.length > 0) {
    console.log('⚠️  TOP 20 PROBLEMAS DETECTADOS:')
    console.log('-'.repeat(80))
    const issueTypes = {}
    allIssues.forEach(issue => {
      if (!issueTypes[issue.type]) {
        issueTypes[issue.type] = []
      }
      issueTypes[issue.type].push(issue)
    })
    
    const sortedTypes = Object.keys(issueTypes).sort((a, b) => issueTypes[b].length - issueTypes[a].length)
    sortedTypes.slice(0, 20).forEach(type => {
      const issues = issueTypes[type]
      log(`  ${type}: ${issues.length} ocurrencia(s)`, 'red')
      issues.slice(0, 3).forEach(issue => {
        log(`    - Test #${issue.testNumber}: "${issue.question.substring(0, 60)}..."`, 'yellow')
      })
      if (issues.length > 3) {
        log(`    ... y ${issues.length - 3} más`, 'yellow')
      }
    })
    console.log()
  }
  
  // Tests con más problemas
  const problematicTests = results
    .filter(r => r.issues && r.issues.length > 0)
    .sort((a, b) => (b.issues?.length || 0) - (a.issues?.length || 0))
    .slice(0, 10)
  
  if (problematicTests.length > 0) {
    console.log('🔴 TOP 10 TESTS CON MÁS PROBLEMAS:')
    console.log('-'.repeat(80))
    problematicTests.forEach((test, index) => {
      log(`  ${index + 1}. Test #${test.testNumber} (${test.category})`, 'red')
      log(`     Pregunta: "${test.question}"`, 'yellow')
      log(`     Problemas: ${test.issues?.length || 0}`, 'red')
      test.issues?.forEach(issue => {
        log(`       - ${issue.type}: ${issue.message}`, 'yellow')
      })
      console.log()
    })
  }
  
  console.log('='.repeat(80))
  
  if (failureCount === 0 && issueCount === 0) {
    log('\n🎉 ¡TODAS LAS PRUEBAS PASARON SIN PROBLEMAS!', 'green')
  } else {
    log(`\n⚠️  Se detectaron ${failureCount} fallos y ${issueCount} problemas. Revisa el reporte para más detalles.`, 'yellow')
  }
  
  console.log(`\n📄 Reporte completo guardado en: ${reportPath}\n`)
}

// Ejecutar
main().catch(error => {
  log(`❌ ERROR FATAL: ${error.message}`, 'red')
  if (error.stack) {
    console.log(error.stack)
  }
  process.exit(1)
})
