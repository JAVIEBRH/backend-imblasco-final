/**
 * Esperar a que termine wrongAttribute y analizar
 */
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const reportsDir = join(__dirname, '../../reports')
const checkInterval = 10000 // 10 segundos
const targetWrongAttr = 30

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getLatestReport() {
  try {
    const reportFiles = fs.readdirSync(reportsDir)
      .filter(f => f.startsWith('test-criticas-') && f.endsWith('.jsonl'))
      .map(f => ({
        name: f,
        path: join(reportsDir, f),
        mtime: fs.statSync(join(reportsDir, f)).mtime
      }))
      .sort((a, b) => b.mtime - a.mtime)
    
    if (reportFiles.length === 0) return null
    return reportFiles[0]
  } catch (error) {
    return null
  }
}

function analyzeWrongAttribute(report) {
  if (!report) return null
  
  try {
    const lines = fs.readFileSync(report.path, 'utf8')
      .split('\n')
      .filter(l => l.trim())
    
    const results = lines.map(l => {
      try {
        return JSON.parse(l)
      } catch (e) {
        return null
      }
    }).filter(r => r !== null && r.category === 'wrongAttribute')
    
    const total = results.length
    const success = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length
    const percentage = total > 0 ? ((success / total) * 100).toFixed(1) : 0
    
    return { total, success, failed, percentage: parseFloat(percentage), results }
  } catch (error) {
    return null
  }
}

async function waitAndAnalyze() {
  console.log('⏳ Esperando a que complete wrongAttribute (30 tests)...\n')
  
  let lastTotal = 0
  let noProgressCount = 0
  
  while (true) {
    const report = getLatestReport()
    const stats = analyzeWrongAttribute(report)
    
    if (stats && stats.total > 0) {
      if (stats.total !== lastTotal) {
        console.log(`📊 Progreso: ${stats.total}/${targetWrongAttr} | ✅ ${stats.success} | ❌ ${stats.failed} | ${stats.percentage}%`)
        lastTotal = stats.total
        noProgressCount = 0
      } else {
        noProgressCount++
      }
      
      if (stats.total >= targetWrongAttr) {
        console.log(`\n✅ wrongAttribute COMPLETADO: ${stats.success}/${targetWrongAttr} (${stats.percentage}%)\n`)
        
        if (stats.percentage >= 95) {
          console.log('🎉 EXCELENTE: >= 95% - La corrección funcionó perfectamente!')
        } else if (stats.percentage >= 90) {
          console.log('✅ BUENO: >= 90% - Mejora significativa')
        } else if (stats.percentage >= 80) {
          console.log('⚠️  ACEPTABLE: >= 80% - Mejora moderada')
        } else {
          console.log('❌ REQUIERE MEJORA: < 80%')
        }
        
        if (stats.failed > 0) {
          console.log(`\n🔴 Fallos detectados (${stats.failed}):`)
          stats.results.filter(r => !r.success).forEach((test, idx) => {
            console.log(`   ${idx + 1}. Test #${test.testNumber}: "${test.question}"`)
            if (test.response) {
              console.log(`      Respuesta: ${test.response.substring(0, 150)}...`)
            }
          })
        } else {
          console.log('\n🎉 ¡PERFECTO! 0 fallos en wrongAttribute')
        }
        
        break
      }
    }
    
    // Si no hay progreso por 5 minutos, asumir que terminó
    if (noProgressCount * checkInterval > 300000) {
      console.log('\n⚠️  Sin progreso por 5 minutos. Analizando resultados actuales...\n')
      if (stats) {
        console.log(`📊 Resultados actuales: ${stats.success}/${stats.total} (${stats.percentage}%)`)
      }
      break
    }
    
    await sleep(checkInterval)
  }
}

waitAndAnalyze().catch(error => {
  console.error('❌ Error:', error.message)
  process.exit(1)
})
