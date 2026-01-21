/**
 * Batería de pruebas para verificar el contexto de variaciones
 * Prueba el flujo: consultar producto → preguntar por variaciones
 * Uso: node src/scripts/test-variations-context.js
 */
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import axios from 'axios'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const envPath = join(__dirname, '../../.env')
dotenv.config({ path: envPath })

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001'
const INIT_URL = `${BASE_URL}/api/chat/init`
const MESSAGE_URL = `${BASE_URL}/api/chat/message`
const REQUEST_TIMEOUT_MS = 60000

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

function logSection(title) {
  console.log('\n' + '='.repeat(80))
  log(title, 'bright')
  console.log('='.repeat(80) + '\n')
}

function logTest(testNumber, total, message) {
  log(`\n[TEST ${testNumber}/${total}]`, 'cyan')
  log(`Pregunta: "${message}"`, 'yellow')
}

function logResponse(response) {
  log(`Respuesta:`, 'green')
  console.log(response)
  console.log('')
}

function logError(error) {
  log(`❌ ERROR: ${error.message}`, 'red')
  if (error.stack) {
    console.log(error.stack)
  }
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
      throw new Error('No se pudo conectar al backend. Verifica que esté corriendo en ' + BASE_URL)
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

// Casos de prueba
// NOTA: Estos casos usan SKUs de ejemplo. Para usar productos variables reales:
// 1. Ejecutar: node src/scripts/find-variable-products.js
// 2. Reemplazar los SKUs aquí con los encontrados en ese script
const testCases = [
  {
    name: 'SKU de variación → Obtener producto padre y listar variaciones',
    steps: [
      { message: 'tienen sku 601062670?', expectedKeywords: ['disponible', 'SKU'] },
      { message: 'tienes en mas colores?', expectedKeywords: ['color', 'variacion', 'disponible'] },
      { message: 'del producto que te acabo de consultar, logicamente', expectedKeywords: ['color', 'variacion', 'disponible'] }
    ]
  },
  {
    name: 'SKU alfanumérico → Variaciones',
    steps: [
      { message: 'tienen ABA1?', expectedKeywords: ['Abanico', 'ABA1', 'disponible'] },
      { message: 'tienes en mas colores?', expectedKeywords: ['color', 'variacion', 'disponible'] }
    ]
  },
  {
    name: 'SKU de variación → Variaciones sin mencionar producto',
    steps: [
      { message: 'tienen sku 601062670?', expectedKeywords: ['disponible'] },
      { message: 'tienes en mas colores?', expectedKeywords: ['color', 'variacion'] }
    ]
  },
  {
    name: 'Producto variable → Pregunta directa de colores',
    steps: [
      { message: 'tienen sku 601062670?', expectedKeywords: ['disponible'] },
      { message: 'que colores tiene?', expectedKeywords: ['color', 'variacion'] }
    ]
  },
  {
    name: 'Producto variable → Pregunta de tallas',
    steps: [
      { message: 'tienen sku 601062670?', expectedKeywords: ['disponible'] },
      { message: 'tienes en mas tallas?', expectedKeywords: ['talla', 'variacion', 'tamaño'] }
    ]
  }
]

async function runTest(testCase, testNumber, total, userId) {
  logSection(`TEST ${testNumber}/${total}: ${testCase.name}`)
  
  const results = {
    testName: testCase.name,
    steps: [],
    success: true,
    errors: []
  }

  for (let i = 0; i < testCase.steps.length; i++) {
    const step = testCase.steps[i]
    logTest(i + 1, testCase.steps.length, step.message)

    try {
      await sleep(500) // Pequeña pausa entre mensajes
      
      const startTime = Date.now()
      const response = await sendMessage(userId, step.message)
      const duration = Date.now() - startTime

      const responseText = response.response || response.message || JSON.stringify(response)
      
      logResponse(responseText)
      log(`⏱️  Tiempo de respuesta: ${duration}ms`, 'blue')

      // Verificar keywords esperadas
      const responseLower = responseText.toLowerCase()
      const foundKeywords = step.expectedKeywords.filter(keyword => 
        responseLower.includes(keyword.toLowerCase())
      )

      const stepResult = {
        step: i + 1,
        message: step.message,
        response: responseText,
        duration,
        expectedKeywords: step.expectedKeywords,
        foundKeywords,
        success: foundKeywords.length > 0 || step.expectedKeywords.length === 0
      }

      results.steps.push(stepResult)

      if (!stepResult.success && step.expectedKeywords.length > 0) {
        log(`⚠️  Advertencia: No se encontraron keywords esperadas`, 'yellow')
        log(`   Esperadas: ${step.expectedKeywords.join(', ')}`, 'yellow')
        log(`   Encontradas: ${foundKeywords.join(', ') || 'ninguna'}`, 'yellow')
        results.success = false
      } else if (stepResult.success) {
        log(`✅ Keywords encontradas: ${foundKeywords.join(', ')}`, 'green')
      }

    } catch (error) {
      logError(error)
      results.steps.push({
        step: i + 1,
        message: step.message,
        error: error.message,
        success: false
      })
      results.success = false
      results.errors.push(error.message)
    }
  }

  return results
}

async function main() {
  logSection('BATERÍA DE PRUEBAS: CONTEXTO DE VARIACIONES')
  
  log(`🌐 Backend URL: ${BASE_URL}`, 'blue')
  log(`📋 Total de casos de prueba: ${testCases.length}`, 'blue')
  log(`⏰ Timeout por request: ${REQUEST_TIMEOUT_MS}ms\n`, 'blue')

  const userId = `test-variations-${Date.now()}`
  log(`👤 User ID: ${userId}\n`, 'cyan')

  // Inicializar chat
  try {
    log('🔄 Inicializando chat...', 'yellow')
    await initChat(userId)
    log('✅ Chat inicializado correctamente\n', 'green')
  } catch (error) {
    logError(error)
    log('\n❌ No se pudo inicializar el chat. Verifica que el backend esté corriendo.', 'red')
    process.exit(1)
  }

  const allResults = []

  // Ejecutar cada caso de prueba
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i]
    const result = await runTest(testCase, i + 1, testCases.length, userId)
    allResults.push(result)
    
    // Pausa entre tests
    if (i < testCases.length - 1) {
      await sleep(1000)
    }
  }

  // Resumen final
  logSection('RESUMEN DE RESULTADOS')
  
  const successful = allResults.filter(r => r.success).length
  const failed = allResults.filter(r => !r.success).length
  
  log(`✅ Tests exitosos: ${successful}/${testCases.length}`, successful === testCases.length ? 'green' : 'yellow')
  log(`❌ Tests fallidos: ${failed}/${testCases.length}`, failed > 0 ? 'red' : 'green')
  
  console.log('\n' + '-'.repeat(80))
  
  allResults.forEach((result, index) => {
    const status = result.success ? '✅' : '❌'
    log(`${status} Test ${index + 1}: ${result.testName}`, result.success ? 'green' : 'red')
    
    if (!result.success && result.errors.length > 0) {
      result.errors.forEach(error => {
        log(`   Error: ${error}`, 'red')
      })
    }
  })

  console.log('\n' + '='.repeat(80))
  
  if (failed === 0) {
    log('\n🎉 ¡TODAS LAS PRUEBAS PASARON EXITOSAMENTE!', 'green')
  } else {
    log(`\n⚠️  ${failed} prueba(s) fallaron. Revisa los detalles arriba.`, 'yellow')
  }

  console.log('')
}

// Ejecutar
main().catch(error => {
  logError(error)
  process.exit(1)
})
