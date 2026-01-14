/**
 * DATABASE CONFIGURATION
 * Conexión a PostgreSQL usando pg (node-postgres)
 *
 * NOTA: dotenv.config() se carga en index.js, no es necesario aquí
 */

import pg from "pg";

const { Pool } = pg;

// Función helper para obtener configuración de DB (carga lazy)
function getDbConfig() {
  return {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432", 10),
    database: process.env.DB_NAME || "imblasco_b2b",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };
}

// Crear pool de forma lazy (cuando se necesite, no al importar)
let pool = null;

function getPool() {
  if (!pool) {
    const config = getDbConfig();
    pool = new Pool(config);
    
    // Log de depuración (solo una vez)
    console.log('[Database] Pool creado con configuración:');
    console.log(`  Host: ${config.host}`);
    console.log(`  Port: ${config.port}`);
    console.log(`  Database: ${config.database}`);
    console.log(`  User: ${config.user}`);
    console.log(`  Password: ${config.password ? `✅ Configurada (${config.password.length} caracteres)` : '❌ NO CONFIGURADA'}`);
    
    // Manejo de errores del pool
    pool.on("error", (err, client) => {
      console.error("Unexpected error on idle client", err);
      process.exit(-1);
    });
  }
  return pool;
}

/**
 * Ejecutar query
 * @param {string} text - SQL query
 * @param {Array} params - Parámetros
 * @returns {Promise}
 */
export async function query(text, params) {
  const start = Date.now();
  try {
    const res = await getPool().query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === "development") {
      console.log("Executed query", { text, duration, rows: res.rowCount });
    }
    return res;
  } catch (error) {
    console.error("Database query error:", error);
    throw error;
  }
}

/**
 * Obtener cliente del pool para transacciones
 * @returns {Promise<pg.PoolClient>}
 */
export async function getClient() {
  return await getPool().connect();
}

/**
 * Verificar conexión
 * @returns {Promise<boolean>}
 */
export async function testConnection() {
  try {
    const res = await query("SELECT NOW()");
    console.log("✅ Database connected:", res.rows[0].now);
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    return false;
  }
}

/**
 * Cerrar pool (útil para tests o shutdown)
 */
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// Exportar función getPool para compatibilidad
export default getPool;
