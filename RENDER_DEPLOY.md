# 🚀 Guía de Despliegue en Render.com

## ⚠️ IMPORTANTE: Debes crear un **Web Service**, NO un Static Site

El backend es una aplicación Node.js/Express, necesita un servicio web activo.

---

## 📋 Configuración para el BACKEND en Render.com

### 1. Crear un **Web Service** (NO Static Site)

1. En el dashboard de Render, haz clic en **"+ New"** → **"Web Service"**
2. Conecta tu repositorio: `JAVIEBRH/IMBLASCOASISTENTEBACKEND`
3. Configura los siguientes campos:

---

### 2. Configuración del Web Service

#### **Name:**
```
imblasco-backend
```
(o el nombre que prefieras)

#### **Region:**
```
Oregon (US West) - us-west-2
```
(o la región más cercana a tus usuarios)

#### **Branch:**
```
main
```

#### **Root Directory:**
```
(Dejar vacío)
```

#### **Runtime:**
```
Node
```

#### **Build Command:**
```
npm install
```

#### **Start Command:**
```
npm start
```

---

### 3. Variables de Entorno (Environment Variables)

Haz clic en **"Environment"** o **"Environment Variables"** y agrega:

```env
# Base de Datos PostgreSQL
DB_HOST=tu-host-postgresql.render.com
DB_PORT=5432
DB_NAME=imblasco_b2b
DB_USER=usuario_postgres
DB_PASSWORD=tu_contraseña_postgres

# OpenAI API
OPENAI_API_KEY=sk-proj-tu-api-key-aqui

# WooCommerce API
WC_URL=https://imblasco.cl
WC_KEY=ck_tu-consumer-key
WC_SECRET=cs_tu-consumer-secret

# Servidor
PORT=10000
NODE_ENV=production
```

**NOTA:** Render automáticamente asigna el puerto. Usa `PORT=10000` o deja que Render lo maneje automáticamente.

---

### 4. Base de Datos PostgreSQL en Render

1. En Render, haz clic en **"+ New"** → **"PostgreSQL"**
2. Configura:
   - **Name:** `imblasco-db`
   - **Database:** `imblasco_b2b`
   - **User:** (se genera automáticamente)
   - **Password:** (se genera automáticamente - **GUÁRDALO**)
3. Una vez creado, copia el **Internal Database URL** o usa las credenciales individuales
4. Actualiza las variables de entorno del Web Service con estas credenciales

---

### 5. Después del Primer Deploy

Una vez que el servicio esté corriendo:

1. Ve a la **Shell** del Web Service en Render
2. Ejecuta las migraciones:
   ```bash
   npm run migrate
   ```
3. (Opcional) Ejecuta el seed:
   ```bash
   npm run seed
   ```

---

## 📋 Configuración para el FRONTEND en Render.com

El frontend SÍ puede ser un **Static Site**:

1. En Render, haz clic en **"+ New"** → **"Static Site"**
2. Conecta: `JAVIEBRH/IMBLASCOASISTENTEFRONTEND`
3. Configura:

#### **Name:**
```
imblasco-frontend
```

#### **Branch:**
```
main
```

#### **Root Directory:**
```
(Dejar vacío)
```

#### **Build Command:**
```
npm install && npm run build
```

#### **Publish Directory:**
```
dist
```

---

## 🔗 Conectar Frontend con Backend

En el frontend, actualiza la configuración de API para que apunte a la URL de Render:

1. En Render, copia la URL de tu backend (ej: `https://imblasco-backend.onrender.com`)
2. Actualiza `vite.config.js` en el frontend para usar esta URL en producción
3. O usa variables de entorno en el build del frontend

---

## ✅ Checklist Final

- [ ] Backend: Web Service creado (NO Static Site)
- [ ] Backend: Variables de entorno configuradas
- [ ] Backend: PostgreSQL creado en Render
- [ ] Backend: Migraciones ejecutadas
- [ ] Frontend: Static Site creado
- [ ] Frontend: URL del backend configurada
- [ ] Ambos servicios desplegados correctamente

---

## 🆘 Problemas Comunes

### Error: "Cannot connect to database"
- Verifica que las variables de entorno de DB estén correctas
- Verifica que PostgreSQL esté corriendo en Render
- Usa el **Internal Database URL** si ambos servicios están en Render

### Error: "Port already in use"
- Deja que Render maneje el PORT automáticamente
- O usa `PORT=10000` en variables de entorno

### El backend se cae después de unos minutos
- Render apaga servicios gratuitos después de 15 minutos de inactividad
- Para producción, considera un plan pago o usa otro servicio

---

¡Listo! 🎉
