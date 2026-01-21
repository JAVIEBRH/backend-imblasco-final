/**
 * Analizar fallos específicos en wrongAttribute
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

const failures = results.filter(r => r.category === 'wrongAttribute' && !r.success)

console.log('╔════════════════════════════════════════════════════════╗')
console.log('║   ANÁLISIS DE FALLOS - wrongAttribute                ║')
console.log('╚════════════════════════════════════════════════════════╝')
console.log()
console.log(`Total de fallos: ${failures.length}\n`)

failures.forEach((test, idx) => {
  console.log(`${idx + 1}. Test #${test.testNumber}`)
  console.log(`   Pregunta: "${test.question}"`)
  console.log(`   Respuesta: ${test.response?.substring(0, 250)}...`)
  if (test.issues && test.issues.length > 0) {
    test.issues.forEach(issue => {
      console.log(`   🔴 ${issue.type}: ${issue.message}`)
      if (issue.expected) console.log(`      Esperado: ${issue.expected}`)
      if (issue.actual) console.log(`      Actual: ${issue.actual}`)
    })
  }
  console.log()
})

// Analizar patrón común
console.log('╔════════════════════════════════════════════════════════╗')
console.log('║   PATRÓN IDENTIFICADO                                ║')
console.log('╚════════════════════════════════════════════════════════╝')
console.log()

const pattern = {
  preguntaPorTallas: failures.filter(f => f.question.toLowerCase().includes('talla')).length,
  preguntaPorColores: failures.filter(f => f.question.toLowerCase().includes('color')).length,
  respuestaNoDisponible: failures.filter(f => f.response?.includes('no está disponible')).length,
  respuestaListaVariaciones: failures.filter(f => f.response?.includes('disponible') && f.response?.includes('talla') || f.response?.includes('color')).length
}

console.log(`Preguntas por tallas: ${pattern.preguntaPorTallas}`)
console.log(`Preguntas por colores: ${pattern.preguntaPorColores}`)
console.log(`Respuestas "no disponible": ${pattern.respuestaNoDisponible}`)
console.log()

console.log('🔍 CONCLUSIÓN:')
console.log('El sistema está respondiendo "No disponible en [atributo]" en lugar de')
console.log('limpiar el contexto y pedir el producto. Esto sugiere que:')
console.log('1. La validación de atributos no está detectando correctamente algunos casos')
console.log('2. El código está llegando a la parte de "validar variante" en lugar de')
console.log('   retornar el mensaje amigable antes')
console.log()
