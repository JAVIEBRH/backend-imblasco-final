/**
 * Analizar resultados del test de categorías críticas
 */
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const reportsDir = join(__dirname, '../../reports')
const reportFiles = fs.readdirSync(reportsDir)
  .filter(f => f.startsWith('test-criticas-') && f.endsWith('.jsonl'))
  .map(f => ({
    name: f,
    path: join(reportsDir, f),
    mtime: fs.statSync(join(reportsDir, f)).mtime
  }))
  .sort((a, b) => b.mtime - a.mtime)

if (reportFiles.length === 0) {
  console.log('❌ No se encontró archivo de reporte')
  process.exit(1)
}

const latestReport = reportFiles[0]
const lines = fs.readFileSync(latestReport.path, 'utf8')
  .split('\n')
  .filter(l => l.trim())

const results = lines.map(l => {
  try {
    return JSON.parse(l)
  } catch (e) {
    return null
  }
}).filter(r => r !== null)

const total = results.length
const success = results.filter(r => r.success).length
const failed = results.filter(r => !r.success).length
const withIssues = results.filter(r => r.issues && r.issues.length > 0).length

// Por categoría
const byCategory = {}
results.forEach(r => {
  if (!byCategory[r.category]) {
    byCategory[r.category] = { total: 0, success: 0, failed: 0, issues: 0 }
  }
  byCategory[r.category].total++
  if (r.success) {
    byCategory[r.category].success++
  } else {
    byCategory[r.category].failed++
  }
  if (r.issues && r.issues.length > 0) {
    byCategory[r.category].issues++
  }
})

console.log('╔════════════════════════════════════════════════════════╗')
console.log('║   ANÁLISIS - TEST CATEGORÍAS CRÍTICAS                ║')
console.log('╚════════════════════════════════════════════════════════╝')
console.log()
console.log(`📄 Archivo: ${latestReport.name}`)
console.log()
console.log('📊 RESUMEN GENERAL')
console.log('='.repeat(60))
console.log(`Total: ${total}`)
console.log(`✅ Exitosos: ${success} (${((success / total) * 100).toFixed(1)}%)`)
console.log(`❌ Fallidos: ${failed} (${((failed / total) * 100).toFixed(1)}%)`)
console.log(`⚠️  Con problemas: ${withIssues}`)
console.log()

console.log('📋 POR CATEGORÍA')
console.log('='.repeat(60))
Object.entries(byCategory)
  .sort((a, b) => b[1].total - a[1].total)
  .forEach(([category, stats]) => {
    const rate = ((stats.success / stats.total) * 100).toFixed(1)
    const status = stats.failed === 0 && stats.issues === 0 ? '✅' : stats.failed > 0 ? '❌' : '⚠️'
    console.log(`${status} ${category.padEnd(25)}: ${stats.success}/${stats.total} (${rate}%)`)
    if (stats.issues > 0) {
      console.log(`   ⚠️  Problemas: ${stats.issues}`)
    }
  })
console.log()

// Fallos críticos
const criticalFailures = results.filter(r => 
  !r.success && r.issues && r.issues.some(i => i.type === 'CRITICAL')
)

if (criticalFailures.length > 0) {
  console.log('🔴 FALLOS CRÍTICOS')
  console.log('='.repeat(60))
  criticalFailures.slice(0, 5).forEach((test, idx) => {
    console.log(`${idx + 1}. Test #${test.testNumber} [${test.category}]`)
    console.log(`   Pregunta: "${test.question}"`)
    if (test.issues) {
      test.issues.forEach(issue => {
        console.log(`   🔴 ${issue.type}: ${issue.message}`)
      })
    }
    console.log(`   Respuesta: ${test.response?.substring(0, 150)}...`)
    console.log()
  })
  if (criticalFailures.length > 5) {
    console.log(`   ... y ${criticalFailures.length - 5} más`)
  }
  console.log()
}

// Errores
const errors = results.filter(r => r.error && !r.success)
if (errors.length > 0) {
  console.log('❌ ERRORES')
  console.log('='.repeat(60))
  const errorTypes = {}
  errors.forEach(r => {
    const errorType = r.error?.includes('validarDatoNumerico') ? 'validarDatoNumerico' :
                     r.error?.includes('400') ? 'Error 400' :
                     r.error?.includes('ECONNREFUSED') ? 'Conexión' :
                     'Otro'
    errorTypes[errorType] = (errorTypes[errorType] || 0) + 1
  })
  Object.entries(errorTypes).forEach(([type, count]) => {
    console.log(`   ${type}: ${count}`)
  })
  console.log()
}

console.log('╔════════════════════════════════════════════════════════╗')
console.log('║                    CONCLUSIÓN                          ║')
console.log('╚════════════════════════════════════════════════════════╝')
console.log()

const successRate = ((success / total) * 100).toFixed(1)
if (successRate >= 90) {
  console.log('✅ BUENO: Tasa de éxito >= 90%')
} else if (successRate >= 80) {
  console.log('⚠️  ACEPTABLE: Tasa de éxito >= 80%')
} else {
  console.log('❌ REQUIERE ATENCIÓN: Tasa de éxito < 80%')
}

console.log()
console.log(`Tasa de éxito: ${successRate}%`)
console.log(`Problemas críticos: ${criticalFailures.length}`)
console.log()
