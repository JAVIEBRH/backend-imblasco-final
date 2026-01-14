/**
 * Script para obtener un producto aleatorio de WooCommerce
 * Uso: node src/scripts/random-product.js
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { getProductsSample } from '../services/wordpress.service.js'

// Configurar dotenv
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const envPath = join(__dirname, '../../.env')

dotenv.config({ path: envPath })

async function getRandomProduct() {
  try {
    console.log('🔍 Buscando productos en WooCommerce...\n')
    
    // Obtener una muestra de productos (100 productos)
    const products = await getProductsSample(100)
    
    if (!products || products.length === 0) {
      console.log('❌ No se encontraron productos en WooCommerce')
      process.exit(1)
    }
    
    // Seleccionar un producto aleatorio
    const randomIndex = Math.floor(Math.random() * products.length)
    const product = products[randomIndex]
    
    console.log('╔════════════════════════════════════════════════════════╗')
    console.log('║        PRODUCTO ALEATORIO DE WOOCOMMERCE             ║')
    console.log('╚════════════════════════════════════════════════════════╝')
    console.log()
    console.log(`📦 Nombre: ${product.name}`)
    console.log(`🆔 ID: ${product.id}`)
    console.log(`🏷️  SKU: ${product.sku || 'N/A'}`)
    console.log(`💰 Precio: ${product.price ? '$' + product.price : 'N/A'}`)
    console.log(`📊 Stock: ${product.stock_quantity !== null ? product.stock_quantity : 'N/A'}`)
    console.log(`✅ Estado: ${product.stock_status}`)
    console.log(`📈 Disponible: ${product.available ? 'Sí' : 'No'}`)
    console.log()
    console.log(`📋 Total de productos consultados: ${products.length}`)
    console.log(`🎲 Producto seleccionado: #${randomIndex + 1} de ${products.length}`)
    console.log()
    
  } catch (error) {
    console.error('❌ Error obteniendo producto aleatorio:', error.message)
    if (error.message.includes('WC_KEY') || error.message.includes('WC_SECRET')) {
      console.error('\n💡 Asegúrate de tener configuradas las variables:')
      console.error('   - WC_URL')
      console.error('   - WC_KEY')
      console.error('   - WC_SECRET')
      console.error('   en el archivo .env')
    }
    process.exit(1)
  }
}

// Ejecutar
getRandomProduct()
