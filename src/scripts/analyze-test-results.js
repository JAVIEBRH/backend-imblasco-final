/**
 * Script para analizar resultados de tests y generar informe detallado
 */
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const reportFile = process.argv[2] || 'reports/stress-test-extreme-1769018175987.jsonl'
const reportPath = join(__dirname, '../..', reportFile)

if (!fs.existsSync(reportPath)) {
  console.error(`❌ Archivo no encontrado: ${reportPath}`)
  process.exit(1)
}

const lines = fs.readFileSync(reportPath, 'utf8').split('\n').filter(l => l.trim())
const results = lines.map(l => JSON.parse(l))

console.log('╔════════════════════════════════════════════════════════╗')
console.log('║   INFORME DETALLADO - STRESS TEST EXTREMO              ║')
console.log('╚════════════════════════════════════════════════════════╝\n')

// Estadísticas generales
const total = results.length
const success = results.filter(r => r.success).length
const failed = results.filter(r => !r.success).length
const withIssues = results.filter(r => r.issues && r.issues.length > 0).length
const error400 = results.filter(r => r.error && r.error.includes('400')).length
const error500 = results.filter(r => r.error && r.error.includes('500')).length
const timeout = results.filter(r => r.error && (r.error.includes('timeout') || r.error.includes('TIMEOUT'))).length

console.log('📊 ESTADÍSTICAS GENERALES')
console.log('='.repeat(80))
console.log(`Total de pruebas: ${total}`)
console.log(`✅ Exitosas: ${success} (${((success / total) * 100).toFixed(1)}%)`)
console.log(`❌ Fallidas: ${failed} (${((failed / total) * 100).toFixed(1)}%)`)
console.log(`⚠️  Con problemas: ${withIssues} (${((withIssues / total) * 100).toFixed(1)}%)`)
console.log(`🔴 Errores 400: ${error400} (${((error400 / total) * 100).toFixed(1)}%)`)
console.log(`🔴 Errores 500: ${error500} (${((error500 / total) * 100).toFixed(1)}%)`)
console.log(`⏱️  Timeouts: ${timeout} (${((timeout / total) * 100).toFixed(1)}%)`)

const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / total
const maxDuration = Math.max(...results.map(r => r.duration))
const minDuration = Math.min(...results.map(r => r.duration))

console.log(`\n⏱️  DURACIÓN`)
console.log(`   Promedio: ${avgDuration.toFixed(0)}ms`)
console.log(`   Mínima: ${minDuration}ms`)
console.log(`   Máxima: ${maxDuration}ms`)

// Análisis de errores 400
if (error400 > 0) {
  console.log('\n🔴 ANÁLISIS DE ERRORES 400')
  console.log('='.repeat(80))
  const error400Tests = results.filter(r => r.error && r.error.includes('400'))
  const errorDetails = {}
  
  error400Tests.forEach(test => {
    const key = test.error || 'Unknown'
    if (!errorDetails[key]) {
      errorDetails[key] = []
    }
    errorDetails[key].push(test)
  })
  
  Object.keys(errorDetails).slice(0, 5).forEach(error => {
    console.log(`\n${error}: ${errorDetails[error].length} ocurrencia(s)`)
    errorDetails[error].slice(0, 3).forEach((test, idx) => {
      console.log(`  ${idx + 1}. Test #${test.testNumber} [${test.category}]`)
      console.log(`     Pregunta: "${test.question}"`)
    })
  })
}

// Tests exitosos (si los hay)
const successful = results.filter(r => r.success && r.response && r.response.length > 0)
if (successful.length > 0) {
  console.log('\n✅ TESTS EXITOSOS')
  console.log('='.repeat(80))
  successful.slice(0, 10).forEach((test, idx) => {
    console.log(`\n${idx + 1}. Test #${test.testNumber} [${test.category}]`)
    console.log(`   Pregunta: "${test.question}"`)
    console.log(`   Respuesta: ${test.response.substring(0, 150)}${test.response.length > 150 ? '...' : ''}`)
    console.log(`   Duración: ${test.duration}ms`)
  })
}

// Análisis por categoría
const categoryStats = {}
results.forEach(result => {
  if (!categoryStats[result.category]) {
    categoryStats[result.category] = {
      total: 0,
      success: 0,
      failures: 0,
      error400: 0,
      issues: 0,
      avgDuration: 0,
      totalDuration: 0
    }
  }
  categoryStats[result.category].total++
  if (result.success) {
    categoryStats[result.category].success++
  } else {
    categoryStats[result.category].failures++
  }
  if (result.error && result.error.includes('400')) {
    categoryStats[result.category].error400++
  }
  if (result.issues) {
    categoryStats[result.category].issues += result.issues.length
  }
  categoryStats[result.category].totalDuration += result.duration
})

Object.keys(categoryStats).forEach(cat => {
  categoryStats[cat].avgDuration = categoryStats[cat].totalDuration / categoryStats[cat].total
})

console.log('\n📋 ESTADÍSTICAS POR CATEGORÍA')
console.log('='.repeat(80))

Object.keys(categoryStats).sort().forEach(category => {
  const stats = categoryStats[category]
  const successRate = ((stats.success / stats.total) * 100).toFixed(1)
  
  console.log(`\n${category}:`)
  console.log(`  Total: ${stats.total}`)
  console.log(`  Éxitos: ${stats.success} (${successRate}%)`)
  console.log(`  Fallos: ${stats.failures}`)
  console.log(`  Errores 400: ${stats.error400}`)
  console.log(`  Problemas: ${stats.issues}`)
  console.log(`  Duración promedio: ${stats.avgDuration.toFixed(0)}ms`)
})

// Problemas detectados
const allIssues = results.flatMap(r => (r.issues || []).map(issue => ({
  ...issue,
  testNumber: r.testNumber,
  category: r.category,
  question: r.question
})))

if (allIssues.length > 0) {
  const issueTypes = {}
  allIssues.forEach(issue => {
    if (!issueTypes[issue.type]) {
      issueTypes[issue.type] = []
    }
    issueTypes[issue.type].push(issue)
  })
  
  console.log('\n🔍 PROBLEMAS DETECTADOS POR TIPO')
  console.log('='.repeat(80))
  
  Object.keys(issueTypes).sort((a, b) => issueTypes[b].length - issueTypes[a].length).forEach(type => {
    const issues = issueTypes[type]
    console.log(`\n${type}: ${issues.length} ocurrencia(s)`)
    issues.slice(0, 5).forEach((issue, idx) => {
      console.log(`  ${idx + 1}. Test #${issue.testNumber} [${issue.category}]`)
      console.log(`     Pregunta: "${issue.question.substring(0, 60)}${issue.question.length > 60 ? '...' : ''}"`)
      console.log(`     Mensaje: ${issue.message}`)
    })
  })
}

console.log('\n' + '='.repeat(80))
console.log('RESUMEN FINAL')
console.log('='.repeat(80))
console.log(`\n✅ Tests exitosos: ${success}/${total} (${((success / total) * 100).toFixed(1)}%)`)
console.log(`❌ Tests fallidos: ${failed}/${total} (${((failed / total) * 100).toFixed(1)}%)`)
console.log(`🔴 Errores 400: ${error400}/${total} (${((error400 / total) * 100).toFixed(1)}%)`)
console.log(`⚠️  Problemas detectados: ${allIssues.length}`)

if (error400 === total) {
  console.log('\n⚠️  PROBLEMA CRÍTICO: Todas las pruebas fallaron con error 400.')
  console.log('   Esto sugiere un problema con el formato de las peticiones HTTP.')
  console.log('   Verificar:')
  console.log('   1. Headers Content-Type correctos')
  console.log('   2. Formato del body (userId, message)')
  console.log('   3. Validación en el endpoint /api/chat/message')
}
