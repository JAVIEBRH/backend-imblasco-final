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

# Rama PROOF - Responses API (opcionales):
# OPENAI_MODEL=gpt-4o-mini
# OPENAI_BASE_URL=https://api.openai.com/v1
# OPENAI_VECTOR_STORE_ID=vs_xxxx   (o VECTOR_STORE_ID) - ID del Vector Store para file_search

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

### Cómo obtener MONGO_URI_STOCKF_READ (base stockf, solo lectura)

La base **stockf** es una base MongoDB aparte (o en el mismo cluster) con la colección `productos` (coming_soon, caracteristicas, excerpt, etc.). El backend se conecta **solo lectura** para enriquecer respuestas del chat.

**Pasos:**

1. **Tener acceso al MongoDB** donde está la base stockf (mismo servidor/Atlas que tu app o uno distinto).

2. **Crear un usuario solo lectura** para la base `stockf`:
   - En MongoDB Atlas: **Database Access → Add New Database User**. Rol: **Read** sobre la base `stockf` (o "read on specific database" → database: `stockf`).
   - En MongoDB local/shell:
     ```js
     use admin
     db.createUser({
       user: "stockf_read",
       pwd: "tu_password_seguro",
       roles: [ { role: "read", db: "stockf" } ]
     })
     ```

3. **Armar la URI** con ese usuario:
   - **Local:** `mongodb://stockf_read:tu_password_seguro@localhost:27017/stockf?authSource=admin`
   - **Atlas:** `mongodb+srv://stockf_read:tu_password_seguro@cluster.xxxxx.mongodb.net/stockf?retryWrites=true&w=majority`
   - Sustituye usuario, contraseña y host por los tuyos. Si el usuario se creó en la base `admin`, deja `authSource=admin`.

4. **Añadir al .env** (en la raíz del backend, junto a DATABASE_URL):
   ```env
   MONGO_URI_STOCKF_READ=mongodb://stockf_read:TU_PASSWORD@host:27017/stockf?authSource=admin
   ```

5. **Reiniciar el backend.** Si la URI es correcta, las respuestas del chat que incluyan productos se enriquecerán con coming_soon, caracteristicas, etc. Si no defines esta variable, el chat sigue funcionando igual pero sin esos datos.

**Comprobar el esquema real de stockf:** En desarrollo puedes llamar a `GET /api/dev/stockf-schema` (solo si `NODE_ENV=development` y `MONGO_URI_STOCKF_READ` está definida). La respuesta devuelve los nombres de los campos de un documento de ejemplo para verificar que coinciden con lo que espera el backend (sku, mysql_id, coming_soon, caracteristicas, excerpt, flags, etc.).

## ⚠️ IMPORTANTE

- **NUNCA** subas el archivo `.env` a Git
- El `.env` está en `.gitignore` por seguridad
- En producción (Render), configura estas variables en Environment Variables
