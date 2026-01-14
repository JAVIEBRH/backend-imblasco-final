/**
 * DATABASE MIGRATION SCRIPT
 * Ejecuta el esquema SQL para crear las tablas
 * 
 * Uso: node src/database/migrate.js
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { testConnection, query } from '../config/database.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function migrate() {
  console.log('🔄 Iniciando migración de base de datos...\n')

  // Verificar conexión
  const connected = await testConnection()
  if (!connected) {
    console.error('❌ No se pudo conectar a la base de datos')
    console.error('   Verifica tu configuración en .env')
    process.exit(1)
  }

  // Leer esquema SQL
  const schemaPath = path.join(__dirname, 'schema.sql')
  const schemaSQL = fs.readFileSync(schemaPath, 'utf-8')

  try {
    // Dividir el SQL en sentencias, manejando funciones PL/pgSQL correctamente
    const statements = []
    let currentStatement = ''
    let inFunction = false
    let dollarQuote = null
    
    const lines = schemaSQL.split('\n')
    
    for (const line of lines) {
      const trimmed = line.trim()
      
      // Saltar comentarios
      if (trimmed.startsWith('--') || trimmed === '') {
        continue
      }
      
      currentStatement += line + '\n'
      
      // Detectar inicio de función PL/pgSQL
      if (trimmed.match(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i)) {
        inFunction = true
        // Buscar el delimitador $$ o $tag$
        const dollarMatch = trimmed.match(/\$[^$]*\$/g)
        if (dollarMatch) {
          dollarQuote = dollarMatch[0]
        }
      }
      
      // Detectar fin de función
      if (inFunction && dollarQuote && trimmed.includes(dollarQuote) && trimmed.includes('language')) {
        inFunction = false
        dollarQuote = null
      }
      
      // Si no estamos en una función y encontramos un ; al final de la línea, es el fin de una sentencia
      if (!inFunction && trimmed.endsWith(';')) {
        const stmt = currentStatement.trim()
        if (stmt.length > 0) {
          statements.push(stmt)
        }
        currentStatement = ''
      }
    }
    
    // Agregar la última sentencia si queda algo
    if (currentStatement.trim().length > 0) {
      statements.push(currentStatement.trim())
    }

    console.log(`📝 Ejecutando ${statements.length} sentencias SQL...\n`)

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i]
      try {
        await query(statement)
        console.log(`✅ Sentencia ${i + 1}/${statements.length} ejecutada`)
      } catch (error) {
        // Algunos errores son normales (tablas ya existen, etc.)
        if (error.message.includes('already exists') || 
            error.message.includes('ya existe') ||
            error.message.includes('duplicate key') ||
            error.message.includes('already defined')) {
          console.log(`⚠️  Sentencia ${i + 1}/${statements.length}: ${error.message.split('\n')[0]}`)
        } else {
          console.error(`❌ Error en sentencia ${i + 1}:`, error.message)
          console.error(`   Sentencia: ${statement.substring(0, 100)}...`)
          throw error
        }
      }
    }

    console.log('\n✅ Migración completada exitosamente!')
    console.log('\n📊 Verificando tablas creadas...')

    const tables = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `)

    console.log(`\n   Tablas encontradas: ${tables.rows.map(r => r.table_name).join(', ')}`)

  } catch (error) {
    console.error('\n❌ Error durante la migración:', error)
    process.exit(1)
  }
}

// Ejecutar migración
migrate()
  .then(() => {
    console.log('\n✨ Listo! La base de datos está preparada.')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n💥 Error fatal:', error)
    process.exit(1)
  })

