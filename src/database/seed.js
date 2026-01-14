/**
 * DATABASE SEED SCRIPT
 * Carga datos de ejemplo (opcional)
 * 
 * Uso: node src/database/seed.js
 */

import { testConnection, query } from '../config/database.js'

async function seed() {
  console.log('🌱 Iniciando seed de base de datos...\n')

  const connected = await testConnection()
  if (!connected) {
    console.error('❌ No se pudo conectar a la base de datos')
    process.exit(1)
  }

  try {
    // Verificar si ya hay datos
    const countResult = await query('SELECT COUNT(*) as total FROM products')
    const count = parseInt(countResult.rows[0].total, 10)

    if (count > 0) {
      console.log(`⚠️  Ya existen ${count} productos en la base de datos.`)
      console.log('   Para cargar productos, usa el endpoint POST /api/stock/import con tu CSV.\n')
      return
    }

    // Insertar algunos productos de ejemplo
    const exampleProducts = [
      { sku: 'SKI-40', name: 'Producto SKI 40', stock: 1200, price: 15000 },
      { sku: 'SKI-50', name: 'Producto SKI 50', stock: 800, price: 18000 },
      { sku: 'SKI-60', name: 'Producto SKI 60', stock: 500, price: 22000 }
    ]

    console.log('📦 Insertando productos de ejemplo...')

    for (const product of exampleProducts) {
      await query(
        `INSERT INTO products (sku, name, stock, price)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (sku) DO UPDATE
         SET name = EXCLUDED.name, stock = EXCLUDED.stock, price = EXCLUDED.price`,
        [product.sku, product.name, product.stock, product.price]
      )
      console.log(`   ✅ ${product.sku}`)
    }

    console.log('\n✅ Seed completado!')
    console.log('\n💡 Para cargar tu CSV real, usa:')
    console.log('   POST /api/stock/import (con archivo CSV)\n')

  } catch (error) {
    console.error('\n❌ Error durante el seed:', error)
    process.exit(1)
  }
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n💥 Error fatal:', error)
    process.exit(1)
  })

