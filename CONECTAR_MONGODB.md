# 🔌 Conectar tu Proyecto a MongoDB

## Paso 1: En MongoDB Compass

1. **Haz clic en la conexión `localhostparkbnb`** que ves en el panel izquierdo
   - O haz clic en **"Add new connection"** si quieres crear una nueva

2. **Si creas nueva conexión**, usa esta URL:
   ```
   mongodb://localhost:27017
   ```
   - Haz clic en "Connect"
   - Esto te conectará a tu MongoDB local

## Paso 2: Crear la Base de Datos

Una vez conectado en Compass:

1. En el panel izquierdo, verás tus bases de datos
2. Haz clic en **"Create Database"** (botón verde)
3. Ingresa:
   - **Database Name:** `imblasco_b2b`
   - **Collection Name:** `products` (puedes dejar este o cambiarlo)
4. Haz clic en **"Create Database"**

## Paso 3: Verificar Configuración del Proyecto

Tu archivo `.env` debe tener:

```env
DATABASE_URL=mongodb://localhost:27017/imblasco_b2b
PORT=3001
NODE_ENV=development
OPENAI_API_KEY=tu-api-key-aqui
```

## Paso 4: Iniciar el Servidor

En la terminal del proyecto, ejecuta:

```powershell
npm run dev
```

Deberías ver:
```
✅ MongoDB connected
✅ Database: imblasco_b2b
```

## ✅ Listo!

Tu aplicación ahora está conectada a MongoDB. Las colecciones se crearán automáticamente cuando:
- Importes productos (CSV)
- Un usuario agregue items al carrito
- Se cree un pedido

---

## Solución de Problemas

### Si no puedes conectar:
1. Verifica que MongoDB esté corriendo:
   ```powershell
   Get-Service MongoDB
   ```
2. Si no está corriendo:
   ```powershell
   net start MongoDB
   ```

### Si la base de datos no existe:
- No te preocupes, MongoDB la creará automáticamente cuando la aplicación se conecte

### Si ves errores de conexión:
- Verifica que el puerto 27017 no esté bloqueado
- Asegúrate de que MongoDB esté corriendo como servicio
