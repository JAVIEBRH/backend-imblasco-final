/**
 * MIGRACIÓN ERP COMPLETO
 * Ejecuta todas las migraciones necesarias para el ERP completo
 * 
 * Uso: node src/database/migrate-erp.js
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { testConnection, query } from '../config/database.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function migrate() {
  console.log('🚀 Iniciando migración completa del ERP...\n')

  const connected = await testConnection()
  if (!connected) {
    console.error('❌ No se pudo conectar a la base de datos')
    process.exit(1)
  }

  try {
    // 1. Esquema base (si no existe)
    console.log('[1/3] Ejecutando esquema base...')
    const schemaPath = join(__dirname, 'schema.sql')
    const schemaSQL = readFileSync(schemaPath, 'utf-8')
    await query(schemaSQL)
    console.log('✅ Esquema base creado\n')

    // 2. Migración de facturación (si no existe)
    console.log('[2/3] Ejecutando migración de facturación...')
    const invoicingPath = join(__dirname, 'migrations', '001_add_invoicing_fields.sql')
    const invoicingSQL = readFileSync(invoicingPath, 'utf-8')
    await query(invoicingSQL)
    console.log('✅ Campos de facturación agregados\n')

    // 3. Migración de usuarios (si no existe)
    console.log('[3/3] Ejecutando migración de usuarios...')
    const usersPath = join(__dirname, 'migrations', '002_create_users_table.sql')
    const usersSQL = readFileSync(usersPath, 'utf-8')
    await query(usersSQL)
    console.log('✅ Tabla de usuarios creada\n')

    // 4. Esquema completo del ERP
    console.log('[4/4] Ejecutando esquema completo del ERP...')
    const erpSchemaPath = join(__dirname, 'migrations', '003_erp_complete_schema.sql')
    const erpSchemaSQL = readFileSync(erpSchemaPath, 'utf-8')
    await query(erpSchemaSQL)
    console.log('✅ Esquema completo del ERP creado\n')

    console.log('✅ Migración completada exitosamente!')
    console.log('\n📋 Tablas creadas:')
    console.log('   • invoices (Facturas)')
    console.log('   • invoice_items (Items de factura)')
    console.log('   • payments (Pagos)')
    console.log('   • stock_movements (Movimientos de stock)')
    console.log('   • suppliers (Proveedores)')
    console.log('   • purchase_orders (Órdenes de compra)')
    console.log('   • accounts_receivable (Cuentas por cobrar)')
    console.log('   • roles (Roles de usuario)')
    console.log('   • user_roles (Asignación de roles)')
    console.log('   • system_settings (Configuración)')
    console.log('   • audit_log (Auditoría)\n')

  } catch (error) {
    console.error('\n❌ Error durante la migración:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

migrate()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n💥 Error fatal:', error)
    process.exit(1)
  })


