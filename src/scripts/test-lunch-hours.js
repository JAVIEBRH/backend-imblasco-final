/**
 * Batería de pruebas específica para preguntas sobre hora de almuerzo
 * Verifica que todas las variaciones respondan correctamente: NO se atiende durante la hora de almuerzo
 * Duración: ~15 minutos
 * Uso: node src/scripts/test-lunch-hours.js
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const envPath = join(__dirname, '../../.env')
dotenv.config({ path: envPath })

const BASE_URL = process.env.TEST_BACKEND_URL || 'http://localhost:3001/api/chat/message'
const DURATION_MINUTES = 15
const REQUEST_DELAY_MS = 2000 // 2 segundos entre requests para no saturar
const REQUEST_TIMEOUT_MS = 30000 // 30 segundos timeout
const USER_ID = `lunch-test-${Date.now()}`

// Batería completa de preguntas sobre hora de almuerzo (variaciones)
const LUNCH_QUESTIONS = [
  // Preguntas directas con "almuerzo"
  '¿atienden a la hora de almuerzo?',
  '¿atendemos a la hora de almuerzo?',
  '¿atendéis a la hora de almuerzo?',
  'atienden a la hora de almuerzo',
  'atendemos a la hora de almuerzo',
  '¿se atiende a la hora de almuerzo?',
  '¿se atiende en la hora de almuerzo?',
  '¿atienden en la hora de almuerzo?',
  '¿atendemos en la hora de almuerzo?',
  '¿atienden durante la hora de almuerzo?',
  '¿atendemos durante la hora de almuerzo?',
  '¿atienden durante el almuerzo?',
  '¿atendemos durante el almuerzo?',
  
  // Preguntas con "horario"
  '¿cuál es el horario de almuerzo?',
  'horario de almuerzo',
  '¿qué horario tienen en la hora de almuerzo?',
  '¿atienden en horario de almuerzo?',
  
  // Preguntas condicionales
  'si atienden a la hora de almuerzo',
  'si atendemos a la hora de almuerzo',
  'si se atiende a la hora de almuerzo',
  '¿y si atienden a la hora de almuerzo?',
  '¿y atendemos a la hora de almuerzo?',
  
  // Preguntas con "colación"
  '¿atienden a la hora de colación?',
  '¿atendemos a la hora de colación?',
  '¿atienden durante la colación?',
  'horario de colación',
  '¿cuál es el horario de colación?',
  '¿atienden en la hora de colación?',
  '¿atendemos en la hora de colación?',
  '¿se atiende durante la hora de colación?',
  'horario de atención durante la hora de colación',
  'atención durante colación',
  
  // Preguntas indirectas
  '¿qué pasa con la hora de almuerzo?',
  '¿funcionan en la hora de almuerzo?',
  '¿están abiertos en la hora de almuerzo?',
  '¿están disponibles en la hora de almuerzo?',
  '¿puedo contactarlos en la hora de almuerzo?',
  
  // Variaciones con mayúsculas/minúsculas
  '¿ATIENDEN A LA HORA DE ALMUERZO?',
  'Atienden A La Hora De Almuerzo',
  'atienden A LA HORA de almuerzo',
  
  // Preguntas con contexto adicional
  'hola, ¿atienden a la hora de almuerzo?',
  'buenos días, ¿atendemos a la hora de almuerzo?',
  'necesito saber si atienden a la hora de almuerzo',
  'quiero saber si atendemos a la hora de almuerzo',
  'me gustaría saber si atienden a la hora de almuerzo',
  
  // Preguntas con puntuación variada
  '¿atienden a la hora de almuerzo.',
  'atienden a la hora de almuerzo?',
  'atienden a la hora de almuerzo!',
  '¿atienden a la hora de almuerzo??',
  
  // Preguntas con palabras adicionales
  'por favor, ¿atienden a la hora de almuerzo?',
  'disculpe, ¿atendemos a la hora de almuerzo?',
  'una pregunta, ¿atienden a la hora de almuerzo?',
  
  // Variaciones con "hora" y "almuerzo" separados
  'hora de almuerzo, ¿atienden?',
  'almuerzo, ¿atendemos?',
  '¿en la hora de almuerzo atienden?',
  
  // Preguntas negativas (deben seguir respondiendo que NO)
  '¿no atienden a la hora de almuerzo?',
  '¿no atendemos a la hora de almuerzo?',
  'entiendo que no atienden a la hora de almuerzo',
]

// Palabras clave que indican respuesta CORRECTA (que NO se atiende)
const CORRECT_RESPONSE_KEYWORDS = [
  'no atendemos',
  'no se atiende',
  'no atienden',
  'no atendemos durante',
  'no se atiende durante',
  '14:00 y 15:30',
  'entre las 14:00',
  'hora de almuerzo',
  'no atendemos durante la hora',
]

// Palabras clave que indican respuesta INCORRECTA (que sí se atiende)
const INCORRECT_RESPONSE_KEYWORDS = [
  'sí atendemos',
  'si atendemos',
  'sí atienden',
  'si atienden',
  'sí se atiende',
  'si se atiende',
  'atendemos durante',
  'atienden durante',
  'sí, atendemos',
  'si, atendemos',
]

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function checkResponseIsCorrect(responseText) {
  if (!responseText || typeof responseText !== 'string') {
    return { isCorrect: false, reason: 'Respuesta vacía o inválida' }
  }
  
  const lowerResponse = responseText.toLowerCase()
  
  // Verificar que NO contenga palabras incorrectas
  const hasIncorrectKeywords = INCORRECT_RESPONSE_KEYWORDS.some(keyword => 
    lowerResponse.includes(keyword.toLowerCase())
  )
  
  if (hasIncorrectKeywords) {
    return { 
      isCorrect: false, 
      reason: 'Respuesta contiene palabras que indican que SÍ se atiende (INCORRECTO)' 
    }
  }
  
  // Verificar que contenga palabras correctas
  const hasCorrectKeywords = CORRECT_RESPONSE_KEYWORDS.some(keyword => 
    lowerResponse.includes(keyword.toLowerCase())
  )
  
  if (!hasCorrectKeywords) {
    return { 
      isCorrect: false, 
      reason: 'Respuesta no contiene palabras clave que indiquen que NO se atiende' 
    }
  }
  
  // Verificar que mencione el horario específico del almuerzo
  const mentionsLunchHours = lowerResponse.includes('14:00') && lowerResponse.includes('15:30')
  
  return { 
    isCorrect: true, 
    reason: mentionsLunchHours 
      ? 'Respuesta correcta: menciona que NO se atiende y el horario específico' 
      : 'Respuesta correcta: menciona que NO se atiende (pero no el horario específico)'
  }
}

async function sendMessage(message) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const startTime = Date.now()
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: USER_ID, message }),
      signal: controller.signal
    })
    clearTimeout(timeoutId)
    
    const responseTime = Date.now() - startTime
    
    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        responseTime
      }
    }
    
    const data = await response.json()
    const botMessage = data.botMessage || data.response || ''
    
    return {
      success: true,
      botMessage,
      responseTime,
      data
    }
  } catch (error) {
    clearTimeout(timeoutId)
    return {
      success: false,
      error: error.message || 'Error desconocido',
      responseTime: null
    }
  }
}

async function runTest() {
  console.log('\n' + '='.repeat(80))
  console.log('🧪 BATERÍA DE PRUEBAS: HORA DE ALMUERZO')
  console.log('='.repeat(80))
  console.log(`📅 Inicio: ${new Date().toLocaleString('es-CL')}`)
  console.log(`⏱️  Duración objetivo: ${DURATION_MINUTES} minutos`)
  console.log(`🔗 Backend URL: ${BASE_URL}`)
  console.log(`👤 User ID: ${USER_ID}`)
  console.log(`📝 Total de preguntas: ${LUNCH_QUESTIONS.length}`)
  console.log('='.repeat(80) + '\n')
  
  const results = []
  const startTime = Date.now()
  const endTime = startTime + (DURATION_MINUTES * 60 * 1000)
  
  let questionIndex = 0
  let correctCount = 0
  let incorrectCount = 0
  let errorCount = 0
  
  // Ciclo que se repite hasta completar 15 minutos
  while (Date.now() < endTime) {
    const question = LUNCH_QUESTIONS[questionIndex % LUNCH_QUESTIONS.length]
    questionIndex++
    
    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000)
    const remainingSeconds = Math.floor((endTime - Date.now()) / 1000)
    
    console.log(`\n[${elapsedSeconds}s / ${remainingSeconds}s restantes] Pregunta ${questionIndex}: "${question}"`)
    
    const result = await sendMessage(question)
    
    if (!result.success) {
      errorCount++
      console.log(`  ❌ ERROR: ${result.error}`)
      results.push({
        question,
        success: false,
        error: result.error,
        responseTime: result.responseTime
      })
    } else {
      const check = checkResponseIsCorrect(result.botMessage)
      
      if (check.isCorrect) {
        correctCount++
        console.log(`  ✅ CORRECTO: ${check.reason}`)
        console.log(`  ⏱️  Tiempo de respuesta: ${result.responseTime}ms`)
        console.log(`  💬 Respuesta: ${result.botMessage.substring(0, 150)}...`)
      } else {
        incorrectCount++
        console.log(`  ❌ INCORRECTO: ${check.reason}`)
        console.log(`  ⏱️  Tiempo de respuesta: ${result.responseTime}ms`)
        console.log(`  💬 Respuesta completa: ${result.botMessage}`)
      }
      
      results.push({
        question,
        success: true,
        isCorrect: check.isCorrect,
        reason: check.reason,
        botMessage: result.botMessage,
        responseTime: result.responseTime
      })
    }
    
    // Esperar antes de la siguiente pregunta
    await sleep(REQUEST_DELAY_MS)
  }
  
  // Generar reporte final
  const totalTime = Math.floor((Date.now() - startTime) / 1000)
  const totalQuestions = results.length
  const successRate = totalQuestions > 0 ? ((correctCount / totalQuestions) * 100).toFixed(2) : 0
  
  console.log('\n' + '='.repeat(80))
  console.log('📊 REPORTE FINAL')
  console.log('='.repeat(80))
  console.log(`⏱️  Tiempo total: ${Math.floor(totalTime / 60)} minutos ${totalTime % 60} segundos`)
  console.log(`📝 Total de preguntas: ${totalQuestions}`)
  console.log(`✅ Respuestas correctas: ${correctCount} (${successRate}%)`)
  console.log(`❌ Respuestas incorrectas: ${incorrectCount}`)
  console.log(`⚠️  Errores: ${errorCount}`)
  console.log('='.repeat(80))
  
  // Guardar reporte en archivo
  const reportPath = join(__dirname, `../../reports/lunch-hours-test-${Date.now()}.json`)
  const report = {
    timestamp: new Date().toISOString(),
    duration: `${Math.floor(totalTime / 60)} minutos ${totalTime % 60} segundos`,
    totalQuestions,
    correctCount,
    incorrectCount,
    errorCount,
    successRate: `${successRate}%`,
    results
  }
  
  // Asegurar que el directorio existe
  const reportsDir = join(__dirname, '../../reports')
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true })
  }
  
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8')
  console.log(`\n💾 Reporte guardado en: ${reportPath}`)
  
  // Mostrar preguntas que fallaron
  if (incorrectCount > 0) {
    console.log('\n' + '='.repeat(80))
    console.log('❌ PREGUNTAS QUE FALLARON:')
    console.log('='.repeat(80))
    results
      .filter(r => r.success && !r.isCorrect)
      .forEach((r, i) => {
        console.log(`\n${i + 1}. "${r.question}"`)
        console.log(`   Razón: ${r.reason}`)
        console.log(`   Respuesta: ${r.botMessage.substring(0, 200)}...`)
      })
  }
  
  console.log('\n✅ Pruebas completadas\n')
  
  // Exit code basado en resultados
  process.exit(incorrectCount > 0 || errorCount > 0 ? 1 : 0)
}

// Ejecutar pruebas
runTest().catch(error => {
  console.error('\n❌ Error fatal:', error)
  process.exit(1)
})
