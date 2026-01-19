# 🍃 Instalar MongoDB en Windows - Guía Rápida

## Opción 1: MongoDB Community Server (Local)

### Paso 1: Descargar MongoDB
1. Ve a: https://www.mongodb.com/try/download/community
2. Selecciona:
   - **Version:** 7.0 (o la más reciente)
   - **Platform:** Windows
   - **Package:** MSI
3. Descarga el instalador

### Paso 2: Instalar
1. Ejecuta el instalador `.msi`
2. Selecciona "Complete" installation
3. Marca "Install MongoDB as a Service"
4. Marca "Install MongoDB Compass" (opcional, interfaz gráfica)
5. Completa la instalación

### Paso 3: Verificar instalación
Abre PowerShell y ejecuta:
```powershell
mongod --version
```

Si muestra la versión, MongoDB está instalado.

### Paso 4: Iniciar MongoDB
MongoDB debería iniciarse automáticamente como servicio. Si no:
```powershell
# Iniciar servicio
net start MongoDB

# O iniciar manualmente
mongod --dbpath "C:\data\db"
```

### Paso 5: Configurar .env
En el archivo `.env` del proyecto:
```env
DATABASE_URL=mongodb://localhost:27017/imblasco_b2b
```

---

## Opción 2: MongoDB Atlas (Cloud - Gratis)

### Paso 1: Crear cuenta
1. Ve a: https://www.mongodb.com/cloud/atlas/register
2. Crea una cuenta gratuita

### Paso 2: Crear cluster
1. Selecciona "Build a Database"
2. Elige el plan **FREE (M0)**
3. Selecciona región (ej: AWS, us-east-1)
4. Crea el cluster (tarda ~5 minutos)

### Paso 3: Configurar acceso
1. **Database Access:**
   - Crea usuario y contraseña
   - Guarda las credenciales

2. **Network Access:**
   - Agrega IP: `0.0.0.0/0` (permite desde cualquier lugar)
   - O agrega tu IP específica

### Paso 4: Obtener connection string
1. Ve a "Database" → "Connect"
2. Selecciona "Connect your application"
3. Copia la connection string:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

### Paso 5: Configurar .env
En el archivo `.env` del proyecto:
```env
DATABASE_URL=mongodb+srv://usuario:password@cluster0.xxxxx.mongodb.net/imblasco_b2b?retryWrites=true&w=majority
```
(Reemplaza `usuario`, `password` y la URL del cluster)

---

## Opción 3: Docker (Recomendado para desarrollo)

### Paso 1: Instalar Docker Desktop
1. Descarga: https://www.docker.com/products/docker-desktop
2. Instala y reinicia

### Paso 2: Ejecutar MongoDB en Docker
```powershell
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

### Paso 3: Configurar .env
```env
DATABASE_URL=mongodb://localhost:27017/imblasco_b2b
```

---

## Verificar conexión

Una vez configurado, inicia el servidor:
```powershell
npm run dev
```

Deberías ver:
```
✅ MongoDB connected
```

Si hay errores, verifica:
- MongoDB está corriendo
- La URL en `.env` es correcta
- El puerto 27017 no está bloqueado por firewall

---

## Solución de problemas

### Error: "MongoServerError: Authentication failed"
- Verifica usuario y contraseña en `.env`
- Para MongoDB local, puede que no necesites autenticación

### Error: "ECONNREFUSED"
- MongoDB no está corriendo
- Verifica el puerto (27017 por defecto)

### Error: "MongoNetworkError"
- Verifica la URL de conexión
- Para Atlas, verifica que tu IP esté en la whitelist
