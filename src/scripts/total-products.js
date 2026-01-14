/**
 * Script para obtener el total de productos de WooCommerce
 * Uso: node src/scripts/total-products.js
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Configurar dotenv
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const envPath = join(__dirname, '../../.env')

dotenv.config({ path: envPath })

async function getTotalProducts() {
  try {
    const WC_URL = process.env.WC_URL || 'https://imblasco.cl'
    const WC_KEY = process.env.WC_KEY
    const WC_SECRET = process.env.WC_SECRET
    
    if (!WC_KEY || !WC_SECRET) {
      console.error('❌ ERROR: WC_KEY o WC_SECRET no configuradas en .env')
      process.exit(1)
    }
    
    // Crear autenticación básica
    const auth = Buffer.from(`${WC_KEY}:${WC_SECRET}`).toString('base64')
    const url = `${WC_URL}/wp-json/wc/v3/products?per_page=1`
    
    console.log('🔍 Consultando total de productos en WooCommerce...\n')
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ Error WooCommerce API (${response.status}):`, errorText.substring(0, 200))
      process.exit(1)
    }
    
    // Leer headers de paginación
    const totalProducts = response.headers.get('X-WP-Total')
    const totalPages = response.headers.get('X-WP-TotalPages')
    
    console.log('╔════════════════════════════════════════════════════════╗')
    console.log('║        TOTAL DE PRODUCTOS EN WOOCOMMERCE               ║')
    console.log('╚════════════════════════════════════════════════════════╝')
    console.log()
    
    if (totalProducts) {
      const total = parseInt(totalProducts)
      const pages = totalPages ? parseInt(totalPages) : Math.ceil(total / 100)
      
      console.log(`📦 Total de productos: ${total.toLocaleString()}`)
      console.log(`📄 Total de páginas (a 100 por página): ${pages}`)
      console.log()
      
      if (total > 100) {
        console.log('⚠️  ADVERTENCIA: Tienes más de 100 productos')
        console.log(`   Actualmente solo se consultan los primeros 50-100 productos`)
        console.log(`   Considera implementar paginación para obtener todos los productos`)
        console.log()
      } else {
        console.log('✅ Con el límite actual de 100 productos por página,')
        console.log('   puedes obtener todos los productos sin paginación')
        console.log()
      }
    } else {
      console.log('⚠️  No se pudo obtener el total de productos')
      console.log('   (Los headers X-WP-Total no están disponibles)')
      console.log('   Esto puede deberse a configuración de caché en WordPress')
      console.log()
    }
    
  } catch (error) {
    console.error('❌ Error consultando productos:', error.message)
    if (error.message.includes('fetch')) {
      console.error('\n💡 Verifica tu conexión a internet y la URL de WooCommerce')
    }
    process.exit(1)
  }
}

// Ejecutar
getTotalProducts()
