/**
 * Script para verificar el tipo de un SKU específico
 * Verifica si es una variación o un producto padre
 * Uso: node src/scripts/verify-sku-type.js [SKU]
 */
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { getProductBySku, getProductVariations } from '../services/wordpress.service.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const envPath = join(__dirname, '../../.env')
dotenv.config({ path: envPath })

const SKU_TO_CHECK = process.argv[2] || '601062670'

async function verifySkuType() {
  console.log('╔════════════════════════════════════════════════════════╗')
  console.log('║        VERIFICACIÓN DE TIPO DE SKU                     ║')
  console.log('╚════════════════════════════════════════════════════════╝')
  console.log()
  console.log(`🔍 Verificando SKU: ${SKU_TO_CHECK}\n`)

  try {
    // Consultar el producto por SKU
    const product = await getProductBySku(SKU_TO_CHECK)
    
    if (!product) {
      console.log(`❌ No se encontró producto con SKU: ${SKU_TO_CHECK}`)
      process.exit(1)
    }

    console.log('✅ Producto encontrado:')
    console.log(`   ID: ${product.id}`)
    console.log(`   Nombre: ${product.name}`)
    console.log(`   SKU: ${product.sku}`)
    console.log(`   Tipo: ${product.type}`)
    console.log(`   Parent ID: ${product.parent_id || 'N/A'}`)
    console.log()

    // Verificar si es una variación
    if (product.parent_id) {
      console.log('📋 RESULTADO: Este SKU es una VARIACIÓN')
      console.log(`   Producto padre ID: ${product.parent_id}`)
      console.log()
      
      // Intentar obtener el producto padre
      try {
        const { WC_URL } = await import('../services/wordpress.service.js').then(m => m.default || {})
        const WC_URL_ENV = process.env.WC_URL || 'https://imblasco.cl'
        const WC_KEY = process.env.WC_KEY
        const WC_SECRET = process.env.WC_SECRET
        
        if (WC_KEY && WC_SECRET) {
          const auth = Buffer.from(`${WC_KEY}:${WC_SECRET}`).toString('base64')
          const parentUrl = `${WC_URL_ENV}/wp-json/wc/v3/products/${product.parent_id}`
          
          const response = await fetch(parentUrl, {
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/json'
            }
          })
          
          if (response.ok) {
            const parentProduct = await response.json()
            console.log('📦 Producto padre:')
            console.log(`   ID: ${parentProduct.id}`)
            console.log(`   Nombre: ${parentProduct.name}`)
            console.log(`   SKU: ${parentProduct.sku || 'N/A'}`)
            console.log(`   Tipo: ${parentProduct.type}`)
            console.log()
            
            // Obtener variaciones del padre
            const variations = await getProductVariations(product.parent_id)
            console.log(`🔄 Variaciones del producto padre: ${variations.length}`)
            if (variations.length > 0) {
              console.log('   Variaciones disponibles:')
              variations.forEach((v, i) => {
                const colorAttr = v.attributes?.find(a => a.name?.toLowerCase() === 'color' || a.name?.toLowerCase() === 'pa_color')
                const color = colorAttr?.option || 'N/A'
                console.log(`   ${i + 1}. SKU: ${v.sku || 'N/A'} - Color: ${color} - Stock: ${v.stock_quantity || 'N/A'}`)
              })
            }
          }
        }
      } catch (error) {
        console.log(`⚠️  No se pudo obtener información del producto padre: ${error.message}`)
      }
    } else if (product.type === 'variable') {
      console.log('📋 RESULTADO: Este SKU es un PRODUCTO PADRE VARIABLE')
      console.log()
      
      // Obtener variaciones
      const variations = await getProductVariations(product.id)
      console.log(`🔄 Variaciones disponibles: ${variations.length}`)
      if (variations.length > 0) {
        console.log('   Variaciones:')
        variations.forEach((v, i) => {
          const colorAttr = v.attributes?.find(a => a.name?.toLowerCase() === 'color' || a.name?.toLowerCase() === 'pa_color')
          const color = colorAttr?.option || 'N/A'
          console.log(`   ${i + 1}. SKU: ${v.sku || 'N/A'} - Color: ${color} - Stock: ${v.stock_quantity || 'N/A'}`)
        })
      } else {
        console.log('   ⚠️  No tiene variaciones configuradas')
      }
    } else {
      console.log('📋 RESULTADO: Este SKU es un PRODUCTO SIMPLE')
      console.log('   No tiene variaciones')
    }

    console.log()
    console.log('╔════════════════════════════════════════════════════════╗')
    console.log('║                    RESUMEN                             ║')
    console.log('╚════════════════════════════════════════════════════════╝')
    console.log()
    console.log(`SKU: ${SKU_TO_CHECK}`)
    console.log(`Tipo: ${product.type}`)
    console.log(`Es variación: ${product.parent_id ? 'Sí' : 'No'}`)
    if (product.parent_id) {
      console.log(`Producto padre ID: ${product.parent_id}`)
    }
    if (product.type === 'variable') {
      const variations = await getProductVariations(product.id)
      console.log(`Variaciones disponibles: ${variations.length}`)
    }
    console.log()

  } catch (error) {
    console.error('❌ Error verificando SKU:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

verifySkuType()
