# 📝 Variables de Entorno Requeridas (.env)

## Archivo .env - Configuración Necesaria

```env
# ============================================
# MONGODB
# ============================================
DATABASE_URL=mongodb://localhost:27017/imblasco_b2b

# Conexión solo lectura a la base stockf (productos con coming_soon, caracteristicas, etc.).
# Usuario MongoDB con rol read únicamente sobre la base stockf. Si no se define, el asistente no enriquecerá con estos datos.
# MONGO_URI_STOCKF_READ=mongodb://usuario:password@host:27017/stockf?authSource=admin

# ============================================
# OPENAI API
# ============================================
OPENAI_API_KEY=sk-proj-tu-openai-api-key-aqui

# ============================================
# WOOCOMMERCE REST API
# ============================================
WC_URL=https://imblasco.cl
WC_KEY=ck_tu_consumer_key_aqui
WC_SECRET=cs_tu_consumer_secret_aqui

# ============================================
# SERVIDOR
# ============================================
PORT=3001
NODE_ENV=development

# ============================================
# CORS (opcional)
# ============================================
# CORS_ORIGIN=http://localhost:5173,http://localhost:3002
```

## 🔑 Cómo Obtener las Keys

### OpenAI API Key
1. Ve a https://platform.openai.com/api-keys
2. Crea una nueva API key
3. Formato: `sk-proj-...` o `sk-...`

### WooCommerce Consumer Key & Secret
1. Ve a tu WordPress: **WooCommerce > Configuración > Avanzado > REST API**
2. Crea una nueva clave API
3. Descripción: "IMBLASCO Asistente Backend"
4. Permisos: **Solo lectura** (Read)
5. Copia:
   - **Consumer Key** → `WC_KEY`
   - **Consumer Secret** → `WC_SECRET`

### MongoDB
- Si es local: `mongodb://localhost:27017/imblasco_b2b`
- Si es remoto (Atlas): `mongodb+srv://usuario:password@cluster.mongodb.net/imblasco_b2b`

## ⚠️ IMPORTANTE

- **NUNCA** subas el archivo `.env` a Git
- El `.env` está en `.gitignore` por seguridad
- En producción (Render), configura estas variables en Environment Variables
