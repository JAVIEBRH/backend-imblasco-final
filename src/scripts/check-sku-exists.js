/**
 * Verificar si un SKU existe en WooCommerce
 */
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import wordpressService from '../services/wordpress.service.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const envPath = join(__dirname, '../../.env')
dotenv.config({ path: envPath })

const skuToCheck = process.argv[2] || 'M999999'

console.log(`🔍 Verificando si existe el SKU: ${skuToCheck}\n`)

try {
  const product = await wordpressService.getProductBySku(skuToCheck)
  
  if (product) {
    console.log('✅ SKU ENCONTRADO:')
    console.log(`   Nombre: ${product.name || 'N/A'}`)
    console.log(`   SKU: ${product.sku || 'N/A'}`)
    console.log(`   ID: ${product.id || 'N/A'}`)
    console.log(`   Tipo: ${product.type || 'N/A'}`)
    console.log(`   Stock: ${product.stock_quantity !== null ? product.stock_quantity : product.stock_status || 'N/A'}`)
    console.log(`   Precio: ${product.price ? '$' + product.price : 'N/A'}`)
    if (product.parent_id) {
      console.log(`   ⚠️  Este es una VARIACIÓN (parent_id: ${product.parent_id})`)
    }
  } else {
    console.log('❌ SKU NO ENCONTRADO')
    console.log(`   El SKU "${skuToCheck}" no existe en WooCommerce`)
  }
} catch (error) {
  console.error(`❌ Error verificando SKU: ${error.message}`)
}

process.exit(0)
