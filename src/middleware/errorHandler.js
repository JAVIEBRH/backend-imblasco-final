/**
 * Middleware de manejo de errores
 */

// Handler para rutas no encontradas
export const notFound = (req, res, next) => {
  const error = new Error(`Ruta no encontrada - ${req.originalUrl}`)
  error.status = 404
  res.status(404)
  next(error)
}

// Handler global de errores
export const errorHandler = (err, req, res, next) => {
  // Si la respuesta ya fue enviada, delegar al handler por defecto de Express
  if (res.headersSent) {
    return next(err)
  }

  // Determinar código de estado
  const statusCode = err.status || err.statusCode || (res.statusCode !== 200 ? res.statusCode : 500)
  
  // Log del error (solo en desarrollo o si es error 500+)
  if (statusCode >= 500 || process.env.NODE_ENV === 'development') {
    console.error('[ERROR HANDLER]', {
      status: statusCode,
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method
    })
  }

  // Respuesta de error
  const response = {
    success: false,
    error: true,
    message: err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  }

  // Agregar detalles adicionales para errores de validación
  if (statusCode === 400 && err.details) {
    response.details = err.details
  }

  res.status(statusCode).json(response)
}

