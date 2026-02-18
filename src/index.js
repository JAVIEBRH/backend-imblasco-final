/**
 * IMBLASCO B2B - Sistema de Pedidos Automatizados
 * Servidor Express principal
 *
 * Endpoints:
 * - POST /api/stock/upload     → Cargar CSV de stock
 * - GET  /api/stock            → Obtener stock actual
 * - GET  /api/stock/:sku       → Buscar producto por SKU
 * - POST /api/chat/message     → Enviar mensaje al chat
 * - GET  /api/chat/history/:userId → Historial de chat
 */

// CARGAR .env PRIMERO, ANTES DE CUALQUIER OTRO MÓDULO
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar .env con path explícito compatible con ES Modules
// En producción (Render), las variables están en process.env directamente
// Solo cargar .env si existe (desarrollo local)
const envPath = path.resolve(__dirname, "../.env");
const envResult = dotenv.config({
  path: envPath,
  override: false, // No sobrescribir variables de entorno existentes
});

if (envResult.error && process.env.NODE_ENV !== "production") {
  console.warn(
    "⚠️  Archivo .env no encontrado (esto es normal en producción):",
    envPath
  );
} else if (!envResult.error) {
  console.log("✅ Archivo .env cargado desde:", envPath);
}

// En producción, las variables vienen de Render directamente
if (process.env.NODE_ENV === "production") {
  console.log("🔧 Modo producción: usando variables de entorno de Render");
}

// Debug: Mostrar variables de entorno disponibles (sin valores sensibles)
console.log("🔍 Variables de entorno disponibles:");
console.log("  NODE_ENV:", process.env.NODE_ENV || "no definido");
console.log(
  "  DATABASE_URL:",
  process.env.DATABASE_URL ? "✅ definido" : "❌ no definido"
);
console.log(
  "  MONGO_URI_STOCKF_READ:",
  process.env.MONGO_URI_STOCKF_READ ? "✅ definido (enriquecimiento stockf activo)" : "⏭️ no definido (chat sin datos stockf)"
);
console.log(
  "  OPENAI_API_KEY:",
  process.env.OPENAI_API_KEY ? "✅ definido" : "❌ no definido"
);

// Verificar que OPENAI_API_KEY esté cargada
const apiKey = process.env.OPENAI_API_KEY?.trim();

if (!apiKey) {
  console.error("❌ ERROR: OPENAI_API_KEY no definida en variables de entorno");
  console.error(
    "   Verifica que esté configurada en Render (Environment Variables)"
  );
} else {
  console.log("✅ OPENAI_API_KEY cargada correctamente");
  console.log(`   Longitud: ${apiKey.length} caracteres`);
  console.log(
    `   Formato: ${apiKey.startsWith("sk-") ? "✅ Correcto" : "❌ Incorrecto"}`
  );

  // Asegurar que esté en process.env sin espacios
  process.env.OPENAI_API_KEY = apiKey;
}

// AHORA importar el resto de módulos (que ya tendrán acceso a process.env)
import express from "express";
import cors from "cors";
import { stockRouter } from "./routes/stock.routes.js";
import { chatRouter } from "./routes/chat.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { indexRouter } from "./routes/index.routes.js";
import { clientRouter } from "./routes/client.routes.js";
import { testConnection, connect } from "./config/database.js";
import { getStockfConnectionReady } from "./config/stockf-database.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { getOpenAIConfig } from "./config/openai.js";

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:5173",
      "http://localhost:5174", // frontend PROOF
      "http://localhost:3002",
      "https://imblascoasistentefrontend.onrender.com",
      "https://frontend-imblasco-final.onrender.com",
    ],
    credentials: true,
  })
);
app.use(express.json());

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "ImBlasco B2B Backend",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// Verificación de configuración OpenAI (usa config centralizada)
app.get("/api/health/openai", async (req, res) => {
  try {
    const conkavoAI = await import("./services/conkavo-ai.service.js");
    const isConfigured = conkavoAI.isConfigured();
    const { apiKey, model } = getOpenAIConfig();

    res.json({
      configured: isConfigured,
      hasApiKey: !!apiKey,
      apiKeyLength: apiKey ? apiKey.length : 0,
      model,
      api: "chat.completions.create()",
      message: isConfigured
        ? "✅ OpenAI configurado correctamente (Chat Completions)"
        : "❌ OpenAI no está configurado. Verifica OPENAI_API_KEY en .env o variables de entorno",
    });
  } catch (error) {
    res.status(500).json({
      configured: false,
      error: error.message,
      message: "❌ Error al verificar configuración de OpenAI",
    });
  }
});

// Ruta de desarrollo: inspeccionar esquema de stockf (solo NODE_ENV=development)
if (process.env.NODE_ENV === "development") {
  app.get("/api/dev/stockf-schema", async (req, res) => {
    const uriDefined = !!(process.env.MONGO_URI_STOCKF_READ || process.env.MONGO_URI_STOCKF);
    try {
      const { getStockfConnectionReadyWithError } = await import(
        "./config/stockf-database.js"
      );
      const { conn, error: connError } = await getStockfConnectionReadyWithError();
      if (!conn) {
        return res.json({
          ok: false,
          uriDefined,
          connectionError: connError || "Conexión falló sin mensaje",
          message: uriDefined
            ? "La conexión a stockf falló. Abajo 'connectionError' tiene el motivo exacto de MongoDB."
            : "MONGO_URI_STOCKF_READ no está en .env o el servidor no se reinició.",
        });
      }
      const col = conn.db.collection("productos");
      const sample = await col.findOne({});
      const count = await col.countDocuments();
      if (!sample) {
        return res.json({
          ok: true,
          message: "Colección productos existe pero está vacía.",
          count: 0,
          keys: [],
        });
      }
      const keys = Object.keys(sample);
      res.json({
        ok: true,
        count,
        keys,
        sampleKeysOnly: keys.reduce((acc, k) => {
          acc[k] = sample[k] === null ? "null" : typeof sample[k];
          return acc;
        }, {}),
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        uriDefined,
        error: err.message,
        message: "Error al leer stockf.productos. Revisa MONGO_URI_STOCKF_READ y permisos en Atlas.",
      });
    }
  });

  app.get("/api/dev/stockf-sample-products", async (req, res) => {
    try {
      const { getStockfConnectionReadyWithError } = await import(
        "./config/stockf-database.js"
      );
      const { conn, error: connError } = await getStockfConnectionReadyWithError();
      if (!conn) return res.json({ ok: false, connectionError: connError });
      const col = conn.db.collection("productos");
      const limit = 10;
      const comingSoon = await col
        .find({ "coming_soon.activo": true, "flags.visible": { $ne: false } })
        .project({ titulo: 1, sku: 1, mysql_id: 1, coming_soon: 1 })
        .limit(limit)
        .toArray();
      const withCaracteristicas = await col
        .find({ caracteristicas: { $exists: true, $ne: null }, "flags.visible": { $ne: false } })
        .project({ titulo: 1, sku: 1, mysql_id: 1, caracteristicas: 1, excerpt: 1 })
        .limit(limit)
        .toArray();
      const withImagen = await col
        .find({ imagen: { $exists: true, $ne: null }, "flags.visible": { $ne: false } })
        .project({ titulo: 1, sku: 1, mysql_id: 1, imagen: 1 })
        .limit(3)
        .toArray();
      res.json({
        ok: true,
        comingSoon,
        withImagen: withImagen.map((p) => ({ titulo: p.titulo, sku: p.sku, mysql_id: p.mysql_id, imagen: p.imagen })),
        withCaracteristicas: withCaracteristicas.map((p) => ({
          titulo: p.titulo,
          sku: p.sku,
          mysql_id: p.mysql_id,
          tieneCaracteristicas: !!p.caracteristicas && Object.keys(p.caracteristicas || {}).length > 0,
          tieneExcerpt: !!(p.excerpt && String(p.excerpt).trim()),
        })),
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });
}

// Routes
app.use("/", indexRouter); // Página de administración
app.use("/api/auth", authRouter); // Autenticación
app.use("/api/stock", stockRouter);
app.use("/api/chat", chatRouter);
app.use("/api/client", clientRouter); // Clientes

// 404 handler
app.use(notFound);

// Error handler global
app.use(errorHandler);

// Inicializar OpenAI al iniciar el servidor
import("./services/conkavo-ai.service.js")
  .then(async (conkavoAI) => {
    try {
      conkavoAI.initializeOpenAI();
      console.log("✅ OpenAI inicializado correctamente");
    } catch (error) {
      console.error("❌ Error al inicializar OpenAI:", error.message);
    }
  })
  .catch((err) => {
    console.error("❌ Error al importar conkavo-ai.service:", err.message);
  });

// Start server
app
  .listen(PORT, async () => {
    // Conectar a MongoDB
    console.log("\n🔍 Conectando a MongoDB...");
    try {
      await connect();
    } catch (error) {
      console.error("❌ Error al conectar a MongoDB:", error.message);
    }
    
    // Verificar conexión
    const dbConnected = await testConnection();

    if (!dbConnected) {
      console.warn("⚠️  ADVERTENCIA: No se pudo conectar a MongoDB");
      console.warn(
        "   El servidor iniciará, pero algunas funciones pueden fallar"
      );
      console.warn("   Verifica tu configuración en .env");
    }

    console.log(`
╔════════════════════════════════════════════════════════╗
║     IMBLASCO B2B - Sistema de Pedidos Automatizados    ║
╠════════════════════════════════════════════════════════╣
║  Servidor corriendo en: http://localhost:${PORT}          ║
║  Base de datos: ${
      dbConnected ? "✅ Conectado" : "❌ Desconectado"
    }${" ".repeat(dbConnected ? 36 : 35)}║
║                                                        ║
║  Endpoints principales:                                ║
║  • POST /api/stock/import   - Importar CSV             ║
║  • GET  /api/stock          - Ver stock                ║
║  • POST /api/chat/init      - Iniciar chat             ║
║  • GET  /api/client         - Listar clientes          ║
╚════════════════════════════════════════════════════════╝
  `);

    if (!dbConnected) {
      console.log("\n💡 Para configurar MongoDB:");
      console.log("   1. Crea un archivo .env en la carpeta backend/");
      console.log("   2. Configura las variables de entorno:");
      console.log("      - DATABASE_URL (o)");
      console.log("      - MONGO_HOST, MONGO_PORT, MONGO_DB, MONGO_USER, MONGO_PASSWORD");
      console.log("   3. Reinicia el servidor\n");
    }

    // Verificación STOCKF (enriquecimiento coming_soon, características, etc.)
    const stockfUri = process.env.MONGO_URI_STOCKF_READ || process.env.MONGO_URI_STOCKF || "";
    if (!stockfUri.trim()) {
      console.log("📦 [STOCKF] ⏭️  No configurado (MONGO_URI_STOCKF_READ no definida) - enriquecimiento deshabilitado");
    } else {
      try {
        const stockfConn = await getStockfConnectionReady();
        if (stockfConn) {
          console.log("📦 [STOCKF] ✅ Enriquecimiento activo (conectado)");
        } else {
          console.warn("📦 [STOCKF] ⚠️  URI definida pero conexión falló - enriquecimiento deshabilitado");
        }
      } catch (e) {
        console.warn("📦 [STOCKF] ⚠️  Error al verificar conexión:", e?.message || e);
      }
    }
  })
  .on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`\n❌ ERROR: El puerto ${PORT} ya está en uso`);
      console.error("   Ejecuta CERRAR_PUERTO_3001.bat para liberar el puerto");
      console.error("   O cierra la otra instancia del servidor manualmente\n");
    } else {
      console.error("\n❌ ERROR al iniciar servidor:", err.message);
    }
    process.exit(1);
  });

export default app;
