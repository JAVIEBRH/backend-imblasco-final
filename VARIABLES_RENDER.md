# 🔐 Variables de Entorno para Render.com

## 📋 Variables que necesitas agregar en tu Web Service

### 1. Base de Datos PostgreSQL (ya las copiaste)

```env
DB_HOST=dpg-d5iph6l6ubrc73e91sv0-a
DB_PORT=5432
DB_NAME=imblascopostgres
DB_USER=imblascopostgres_user
DB_PASSWORD=tu_password_copiado
```

---

### 2. OpenAI API

```env
OPENAI_API_KEY=sk-proj-tu-api-key-aqui
```

(Copia la clave desde tu `.env` local)

---

### 3. WooCommerce API

```env
WC_URL=https://imblasco.cl
WC_KEY=ck_tu-consumer-key
WC_SECRET=cs_tu-consumer-secret
```

(Copia los valores desde tu `.env` local)

---

### 4. Servidor

```env
PORT=10000
NODE_ENV=production
```

---

## 📝 Pasos para agregar en Render

1. Ve a tu **Web Service** (ej: `imblasco-backend`)
2. Haz clic en la pestaña **"Environment"**
3. Haz clic en **"Add Environment Variable"** para cada una
4. Agrega las variables de la lista de arriba
5. Guarda (Render reiniciará automáticamente)

---

## ⚠️ IMPORTANTE

- Reemplaza `tu_password_copiado` con el password real que copiaste
- Reemplaza `tu-api-key-aqui` con tu clave de OpenAI real
- Reemplaza las credenciales de WooCommerce con las reales
- **NO** subas el archivo `.env` a GitHub (ya está en `.gitignore`)

---

## ✅ Después de agregar las variables

1. Render reiniciará automáticamente tu servicio
2. Ve a los **Logs** para verificar que todo funciona
3. Ejecuta las migraciones (ver siguiente paso)
