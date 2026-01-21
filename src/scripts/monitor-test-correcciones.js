/**
 * Script para monitorear el progreso del test de correcciones en tiempo real
 */
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Buscar el archivo de reporte más reciente
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
  console.log('⏳ Aún no se ha generado archivo de progreso...')
  console.log('   El test está cargando productos y variaciones.')
  process.exit(0)
}

const latestReport = reportFiles[0]

function readProgress() {
  try {
    if (!fs.existsSync(latestReport.path)) {
      return null
    }
    
    const lines = fs.readFileSync(latestReport.path, 'utf8')
      .split('\n')
      .filter(l => l.trim())

    if (lines.length === 0) {
      return null
    }

    const results = lines.map(l => {
      try {
        return JSON.parse(l)
      } catch (e) {
        return null
      }
    }).filter(r => r !== null)

    return results
  } catch (error) {
    return null
  }
}

function displayProgress() {
  const results = readProgress()
  
  if (!results || results.length === 0) {
    console.clear()
    console.log('╔════════════════════════════════════════════════════════╗')
    console.log('║   MONITOREO - TEST DE CORRECCIONES                    ║')
    console.log('╚════════════════════════════════════════════════════════╝')
    console.log()
    console.log('⏳ Esperando resultados...')
    return false
  }

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

  console.clear()
  console.log('╔════════════════════════════════════════════════════════╗')
  console.log('║   MONITOREO - TEST DE CORRECCIONES                     ║')
  console.log('╚════════════════════════════════════════════════════════╝')
  console.log()
  console.log(`📄 Archivo: ${latestReport.name}`)
  console.log(`🕐 Última actualización: ${latestReport.mtime.toLocaleString()}`)
  console.log()
  console.log('📊 ESTADÍSTICAS GENERALES')
  console.log('='.repeat(60))
  console.log(`Total completados: ${total} / 750 (${((total / 750) * 100).toFixed(1)}%)`)
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
      const successRate = ((stats.success / stats.total) * 100).toFixed(1)
      const status = stats.failed === 0 && stats.issues === 0 ? '✅' : stats.failed > 0 ? '❌' : '⚠️'
      console.log(`${status} ${category.padEnd(25)}: ${stats.success}/${stats.total} (${successRate}%) ${stats.issues > 0 ? `[${stats.issues} problemas]` : ''}`)
    })
  console.log()

  // Últimos 5 tests
  if (results.length > 0) {
    console.log('📋 ÚLTIMOS 5 TESTS')
    console.log('='.repeat(60))
    results.slice(-5).forEach((test) => {
      const status = test.success ? '✅' : '❌'
      const question = test.question.length > 50 
        ? test.question.substring(0, 50) + '...' 
        : test.question
      console.log(`${status} Test #${test.testNumber} [${test.category}]`)
      console.log(`   "${question}"`)
      console.log(`   Duración: ${test.duration}ms`)
      if (test.issues && test.issues.length > 0) {
        test.issues.forEach(issue => {
          console.log(`   ⚠️  ${issue.type}: ${issue.message}`)
        })
      }
      if (test.error) {
        console.log(`   ❌ Error: ${test.error.substring(0, 80)}...`)
      }
      console.log()
    })
  }

  // Estimación de tiempo restante
  if (total > 0 && avgDuration > 0 && total < 750) {
    const remaining = 750 - total
    const estimatedSeconds = (remaining * avgDuration) / 1000
    const estimatedMinutes = Math.floor(estimatedSeconds / 60)
    const estimatedSecs = Math.floor(estimatedSeconds % 60)
    console.log('⏱️  ESTIMACIÓN')
    console.log('='.repeat(60))
    console.log(`Tests restantes: ${remaining}`)
    console.log(`Tiempo estimado: ~${estimatedMinutes}m ${estimatedSecs}s`)
    console.log()
  }

  // Si terminó
  if (total >= 750) {
    console.log('🎉 TEST COMPLETADO')
    console.log('='.repeat(60))
    console.log(`Tasa de éxito final: ${((success / total) * 100).toFixed(1)}%`)
    console.log(`Problemas críticos: ${criticalIssues}`)
    console.log()
    return true
  }

  return false
}

// Monitorear cada 2 segundos
const interval = setInterval(() => {
  const finished = displayProgress()
  if (finished) {
    clearInterval(interval)
    console.log('✅ Monitoreo finalizado. Revisa el archivo de reporte para más detalles.')
    process.exit(0)
  }
}, 2000)

// Mostrar inmediatamente
displayProgress()
