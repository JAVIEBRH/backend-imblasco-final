/**
 * TEST RÁPIDO - SOLO wrongAttribute
 * Enfocado en verificar la corrección de wrongAttribute
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
const REQUEST_TIMEOUT_MS = 60000
const DELAY_BETWEEN_TESTS = 50
const MAX_RETRIES = 3
const RETRY_DELAY = 1000

let productsWithColors = []
let productsWithSizes = []

async function loadProducts() {
  console.log('📦 Cargando productos...')
  try {
    const allProducts = await wordpressService.getAllProducts()
    const variableProducts = allProducts.filter(p => p.type === 'variable').slice(0, 30)
    
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
          
          if (hasColors && productsWithColors.length < 15) {
            productsWithColors.push(product)
          }
          if (hasSizes && productsWithSizes.length < 15) {
            productsWithSizes.push(product)
          }
        }
        await new Promise(resolve => setTimeout(resolve, 30))
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

function detectIssues(message, response, category) {
  const issues = []
  if (!response || typeof response !== 'string') return issues
  
  if (category === 'wrongAttribute') {
    // Debe pedir producto, NO listar variaciones ni decir "no disponible en [atributo] valor"
    const isListingVariations = /(disponible|tiene|hay).*(talla|tamaño|color|variaci[oó]n)/i.test(response)
    const saysNoAvailable = /no.*disponible.*en.*(talla|tamaño|color).*valor/i.test(response)
    const shouldAskForProduct = /(necesito|indiques|confirme|nombre completo|sku del producto|producto)/i.test(response)
    
    if ((isListingVariations || saysNoAvailable) && !shouldAskForProduct) {
      issues.push({
        type: 'CRITICAL',
        message: 'Listando variaciones o diciendo "no disponible" sin pedir producto',
        expected: 'Debería pedir el nombre completo o SKU del producto',
        actual: response.substring(0, 150)
      })
    }
  }
  
  return issues
}

function generateQuestions() {
  const questions = []
  
  // wrongAttribute: Consultar producto con colores, luego preguntar por tallas (o viceversa)
  if (productsWithColors.length > 0 && productsWithSizes.length > 0) {
    for (let i = 0; i < 10; i++) {
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
    
    for (let i = 0; i < 10; i++) {
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
  
  return questions
}

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

async function runTests() {
  console.log('╔════════════════════════════════════════════════════════╗')
  console.log('║   TEST RÁPIDO - wrongAttribute                        ║')
  console.log('╚════════════════════════════════════════════════════════╝')
  console.log()
  
  const loaded = await loadProducts()
  if (!loaded) {
    console.log('❌ No se pudieron cargar productos')
    process.exit(1)
  }
  
  const questions = generateQuestions()
  console.log(`✅ ${questions.length} preguntas generadas`)
  console.log()
  
  const timestamp = Date.now()
  const reportFile = join(__dirname, `../../reports/test-wrong-attr-quick-${timestamp}.jsonl`)
  
  const userId = `test-wrong-attr-${timestamp}`
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
  let wrongAttrSuccess = 0
  let wrongAttrFailed = 0
  
  for (let i = 0; i < questions.length; i++) {
    const test = questions[i]
    const testNum = i + 1
    
    if (testNum % 5 === 0 || testNum === 1) {
      const wrongAttrTotal = questions.filter(q => q.category === 'wrongAttribute').length
      const wrongAttrDone = questions.slice(0, i + 1).filter(q => q.category === 'wrongAttribute').length
      console.log(`📊 Progreso: ${testNum}/${questions.length} | wrongAttribute: ${wrongAttrDone}/${wrongAttrTotal}`)
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
        if (test.category === 'wrongAttribute') {
          wrongAttrSuccess++
        }
      } else {
        failureCount++
        if (test.category === 'wrongAttribute') {
          wrongAttrFailed++
          if (hasIssues) {
            console.log(`⚠️  Test #${testNum} [${test.category}]: ${issues[0].message}`)
          }
        }
      }
      
      const testResult = {
        testNumber: testNum,
        category: test.category,
        question: test.question,
        success: result.success && !hasIssues,
        response: result.response && typeof result.response === 'string' ? result.response.substring(0, 300) : (result.error || 'Sin respuesta'),
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
      if (test.category === 'wrongAttribute') {
        wrongAttrFailed++
      }
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
  
  const wrongAttrTotal = questions.filter(q => q.category === 'wrongAttribute').length
  const wrongAttrPercentage = wrongAttrTotal > 0 ? ((wrongAttrSuccess / wrongAttrTotal) * 100).toFixed(1) : 0
  
  console.log('\n╔════════════════════════════════════════════════════════╗')
  console.log('║                    RESUMEN FINAL                       ║')
  console.log('╚════════════════════════════════════════════════════════╝')
  console.log()
  console.log(`Total tests: ${questions.length}`)
  console.log(`✅ Exitosos: ${successCount} (${((successCount / questions.length) * 100).toFixed(1)}%)`)
  console.log(`❌ Fallidos: ${failureCount} (${((failureCount / questions.length) * 100).toFixed(1)}%)`)
  console.log()
  console.log(`🎯 wrongAttribute:`)
  console.log(`   ✅ Exitosos: ${wrongAttrSuccess}/${wrongAttrTotal} (${wrongAttrPercentage}%)`)
  console.log(`   ❌ Fallidos: ${wrongAttrFailed}`)
  console.log()
  
  if (parseFloat(wrongAttrPercentage) >= 95) {
    console.log('🎉 EXCELENTE: >= 95% - La corrección funcionó perfectamente!')
  } else if (parseFloat(wrongAttrPercentage) >= 90) {
    console.log('✅ BUENO: >= 90% - Mejora significativa')
  } else if (parseFloat(wrongAttrPercentage) >= 80) {
    console.log('⚠️  ACEPTABLE: >= 80% - Mejora moderada')
  } else {
    console.log('❌ REQUIERE MEJORA: < 80%')
  }
  
  console.log(`📄 Reporte: ${reportFile}`)
  console.log()
}

runTests().catch(error => {
  console.error(`❌ Error fatal: ${error.message}`)
  process.exit(1)
})
