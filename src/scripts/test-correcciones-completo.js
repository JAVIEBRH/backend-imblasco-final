/**
 * TEST COMPLETO DE CORRECCIONES IMPLEMENTADAS
 * 
 * Este script prueba específicamente todas las correcciones realizadas:
 * 1. Consultas de variaciones sin contexto (debe pedir producto)
 * 2. Limpieza de contexto cuando producto no se encuentra
 * 3. Palabras simples sin contexto (color, colores, talla, etc.)
 * 4. Validación de atributos en productos del contexto
 * 5. Manejo de errores mejorado
 * 
 * CARACTERÍSTICAS:
 * - 500 productos reales
 * - 750 consultas exhaustivas
 * - Manejo robusto de errores (no se congela)
 * - Guardado periódico de progreso
 * - Reintentos automáticos
 * - Timeouts configurados
 * - Logging detallado
 * 
 * Uso: node src/scripts/test-correcciones-completo.js
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
const REQUEST_TIMEOUT_MS = 90000
const TOTAL_TESTS = 750
const DELAY_BETWEEN_TESTS = 100
const MAX_RETRIES = 3
const RETRY_DELAY = 2000
const PROGRESS_SAVE_INTERVAL = 50

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
let productsWithColors = []
let productsWithSizes = []

/**
 * Cargar 500 productos reales
 */
async function loadRealProducts() {
  log('📦 Cargando 500 productos reales del sistema...', 'cyan')
  
  try {
    const allProducts = await wordpressService.getAllProducts()
    
    if (!allProducts || allProducts.length === 0) {
      log('⚠️ No se pudieron cargar productos reales', 'yellow')
      return false
    }
    
    realProducts = allProducts.slice(0, 500)
    log(`   ✅ ${realProducts.length} productos cargados`, 'green')
    
    // Extraer SKUs únicos
    const skuSet = new Set()
    realProducts.forEach(p => {
      if (p.sku && p.sku.trim().length > 0) {
        skuSet.add(p.sku.trim())
      }
    })
    realSkus = Array.from(skuSet).slice(0, 400)
    
    // Identificar productos variables
    realVariableProducts = realProducts.filter(p => p.type === 'variable')
    
    // Obtener SKUs de variaciones
    log('   Cargando variaciones de productos variables...', 'blue')
    const sampleSize = Math.min(100, realVariableProducts.length)
    for (const product of realVariableProducts.slice(0, sampleSize)) {
      try {
        const variations = await wordpressService.getProductVariations(product.id)
        if (variations && variations.length > 0) {
          variations.forEach(v => {
            if (v.sku && v.sku.trim().length > 0) {
              realVariationSkus.push({
                sku: v.sku.trim(),
                parentName: product.name,
                parentId: product.id,
                parent: product
              })
            }
          })
          
          // Categorizar productos por atributos
          const hasColors = variations.some(v => {
            return v.attributes && v.attributes.some(attr => {
              const attrName = (attr.name || '').toLowerCase()
              return attrName.includes('color') || attrName === 'pa_color'
            })
          })
          
          const hasSizes = variations.some(v => {
            return v.attributes && v.attributes.some(attr => {
              const attrName = (attr.name || '').toLowerCase()
              return attrName.includes('talla') || attrName.includes('tamaño') || 
                     attrName === 'pa_talla' || attrName === 'pa_tamaño'
            })
          })
          
          if (hasColors) productsWithColors.push(product)
          if (hasSizes) productsWithSizes.push(product)
        }
        await new Promise(resolve => setTimeout(resolve, 50))
      } catch (error) {
        // Continuar con el siguiente
      }
    }
    
    log(`✅ ${realSkus.length} SKUs únicos disponibles`, 'green')
    log(`✅ ${realVariableProducts.length} productos variables encontrados`, 'green')
    log(`✅ ${realVariationSkus.length} SKUs de variaciones encontrados`, 'green')
    log(`✅ ${productsWithColors.length} productos con colores identificados`, 'green')
    log(`✅ ${productsWithSizes.length} productos con tallas/tamaños identificados`, 'green')
    
    return true
  } catch (error) {
    log(`❌ Error cargando productos reales: ${error.message}`, 'red')
    return false
  }
}

/**
 * Detectar problemas en las respuestas
 */
function detectIssues(message, response, expectedBehavior) {
  const issues = []
  
  // Validar que response existe y es string
  if (!response || typeof response !== 'string') {
    return issues // Si no hay respuesta, no podemos detectar problemas
  }
  
  const responseLower = response.toLowerCase()
  
  // Verificar si es una pregunta sobre variaciones sin contexto
  const isVariationQuestion = /(talla|tamaño|color|variaci[oó]n)/i.test(message)
  const hasNoContext = !/(tienes|tiene|disponible|hay).*(producto|sku|nombre)/i.test(message)
  const isSimpleWord = ['color', 'colores', 'talla', 'tallas', 'tamaño', 'tamaños', 'variacion', 'variaciones']
    .includes(message.toLowerCase().trim())
  
  if (isVariationQuestion && (hasNoContext || isSimpleWord)) {
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

/**
 * Generar 750 preguntas enfocadas en las correcciones
 */
function generateTestQuestions() {
  const questions = []
  
  // ========== CORRECCIÓN 1: VARIACIONES SIN CONTEXTO (150 preguntas) ==========
  // Estas deben pedir producto, NO dar error genérico
  const variationNoContextQuestions = [
    // Colores sin contexto
    'tienes en mas colores?', 'tienes en otros colores?', 'que colores disponibles?',
    'hay mas colores?', 'que colores tiene?', 'hay otros colores?',
    'disponible en mas colores?', 'que colores hay?', 'tienes colores?',
    'hay colores disponibles?', 'color', 'colores',
    
    // Tallas sin contexto
    'tienes en mas tallas?', 'que tallas disponibles?', 'hay mas tallas?',
    'que tallas tiene?', 'hay otras tallas?', 'disponible en mas tallas?',
    'que tallas hay?', 'tienes tallas?', 'hay tallas disponibles?',
    'talla', 'tallas',
    
    // Tamaños sin contexto
    'tienes en mas tamaños?', 'que tamaños disponibles?', 'hay mas tamaños?',
    'que tamaños tiene?', 'hay otros tamaños?', 'disponible en mas tamaños?',
    'que tamaños hay?', 'tienes tamaños?', 'hay tamaños disponibles?',
    'tamaño', 'tamaños',
    
    // Variaciones genéricas sin contexto
    'que variaciones tiene?', 'tienes variaciones?', 'hay variaciones?',
    'que variaciones disponibles?', 'tienes mas variaciones?',
    'variacion', 'variaciones',
    
    // Formulaciones alternativas
    'y en otros colores?', 'y mas tallas?', 'y otros tamaños?',
    'y variaciones?', 'y mas opciones?', 'y otros modelos?'
  ]
  
  // Repetir variaciones para asegurar cobertura
  for (let i = 0; i < 150; i++) {
    const q = variationNoContextQuestions[i % variationNoContextQuestions.length]
    questions.push({ question: q, category: 'variationNoContext', testNumber: questions.length + 1 })
  }
  
  // ========== CORRECCIÓN 2: LIMPIEZA DE CONTEXTO (100 preguntas) ==========
  // Consultar producto inexistente seguido de variaciones (debe limpiar contexto)
  const nonExistentSkus = ['M999999', 'K888888', 'X777777', 'Z666666', 'Y555555']
  for (let i = 0; i < 100; i++) {
    const sku = nonExistentSkus[i % nonExistentSkus.length]
    if (i % 2 === 0) {
      questions.push({ question: `tienen el producto ${sku}?`, category: 'productNotFound', testNumber: questions.length + 1 })
    } else {
      // Seguimiento después de producto no encontrado (debe pedir producto, no usar contexto anterior)
      const followUps = ['que colores tiene?', 'que tallas tiene?', 'que tamaños tiene?', 'que variaciones tiene?']
      questions.push({ 
        question: followUps[(i / 2) % followUps.length], 
        category: 'contextCleared',
        testNumber: questions.length + 1 
      })
    }
  }
  
  // ========== CORRECCIÓN 3: VALIDACIÓN DE ATRIBUTOS EN CONTEXTO (100 preguntas) ==========
  // Consultar producto con colores, luego preguntar por tallas (o viceversa)
  // Debe detectar que el producto no tiene ese atributo y pedir producto específico
  if (productsWithColors.length > 0 && productsWithSizes.length > 0) {
    // Casos donde se pregunta por atributo que NO tiene el producto en contexto
    for (let i = 0; i < 50; i++) {
      const colorProduct = productsWithColors[i % productsWithColors.length]
      if (colorProduct.sku) {
        questions.push({ 
          question: `tienes el producto ${colorProduct.sku}?`, 
          category: 'setupContext',
          testNumber: questions.length + 1 
        })
        questions.push({ 
          question: 'que tallas tiene?', // Producto con colores, no tallas
          category: 'wrongAttribute',
          testNumber: questions.length + 1 
        })
      }
    }
    
    for (let i = 0; i < 50; i++) {
      const sizeProduct = productsWithSizes[i % productsWithSizes.length]
      if (sizeProduct.sku) {
        questions.push({ 
          question: `tienes el producto ${sizeProduct.sku}?`, 
          category: 'setupContext',
          testNumber: questions.length + 1 
        })
        questions.push({ 
          question: 'que colores tiene?', // Producto con tallas, no colores
          category: 'wrongAttribute',
          testNumber: questions.length + 1 
        })
      }
    }
  }
  
  // ========== CORRECCIÓN 4: SKUs REALES Y VARIACIONES (200 preguntas) ==========
  // Tests normales para asegurar que no rompimos nada
  realSkus.slice(0, 100).forEach(sku => {
    questions.push(
      { question: `tienen sku ${sku}?`, category: 'skuReal', testNumber: questions.length + 1 },
      { question: `tienen ${sku}?`, category: 'skuReal', testNumber: questions.length + 1 }
    )
  })
  
  // Variaciones reales
  realVariationSkus.slice(0, 50).forEach(({ sku, parentName }) => {
    questions.push(
      { question: `tienen sku ${sku}?`, category: 'skuVariation', testNumber: questions.length + 1 },
      { question: `tienen ${sku}?`, category: 'skuVariation', testNumber: questions.length + 1 },
      { question: `que colores tiene ${parentName}?`, category: 'variationWithContext', testNumber: questions.length + 1 },
      { question: `que tallas tiene ${parentName}?`, category: 'variationWithContext', testNumber: questions.length + 1 }
    )
  })
  
  // ========== CORRECCIÓN 5: VARIACIONES CON CONTEXTO VÁLIDO (100 preguntas) ==========
  // Estas DEBEN funcionar (producto en contexto válido)
  if (productsWithColors.length > 0) {
    productsWithColors.slice(0, 50).forEach(product => {
      if (product.sku) {
        questions.push({ 
          question: `tienes el producto ${product.sku}?`, 
          category: 'setupContext',
          testNumber: questions.length + 1 
        })
        questions.push({ 
          question: 'que colores tiene?', // Esta DEBE funcionar
          category: 'variationValidContext',
          testNumber: questions.length + 1 
        })
      }
    })
  }
  
  // ========== OTROS CASOS DE BORDE (100 preguntas) ==========
  // Consultas ambiguas, seguimientos, etc.
  for (let i = 0; i < 100; i++) {
    questions.push(
      { question: 'hola', category: 'greeting', testNumber: questions.length + 1 },
      { question: 'que tienen?', category: 'ambiguous', testNumber: questions.length + 1 },
      { question: 'y ese?', category: 'followUp', testNumber: questions.length + 1 },
      { question: 'cuanto cuesta?', category: 'priceNoContext', testNumber: questions.length + 1 }
    )
  }
  
  // Limitar a 750 preguntas
  return questions.slice(0, TOTAL_TESTS)
}

/**
 * Inicializar chat
 */
async function initChat(userId, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.post(INIT_URL, { userId }, {
        timeout: REQUEST_TIMEOUT_MS,
        headers: { 'Content-Type': 'application/json' }
      })
      
      // El endpoint init devuelve el userId o sessionId, pero para message necesitamos userId
      if (response.data) {
        return userId // Retornar userId para usar en sendMessage
      }
    } catch (error) {
      if (error.response) {
        // Error con respuesta del servidor
        log(`⚠️  Error ${error.response.status} en initChat (intento ${attempt}/${retries}): ${JSON.stringify(error.response.data)}`, 'yellow')
      } else if (error.request) {
        // Error de conexión
        log(`⚠️  Error de conexión en initChat (intento ${attempt}/${retries}): ${error.message}`, 'yellow')
      } else {
        log(`⚠️  Error en initChat (intento ${attempt}/${retries}): ${error.message}`, 'yellow')
      }
      
      if (attempt === retries) {
        throw new Error(`Error inicializando chat después de ${retries} intentos: ${error.message}`)
      }
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
    }
  }
}

/**
 * Enviar mensaje con reintentos
 * NOTA: El endpoint espera userId, NO sessionId
 */
async function sendMessage(userId, message, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const startTime = Date.now()
      const response = await axios.post(MESSAGE_URL, { userId, message }, {
        timeout: REQUEST_TIMEOUT_MS,
        headers: { 'Content-Type': 'application/json' }
      })
      const duration = Date.now() - startTime
      
      // El endpoint puede devolver response, botMessage o message
      const responseText = response.data?.response || response.data?.botMessage || response.data?.message || ''
      
      if (responseText) {
        return {
          success: true,
          response: responseText,
          duration
        }
      } else {
        return {
          success: false,
          response: 'Respuesta sin datos',
          duration,
          error: 'No response data'
        }
      }
    } catch (error) {
      if (error.response) {
        // Error con respuesta del servidor (400, 500, etc.)
        const errorDetails = {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
          message: error.message
        }
        
        if (attempt === retries) {
          log(`❌ Error ${error.response.status} en sendMessage después de ${retries} intentos: ${JSON.stringify(errorDetails)}`, 'red')
          return {
            success: false,
            response: error.response.data?.error || error.response.data?.message || error.message,
            duration: 0,
            error: `HTTP ${error.response.status}: ${JSON.stringify(errorDetails)}`
          }
        } else {
          log(`⚠️  Error ${error.response.status} en sendMessage (intento ${attempt}/${retries}), reintentando...`, 'yellow')
        }
      } else if (error.request) {
        // Error de conexión
        if (attempt === retries) {
          log(`❌ Error de conexión en sendMessage después de ${retries} intentos: ${error.message}`, 'red')
          return {
            success: false,
            response: 'Error de conexión con el servidor',
            duration: 0,
            error: error.message
          }
        }
      } else {
        if (attempt === retries) {
          return {
            success: false,
            response: error.message,
            duration: 0,
            error: error.message
          }
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
    }
  }
}

/**
 * Ejecutar tests
 */
async function runTests() {
  log('╔════════════════════════════════════════════════════════╗', 'cyan')
  log('║   TEST COMPLETO DE CORRECCIONES                       ║', 'cyan')
  log('╚════════════════════════════════════════════════════════╝', 'cyan')
  log('', 'reset')
  
  // Cargar productos
  const productsLoaded = await loadRealProducts()
  if (!productsLoaded) {
    log('❌ No se pudieron cargar productos. Abortando.', 'red')
    process.exit(1)
  }
  
  // Generar preguntas
  log('📝 Generando preguntas de prueba...', 'cyan')
  const questions = generateTestQuestions()
  log(`✅ ${questions.length} preguntas generadas`, 'green')
  log('', 'reset')
  
  // Crear archivo de reporte
  const timestamp = Date.now()
  const reportFile = join(__dirname, `../../reports/test-correcciones-${timestamp}.jsonl`)
  
  // Inicializar chat
  const userId = `test-correcciones-${timestamp}`
  try {
    await initChat(userId)
    log(`✅ Chat inicializado para userId: ${userId}`, 'green')
  } catch (error) {
    log(`❌ Error inicializando chat: ${error.message}`, 'red')
    process.exit(1)
  }
  
  log('', 'reset')
  log('🚀 Iniciando tests...', 'bright')
  log('', 'reset')
  
  let successCount = 0
  let failureCount = 0
  let totalIssues = 0
  
  for (let i = 0; i < questions.length; i++) {
    const test = questions[i]
    const testNum = i + 1
    
    // Log progreso
    if (testNum % 10 === 0 || testNum === 1) {
      log(`📊 Progreso: ${testNum}/${questions.length} (${((testNum / questions.length) * 100).toFixed(1)}%)`, 'blue')
    }
    
    try {
      const result = await sendMessage(userId, test.question)
      
      // Detectar problemas solo si hay respuesta válida
      let issues = []
      let hasIssues = false
      
      if (result.success && result.response && typeof result.response === 'string') {
        issues = detectIssues(test.question, result.response, test.category)
        hasIssues = issues.length > 0
      }
      
      if (result.success && !hasIssues) {
        successCount++
      } else {
        failureCount++
        if (hasIssues) {
          totalIssues += issues.length
          log(`⚠️  Test #${testNum} [${test.category}]: ${issues.length} problema(s)`, 'yellow')
          issues.forEach(issue => {
            log(`   ${issue.type}: ${issue.message}`, 'yellow')
          })
        } else if (!result.success) {
          log(`❌ Test #${testNum} [${test.category}]: ${result.error || 'Error desconocido'}`, 'red')
        }
      }
      
      // Guardar resultado
      const testResult = {
        testNumber: testNum,
        category: test.category,
        question: test.question,
        success: result.success && !hasIssues,
        response: result.response && typeof result.response === 'string' ? result.response.substring(0, 500) : (result.error || 'Sin respuesta'),
        duration: result.duration,
        issues: issues,
        error: result.error || null
      }
      
      fs.appendFileSync(reportFile, JSON.stringify(testResult) + '\n')
      
      // Guardar progreso periódicamente
      if (testNum % PROGRESS_SAVE_INTERVAL === 0) {
        log(`💾 Progreso guardado: ${testNum} tests completados`, 'cyan')
      }
      
      // Delay entre tests
      if (i < questions.length - 1) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_TESTS))
      }
      
    } catch (error) {
      failureCount++
      log(`❌ Test #${testNum} falló con excepción: ${error.message}`, 'red')
      
      const testResult = {
        testNumber: testNum,
        category: test.category,
        question: test.question,
        success: false,
        response: null,
        duration: 0,
        issues: [],
        error: error.message
      }
      
      fs.appendFileSync(reportFile, JSON.stringify(testResult) + '\n')
    }
  }
  
  // Resumen final
  log('', 'reset')
  log('╔════════════════════════════════════════════════════════╗', 'cyan')
  log('║                    RESUMEN FINAL                       ║', 'cyan')
  log('╚════════════════════════════════════════════════════════╝', 'cyan')
  log('', 'reset')
  log(`Total tests: ${questions.length}`, 'bright')
  log(`✅ Exitosos: ${successCount} (${((successCount / questions.length) * 100).toFixed(1)}%)`, 'green')
  log(`❌ Fallidos: ${failureCount} (${((failureCount / questions.length) * 100).toFixed(1)}%)`, 'red')
  log(`⚠️  Problemas detectados: ${totalIssues}`, 'yellow')
  log(`📄 Reporte guardado en: ${reportFile}`, 'cyan')
  log('', 'reset')
}

// Ejecutar
runTests().catch(error => {
  log(`❌ Error fatal: ${error.message}`, 'red')
  console.error(error)
  process.exit(1)
})
