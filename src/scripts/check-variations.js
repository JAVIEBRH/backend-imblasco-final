/**
 * Script para verificar productos variables y sus variaciones en WooCommerce
 * Uso: node src/scripts/check-variations.js
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Configurar dotenv
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const envPath = join(__dirname, '../../.env')

dotenv.config({ path: envPath })

async function checkVariations() {
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
    
    console.log('🔍 Verificando productos variables y variaciones en WooCommerce...\n')
    
    // Obtener todos los productos
    let allProducts = []
    let page = 1
    let totalPages = 1
    
    do {
      const url = `${WC_URL}/wp-json/wc/v3/products?per_page=100&page=${page}&status=publish`
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`)
      }
      
      const products = await response.json()
      allProducts = allProducts.concat(products)
      
      totalPages = parseInt(response.headers.get('X-WP-TotalPages') || '1')
      console.log(`📄 Página ${page}/${totalPages}: ${products.length} productos obtenidos`)
      
      page++
    } while (page <= totalPages)
    
    console.log(`\n✅ Total de productos obtenidos: ${allProducts.length}\n`)
    
    // Identificar productos variables
    const variableProducts = allProducts.filter(p => p.type === 'variable')
    const simpleProducts = allProducts.filter(p => p.type === 'simple')
    
    console.log('╔════════════════════════════════════════════════════════╗')
    console.log('║        ANÁLISIS DE PRODUCTOS Y VARIACIONES             ║')
    console.log('╚════════════════════════════════════════════════════════╝')
    console.log()
    console.log(`📦 Productos simples: ${simpleProducts.length}`)
    console.log(`🔄 Productos variables: ${variableProducts.length}`)
    console.log()
    
    if (variableProducts.length === 0) {
      console.log('✅ No hay productos variables en tu catálogo.')
      console.log('   Todos los productos son simples (sin variaciones).')
      console.log('   No es necesario implementar soporte para variaciones.')
      console.log()
      return
    }
    
    console.log(`🔍 Analizando ${variableProducts.length} productos variables...\n`)
    
    // Analizar cada producto variable
    let totalVariations = 0
    let variationsWithSku = 0
    let productsWithMultipleSkus = []
    let productsWithoutVariations = []
    
    for (let i = 0; i < variableProducts.length; i++) {
      const product = variableProducts[i]
      const productName = product.name || `Producto #${product.id}`
      
      console.log(`[${i + 1}/${variableProducts.length}] ${productName} (ID: ${product.id})`)
      
      // Obtener variaciones del producto
      const variationsUrl = `${WC_URL}/wp-json/wc/v3/products/${product.id}/variations?per_page=100`
      const variationsResponse = await fetch(variationsUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (variationsResponse.ok) {
        const variations = await variationsResponse.json()
        totalVariations += variations.length
        
        if (variations.length === 0) {
          productsWithoutVariations.push({
            id: product.id,
            name: productName,
            sku: product.sku || 'Sin SKU'
          })
          console.log(`   ⚠️  Sin variaciones configuradas`)
        } else {
          console.log(`   📋 Variaciones: ${variations.length}`)
          
          // Verificar SKUs de variaciones
          const skus = new Set()
          variations.forEach(variation => {
            if (variation.sku) {
              skus.add(variation.sku)
              variationsWithSku++
            }
          })
          
          if (skus.size > 0) {
            console.log(`   🏷️  SKUs únicos en variaciones: ${skus.size}`)
            if (skus.size > 1) {
              productsWithMultipleSkus.push({
                id: product.id,
                name: productName,
                skus: Array.from(skus),
                variationCount: variations.length
              })
              console.log(`   ⚠️  Múltiples SKUs: ${Array.from(skus).join(', ')}`)
            } else {
              console.log(`   ✅ Un solo SKU: ${Array.from(skus)[0]}`)
            }
          } else {
            console.log(`   ⚠️  Ninguna variación tiene SKU`)
          }
        }
      } else {
        console.log(`   ❌ Error obteniendo variaciones: ${variationsResponse.status}`)
      }
      
      console.log()
    }
    
    // Resumen final
    console.log('╔════════════════════════════════════════════════════════╗')
    console.log('║                    RESUMEN                            ║')
    console.log('╚════════════════════════════════════════════════════════╝')
    console.log()
    console.log(`📊 Estadísticas:`)
    console.log(`   • Productos variables: ${variableProducts.length}`)
    console.log(`   • Total de variaciones: ${totalVariations}`)
    console.log(`   • Variaciones con SKU: ${variationsWithSku}`)
    console.log(`   • Productos con múltiples SKUs: ${productsWithMultipleSkus.length}`)
    console.log(`   • Productos sin variaciones: ${productsWithoutVariations.length}`)
    console.log()
    
    if (productsWithMultipleSkus.length > 0) {
      console.log('⚠️  PRODUCTOS CON MÚLTIPLES SKUs (necesitan soporte para variaciones):')
      productsWithMultipleSkus.forEach(p => {
        console.log(`   • ${p.name} (ID: ${p.id})`)
        console.log(`     SKUs: ${p.skus.join(', ')}`)
        console.log(`     Variaciones: ${p.variationCount}`)
      })
      console.log()
      console.log('💡 RECOMENDACIÓN: Implementar soporte para variaciones')
      console.log('   para que el sistema pueda buscar por SKU de variaciones.')
    } else if (variationsWithSku > 0) {
      console.log('✅ Las variaciones tienen SKUs, pero cada producto tiene un solo SKU por variación.')
      console.log('💡 RECOMENDACIÓN: Implementar soporte para variaciones')
      console.log('   para que el sistema pueda buscar por SKU de variaciones.')
    } else {
      console.log('✅ No hay variaciones con SKUs diferentes.')
      console.log('   No es crítico implementar soporte para variaciones ahora.')
    }
    
    if (productsWithoutVariations.length > 0) {
      console.log()
      console.log('⚠️  PRODUCTOS VARIABLES SIN VARIACIONES:')
      productsWithoutVariations.forEach(p => {
        console.log(`   • ${p.name} (ID: ${p.id}, SKU: ${p.sku})`)
      })
    }
    
  } catch (error) {
    console.error('❌ Error verificando variaciones:', error.message)
    if (error.message.includes('fetch')) {
      console.error('\n💡 Verifica tu conexión a internet y la URL de WooCommerce')
    }
    process.exit(1)
  }
}

// Ejecutar
checkVariations()
