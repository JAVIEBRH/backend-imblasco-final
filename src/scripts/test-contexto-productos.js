/**
 * TEST: Validación de contexto con productos diferentes
 * Simula el escenario: llaveros → mochilas
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
const DELAY_BETWEEN_TESTS = 500

async function initChat(userId) {
  try {
    const response = await axios.post(INIT_URL, { userId }, {
      timeout: REQUEST_TIMEOUT_MS,
      headers: { 'Content-Type': 'application/json' }
    })
    return response.data ? userId : null
  } catch (error) {
    throw new Error(`Error inicializando chat: ${error.message}`)
  }
}

async function sendMessage(userId, message) {
  try {
    const startTime = Date.now()
    const response = await axios.post(MESSAGE_URL, { userId, message }, {
      timeout: REQUEST_TIMEOUT_MS,
      headers: { 'Content-Type': 'application/json' }
    })
    const duration = Date.now() - startTime
    
    const responseText = response.data?.response || response.data?.botMessage || response.data?.message || ''
    
    return {
      success: !!responseText,
      response: responseText,
      duration
    }
  } catch (error) {
    return {
      success: false,
      response: error.response?.data?.error || error.message,
      duration: 0,
      error: error.message
    }
  }
}

function detectIssues(question, response, expectedBehavior) {
  const issues = []
  if (!response || typeof response !== 'string') return issues
  
  const responseLower = response.toLowerCase()
  
  if (expectedBehavior === 'shouldSearch') {
    // Debe buscar y encontrar productos, NO decir "no encontré" sin buscar
    const saysNotFound = /no.*encontr[eoé]|no.*tengo.*informaci[oó]n|no.*disponible/i.test(response)
    const listsProducts = /encontr[eoé].*\d+.*producto|producto.*relacionado|mostrando/i.test(response)
    const asksForMoreInfo = /nombre completo|sku del producto|me lo puedes confirmar/i.test(response)
    
    if (saysNotFound && !listsProducts && !asksForMoreInfo) {
      issues.push({
        type: 'CRITICAL',
        message: 'Responde "no encontré" sin haber buscado realmente',
        expected: 'Debería buscar el producto y listar resultados o pedir más información',
        actual: response.substring(0, 200)
      })
    }
  }
  
  return issues
}

async function runTest() {
  console.log('╔════════════════════════════════════════════════════════╗')
  console.log('║   TEST: Contexto con productos diferentes             ║')
  console.log('╚════════════════════════════════════════════════════════╝')
  console.log()
  
  const timestamp = Date.now()
  const userId = `test-contexto-${timestamp}`
  
  try {
    await initChat(userId)
    console.log(`✅ Chat inicializado`)
  } catch (error) {
    console.log(`❌ Error: ${error.message}`)
    process.exit(1)
  }
  
  console.log()
  console.log('🧪 ESCENARIO:')
  console.log('   1. Usuario pregunta "tienen llaveros?" → sistema encuentra múltiples resultados')
  console.log('   2. Usuario pregunta "tienes mochilas?" → sistema DEBE buscar mochilas, no usar contexto de llaveros')
  console.log()
  
  const tests = [
    {
      step: 1,
      question: 'tienen llaveros?',
      expectedBehavior: 'shouldSearch',
      description: 'Buscar llaveros (establece contexto)'
    },
    {
      step: 2,
      question: 'tienes mochilas?',
      expectedBehavior: 'shouldSearch',
      description: 'Buscar mochilas (debe ignorar contexto de llaveros)'
    }
  ]
  
  let allPassed = true
  
  for (const test of tests) {
    console.log(`📝 Paso ${test.step}: "${test.question}"`)
    console.log(`   Esperado: ${test.description}`)
    
    try {
      const result = await sendMessage(userId, test.question)
      
      if (!result.success) {
        console.log(`   ❌ Error: ${result.error || 'Sin respuesta'}`)
        allPassed = false
      } else {
        const issues = detectIssues(test.question, result.response, test.expectedBehavior)
        
        if (issues.length > 0) {
          console.log(`   ❌ FALLO DETECTADO:`)
          issues.forEach(issue => {
            console.log(`      - ${issue.message}`)
            console.log(`        Esperado: ${issue.expected}`)
            console.log(`        Actual: ${issue.actual}...`)
          })
          allPassed = false
        } else {
          console.log(`   ✅ OK`)
          console.log(`   Respuesta: ${result.response.substring(0, 150)}...`)
        }
        
        console.log(`   Tiempo: ${result.duration}ms`)
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`)
      allPassed = false
    }
    
    console.log()
    
    if (test.step < tests.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_TESTS))
    }
  }
  
  console.log('╔════════════════════════════════════════════════════════╗')
  console.log('║                    RESULTADO                             ║')
  console.log('╚════════════════════════════════════════════════════════╝')
  console.log()
  
  if (allPassed) {
    console.log('✅ TEST PASADO: El sistema busca correctamente productos diferentes')
    console.log('   La corrección funciona correctamente.')
  } else {
    console.log('❌ TEST FALLIDO: El sistema aún tiene problemas con el contexto')
    console.log('   Revisar las correcciones aplicadas.')
  }
  
  console.log()
}

runTest().catch(error => {
  console.error(`❌ Error fatal: ${error.message}`)
  process.exit(1)
})
