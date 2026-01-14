/**
 * MIGRACIÓN DE USUARIOS
 * Ejecuta la migración 002 para crear tabla de usuarios
 * 
 * Uso: node src/database/migrate-users.js
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { query, getClient } from '../config/database.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function runMigration() {
  const migrationFile = path.join(__dirname, 'migrations', '002_create_users_table.sql')
  
  console.log('\n📦 Ejecutando migración de usuarios...\n')
  console.log(`📄 Archivo: ${migrationFile}\n`)

  if (!fs.existsSync(migrationFile)) {
    console.error(`❌ Archivo de migración no encontrado: ${migrationFile}`)
    process.exit(1)
  }

  const sql = fs.readFileSync(migrationFile, 'utf8')
  const client = await getClient()

  try {
    await client.query('BEGIN')

    // Ejecutar SQL
    await client.query(sql)

    await client.query('COMMIT')

    console.log('✅ Migración ejecutada exitosamente\n')
    console.log('Usuarios de prueba creados:')
    console.log('  1. demo@cliente.cl / demo123')
    console.log('  2. test@empresa.cl / test123')
    console.log('  3. b2b@comercio.cl / b2b123\n')
    console.log('Ver USUARIOS_DEMO.md para más detalles\n')

    process.exit(0)

  } catch (error) {
    await client.query('ROLLBACK')
    console.error('\n❌ Error en migración:', error.message)
    console.error(error)
    process.exit(1)
  } finally {
    client.release()
  }
}

runMigration()


