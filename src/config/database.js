/**
 * DATABASE CONFIGURATION
 * Conexión a MongoDB usando Mongoose
 */

import mongoose from 'mongoose';

// Configuración de conexión (base final: dataimblasco)
function getMongoUri() {
  if (process.env.MONGO_URI) {
    return process.env.MONGO_URI;
  }
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  // O construir desde variables individuales (base final: dataimblasco)
  const host = process.env.DB_HOST || process.env.MONGO_HOST || 'localhost';
  const port = process.env.DB_PORT || process.env.MONGO_PORT || '27017';
  const database = process.env.DB_NAME || process.env.MONGO_DB || 'dataimblasco';
  const user = process.env.DB_USER || process.env.MONGO_USER || '';
  const password = process.env.DB_PASSWORD || process.env.MONGO_PASSWORD || '';

  // Si hay usuario/password, usar autenticación
  if (user && password) {
    return `mongodb://${user}:${password}@${host}:${port}/${database}?authSource=admin`;
  }

  // Conexión local sin autenticación
  return `mongodb://${host}:${port}/${database}`;
}

let isConnected = false;

/**
 * Conectar a MongoDB
 * @returns {Promise<mongoose.Connection>}
 */
export async function connect() {
  if (isConnected) {
    console.log('[MongoDB] Ya está conectado');
    return mongoose.connection;
  }

  try {
    const mongoUri = getMongoUri();
    
    const options = {
      maxPoolSize: 10, // Mantener hasta 10 conexiones
      serverSelectionTimeoutMS: 5000, // Timeout de 5 segundos
      socketTimeoutMS: 45000, // Cerrar sockets después de 45s de inactividad
    };

    // Conectar
    await mongoose.connect(mongoUri, options);

    isConnected = true;
    console.log('[MongoDB] ✅ Conectado exitosamente');
    console.log(`  Database: ${mongoose.connection.db.databaseName}`);

    // Manejo de eventos
    mongoose.connection.on('error', (err) => {
      console.error('[MongoDB] ❌ Error de conexión:', err.message);
      isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[MongoDB] ⚠️ Desconectado');
      isConnected = false;
    });

    mongoose.connection.on('reconnected', () => {
      console.log('[MongoDB] ✅ Reconectado');
      isConnected = true;
    });

    return mongoose.connection;
  } catch (error) {
    console.error('[MongoDB] ❌ Error al conectar:', error.message);
    isConnected = false;
    throw error;
  }
}

/**
 * Desconectar de MongoDB
 */
export async function disconnect() {
  if (isConnected) {
    await mongoose.disconnect();
    isConnected = false;
    console.log('[MongoDB] Desconectado');
  }
}

/**
 * Verificar conexión
 * @returns {Promise<boolean>}
 */
export async function testConnection() {
  try {
    if (!isConnected) {
      await connect();
    }
    
    // Ping a la base de datos
    await mongoose.connection.db.admin().ping();
    console.log('✅ MongoDB connected');
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    return false;
  }
}

/**
 * Obtener el estado de la conexión
 */
export function getConnectionState() {
  return {
    isConnected,
    readyState: mongoose.connection.readyState, // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
    dbName: mongoose.connection.db?.databaseName
  };
}

// Exportar mongoose para uso en modelos
export default mongoose;
