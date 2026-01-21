/**
 * Análisis detallado del test rápido
 */
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const reportsDir = join(__dirname, '../../reports')
const reportFiles = fs.readdirSync(reportsDir)
  .filter(f => f.startsWith('test-wrong-attr-quick-') && f.endsWith('.jsonl'))
  .map(f => ({
    name: f,
    path: join(reportsDir, f),
    mtime: fs.statSync(join(reportsDir, f)).mtime
  }))
  .sort((a, b) => b.mtime - a.mtime)

if (reportFiles.length === 0) {
  console.log('❌ No se encontró reporte')
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

console.log('╔════════════════════════════════════════════════════════╗')
console.log('║        ANÁLISIS DETALLADO - TEST RÁPIDO                ║')
console.log('╚════════════════════════════════════════════════════════╝')
console.log()

// Estadísticas generales
const totalTests = results.length
const allSuccess = results.filter(r => r.success).length
const allFailed = results.filter(r => !r.success).length
const totalPercentage = totalTests > 0 ? ((allSuccess / totalTests) * 100).toFixed(1) : 0

console.log('📊 ESTADÍSTICAS GENERALES')
console.log(`   Total de tests: ${totalTests}`)
console.log(`   ✅ Exitosos: ${allSuccess} (${totalPercentage}%)`)
console.log(`   ❌ Fallidos: ${allFailed}`)
console.log()

// wrongAttribute específico
const wrongAttr = results.filter(r => r.category === 'wrongAttribute')
const setupContext = results.filter(r => r.category === 'setupContext')

const wrongAttrTotal = wrongAttr.length
const wrongAttrSuccess = wrongAttr.filter(r => r.success).length
const wrongAttrFailed = wrongAttr.filter(r => !r.success).length
const wrongAttrPercentage = wrongAttrTotal > 0 ? ((wrongAttrSuccess / wrongAttrTotal) * 100).toFixed(1) : 0

console.log('🎯 CATEGORÍA: wrongAttribute')
console.log(`   Total: ${wrongAttrTotal}`)
console.log(`   ✅ Exitosos: ${wrongAttrSuccess} (${wrongAttrPercentage}%)`)
console.log(`   ❌ Fallidos: ${wrongAttrFailed}`)
console.log()

// Tiempos de respuesta
const durations = results.filter(r => r.duration && r.duration > 0).map(r => r.duration)
if (durations.length > 0) {
  const avgDuration = (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(0)
  const minDuration = Math.min(...durations)
  const maxDuration = Math.max(...durations)
  console.log('⏱️  TIEMPOS DE RESPUESTA')
  console.log(`   Promedio: ${avgDuration}ms`)
  console.log(`   Mínimo: ${minDuration}ms`)
  console.log(`   Máximo: ${maxDuration}ms`)
  console.log()
}

// Análisis de fallos
if (wrongAttrFailed > 0) {
  console.log('🔴 FALLOS DETECTADOS EN wrongAttribute:')
  wrongAttr.filter(r => !r.success).forEach((test, idx) => {
    console.log(`\n   ${idx + 1}. Test #${test.testNumber}`)
    console.log(`      Pregunta: "${test.question}"`)
    if (test.response) {
      console.log(`      Respuesta: ${test.response.substring(0, 200)}...`)
    }
    if (test.issues && test.issues.length > 0) {
      test.issues.forEach(issue => {
        console.log(`      ⚠️  ${issue.message}`)
        console.log(`         Esperado: ${issue.expected}`)
      })
    }
    if (test.error) {
      console.log(`      ❌ Error: ${test.error}`)
    }
  })
  console.log()
} else {
  console.log('✅ NO HAY FALLOS EN wrongAttribute')
  console.log('   Todos los tests pasaron correctamente.')
  console.log()
}

// Muestra de respuestas exitosas
if (wrongAttrSuccess > 0) {
  console.log('✅ MUESTRA DE RESPUESTAS EXITOSAS (primeros 3):')
  wrongAttr.filter(r => r.success).slice(0, 3).forEach((test, idx) => {
    console.log(`\n   ${idx + 1}. Test #${test.testNumber}`)
    console.log(`      Pregunta: "${test.question}"`)
    if (test.response) {
      console.log(`      Respuesta: ${test.response.substring(0, 200)}...`)
    }
  })
  console.log()
}

// Conclusión
console.log('╔════════════════════════════════════════════════════════╗')
console.log('║                    CONCLUSIÓN                          ║')
console.log('╚════════════════════════════════════════════════════════╝')
console.log()

if (parseFloat(wrongAttrPercentage) >= 95) {
  console.log('🎉 EXCELENTE: >= 95%')
  console.log('   La corrección funcionó perfectamente.')
  console.log('   El sistema ahora detecta correctamente cuando un producto')
  console.log('   no tiene variaciones con el atributo solicitado y pide')
  console.log('   el producto específico en lugar de responder incorrectamente.')
} else if (parseFloat(wrongAttrPercentage) >= 90) {
  console.log('✅ BUENO: >= 90%')
  console.log('   Mejora significativa, pero aún hay casos a corregir.')
} else if (parseFloat(wrongAttrPercentage) >= 80) {
  console.log('⚠️  ACEPTABLE: >= 80%')
  console.log('   Mejora moderada, se requiere más trabajo.')
} else {
  console.log('❌ REQUIERE MEJORA: < 80%')
  console.log('   La corrección no fue suficiente.')
}

console.log()
console.log(`📄 Reporte completo: ${latestReport.path}`)
console.log()
