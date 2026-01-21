/**
 * Verificar wrongAttribute del reporte más reciente
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
console.log(`📄 Analizando: ${latestReport.name}`)
console.log(`   Fecha: ${latestReport.mtime.toLocaleString()}\n`)

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

console.log('╔════════════════════════════════════════════════════════╗')
console.log('║   RESULTADOS wrongAttribute (CON CORRECCIÓN)         ║')
console.log('╚════════════════════════════════════════════════════════╝')
console.log()
console.log(`📊 Total: ${total}/30`)
console.log(`✅ Exitosos: ${success}`)
console.log(`❌ Fallidos: ${failed}`)
console.log(`📈 Porcentaje: ${percentage}%`)
console.log()

if (total >= 30) {
  if (parseFloat(percentage) >= 95) {
    console.log('🎉 EXCELENTE: >= 95% - La corrección funcionó perfectamente!')
  } else if (parseFloat(percentage) >= 90) {
    console.log('✅ BUENO: >= 90% - Mejora significativa')
  } else if (parseFloat(percentage) >= 80) {
    console.log('⚠️  ACEPTABLE: >= 80% - Mejora moderada')
  } else {
    console.log('❌ REQUIERE MEJORA: < 80%')
  }
  
  if (failed > 0) {
    console.log(`\n🔴 Fallos detectados (${failed}):`)
    wrongAttr.filter(r => !r.success).forEach((test, idx) => {
      console.log(`\n   ${idx + 1}. Test #${test.testNumber}: "${test.question}"`)
      if (test.response) {
        console.log(`      Respuesta: ${test.response.substring(0, 200)}...`)
      }
      if (test.issues && test.issues.length > 0) {
        test.issues.forEach(issue => {
          console.log(`      🔴 ${issue.type}: ${issue.message}`)
        })
      }
    })
  } else {
    console.log('\n🎉 ¡PERFECTO! 0 fallos en wrongAttribute')
  }
} else {
  console.log(`⏳ Progreso: ${total}/30 tests de wrongAttribute`)
}

// Comparar con resultado anterior
if (reportFiles.length > 1) {
  const previousReport = reportFiles[1]
  const prevLines = fs.readFileSync(previousReport.path, 'utf8')
    .split('\n')
    .filter(l => l.trim())
  const prevResults = prevLines.map(l => {
    try {
      return JSON.parse(l)
    } catch (e) {
      return null
    }
  }).filter(r => r !== null && r.category === 'wrongAttribute')
  
  const prevSuccess = prevResults.filter(r => r.success).length
  const prevFailed = prevResults.filter(r => !r.success).length
  const prevPercentage = prevResults.length > 0 ? ((prevSuccess / prevResults.length) * 100).toFixed(1) : 0
  
  console.log('\n╔════════════════════════════════════════════════════════╗')
  console.log('║   COMPARACIÓN CON TEST ANTERIOR                       ║')
  console.log('╚════════════════════════════════════════════════════════╝')
  console.log()
  console.log(`Anterior: ${prevSuccess}/${prevResults.length} (${prevPercentage}%)`)
  console.log(`Actual:   ${success}/${total} (${percentage}%)`)
  
  const improvement = parseFloat(percentage) - parseFloat(prevPercentage)
  if (improvement > 0) {
    console.log(`\n✅ Mejora: +${improvement.toFixed(1)} puntos porcentuales`)
  } else if (improvement < 0) {
    console.log(`\n⚠️  Regresión: ${improvement.toFixed(1)} puntos porcentuales`)
  } else {
    console.log(`\n➡️  Sin cambio`)
  }
}
