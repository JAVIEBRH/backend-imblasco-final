/**
 * TEST ESPECÍFICO: Variaciones sin contexto
 * 
 * Este script prueba específicamente la corrección para el problema de
 * variaciones sin contexto (tallas/tamaños sin producto previo).
 * 
 * Genera ~100 pruebas enfocadas en:
 * - Preguntas sobre tallas sin producto en contexto
 * - Preguntas sobre tamaños sin producto en contexto
 * - Preguntas sobre colores sin producto en contexto
 * - Casos edge: variaciones con diferentes formulaciones
 */

import axios from 'axios'

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001'
const INIT_URL = `${BASE_URL}/api/chat/init`
const MESSAGE_URL = `${BASE_URL}/api/chat/message`

const TEST_USER_ID = 'test-variations-no-context'
const MAX_RETRIES = 3
const RETRY_DELAY = 1000
const REQUEST_TIMEOUT_MS = 90000

// Preguntas específicas para probar variaciones sin contexto
const VARIATION_QUESTIONS = [
  // Tallas
  'hay mas tallas?',
  'que tallas disponibles?',
  'tienes en mas tallas?',
  'que tallas tienen?',
  'hay otras tallas?',
  'disponible en mas tallas?',
  'cuales son las tallas?',
  'tienes tallas?',
  'hay tallas disponibles?',
  'que tallas hay?',
  
  // Tamaños
  'hay mas tamaños?',
  'que tamaños disponibles?',
  'tienes en mas tamaños?',
  'que tamaños tienen?',
  'hay otros tamaños?',
  'disponible en mas tamaños?',
  'cuales son los tamaños?',
  'tienes tamaños?',
  'hay tamaños disponibles?',
  'que tamaños hay?',
  
  // Colores (sin contexto)
  'hay mas colores?',
  'que colores disponibles?',
  'tienes en mas colores?',
  'que colores tienen?',
  'hay otros colores?',
  'disponible en mas colores?',
  'cuales son los colores?',
  'tienes colores?',
  'hay colores disponibles?',
  'que colores hay?',
  
  // Variaciones genéricas
  'hay mas variaciones?',
  'que variaciones disponibles?',
  'tienes en mas variaciones?',
  'que variaciones tienen?',
  'hay otras variaciones?',
  'disponible en mas variaciones?',
  'cuales son las variaciones?',
  'tienes variaciones?',
  'hay variaciones disponibles?',
  'que variaciones hay?',
  
  // Formulaciones alternativas
  'me puedes decir las tallas?',
  'dime que tallas hay',
  'necesito saber las tallas',
  'quiero ver las tallas',
  'muestrame las tallas',
  'informacion de tallas',
  'listado de tallas',
  'catalogo de tallas',
  'opciones de tallas',
  'variantes de tallas',
  
  // Con mayúsculas y signos
  'HAY MAS TALLAS?',
  '¿Que tallas disponibles?',
  'Tienes en mas tallas?',
  'Que tallas tienen?',
  'Hay otras tallas?',
  'Disponible en mas tallas?',
  'Cuales son las tallas?',
  'Tienes tallas?',
  'Hay tallas disponibles?',
  'Que tallas hay?',
  
  // Con contexto previo (deberían funcionar)
  'hola',
  'tienes el producto L39?',
  'que colores tiene?', // Esta debería funcionar porque hay contexto
  'tienes el producto M46?',
  'que tallas tiene?', // Esta debería funcionar porque hay contexto
  'tienes el producto K62?',
  'que tamaños tiene?', // Esta debería funcionar porque hay contexto
  
  // Casos edge
  'talla',
  'tallas',
  'tamaño',
  'tamaños',
  'color',
  'colores',
  'variacion',
  'variaciones',
  
  // Preguntas mixtas (deberían ser AMBIGUA)
  'tienes productos?',
  'que productos tienen?',
  'hay stock?',
  'precios?',
]

// Función para log con colores
function log(message, color = 'white') {
  const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    reset: '\x1b[0m'
  }
  console.log(`${colors[color]}${message}${colors.reset}`)
}

// Inicializar chat
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
      log(`✅ Chat inicializado correctamente`, 'green')
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

// Enviar mensaje
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

// Detectar problemas en la respuesta
function detectIssues(message, response, expectedBehavior) {
  const issues = []
  const responseLower = response.toLowerCase()
  
  // Verificar si es una pregunta sobre variaciones sin contexto
  const isVariationQuestion = /(talla|tamaño|color|variaci[oó]n)/i.test(message)
  const hasNoContext = !/(tienes|tiene|disponible|hay).*(producto|sku|nombre)/i.test(message)
  
  if (isVariationQuestion && hasNoContext) {
    // Debería pedir el producto/SKU
    const shouldAskForProduct = /(necesito|indiques|confirme|nombre completo|sku del producto|producto)/i.test(response)
    const isGenericError = /(error|lo siento|no puedo|no tengo|no se pudo|hubo un error)/i.test(response)
    
    if (isGenericError && !shouldAskForProduct) {
      issues.push({
        type: 'CRITICAL',
        message: 'Respuesta genérica de error en lugar de pedir producto/SKU',
        expected: 'Debería pedir el nombre completo o SKU del producto',
        actual: response.substring(0, 100)
      })
    }
    
    if (!shouldAskForProduct && !isGenericError) {
      // Verificar si está listando variaciones sin producto (incorrecto)
      const isListingVariations = /(disponible|tiene|hay).*(talla|tamaño|color|variaci[oó]n)/i.test(response)
      if (isListingVariations) {
        issues.push({
          type: 'CRITICAL',
          message: 'Listando variaciones sin producto en contexto',
          expected: 'Debería pedir el nombre completo o SKU del producto',
          actual: response.substring(0, 100)
        })
      }
    }
  }
  
  return issues
}

// Ejecutar pruebas
async function runTests() {
  log('\n╔════════════════════════════════════════════════════════╗', 'cyan')
  log('║  TEST: Variaciones sin contexto (Corrección)           ║', 'cyan')
  log('╚════════════════════════════════════════════════════════╝', 'cyan')
  log('')
  
  try {
    // Inicializar chat
    log('🔧 Inicializando chat...', 'blue')
    const userId = await initChat()
    log('')
    
    const results = []
    const totalTests = VARIATION_QUESTIONS.length
    let successCount = 0
    let failureCount = 0
    let criticalIssues = []
    
    log(`📊 Ejecutando ${totalTests} pruebas...`, 'blue')
    log('')
    
    for (let i = 0; i < totalTests; i++) {
      const question = VARIATION_QUESTIONS[i]
      const testNumber = i + 1
      
      try {
        log(`[${testNumber}/${totalTests}] Enviando: "${question}"`, 'white')
        
        const result = await sendMessage(userId, question)
        
        if (result.success) {
          const issues = detectIssues(question, result.response, 'should_ask_for_product')
          
          if (issues.length === 0) {
            log(`   ✅ Éxito (${result.duration}ms)`, 'green')
            log(`   Respuesta: ${result.response.substring(0, 80)}...`, 'gray')
            successCount++
          } else {
            log(`   ⚠️ Problemas detectados:`, 'yellow')
            issues.forEach(issue => {
              log(`      - ${issue.message}`, 'yellow')
              if (issue.type === 'CRITICAL') {
                criticalIssues.push({
                  question,
                  issue,
                  response: result.response
                })
              }
            })
            failureCount++
          }
          
          results.push({
            testNumber,
            question,
            success: result.success,
            response: result.response,
            duration: result.duration,
            issues
          })
        } else {
          log(`   ❌ Error: ${result.error}`, 'red')
          failureCount++
          results.push({
            testNumber,
            question,
            success: false,
            error: result.error,
            duration: result.duration
          })
        }
      } catch (error) {
        log(`   ❌ Excepción: ${error.message}`, 'red')
        failureCount++
        results.push({
          testNumber,
          question,
          success: false,
          error: error.message
        })
      }
      
      // Pequeña pausa entre pruebas
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    
    // Resumen
    log('')
    log('╔════════════════════════════════════════════════════════╗', 'cyan')
    log('║                    RESUMEN DE PRUEBAS                  ║', 'cyan')
    log('╚════════════════════════════════════════════════════════╝', 'cyan')
    log('')
    log(`Total de pruebas: ${totalTests}`, 'white')
    log(`✅ Éxitos: ${successCount} (${((successCount / totalTests) * 100).toFixed(1)}%)`, 'green')
    log(`❌ Fallos: ${failureCount} (${((failureCount / totalTests) * 100).toFixed(1)}%)`, 'red')
    log(`⚠️ Problemas críticos detectados: ${criticalIssues.length}`, criticalIssues.length > 0 ? 'red' : 'green')
    log('')
    
    if (criticalIssues.length > 0) {
      log('╔════════════════════════════════════════════════════════╗', 'red')
      log('║              PROBLEMAS CRÍTICOS DETECTADOS            ║', 'red')
      log('╚════════════════════════════════════════════════════════╝', 'red')
      log('')
      
      criticalIssues.forEach((item, index) => {
        log(`${index + 1}. Pregunta: "${item.question}"`, 'yellow')
        log(`   Problema: ${item.issue.message}`, 'red')
        log(`   Esperado: ${item.issue.expected}`, 'cyan')
        log(`   Actual: ${item.response.substring(0, 150)}...`, 'white')
        log('')
      })
    }
    
    // Guardar resultados
    const timestamp = Date.now()
    const reportFile = `reports/variations-no-context-test-${timestamp}.jsonl`
    const fs = await import('fs')
    const path = await import('path')
    
    const reportDir = path.dirname(reportFile)
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true })
    }
    
    const reportData = {
      timestamp: new Date().toISOString(),
      totalTests,
      successCount,
      failureCount,
      criticalIssues: criticalIssues.length,
      results
    }
    
    fs.writeFileSync(reportFile, JSON.stringify(reportData, null, 2))
    log(`📄 Reporte guardado en: ${reportFile}`, 'blue')
    
    return {
      success: criticalIssues.length === 0,
      totalTests,
      successCount,
      failureCount,
      criticalIssues: criticalIssues.length
    }
    
  } catch (error) {
    log(`❌ Error fatal en las pruebas: ${error.message}`, 'red')
    throw error
  }
}

// Ejecutar
runTests()
  .then(result => {
    if (result.success) {
      log('\n✅ Todas las pruebas pasaron correctamente!', 'green')
      process.exit(0)
    } else {
      log(`\n⚠️ Se detectaron ${result.criticalIssues} problemas críticos`, 'yellow')
      process.exit(1)
    }
  })
  .catch(error => {
    log(`\n❌ Error fatal: ${error.message}`, 'red')
    process.exit(1)
  })
