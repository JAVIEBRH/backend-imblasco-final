/**
 * Monitorear específicamente wrongAttribute durante el test
 */
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const reportsDir = join(__dirname, '../../reports')
const target = 140
const checkInterval = 5000 // 5 segundos

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
    
    return { total, success, failed, percentage: total > 0 ? ((success / total) * 100).toFixed(1) : 0 }
  } catch (error) {
    return null
  }
}

async function monitor() {
  console.log('⏳ Monitoreando test - Enfoque en wrongAttribute...\n')
  
  let lastTotal = 0
  let lastWrongAttr = null
  
  while (true) {
    const report = getLatestReport()
    const wrongAttr = analyzeWrongAttribute(report)
    
    if (wrongAttr && wrongAttr.total > 0) {
      if (wrongAttr.total !== lastTotal || JSON.stringify(wrongAttr) !== JSON.stringify(lastWrongAttr)) {
        const progress = wrongAttr.total >= 30 ? '✅ COMPLETO' : `⏳ ${wrongAttr.total}/30`
        console.log(`📊 wrongAttribute: ${progress} | ✅ ${wrongAttr.success} | ❌ ${wrongAttr.failed} | ${wrongAttr.percentage}%`)
        lastTotal = wrongAttr.total
        lastWrongAttr = wrongAttr
        
        if (wrongAttr.total >= 30) {
          console.log(`\n🎯 wrongAttribute completado: ${wrongAttr.success}/30 (${wrongAttr.percentage}%)`)
          if (parseFloat(wrongAttr.percentage) >= 95) {
            console.log('✅ EXCELENTE: >= 95%')
          } else if (parseFloat(wrongAttr.percentage) >= 90) {
            console.log('✅ BUENO: >= 90%')
          } else if (parseFloat(wrongAttr.percentage) >= 80) {
            console.log('⚠️  ACEPTABLE: >= 80%')
          } else {
            console.log('❌ REQUIERE MEJORA: < 80%')
          }
          break
        }
      }
    }
    
    // Verificar si el test completo terminó
    if (report) {
      try {
        const allLines = fs.readFileSync(report.path, 'utf8')
          .split('\n')
          .filter(l => l.trim())
        if (allLines.length >= target) {
          console.log('\n✅ Test completo finalizado')
          break
        }
      } catch (e) {}
    }
    
    await sleep(checkInterval)
  }
}

monitor().catch(error => {
  console.error('❌ Error:', error.message)
  process.exit(1)
})
