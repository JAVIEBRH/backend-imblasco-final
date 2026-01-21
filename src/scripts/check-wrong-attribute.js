/**
 * Verificar progreso de wrongAttribute
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
  console.log('⏳ Test aún iniciando...')
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

const wrongAttr = results.filter(r => r.category === 'wrongAttribute')
const total = wrongAttr.length
const success = wrongAttr.filter(r => r.success).length
const failed = wrongAttr.filter(r => !r.success).length
const percentage = total > 0 ? ((success / total) * 100).toFixed(1) : 0

console.log(`\n📊 wrongAttribute: ${success}/${total} (${percentage}%)`)
console.log(`   ✅ Exitosos: ${success}`)
console.log(`   ❌ Fallidos: ${failed}`)

if (total >= 30) {
  console.log(`\n🎯 wrongAttribute COMPLETADO`)
  if (parseFloat(percentage) >= 95) {
    console.log('✅ EXCELENTE: >= 95%')
  } else if (parseFloat(percentage) >= 90) {
    console.log('✅ BUENO: >= 90%')
  } else if (parseFloat(percentage) >= 80) {
    console.log('⚠️  ACEPTABLE: >= 80%')
  } else {
    console.log('❌ REQUIERE MEJORA: < 80%')
  }
  
  if (failed > 0) {
    console.log(`\n🔴 Fallos detectados:`)
    wrongAttr.filter(r => !r.success).forEach((test, idx) => {
      console.log(`   ${idx + 1}. Test #${test.testNumber}: "${test.question}"`)
    })
  }
} else {
  console.log(`\n⏳ Progreso: ${total}/30 tests de wrongAttribute`)
}
