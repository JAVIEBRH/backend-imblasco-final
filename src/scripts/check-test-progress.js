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

const total = lines.length
const target = 140
const percentage = ((total / target) * 100).toFixed(1)
const remaining = target - total

console.log(`📊 PROGRESO: ${total}/${target} (${percentage}%)`)

if (total >= target) {
  console.log('✅ TEST COMPLETADO!\n')
  process.exit(0)
} else {
  console.log(`⏳ Falta(n) ${remaining} test(s). El test sigue ejecutándose...`)
  process.exit(0)
}
