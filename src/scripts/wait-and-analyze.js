/**
 * Esperar a que termine el test y analizar automáticamente
 */
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const reportsDir = join(__dirname, '../../reports')
const target = 140
const checkInterval = 10000 // 10 segundos

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

function getProgress(report) {
  if (!report) return { total: 0, percentage: 0 }
  
  try {
    const lines = fs.readFileSync(report.path, 'utf8')
      .split('\n')
      .filter(l => l.trim())
    const total = lines.length
    const percentage = ((total / target) * 100).toFixed(1)
    return { total, percentage: parseFloat(percentage) }
  } catch (error) {
    return { total: 0, percentage: 0 }
  }
}

async function waitForCompletion() {
  console.log('⏳ Esperando a que termine el test...\n')
  
  let lastProgress = 0
  let noProgressCount = 0
  
  while (true) {
    const report = getLatestReport()
    const progress = getProgress(report)
    
    if (progress.total >= target) {
      console.log(`✅ TEST COMPLETADO! (${progress.total}/${target})\n`)
      return report
    }
    
    // Mostrar progreso si cambió
    if (progress.total !== lastProgress) {
      const remaining = target - progress.total
      const elapsed = Math.floor(noProgressCount * checkInterval / 1000)
      console.log(`📊 Progreso: ${progress.total}/${target} (${progress.percentage}%) - Faltan ${remaining} tests - Tiempo: ${elapsed}s`)
      lastProgress = progress.total
      noProgressCount = 0
    } else {
      noProgressCount++
      // Si no hay progreso por más de 5 minutos, asumir que terminó
      if (noProgressCount * checkInterval > 300000) {
        console.log(`\n⚠️  Sin progreso por 5 minutos. Asumiendo que el test terminó.\n`)
        return report
      }
    }
    
    await sleep(checkInterval)
  }
}

async function analyzeResults(report) {
  if (!report) {
    console.log('❌ No se encontró archivo de reporte')
    return
  }
  
  console.log('📊 Analizando resultados...\n')
  console.log('='.repeat(60))
  
  try {
    const { stdout, stderr } = await execAsync(`node src/scripts/analyze-test-criticas.js`)
    console.log(stdout)
    if (stderr) console.error(stderr)
  } catch (error) {
    console.error('❌ Error ejecutando análisis:', error.message)
  }
}

// Ejecutar
(async () => {
  try {
    const report = await waitForCompletion()
    await analyzeResults(report)
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
})()
