/**
 * Script para encontrar productos variables reales con múltiples variaciones
 * Uso: node src/scripts/find-variable-products.js
 */
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { getAllProducts, getProductVariations } from '../services/wordpress.service.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const envPath = join(__dirname, '../../.env')
dotenv.config({ path: envPath })

async function findVariableProducts() {
  console.log('╔════════════════════════════════════════════════════════╗')
  console.log('║   BUSCANDO PRODUCTOS VARIABLES CON VARIACIONES         ║')
  console.log('╚════════════════════════════════════════════════════════╝')
  console.log()

  try {
    console.log('🔍 Obteniendo todos los productos...')
    const allProducts = await getAllProducts()
    console.log(`✅ Total de productos obtenidos: ${allProducts.length}\n`)

    // Filtrar productos variables
    const variableProducts = allProducts.filter(p => p.type === 'variable')
    console.log(`📦 Productos variables encontrados: ${variableProducts.length}\n`)

    if (variableProducts.length === 0) {
      console.log('❌ No se encontraron productos variables')
      return
    }

    console.log('🔍 Analizando productos variables para encontrar los con múltiples variaciones...\n')

    const productsWithVariations = []
    const maxProducts = 10 // Limitar a 10 productos para no demorar mucho

    for (let i = 0; i < Math.min(variableProducts.length, maxProducts); i++) {
      const product = variableProducts[i]
      console.log(`[${i + 1}/${Math.min(variableProducts.length, maxProducts)}] ${product.name} (ID: ${product.id}, SKU: ${product.sku || 'N/A'})`)

      try {
        const variations = await getProductVariations(product.id)
        
        if (variations && variations.length >= 2) {
          // Verificar que tenga al menos 2 variaciones con SKUs diferentes
          const skus = new Set()
          variations.forEach(v => {
            if (v.sku && v.sku.trim()) {
              skus.add(v.sku.trim())
            }
          })

          if (skus.size >= 2) {
            // Extraer atributos de color si existen
            const colors = new Set()
            variations.forEach(v => {
              if (v.attributes && Array.isArray(v.attributes)) {
                v.attributes.forEach(attr => {
                  const attrName = (attr.name || '').toLowerCase()
                  if (attrName === 'color' || attrName === 'pa_color' || attrName.includes('color')) {
                    if (attr.option) {
                      colors.add(attr.option)
                    }
                  }
                })
              }
            })

            productsWithVariations.push({
              id: product.id,
              name: product.name,
              sku: product.sku || null,
              variationCount: variations.length,
              skuCount: skus.size,
              skus: Array.from(skus),
              colors: Array.from(colors),
              variations: variations.map(v => ({
                id: v.id,
                sku: v.sku,
                stock: v.stock_quantity,
                attributes: v.attributes
              }))
            })

            console.log(`   ✅ ${variations.length} variaciones, ${skus.size} SKUs únicos`)
            if (colors.size > 0) {
              console.log(`   🎨 Colores: ${Array.from(colors).join(', ')}`)
            }
          } else {
            console.log(`   ⚠️  Solo ${skus.size} SKU(s) único(s)`)
          }
        } else {
          console.log(`   ⚠️  Solo ${variations?.length || 0} variación(es)`)
        }
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`)
      }
      console.log()
    }

    // Mostrar resumen
    console.log('╔════════════════════════════════════════════════════════╗')
    console.log('║                    RESULTADOS                          ║')
    console.log('╚════════════════════════════════════════════════════════╝')
    console.log()

    if (productsWithVariations.length === 0) {
      console.log('❌ No se encontraron productos variables con múltiples variaciones y SKUs diferentes')
      console.log('   Todos los productos variables tienen menos de 2 variaciones o SKUs duplicados')
    } else {
      console.log(`✅ Encontrados ${productsWithVariations.length} producto(s) variable(s) con múltiples variaciones:\n`)

      // Mostrar los primeros 5
      const topProducts = productsWithVariations.slice(0, 5)
      topProducts.forEach((product, index) => {
        console.log(`${index + 1}. ${product.name}`)
        console.log(`   ID: ${product.id}`)
        console.log(`   SKU padre: ${product.sku || 'N/A'}`)
        console.log(`   Variaciones: ${product.variationCount}`)
        console.log(`   SKUs únicos: ${product.skuCount}`)
        console.log(`   SKUs: ${product.skus.join(', ')}`)
        if (product.colors.length > 0) {
          console.log(`   Colores: ${product.colors.join(', ')}`)
        }
        console.log()
      })

      // Guardar resultados en formato JSON para usar en tests
      console.log('💡 SKUs recomendados para pruebas:')
      topProducts.forEach((product, index) => {
        if (product.skus.length > 0) {
          console.log(`   Test ${index + 1}: SKU padre "${product.sku || product.id}" o variación "${product.skus[0]}"`)
        }
      })
      console.log()
    }

  } catch (error) {
    console.error('❌ Error buscando productos variables:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

findVariableProducts()
