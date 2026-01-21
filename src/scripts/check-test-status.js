/**
 * Script simple para verificar el estado del test de correcciones
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
  console.log('⏳ No se encontró archivo de reporte')
  process.exit(0)
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

console.log(`📊 Estado del Test: ${total}/750 (${((total / 750) * 100).toFixed(1)}%)`)
console.log(`✅ Exitosos: ${success} (${((success / total) * 100).toFixed(1)}%)`)
console.log(`❌ Fallidos: ${failed}`)
console.log(`⚠️  Con problemas: ${withIssues}`)
console.log(`🔴 Críticos: ${criticalIssues}`)

if (total >= 750) {
  console.log('\n🎉 TEST COMPLETADO')
} else {
  console.log(`\n⏳ En progreso... (${750 - total} tests restantes)`)
}
