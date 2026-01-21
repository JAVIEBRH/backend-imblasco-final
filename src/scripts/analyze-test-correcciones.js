/**
 * Script para analizar los resultados completos del test de correcciones
 */
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const reportsDir = join(__dirname, '../../reports')
const reportFiles = fs.readdirSync(reportsDir)
  .filter(f => f.startsWith('test-correcciones-') && f.endsWith('.jsonl'))
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
const criticalIssues = results.filter(r => r.issues && r.issues.some(i => i.type === 'CRITICAL' || i.type === 'ERROR')).length
const avgDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0) / total

// Estadísticas por categoría
const byCategory = {}
results.forEach(r => {
  if (!byCategory[r.category]) {
    byCategory[r.category] = { 
      total: 0, 
      success: 0, 
      failed: 0, 
      issues: 0,
      criticalIssues: 0,
      avgDuration: 0,
      tests: []
    }
  }
  byCategory[r.category].total++
  byCategory[r.category].tests.push(r)
  if (r.success) {
    byCategory[r.category].success++
  } else {
    byCategory[r.category].failed++
  }
  if (r.issues && r.issues.length > 0) {
    byCategory[r.category].issues++
    if (r.issues.some(i => i.type === 'CRITICAL' || i.type === 'ERROR')) {
      byCategory[r.category].criticalIssues++
    }
  }
})

// Calcular duración promedio por categoría
Object.keys(byCategory).forEach(cat => {
  const durations = byCategory[cat].tests.map(t => t.duration || 0).filter(d => d > 0)
  byCategory[cat].avgDuration = durations.length > 0 
    ? durations.reduce((sum, d) => sum + d, 0) / durations.length 
    : 0
})

// Encontrar fallos críticos
const criticalFailures = results.filter(r => 
  !r.success && r.issues && r.issues.some(i => i.type === 'CRITICAL' || i.type === 'ERROR')
)

// Encontrar errores de conexión/procesamiento
const connectionErrors = results.filter(r => 
  !r.success && r.error && (
    r.error.includes('ECONNREFUSED') || 
    r.error.includes('timeout') || 
    r.error.includes('Cannot read properties')
  )
)

console.log('╔════════════════════════════════════════════════════════╗')
console.log('║   ANÁLISIS COMPLETO - TEST DE CORRECCIONES           ║')
console.log('╚════════════════════════════════════════════════════════╝')
console.log()
console.log(`📄 Archivo: ${latestReport.name}`)
console.log(`🕐 Fecha: ${latestReport.mtime.toLocaleString()}`)
console.log()
console.log('📊 RESUMEN EJECUTIVO')
console.log('='.repeat(60))
console.log(`Total tests: ${total} / 750`)
console.log(`✅ Exitosos: ${success} (${((success / total) * 100).toFixed(1)}%)`)
console.log(`❌ Fallidos: ${failed} (${((failed / total) * 100).toFixed(1)}%)`)
console.log(`⚠️  Con problemas: ${withIssues} (${((withIssues / total) * 100).toFixed(1)}%)`)
console.log(`🔴 Críticos: ${criticalIssues}`)
console.log(`⏱️  Duración promedio: ${avgDuration.toFixed(0)}ms`)
console.log()

// Estadísticas por categoría
console.log('📋 ESTADÍSTICAS POR CATEGORÍA')
console.log('='.repeat(60))
Object.entries(byCategory)
  .sort((a, b) => b[1].total - a[1].total)
  .forEach(([category, stats]) => {
    const successRate = stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(1) : '0.0'
    const status = stats.failed === 0 && stats.issues === 0 ? '✅' : stats.failed > 0 ? '❌' : '⚠️'
    console.log(`${status} ${category.padEnd(25)}: ${stats.success}/${stats.total} (${successRate}%)`)
    console.log(`   ⏱️  Duración promedio: ${stats.avgDuration.toFixed(0)}ms`)
    if (stats.issues > 0) {
      console.log(`   ⚠️  Problemas: ${stats.issues} (${stats.criticalIssues} críticos)`)
    }
    console.log()
  })

// Análisis de errores
if (connectionErrors.length > 0) {
  console.log('🔴 ERRORES DE CONEXIÓN/PROCESAMIENTO')
  console.log('='.repeat(60))
  console.log(`Total: ${connectionErrors.length}`)
  const errorTypes = {}
  connectionErrors.forEach(r => {
    const errorType = r.error?.includes('ECONNREFUSED') ? 'Conexión rechazada' :
                     r.error?.includes('timeout') ? 'Timeout' :
                     r.error?.includes('Cannot read') ? 'Error de código' :
                     'Otro error'
    errorTypes[errorType] = (errorTypes[errorType] || 0) + 1
  })
  Object.entries(errorTypes).forEach(([type, count]) => {
    console.log(`   ${type}: ${count}`)
  })
  console.log()
}

// Fallos críticos
if (criticalFailures.length > 0) {
  console.log('🔴 FALLOS CRÍTICOS DETECTADOS')
  console.log('='.repeat(60))
  criticalFailures.slice(0, 10).forEach((test, idx) => {
    console.log(`${idx + 1}. Test #${test.testNumber} [${test.category}]`)
    console.log(`   Pregunta: "${test.question}"`)
    if (test.issues) {
      test.issues.forEach(issue => {
        if (issue.type === 'CRITICAL' || issue.type === 'ERROR') {
          console.log(`   🔴 ${issue.type}: ${issue.message}`)
        }
      })
    }
    if (test.error) {
      console.log(`   ❌ Error: ${test.error.substring(0, 100)}`)
    }
    console.log()
  })
  if (criticalFailures.length > 10) {
    console.log(`   ... y ${criticalFailures.length - 10} más`)
  }
  console.log()
}

// Tests más lentos
const slowTests = results
  .filter(r => r.duration > 10000)
  .sort((a, b) => b.duration - a.duration)
  .slice(0, 5)

if (slowTests.length > 0) {
  console.log('⏱️  TESTS MÁS LENTOS (>10 segundos)')
  console.log('='.repeat(60))
  slowTests.forEach((test, idx) => {
    console.log(`${idx + 1}. Test #${test.testNumber} [${test.category}]: ${(test.duration / 1000).toFixed(1)}s`)
    console.log(`   "${test.question.substring(0, 60)}..."`)
    console.log()
  })
}

// Resumen final
console.log('╔════════════════════════════════════════════════════════╗')
console.log('║                    CONCLUSIÓN                          ║')
console.log('╚════════════════════════════════════════════════════════╝')
console.log()

const successRate = ((success / total) * 100).toFixed(1)
if (successRate >= 95) {
  console.log('✅ EXCELENTE: Tasa de éxito >= 95%')
} else if (successRate >= 90) {
  console.log('✅ BUENO: Tasa de éxito >= 90%')
} else if (successRate >= 80) {
  console.log('⚠️  ACEPTABLE: Tasa de éxito >= 80%')
} else {
  console.log('❌ REQUIERE ATENCIÓN: Tasa de éxito < 80%')
}

console.log()
console.log(`Tasa de éxito: ${successRate}%`)
console.log(`Problemas críticos: ${criticalIssues}`)
console.log(`Errores de conexión: ${connectionErrors.length}`)
console.log()
