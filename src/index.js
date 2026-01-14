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
 * - GET  /api/cart/:userId     → Obtener carrito
 * - POST /api/order/confirm    → Confirmar pedido
 * - GET  /api/orders/:userId   → Historial de pedidos
 */

// CARGAR .env PRIMERO, ANTES DE CUALQUIER OTRO MÓDULO
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar .env con path explícito compatible con ES Modules
const envPath = path.resolve(__dirname, "../.env");
const envResult = dotenv.config({
  path: envPath,
});

if (envResult.error) {
  console.error("❌ ERROR cargando .env:", envResult.error.message);
  console.error("   Ruta intentada:", envPath);
} else {
  console.log("✅ Archivo .env cargado desde:", envPath);
}

// Verificar que OPENAI_API_KEY esté cargada
const apiKey = process.env.OPENAI_API_KEY?.trim();

if (!apiKey) {
  console.error("❌ ERROR: OPENAI_API_KEY no definida en variables de entorno");
  console.error(
    "   Verifica que el archivo .env exista y contenga OPENAI_API_KEY"
  );
  console.error("   Ruta del .env:", envPath);
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
import { cartRouter } from "./routes/cart.routes.js";
import { orderRouter } from "./routes/order.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { indexRouter } from "./routes/index.routes.js";
import { invoiceRouter } from "./routes/invoice.routes.js";
import { paymentRouter } from "./routes/payment.routes.js";
import { clientRouter } from "./routes/client.routes.js";
import { reportRouter } from "./routes/report.routes.js";
import { testConnection } from "./config/database.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(
  cors({
    origin: ["http://localhost:3000", "http://localhost:5173"],
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

// Verificación de configuración OpenAI
app.get("/api/health/openai", async (req, res) => {
  try {
    const conkavoAI = await import("./services/conkavo-ai.service.js");
    const isConfigured = conkavoAI.isConfigured();
    const hasApiKey = !!process.env.OPENAI_API_KEY;

    res.json({
      configured: isConfigured,
      hasApiKey: hasApiKey,
      apiKeyLength: process.env.OPENAI_API_KEY
        ? process.env.OPENAI_API_KEY.length
        : 0,
      model: "gpt-4o-mini",
      api: "chat.completions.create()",
      message: isConfigured
        ? "✅ OpenAI configurado correctamente (Responses API)"
        : "❌ OpenAI no está configurado. Verifica OPENAI_API_KEY en .env",
    });
  } catch (error) {
    res.status(500).json({
      configured: false,
      error: error.message,
      message: "❌ Error al verificar configuración de OpenAI",
    });
  }
});

// Routes
app.use("/", indexRouter); // Página de administración
app.use("/api/auth", authRouter); // Autenticación
app.use("/api/stock", stockRouter);
app.use("/api/chat", chatRouter);
app.use("/api/cart", cartRouter);
app.use("/api/order", orderRouter);
app.use("/api/invoice", invoiceRouter); // Facturación
app.use("/api/payment", paymentRouter); // Pagos
app.use("/api/client", clientRouter); // Clientes
app.use("/api/report", reportRouter); // Reportes

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
    // Verificar conexión a base de datos
    console.log("\n🔍 Verificando conexión a PostgreSQL...");
    const dbConnected = await testConnection();

    if (!dbConnected) {
      console.warn("⚠️  ADVERTENCIA: No se pudo conectar a PostgreSQL");
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
║  • GET  /api/cart/:userId   - Ver carrito              ║
║  • POST /api/order/confirm  - Confirmar pedido        ║
║  • POST /api/invoice/create  - Crear factura            ║
║  • GET  /api/client         - Listar clientes          ║
║  • POST /api/payment         - Registrar pago          ║
╚════════════════════════════════════════════════════════╝
  `);

    if (!dbConnected) {
      console.log("\n💡 Para configurar PostgreSQL:");
      console.log("   1. Crea un archivo .env en la carpeta backend/");
      console.log(
        "   2. Configura las variables de entorno (ver .env.example)"
      );
      console.log("   3. Ejecuta: node src/database/migrate.js");
      console.log("   4. Reinicia el servidor\n");
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
