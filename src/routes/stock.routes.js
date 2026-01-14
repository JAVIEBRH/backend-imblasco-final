/**
 * STOCK ROUTES
 * Endpoints para gestión de inventario
 */

import { Router } from 'express'
import multer from 'multer'
import * as stockService from '../services/stock.service.js'
import * as csvImportService from '../services/csv-import.service.js'

export const stockRouter = Router()

// Configuración de multer para upload de CSV
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true)
    } else {
      cb(new Error('Solo se permiten archivos CSV'))
    }
  }
})

/**
 * POST /api/stock/import
 * Importar archivo CSV de stock (WooCommerce) a PostgreSQL
 */
stockRouter.post('/import', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: true,
        message: 'No se proporcionó archivo CSV'
      })
    }

    // Detectar encoding (por defecto utf8, pero puede ser latin1)
    const encoding = req.body.encoding || 'utf8'
    const csvContent = req.file.buffer.toString(encoding)

    // Importar usando el servicio de importación
    const result = await csvImportService.importCSV(csvContent, encoding)

    res.json({
      success: true,
      message: `Stock importado: ${result.import.inserted} nuevos, ${result.import.updated} actualizados`,
      ...result
    })

  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/stock/upload (LEGACY - mantiene compatibilidad)
 * @deprecated Usar /api/stock/import en su lugar
 */
stockRouter.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: true,
        message: 'No se proporcionó archivo CSV'
      })
    }

    const encoding = req.body.encoding || 'utf8'
    const csvContent = req.file.buffer.toString(encoding)

    const result = await csvImportService.importCSV(csvContent, encoding)

    res.json({
      success: true,
      message: `Stock cargado: ${result.import.inserted + result.import.updated} productos`,
      loaded: result.import.inserted + result.import.updated,
      ...result
    })

  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/stock/upload-text
 * Importar stock desde texto CSV (sin archivo)
 */
stockRouter.post('/upload-text', async (req, res, next) => {
  try {
    const { csvContent, encoding = 'utf8' } = req.body

    if (!csvContent) {
      return res.status(400).json({
        success: false,
        error: 'No se proporcionó contenido CSV'
      })
    }

    const result = await csvImportService.importCSV(csvContent, encoding)
    res.json({
      success: true,
      message: `Stock importado: ${result.import.inserted + result.import.updated} productos`,
      ...result
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/stock
 * Obtener todo el stock
 */
stockRouter.get('/', async (req, res, next) => {
  try {
    const { limit = 1000, offset = 0, available_only } = req.query
    
    // Validar y limitar
    let limitNum = parseInt(limit, 10)
    if (isNaN(limitNum) || limitNum < 1) limitNum = 1000
    if (limitNum > 1000) limitNum = 1000 // Máximo para prevenir DoS
    
    let offsetNum = parseInt(offset, 10)
    if (isNaN(offsetNum) || offsetNum < 0) offsetNum = 0
    
    const result = await stockService.getAllStock({
      limit: limitNum,
      offset: offsetNum,
      availableOnly: available_only === 'true'
    })
    res.json({
      success: true,
      ...result
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/stock/search?q=termino
 * Buscar productos
 */
stockRouter.get('/search', async (req, res, next) => {
  try {
    const { q, limit = 10 } = req.query
    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      return res.json({ results: [], query: '' })
    }

    // Validar y limitar
    let limitNum = parseInt(limit, 10)
    if (isNaN(limitNum) || limitNum < 1) limitNum = 10
    if (limitNum > 100) limitNum = 100 // Máximo para búsquedas

    const results = await stockService.searchProducts(q.trim(), limitNum)
    res.json({
      query: q,
      results,
      count: results.length
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/stock/:sku
 * Obtener producto por SKU
 */
stockRouter.get('/:sku', async (req, res, next) => {
  try {
    const { sku } = req.params
    const product = await stockService.getProductBySKU(sku)

    if (!product) {
      return res.status(404).json({
        error: true,
        message: `Producto ${sku} no encontrado`
      })
    }

    res.json(product)
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/stock/check
 * Validar disponibilidad de stock
 */
stockRouter.post('/check', async (req, res, next) => {
  try {
    const { sku, quantity } = req.body
    const cantidad = quantity || req.body.cantidad

    if (!sku || typeof sku !== 'string' || sku.trim().length === 0) {
      return res.status(400).json({
        error: true,
        message: 'sku debe ser un string no vacío'
      })
    }

    if (!cantidad) {
      return res.status(400).json({
        error: true,
        message: 'cantidad es requerida'
      })
    }

    const cantidadNum = parseInt(cantidad, 10)
    if (isNaN(cantidadNum) || cantidadNum <= 0) {
      return res.status(400).json({
        error: true,
        message: 'cantidad debe ser un número mayor a 0'
      })
    }

    const sanitizedSKU = sku.trim().toUpperCase().replace(/[^A-Z0-9\-]/g, '')
    if (sanitizedSKU.length === 0) {
      return res.status(400).json({
        error: true,
        message: 'sku contiene caracteres inválidos'
      })
    }

    const validation = await stockService.checkStock(sanitizedSKU, cantidadNum)
    res.json(validation)
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/stock/validate (LEGACY - mantiene compatibilidad)
 */
stockRouter.post('/validate', async (req, res, next) => {
  try {
    const { sku, cantidad } = req.body

    if (!sku || typeof sku !== 'string' || sku.trim().length === 0) {
      return res.status(400).json({
        error: true,
        message: 'sku debe ser un string no vacío'
      })
    }

    if (!cantidad) {
      return res.status(400).json({
        error: true,
        message: 'cantidad es requerida'
      })
    }

    const cantidadNum = parseInt(cantidad, 10)
    if (isNaN(cantidadNum) || cantidadNum <= 0) {
      return res.status(400).json({
        error: true,
        message: 'cantidad debe ser un número mayor a 0'
      })
    }

    const sanitizedSKU = sku.trim().toUpperCase().replace(/[^A-Z0-9\-]/g, '')
    if (sanitizedSKU.length === 0) {
      return res.status(400).json({
        error: true,
        message: 'sku contiene caracteres inválidos'
      })
    }

    const validation = await stockService.validateStock(sanitizedSKU, cantidadNum)
    res.json(validation)
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/stock/filter/available
 * Obtener solo productos con stock disponible
 */
stockRouter.get('/filter/available', async (req, res, next) => {
  try {
    const { limit = 1000 } = req.query
    
    // Validar y limitar
    let limitNum = parseInt(limit, 10)
    if (isNaN(limitNum) || limitNum < 1) limitNum = 1000
    if (limitNum > 1000) limitNum = 1000 // Máximo
    
    const products = await stockService.getAvailableProducts(limitNum)
    res.json({
      products,
      count: products.length
    })
  } catch (error) {
    next(error)
  }
})

export default stockRouter

