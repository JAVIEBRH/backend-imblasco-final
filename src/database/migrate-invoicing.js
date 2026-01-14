/**
 * MIGRACIÓN DE FACTURACIÓN
 * Ejecuta la migración 001 para agregar campos de facturación
 * 
 * Uso: node src/database/migrate-invoicing.js
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { query, getClient } from '../config/database.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function runMigration() {
  const migrationFile = path.join(__dirname, 'migrations', '001_add_invoicing_fields.sql')
  
  console.log('\n📦 Ejecutando migración de facturación...\n')
  console.log(`📄 Archivo: ${migrationFile}\n`)

  if (!fs.existsSync(migrationFile)) {
    console.error(`❌ Archivo de migración no encontrado: ${migrationFile}`)
    process.exit(1)
  }

  const sql = fs.readFileSync(migrationFile, 'utf8')
  const client = await getClient()

  try {
    await client.query('BEGIN')

    // Ejecutar SQL (ya está preparado para ejecutarse como un bloque)
    await client.query(sql)

    await client.query('COMMIT')

    console.log('✅ Migración ejecutada exitosamente\n')
    console.log('Campos agregados:')
    console.log('  - net_amount, iva_amount, total_amount')
    console.log('  - client_snapshot, items_snapshot')
    console.log('  - erp_reference, invoiced_at')
    console.log('  - Nuevos estados: sent_to_erp, invoiced, error\n')

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

