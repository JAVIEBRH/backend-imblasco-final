/**
 * Script para analizar resultados del stress test
 * Uso: node src/scripts/analyze-stress-test.js [archivo.jsonl]
 */
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Colores para la consola
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function main() {
  const reportFile = process.argv[2] || 'reports/stress-test-1769012557616.jsonl'
  const reportPath = join(__dirname, '../..', reportFile)
  
  if (!fs.existsSync(reportPath)) {
    log(`❌ Archivo no encontrado: ${reportPath}`, 'red')
    process.exit(1)
  }
  
  log('╔════════════════════════════════════════════════════════╗', 'bright')
  log('║   ANÁLISIS DE RESULTADOS - STRESS TEST                  ║', 'bright')
  log('╚════════════════════════════════════════════════════════╝', 'bright')
  console.log()
  
  log(`📄 Analizando: ${reportFile}\n`, 'cyan')
  
  // Leer y parsear resultados
  const lines = fs.readFileSync(reportPath, 'utf8').split('\n').filter(l => l.trim())
  const results = lines.map(l => JSON.parse(l))
  
  const total = results.length
  const success = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length
  const withIssues = results.filter(r => r.issues && r.issues.length > 0).length
  
  // Estadísticas generales
  log('📊 ESTADÍSTICAS GENERALES', 'bright')
  console.log('='.repeat(80))
  log(`Total de pruebas: ${total}`, 'blue')
  log(`✅ Exitosas: ${success} (${((success / total) * 100).toFixed(1)}%)`, success === total ? 'green' : 'yellow')
  log(`❌ Fallidas: ${failed} (${((failed / total) * 100).toFixed(1)}%)`, failed > 0 ? 'red' : 'green')
  log(`⚠️  Con problemas: ${withIssues} (${((withIssues / total) * 100).toFixed(1)}%)`, withIssues > 0 ? 'yellow' : 'green')
  
  const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / total
  const maxDuration = Math.max(...results.map(r => r.duration))
  const minDuration = Math.min(...results.map(r => r.duration))
  
  log(`⏱️  Duración promedio: ${avgDuration.toFixed(0)}ms`, 'blue')
  log(`⏱️  Duración mínima: ${minDuration}ms`, 'blue')
  log(`⏱️  Duración máxima: ${maxDuration}ms`, maxDuration > 30000 ? 'red' : 'blue')
  console.log()
  
  // Análisis de problemas
  const allIssues = results.flatMap(r => (r.issues || []).map(issue => ({
    ...issue,
    testNumber: r.testNumber,
    category: r.category,
    question: r.question
  })))
  
  if (allIssues.length > 0) {
    const issueTypes = {}
    allIssues.forEach(issue => {
      if (!issueTypes[issue.type]) {
        issueTypes[issue.type] = []
      }
      issueTypes[issue.type].push(issue)
    })
    
    log('🔍 ANÁLISIS DE PROBLEMAS POR TIPO', 'bright')
    console.log('='.repeat(80))
    
    const sortedTypes = Object.keys(issueTypes).sort((a, b) => issueTypes[b].length - issueTypes[a].length)
    sortedTypes.forEach(type => {
      const issues = issueTypes[type]
      log(`\n${type}: ${issues.length} ocurrencia(s)`, 'red')
      
      // Mostrar ejemplos
      issues.slice(0, 5).forEach((issue, idx) => {
        log(`  ${idx + 1}. Test #${issue.testNumber} [${issue.category}]`, 'yellow')
        log(`     Pregunta: "${issue.question.substring(0, 70)}${issue.question.length > 70 ? '...' : ''}"`, 'yellow')
        log(`     Mensaje: ${issue.message}`, 'yellow')
      })
      if (issues.length > 5) {
        log(`  ... y ${issues.length - 5} más`, 'yellow')
      }
    })
    console.log()
  }
  
  // Análisis por categoría
  const categoryStats = {}
  results.forEach(result => {
    if (!categoryStats[result.category]) {
      categoryStats[result.category] = {
        total: 0,
        success: 0,
        failures: 0,
        issues: 0,
        avgDuration: 0,
        totalDuration: 0
      }
    }
    categoryStats[result.category].total++
    if (result.success) {
      categoryStats[result.category].success++
    } else {
      categoryStats[result.category].failures++
    }
    if (result.issues) {
      categoryStats[result.category].issues += result.issues.length
    }
    categoryStats[result.category].totalDuration += result.duration
  })
  
  Object.keys(categoryStats).forEach(cat => {
    categoryStats[cat].avgDuration = categoryStats[cat].totalDuration / categoryStats[cat].total
  })
  
  log('📋 ESTADÍSTICAS POR CATEGORÍA', 'bright')
  console.log('='.repeat(80))
  
  Object.keys(categoryStats).sort().forEach(category => {
    const stats = categoryStats[category]
    const successRate = ((stats.success / stats.total) * 100).toFixed(1)
    const color = stats.success === stats.total ? 'green' : stats.failures > 0 ? 'red' : 'yellow'
    
    log(`\n${category}:`, 'cyan')
    log(`  Total: ${stats.total}`, 'blue')
    log(`  Éxitos: ${stats.success} (${successRate}%)`, color)
    log(`  Fallos: ${stats.failures}`, stats.failures > 0 ? 'red' : 'green')
    log(`  Problemas: ${stats.issues}`, stats.issues > 0 ? 'yellow' : 'green')
    log(`  Duración promedio: ${stats.avgDuration.toFixed(0)}ms`, 'blue')
  })
  console.log()
  
  // Tests más problemáticos
  const problematicTests = results
    .filter(r => r.issues && r.issues.length > 0)
    .sort((a, b) => (b.issues?.length || 0) - (a.issues?.length || 0))
    .slice(0, 15)
  
  if (problematicTests.length > 0) {
    log('🔴 TOP 15 TESTS CON MÁS PROBLEMAS', 'bright')
    console.log('='.repeat(80))
    
    problematicTests.forEach((test, index) => {
      log(`\n${index + 1}. Test #${test.testNumber} [${test.category}]`, 'red')
      log(`   Pregunta: "${test.question}"`, 'yellow')
      log(`   Problemas: ${test.issues?.length || 0}`, 'red')
      log(`   Duración: ${test.duration}ms`, test.duration > 30000 ? 'red' : 'blue')
      test.issues?.forEach(issue => {
        log(`   - ${issue.type}: ${issue.message}`, 'yellow')
      })
    })
    console.log()
  }
  
  // Tests fallidos
  const failedTests = results.filter(r => !r.success)
  
  if (failedTests.length > 0) {
    log('❌ TESTS FALLIDOS (EXCEPCIONES)', 'bright')
    console.log('='.repeat(80))
    
    failedTests.slice(0, 20).forEach((test, index) => {
      log(`\n${index + 1}. Test #${test.testNumber} [${test.category}]`, 'red')
      log(`   Pregunta: "${test.question}"`, 'yellow')
      if (test.error) {
        log(`   Error: ${test.error}`, 'red')
      }
      if (test.issues) {
        test.issues.forEach(issue => {
          log(`   - ${issue.type}: ${issue.message}`, 'yellow')
        })
      }
    })
    
    if (failedTests.length > 20) {
      log(`\n... y ${failedTests.length - 20} más`, 'yellow')
    }
    console.log()
  }
  
  // Tests con respuestas muy lentas
  const slowTests = results
    .filter(r => r.duration > 30000)
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 10)
  
  if (slowTests.length > 0) {
    log('🐌 TOP 10 TESTS MÁS LENTOS (>30s)', 'bright')
    console.log('='.repeat(80))
    
    slowTests.forEach((test, index) => {
      log(`${index + 1}. Test #${test.testNumber} [${test.category}]: ${(test.duration / 1000).toFixed(1)}s`, 'red')
      log(`   Pregunta: "${test.question.substring(0, 60)}..."`, 'yellow')
    })
    console.log()
  }
  
  // Resumen final
  console.log('='.repeat(80))
  log('RESUMEN FINAL', 'bright')
  console.log('='.repeat(80))
  
  const criticalIssues = allIssues.filter(i => i.type === 'EXCEPTION' || i.type === 'ERROR')
  const performanceIssues = allIssues.filter(i => i.type === 'PERFORMANCE')
  
  log(`\n✅ Tests exitosos: ${success}/${total} (${((success / total) * 100).toFixed(1)}%)`, success === total ? 'green' : 'yellow')
  log(`❌ Tests fallidos: ${failed}/${total} (${((failed / total) * 100).toFixed(1)}%)`, failed > 0 ? 'red' : 'green')
  log(`⚠️  Problemas detectados: ${allIssues.length}`, allIssues.length > 0 ? 'yellow' : 'green')
  log(`🔴 Problemas críticos: ${criticalIssues.length}`, criticalIssues.length > 0 ? 'red' : 'green')
  log(`🐌 Problemas de rendimiento: ${performanceIssues.length}`, performanceIssues.length > 0 ? 'yellow' : 'green')
  
  if (criticalIssues.length > 0) {
    log(`\n⚠️  ACCIÓN REQUERIDA: Se detectaron ${criticalIssues.length} problemas críticos que requieren atención inmediata.`, 'red')
  }
  
  console.log()
}

main()
