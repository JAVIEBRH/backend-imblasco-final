/**
 * CSV IMPORT SERVICE
 * Parser robusto para CSV de WooCommerce
 * 
 * Características:
 * - Detecta separador (coma o punto y coma)
 * - Maneja encoding latin1/windows-1252 y UTF-8
 * - Normaliza datos
 * - Consolida productos por SKU
 * - Validaciones robustas
 */

import { parse } from 'csv-parse/sync'
import { Product } from '../models/index.js'

/**
 * Mapeo de columnas WooCommerce
 * Busca variantes comunes de nombres de columnas
 */
const COLUMN_MAPPINGS = {
  sku: ['sku', 'codigo', 'codigo_producto', 'code', 'product_code'],
  name: ['nombre', 'name', 'nombre_producto', 'producto', 'descripcion', 'title', 'product_name'],
  stock: ['inventario', 'stock', 'stock_quantity', 'stock_disponible', 'cantidad', 'qty', 'quantity', 'existencias'],
  price: ['precio_normal', 'precio normal', 'regular_price', 'price', 'precio', 'precio_regular']
}

/**
 * Normalizar nombre de columna
 * @param {string} colName - Nombre de columna original
 * @returns {string} - Nombre normalizado
 */
function normalizeColumnName(colName) {
  return colName
    .toLowerCase()
    .trim()
    .replace(/"/g, '')
    .replace(/\s+/g, '_')
}

/**
 * Encontrar índice de columna
 * @param {Array<string>} headers - Headers normalizados
 * @param {Array<string>} possibleNames - Nombres posibles
 * @returns {number} - Índice o -1 si no se encuentra
 */
function findColumnIndex(headers, possibleNames) {
  for (const name of possibleNames) {
    const idx = headers.findIndex(h => h.includes(name) || name.includes(h))
    if (idx >= 0) return idx
  }
  return -1
}

/**
 * Parsear CSV de WooCommerce
 * @param {string|Buffer} csvContent - Contenido del CSV
 * @param {string} encoding - Encoding (latin1, utf8, etc.)
 * @returns {Array<Object>} - Array de productos parseados
 */
export function parseWooCommerceCSV(csvContent, encoding = 'utf8') {
  try {
    // Convertir a string si es Buffer
    let content = csvContent
    if (Buffer.isBuffer(csvContent)) {
      content = csvContent.toString(encoding)
    }

    // Detectar separador
    const firstLine = content.split('\n')[0]
    const hasSemicolon = firstLine.includes(';') && firstLine.split(';').length > firstLine.split(',').length
    const delimiter = hasSemicolon ? ';' : ','

    // Parsear CSV usando csv-parse
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      relax_column_count: true,
      delimiter,
      encoding: encoding === 'latin1' || encoding === 'windows-1252' ? 'latin1' : 'utf8',
      bom: true // Manejar BOM si existe
    })

    if (!records || records.length === 0) {
      throw new Error('CSV vacío o sin datos')
    }

    // Normalizar headers
    const headers = Object.keys(records[0]).map(normalizeColumnName)
    
    // Encontrar índices de columnas relevantes
    const skuIdx = findColumnIndex(headers, COLUMN_MAPPINGS.sku)
    const nameIdx = findColumnIndex(headers, COLUMN_MAPPINGS.name)
    const stockIdx = findColumnIndex(headers, COLUMN_MAPPINGS.stock)
    const priceIdx = findColumnIndex(headers, COLUMN_MAPPINGS.price)

    if (skuIdx === -1) {
      throw new Error('Columna SKU no encontrada. Columnas disponibles: ' + headers.join(', '))
    }

    if (stockIdx === -1) {
      throw new Error('Columna de stock no encontrada. Columnas disponibles: ' + headers.join(', '))
    }

    // Procesar registros
    const products = new Map() // Usar Map para consolidar por SKU
    const errors = []

    records.forEach((record, idx) => {
      try {
        const rawValues = Object.values(record)
        const sku = (rawValues[skuIdx] || '').toString().trim().toUpperCase()
        const name = nameIdx >= 0 ? (rawValues[nameIdx] || '').toString().trim() : sku
        const stockRaw = rawValues[stockIdx] || '0'
        const priceRaw = priceIdx >= 0 ? (rawValues[priceIdx] || '0') : '0'

        // Validar SKU
        if (!sku || sku === 'NULL' || sku === '') {
          errors.push(`Línea ${idx + 2}: SKU vacío o inválido`)
          return
        }

        // Parsear stock
        const stock = parseInt(stockRaw.toString().replace(/[^\d-]/g, ''), 10)
        if (isNaN(stock) || stock < 0) {
          errors.push(`Línea ${idx + 2}: Stock inválido para ${sku} (valor: ${stockRaw})`)
          return
        }

        // Parsear precio
        const priceRawStr = priceRaw.toString().replace(/[^\d.,]/g, '').replace(',', '.')
        const price = parseFloat(priceRawStr) || 0

        // Consolidar por SKU (si ya existe, usar el que tenga mayor stock o actualizar)
        if (products.has(sku)) {
          const existing = products.get(sku)
          // Actualizar si este registro tiene más stock o precio más reciente
          if (stock > existing.stock || price > 0) {
            products.set(sku, {
              sku,
              name: name || existing.name,
              stock,
              price: price > 0 ? price : existing.price
            })
          }
        } else {
          products.set(sku, {
            sku,
            name: name || sku,
            stock,
            price
          })
        }
      } catch (error) {
        errors.push(`Línea ${idx + 2}: ${error.message}`)
      }
    })

    return {
      products: Array.from(products.values()),
      errors: errors.length > 0 ? errors : null,
      totalRows: records.length,
      processedRows: products.size
    }
  } catch (error) {
    throw new Error(`Error parseando CSV: ${error.message}`)
  }
}

/**
 * Importar productos a MongoDB
 * @param {Array<Object>} products - Array de productos parseados
 * @returns {Promise<Object>} - Resultado de la importación
 */
export async function importProductsToDatabase(products) {
  if (!products || products.length === 0) {
    throw new Error('No hay productos para importar')
  }

  try {
    let inserted = 0
    let updated = 0
    const errors = []

    // Usar bulkWrite para mejor rendimiento
    const bulkOps = []

    for (const product of products) {
      try {
        const normalizedSKU = product.sku?.trim().toUpperCase()
        
        if (!normalizedSKU) {
          errors.push(`SKU vacío para producto: ${product.name || 'sin nombre'}`)
          continue
        }

        // Upsert: actualizar si existe, insertar si no existe
        bulkOps.push({
          updateOne: {
            filter: { sku: normalizedSKU },
            update: {
              $set: {
                name: product.name || normalizedSKU,
                stock: parseInt(product.stock, 10) || 0,
                price: parseFloat(product.price) || 0,
                updatedAt: new Date()
              },
              $setOnInsert: {
                createdAt: new Date()
              }
            },
            upsert: true
          }
        })
      } catch (error) {
        errors.push(`SKU ${product.sku}: ${error.message}`)
      }
    }

    // Ejecutar operaciones en lote
    if (bulkOps.length > 0) {
      const result = await Product.bulkWrite(bulkOps, { ordered: false })
      inserted = result.upsertedCount
      updated = result.modifiedCount
    }

    return {
      success: true,
      inserted,
      updated,
      total: products.length,
      errors: errors.length > 0 ? errors : null
    }
  } catch (error) {
    throw error
  }
}

/**
 * Importar CSV completo (parse + import)
 * @param {string|Buffer} csvContent - Contenido del CSV
 * @param {string} encoding - Encoding
 * @returns {Promise<Object>} - Resultado completo
 */
export async function importCSV(csvContent, encoding = 'utf8') {
  const startTime = Date.now()

  // Parsear CSV
  const parseResult = parseWooCommerceCSV(csvContent, encoding)

  if (parseResult.errors && parseResult.errors.length > 0) {
    console.warn(`⚠️  Errores durante parsing: ${parseResult.errors.length}`)
  }

  // Importar a base de datos
  const importResult = await importProductsToDatabase(parseResult.products)

  const duration = Date.now() - startTime

  return {
    success: true,
    parse: {
      totalRows: parseResult.totalRows,
      processedRows: parseResult.processedRows,
      errors: parseResult.errors
    },
    import: importResult,
    duration: `${duration}ms`,
    timestamp: new Date().toISOString()
  }
}

export default {
  parseWooCommerceCSV,
  importProductsToDatabase,
  importCSV
}

