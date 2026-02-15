/**
 * Conexión READ-ONLY a la base MongoDB "stockf" (productos con coming_soon, caracteristicas, etc.).
 * No modifica la conexión principal (database.js). Lazy init: solo conecta en la primera lectura.
 * Usar usuario MongoDB con rol read únicamente sobre stockf.
 */

import mongoose from 'mongoose'

const STOCKF_URI = process.env.MONGO_URI_STOCKF_READ || process.env.MONGO_URI_STOCKF || ''
const CONNECT_OPTIONS = {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 10000,
  maxPoolSize: 3
}

let stockfConnection = null

/**
 * Obtiene la conexión a la base stockf. Devuelve null si MONGO_URI_STOCKF_READ no está definida.
 * La conexión se establece en background; para operaciones usar getStockfConnectionReady().
 * @returns {mongoose.Connection | null}
 */
export function getStockfConnection() {
  if (!STOCKF_URI || STOCKF_URI.trim() === '') {
    return null
  }
  if (stockfConnection) {
    return stockfConnection
  }
  try {
    stockfConnection = mongoose.createConnection(STOCKF_URI, CONNECT_OPTIONS)
    stockfConnection.on('error', (err) => {
      console.warn('[stockf] Conexión error:', err?.message)
    })
    stockfConnection.on('disconnected', () => {
      console.warn('[stockf] Desconectado')
    })
    return stockfConnection
  } catch (err) {
    console.warn('[stockf] Error creando conexión:', err?.message)
    return null
  }
}

/**
 * Devuelve la conexión cuando está lista (para primera lectura). Si no hay URI, devuelve null.
 * @returns {Promise<mongoose.Connection | null>}
 */
export async function getStockfConnectionReady() {
  const conn = getStockfConnection()
  if (!conn) return null
  try {
    await conn.asPromise()
    return conn
  } catch (err) {
    console.warn('[stockf] Conexión no disponible:', err?.message)
    return null
  }
}

/**
 * Cierra la conexión stockf (útil en tests o shutdown).
 */
export async function closeStockfConnection() {
  if (stockfConnection) {
    await stockfConnection.close().catch(() => {})
    stockfConnection = null
  }
}
