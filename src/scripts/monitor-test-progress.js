/**
 * Script para monitorear el progreso del stress test en tiempo real
 */
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Buscar el archivo de reporte más reciente
const reportsDir = join(__dirname, '../../reports')
const reportFiles = fs.readdirSync(reportsDir)
  .filter(f => f.startsWith('stress-test-extreme-v2-') && f.endsWith('.jsonl'))
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
const lines = fs.readFileSync(latestReport.path, 'utf8')
  .split('\n')
  .filter(l => l.trim())

if (lines.length === 0) {
  console.log('⏳ El archivo de reporte está vacío...')
  process.exit(0)
}

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

console.log('╔════════════════════════════════════════════════════════╗')
console.log('║   PROGRESO ACTUAL - STRESS TEST v2                      ║')
console.log('╚════════════════════════════════════════════════════════╝')
console.log()
console.log(`📄 Archivo: ${latestReport.name}`)
console.log(`🕐 Última actualización: ${latestReport.mtime.toLocaleString()}`)
console.log()
console.log('📊 ESTADÍSTICAS')
console.log('='.repeat(60))
console.log(`Total completados: ${total} / 700 (${((total / 700) * 100).toFixed(1)}%)`)
console.log(`✅ Exitosos: ${success} (${((success / total) * 100).toFixed(1)}%)`)
console.log(`❌ Fallidos: ${failed} (${((failed / total) * 100).toFixed(1)}%)`)
console.log(`⚠️  Con problemas: ${withIssues} (${((withIssues / total) * 100).toFixed(1)}%)`)
console.log(`🔴 Críticos: ${criticalIssues}`)
console.log(`⏱️  Duración promedio: ${avgDuration.toFixed(0)}ms`)
console.log()

// Mostrar últimos 5 tests
if (results.length > 0) {
  console.log('📋 ÚLTIMOS 5 TESTS')
  console.log('='.repeat(60))
  results.slice(-5).forEach((test, idx) => {
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
if (total > 0 && avgDuration > 0) {
  const remaining = 700 - total
  const estimatedSeconds = (remaining * avgDuration) / 1000
  const estimatedMinutes = Math.floor(estimatedSeconds / 60)
  const estimatedSecs = Math.floor(estimatedSeconds % 60)
  console.log('⏱️  ESTIMACIÓN')
  console.log('='.repeat(60))
  console.log(`Tests restantes: ${remaining}`)
  console.log(`Tiempo estimado: ~${estimatedMinutes}m ${estimatedSecs}s`)
  console.log()
}
