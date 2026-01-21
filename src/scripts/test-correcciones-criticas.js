/**
 * TEST RÁPIDO - SOLO CATEGORÍAS CRÍTICAS
 * 
 * Enfocado en las categorías que fallaron por error 400:
 * - wrongAttribute: Validación de atributos en contexto
 * - contextCleared: Limpieza de contexto después de producto no encontrado
 * - variationWithContext: Variaciones con contexto válido
 * 
 * Uso: node src/scripts/test-correcciones-criticas.js
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
const DELAY_BETWEEN_TESTS = 100
const MAX_RETRIES = 3
const RETRY_DELAY = 2000

// Variables globales
let productsWithColors = []
let productsWithSizes = []

/**
 * Cargar productos necesarios (solo los que tienen atributos específicos)
 */
async function loadProducts() {
  console.log('📦 Cargando productos con atributos específicos...')
  
  try {
    const allProducts = await wordpressService.getAllProducts()
    const variableProducts = allProducts.filter(p => p.type === 'variable').slice(0, 50)
    
    for (const product of variableProducts) {
      try {
        const variations = await wordpressService.getProductVariations(product.id)
        if (variations && variations.length > 0) {
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
          
          if (hasColors && productsWithColors.length < 20) {
            productsWithColors.push(product)
          }
          if (hasSizes && productsWithSizes.length < 20) {
            productsWithSizes.push(product)
          }
        }
        await new Promise(resolve => setTimeout(resolve, 50))
      } catch (error) {
        // Continuar
      }
    }
    
    console.log(`✅ ${productsWithColors.length} productos con colores`)
    console.log(`✅ ${productsWithSizes.length} productos con tallas/tamaños`)
    return true
  } catch (error) {
    console.error(`❌ Error: ${error.message}`)
    return false
  }
}

/**
 * Detectar problemas
 */
function detectIssues(message, response, category) {
  const issues = []
  if (!response || typeof response !== 'string') return issues
  
  const responseLower = response.toLowerCase()
  
  if (category === 'wrongAttribute') {
    // Debe pedir producto, NO listar variaciones
    const isListingVariations = /(disponible|tiene|hay).*(talla|tamaño|color|variaci[oó]n)/i.test(response)
    const shouldAskForProduct = /(necesito|indiques|confirme|nombre completo|sku del producto|producto)/i.test(response)
    
    if (isListingVariations && !shouldAskForProduct) {
      issues.push({
        type: 'CRITICAL',
        message: 'Listando variaciones sin producto en contexto',
        expected: 'Debería pedir el nombre completo o SKU del producto',
        actual: response.substring(0, 100)
      })
    }
  }
  
  return issues
}

/**
 * Generar preguntas solo para categorías críticas
 */
function generateCriticalQuestions() {
  const questions = []
  
  // 1. wrongAttribute (30 tests)
  // Consultar producto con colores, luego preguntar por tallas (o viceversa)
  if (productsWithColors.length > 0 && productsWithSizes.length > 0) {
    for (let i = 0; i < 15; i++) {
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
    
    for (let i = 0; i < 15; i++) {
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
  
  // 2. contextCleared (20 tests)
  // Consultar producto inexistente seguido de variaciones
  const nonExistentSkus = ['M999999', 'K888888', 'X777777', 'Z666666', 'Y555555']
  for (let i = 0; i < 20; i++) {
    const sku = nonExistentSkus[i % nonExistentSkus.length]
    questions.push({ question: `tienen el producto ${sku}?`, category: 'productNotFound', testNumber: questions.length + 1 })
    const followUps = ['que colores tiene?', 'que tallas tiene?', 'que tamaños tiene?', 'que variaciones tiene?']
    questions.push({ 
      question: followUps[i % followUps.length], 
      category: 'contextCleared',
      testNumber: questions.length + 1 
    })
  }
  
  // 3. variationWithContext (20 tests)
  // Variaciones con contexto válido (DEBEN funcionar)
  if (productsWithColors.length > 0) {
    productsWithColors.slice(0, 20).forEach(product => {
      if (product.sku) {
        questions.push({ 
          question: `tienes el producto ${product.sku}?`, 
          category: 'setupContext',
          testNumber: questions.length + 1 
        })
        questions.push({ 
          question: 'que colores tiene?', // Esta DEBE funcionar
          category: 'variationWithContext',
          testNumber: questions.length + 1 
        })
      }
    })
  }
  
  return questions
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
      if (response.data) {
        return userId
      }
    } catch (error) {
      if (attempt === retries) {
        throw new Error(`Error inicializando chat: ${error.message}`)
      }
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
    }
  }
}

/**
 * Enviar mensaje
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
          response: 'Sin respuesta',
          duration,
          error: 'No response data'
        }
      }
    } catch (error) {
      if (attempt === retries) {
        return {
          success: false,
          response: error.response?.data?.error || error.message,
          duration: 0,
          error: error.message
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
  console.log('╔════════════════════════════════════════════════════════╗')
  console.log('║   TEST RÁPIDO - CATEGORÍAS CRÍTICAS                  ║')
  console.log('╚════════════════════════════════════════════════════════╝')
  console.log()
  
  // Cargar productos
  const loaded = await loadProducts()
  if (!loaded) {
    console.log('❌ No se pudieron cargar productos')
    process.exit(1)
  }
  
  // Generar preguntas
  const questions = generateCriticalQuestions()
  console.log(`✅ ${questions.length} preguntas generadas`)
  console.log()
  
  // Crear archivo de reporte
  const timestamp = Date.now()
  const reportFile = join(__dirname, `../../reports/test-criticas-${timestamp}.jsonl`)
  
  // Inicializar chat
  const userId = `test-criticas-${timestamp}`
  try {
    await initChat(userId)
    console.log(`✅ Chat inicializado`)
  } catch (error) {
    console.log(`❌ Error: ${error.message}`)
    process.exit(1)
  }
  
  console.log('🚀 Iniciando tests...\n')
  
  let successCount = 0
  let failureCount = 0
  let totalIssues = 0
  
  for (let i = 0; i < questions.length; i++) {
    const test = questions[i]
    const testNum = i + 1
    
    if (testNum % 10 === 0 || testNum === 1) {
      console.log(`📊 Progreso: ${testNum}/${questions.length} (${((testNum / questions.length) * 100).toFixed(1)}%)`)
    }
    
    try {
      const result = await sendMessage(userId, test.question)
      
      let issues = []
      if (result.success && result.response && typeof result.response === 'string') {
        issues = detectIssues(test.question, result.response, test.category)
      }
      const hasIssues = issues.length > 0
      
      if (result.success && !hasIssues) {
        successCount++
      } else {
        failureCount++
        if (hasIssues) {
          totalIssues += issues.length
          console.log(`⚠️  Test #${testNum} [${test.category}]: ${issues.length} problema(s)`)
        } else if (!result.success) {
          console.log(`❌ Test #${testNum} [${test.category}]: ${result.error || 'Error'}`)
        }
      }
      
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
      
      if (i < questions.length - 1) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_TESTS))
      }
      
    } catch (error) {
      failureCount++
      console.log(`❌ Test #${testNum} falló: ${error.message}`)
      
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
  
  // Resumen
  console.log('\n╔════════════════════════════════════════════════════════╗')
  console.log('║                    RESUMEN FINAL                       ║')
  console.log('╚════════════════════════════════════════════════════════╝')
  console.log()
  console.log(`Total tests: ${questions.length}`)
  console.log(`✅ Exitosos: ${successCount} (${((successCount / questions.length) * 100).toFixed(1)}%)`)
  console.log(`❌ Fallidos: ${failureCount} (${((failureCount / questions.length) * 100).toFixed(1)}%)`)
  console.log(`⚠️  Problemas detectados: ${totalIssues}`)
  console.log(`📄 Reporte: ${reportFile}`)
  console.log()
}

runTests().catch(error => {
  console.error(`❌ Error fatal: ${error.message}`)
  process.exit(1)
})
