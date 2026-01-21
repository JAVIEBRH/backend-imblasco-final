/**
 * ESTADO COMPLETO DEL SISTEMA
 * Análisis de todos los reportes disponibles para dar un panorama general
 */
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const reportsDir = join(__dirname, '../../reports')

// Buscar el reporte más reciente de test-criticas
const reportFiles = fs.readdirSync(reportsDir)
  .filter(f => f.startsWith('test-criticas-') && f.endsWith('.jsonl'))
  .map(f => ({
    name: f,
    path: join(reportsDir, f),
    mtime: fs.statSync(join(reportsDir, f)).mtime
  }))
  .sort((a, b) => b.mtime - a.mtime)

if (reportFiles.length === 0) {
  console.log('❌ No se encontró reporte de test-criticas')
  console.log('   Ejecuta primero: npm run test-criticas')
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

// Estadísticas por categoría
const byCategory = {}
results.forEach(r => {
  if (!byCategory[r.category]) {
    byCategory[r.category] = { total: 0, success: 0, failed: 0, issues: 0 }
  }
  byCategory[r.category].total++
  if (r.success) {
    byCategory[r.category].success++
  } else {
    byCategory[r.category].failed++
  }
  if (r.issues && r.issues.length > 0) {
    byCategory[r.category].issues++
  }
})

// Estadísticas generales
const total = results.length
const success = results.filter(r => r.success).length
const failed = results.filter(r => !r.success).length
const overallPercentage = total > 0 ? ((success / total) * 100).toFixed(1) : 0

console.log('╔════════════════════════════════════════════════════════╗')
console.log('║          ESTADO COMPLETO DEL SISTEMA                   ║')
console.log('╚════════════════════════════════════════════════════════╝')
console.log()
console.log(`📄 Reporte: ${latestReport.name}`)
console.log(`📅 Fecha: ${new Date(latestReport.mtime).toLocaleString('es-CL')}`)
console.log()

// Resumen general
console.log('╔════════════════════════════════════════════════════════╗')
console.log('║              RESUMEN GENERAL                           ║')
console.log('╚════════════════════════════════════════════════════════╝')
console.log()
console.log(`📊 Total de tests: ${total}`)
console.log(`✅ Exitosos: ${success} (${overallPercentage}%)`)
console.log(`❌ Fallidos: ${failed} (${((failed / total) * 100).toFixed(1)}%)`)
console.log()

// Por categoría con porcentajes
console.log('╔════════════════════════════════════════════════════════╗')
console.log('║          ESTADO POR CATEGORÍA                         ║')
console.log('╚════════════════════════════════════════════════════════╝')
console.log()

const categories = Object.entries(byCategory)
  .sort((a, b) => b[1].total - a[1].total)

categories.forEach(([category, stats]) => {
  const percentage = ((stats.success / stats.total) * 100).toFixed(1)
  const failedPercentage = ((stats.failed / stats.total) * 100).toFixed(1)
  
  // Determinar estado visual
  let status = '✅'
  let statusText = 'EXCELENTE'
  if (parseFloat(percentage) < 50) {
    status = '🔴'
    statusText = 'CRÍTICO'
  } else if (parseFloat(percentage) < 70) {
    status = '⚠️'
    statusText = 'REQUIERE ATENCIÓN'
  } else if (parseFloat(percentage) < 85) {
    status = '🟡'
    statusText = 'MEJORABLE'
  } else if (parseFloat(percentage) < 95) {
    status = '🟢'
    statusText = 'BUENO'
  }
  
  console.log(`${status} ${category.toUpperCase().padEnd(25)}`)
  console.log(`   Total: ${stats.total}`)
  console.log(`   ✅ Exitosos: ${stats.success} (${percentage}%)`)
  console.log(`   ❌ Fallidos: ${stats.failed} (${failedPercentage}%)`)
  if (stats.issues > 0) {
    console.log(`   ⚠️  Con problemas: ${stats.issues}`)
  }
  console.log(`   Estado: ${statusText}`)
  console.log()
})

// Gráfico de barras simple
console.log('╔════════════════════════════════════════════════════════╗')
console.log('║          VISUALIZACIÓN DE PORCENTAJES                    ║')
console.log('╚════════════════════════════════════════════════════════╝')
console.log()

categories.forEach(([category, stats]) => {
  const percentage = parseFloat(((stats.success / stats.total) * 100).toFixed(1))
  const barLength = Math.round(percentage / 2) // 50 caracteres = 100%
  const bar = '█'.repeat(barLength) + '░'.repeat(50 - barLength)
  const status = percentage >= 95 ? '✅' : percentage >= 85 ? '🟢' : percentage >= 70 ? '🟡' : percentage >= 50 ? '⚠️' : '🔴'
  
  console.log(`${status} ${category.padEnd(25)} ${percentage.toFixed(1).padStart(5)}% ${bar}`)
})

console.log()

// Top 3 categorías con mejor rendimiento
const topCategories = categories
  .filter(([_, stats]) => stats.total >= 5) // Al menos 5 tests
  .sort((a, b) => {
    const aPct = (a[1].success / a[1].total) * 100
    const bPct = (b[1].success / b[1].total) * 100
    return bPct - aPct
  })
  .slice(0, 3)

// Top 3 categorías que requieren atención
const needsAttention = categories
  .filter(([_, stats]) => stats.total >= 5 && (stats.success / stats.total) < 0.95)
  .sort((a, b) => {
    const aPct = (a[1].success / a[1].total) * 100
    const bPct = (b[1].success / b[1].total) * 100
    return aPct - bPct
  })
  .slice(0, 3)

console.log('╔════════════════════════════════════════════════════════╗')
console.log('║              DESTACADOS                                 ║')
console.log('╚════════════════════════════════════════════════════════╝')
console.log()

if (topCategories.length > 0) {
  console.log('🏆 TOP 3 CATEGORÍAS CON MEJOR RENDIMIENTO:')
  topCategories.forEach(([category, stats], idx) => {
    const pct = ((stats.success / stats.total) * 100).toFixed(1)
    console.log(`   ${idx + 1}. ${category}: ${stats.success}/${stats.total} (${pct}%)`)
  })
  console.log()
}

if (needsAttention.length > 0) {
  console.log('⚠️  CATEGORÍAS QUE REQUIEREN ATENCIÓN:')
  needsAttention.forEach(([category, stats], idx) => {
    const pct = ((stats.success / stats.total) * 100).toFixed(1)
    console.log(`   ${idx + 1}. ${category}: ${stats.success}/${stats.total} (${pct}%)`)
  })
  console.log()
}

// Conclusión final
console.log('╔════════════════════════════════════════════════════════╗')
console.log('║              CONCLUSIÓN GENERAL                         ║')
console.log('╚════════════════════════════════════════════════════════╝')
console.log()

if (parseFloat(overallPercentage) >= 95) {
  console.log('🎉 EXCELENTE: El sistema está funcionando de manera óptima')
  console.log(`   Tasa de éxito general: ${overallPercentage}%`)
} else if (parseFloat(overallPercentage) >= 85) {
  console.log('✅ BUENO: El sistema funciona bien, con algunas áreas de mejora')
  console.log(`   Tasa de éxito general: ${overallPercentage}%`)
} else if (parseFloat(overallPercentage) >= 70) {
  console.log('⚠️  ACEPTABLE: El sistema funciona, pero requiere mejoras')
  console.log(`   Tasa de éxito general: ${overallPercentage}%`)
} else {
  console.log('🔴 REQUIERE ATENCIÓN: El sistema necesita correcciones importantes')
  console.log(`   Tasa de éxito general: ${overallPercentage}%`)
}

console.log()
console.log(`📊 Resumen:`)
console.log(`   • Total de categorías evaluadas: ${categories.length}`)
console.log(`   • Categorías con >= 95%: ${categories.filter(([_, s]) => (s.success / s.total) >= 0.95).length}`)
console.log(`   • Categorías con >= 85%: ${categories.filter(([_, s]) => (s.success / s.total) >= 0.85).length}`)
console.log(`   • Categorías con < 70%: ${categories.filter(([_, s]) => (s.success / s.total) < 0.70).length}`)
console.log()
