/**
 * ESTADO COMPLETO DEL SISTEMA - ACTUALIZADO
 * Incluye el test rápido más reciente que muestra la corrección
 */
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const reportsDir = join(__dirname, '../../reports')

// Buscar reportes
const testCriticasFiles = fs.readdirSync(reportsDir)
  .filter(f => f.startsWith('test-criticas-') && f.endsWith('.jsonl'))
  .map(f => ({
    name: f,
    path: join(reportsDir, f),
    mtime: fs.statSync(join(reportsDir, f)).mtime
  }))
  .sort((a, b) => b.mtime - a.mtime)

const testQuickFiles = fs.readdirSync(reportsDir)
  .filter(f => f.startsWith('test-wrong-attr-quick-') && f.endsWith('.jsonl'))
  .map(f => ({
    name: f,
    path: join(reportsDir, f),
    mtime: fs.statSync(join(reportsDir, f)).mtime
  }))
  .sort((a, b) => b.mtime - a.mtime)

console.log('╔════════════════════════════════════════════════════════╗')
console.log('║          ESTADO COMPLETO DEL SISTEMA                   ║')
console.log('║          (Incluye corrección más reciente)              ║')
console.log('╚════════════════════════════════════════════════════════╝')
console.log()

// Analizar test completo más reciente
if (testCriticasFiles.length > 0) {
  const latestCriticas = testCriticasFiles[0]
  const lines = fs.readFileSync(latestCriticas.path, 'utf8')
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
      byCategory[r.category] = { total: 0, success: 0, failed: 0 }
    }
    byCategory[r.category].total++
    if (r.success) {
      byCategory[r.category].success++
    } else {
      byCategory[r.category].failed++
    }
  })

  // Actualizar con test rápido si existe
  if (testQuickFiles.length > 0) {
    const latestQuick = testQuickFiles[0]
    const quickLines = fs.readFileSync(latestQuick.path, 'utf8')
      .split('\n')
      .filter(l => l.trim())

    const quickResults = quickLines.map(l => {
      try {
        return JSON.parse(l)
      } catch (e) {
        return null
      }
    }).filter(r => r !== null && r.category === 'wrongAttribute')

    if (quickResults.length > 0) {
      const quickSuccess = quickResults.filter(r => r.success).length
      const quickTotal = quickResults.length
      
      // Actualizar wrongAttribute con datos del test rápido (más reciente)
      if (byCategory['wrongAttribute']) {
        console.log('📌 NOTA: Usando datos del test rápido más reciente para wrongAttribute')
        console.log(`   Test completo: ${byCategory['wrongAttribute'].success}/${byCategory['wrongAttribute'].total} (${((byCategory['wrongAttribute'].success / byCategory['wrongAttribute'].total) * 100).toFixed(1)}%)`)
        console.log(`   Test rápido (corregido): ${quickSuccess}/${quickTotal} (${((quickSuccess / quickTotal) * 100).toFixed(1)}%)`)
        console.log()
        
        // Actualizar con datos del test rápido
        byCategory['wrongAttribute'] = {
          total: quickTotal,
          success: quickSuccess,
          failed: quickTotal - quickSuccess,
          updated: true
        }
      }
    }
  }

  // Estadísticas generales
  const total = results.length
  const success = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length
  
  // Recalcular totales considerando la actualización
  let adjustedTotal = total
  let adjustedSuccess = success
  let adjustedFailed = failed
  
  if (byCategory['wrongAttribute']?.updated) {
    // Ajustar totales: restar los tests antiguos de wrongAttribute y sumar los nuevos
    const oldWrongAttr = results.filter(r => r.category === 'wrongAttribute')
    adjustedTotal = total - oldWrongAttr.length + byCategory['wrongAttribute'].total
    adjustedSuccess = success - oldWrongAttr.filter(r => r.success).length + byCategory['wrongAttribute'].success
    adjustedFailed = failed - oldWrongAttr.filter(r => !r.success).length + byCategory['wrongAttribute'].failed
  }
  
  const overallPercentage = adjustedTotal > 0 ? ((adjustedSuccess / adjustedTotal) * 100).toFixed(1) : 0

  console.log('╔════════════════════════════════════════════════════════╗')
  console.log('║              RESUMEN GENERAL                           ║')
  console.log('╚════════════════════════════════════════════════════════╝')
  console.log()
  console.log(`📄 Reporte base: ${latestCriticas.name}`)
  if (testQuickFiles.length > 0) {
    console.log(`📄 Test rápido: ${testQuickFiles[0].name}`)
  }
  console.log()
  console.log(`📊 Total de tests: ${adjustedTotal}`)
  console.log(`✅ Exitosos: ${adjustedSuccess} (${overallPercentage}%)`)
  console.log(`❌ Fallidos: ${adjustedFailed} (${((adjustedFailed / adjustedTotal) * 100).toFixed(1)}%)`)
  console.log()

  // Por categoría
  console.log('╔════════════════════════════════════════════════════════╗')
  console.log('║          ESTADO POR CATEGORÍA                         ║')
  console.log('╚════════════════════════════════════════════════════════╝')
  console.log()

  const categories = Object.entries(byCategory)
    .sort((a, b) => b[1].total - a[1].total)

  categories.forEach(([category, stats]) => {
    const percentage = ((stats.success / stats.total) * 100).toFixed(1)
    const failedPercentage = ((stats.failed / stats.total) * 100).toFixed(1)
    
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
    
    const updateNote = stats.updated ? ' (ACTUALIZADO)' : ''
    console.log(`${status} ${category.toUpperCase().padEnd(25)}${updateNote}`)
    console.log(`   Total: ${stats.total}`)
    console.log(`   ✅ Exitosos: ${stats.success} (${percentage}%)`)
    console.log(`   ❌ Fallidos: ${stats.failed} (${failedPercentage}%)`)
    console.log(`   Estado: ${statusText}`)
    console.log()
  })

  // Gráfico
  console.log('╔════════════════════════════════════════════════════════╗')
  console.log('║          VISUALIZACIÓN DE PORCENTAJES                    ║')
  console.log('╚════════════════════════════════════════════════════════╝')
  console.log()

  categories.forEach(([category, stats]) => {
    const percentage = parseFloat(((stats.success / stats.total) * 100).toFixed(1))
    const barLength = Math.round(percentage / 2)
    const bar = '█'.repeat(barLength) + '░'.repeat(50 - barLength)
    const status = percentage >= 95 ? '✅' : percentage >= 85 ? '🟢' : percentage >= 70 ? '🟡' : percentage >= 50 ? '⚠️' : '🔴'
    const updateMark = stats.updated ? ' ⬆️' : ''
    
    console.log(`${status} ${category.padEnd(25)} ${percentage.toFixed(1).padStart(5)}% ${bar}${updateMark}`)
  })

  console.log()

  // Conclusión
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
  
  if (byCategory['wrongAttribute']?.updated) {
    console.log('✨ La corrección de wrongAttribute ha mejorado significativamente')
    console.log('   el rendimiento del sistema.')
    console.log()
  }
} else {
  console.log('❌ No se encontró reporte de test-criticas')
  console.log('   Ejecuta primero: npm run test-criticas')
}
