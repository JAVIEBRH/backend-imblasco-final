# ImBlasco Backend

Backend API del sistema B2B de ImBlasco - Sistema de pedidos automatizados con PostgreSQL.

## 🚀 Inicio Rápido

```bash
npm install
npm run migrate  # Primera vez: crear tablas en PostgreSQL
npm run dev
```

El backend estará disponible en: **http://localhost:3001**

## 📦 Stack Tecnológico

- **Node.js** - Runtime
- **Express** - Framework web
- **PostgreSQL** - Base de datos
- **pg** - Cliente PostgreSQL
- **csv-parse** - Parser de CSVs
- **multer** - Upload de archivos

## 🗄️ Base de Datos

- **PostgreSQL** requerido
- Ver `GUIA_POSTGRESQL_WINDOWS.md` para instalación
- Ejecutar `npm run migrate` para crear tablas

## ⚙️ Configuración

1. Copia `.env.example` a `.env`
2. Configura tus credenciales de PostgreSQL:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=imblasco_b2b
DB_USER=postgres
DB_PASSWORD=tu_contraseña
```

3. Crea la base de datos: `imblasco_b2b`
4. Ejecuta: `npm run migrate`

## 📡 Endpoints API

### Stock
- `POST /api/stock/import` - Importar CSV de stock
- `GET /api/stock` - Listar productos
- `GET /api/stock/:sku` - Buscar por SKU
- `POST /api/stock/check` - Validar stock

### Chat
- `POST /api/chat/init` - Inicializar chat
- `POST /api/chat/action` - Procesar acción
- `GET /api/chat/history/:userId` - Historial

### Carrito
- `GET /api/cart/:userId` - Obtener carrito
- `POST /api/cart/:userId/add` - Agregar producto
- `DELETE /api/cart/:userId/clear` - Vaciar carrito

### Pedidos
- `POST /api/order/confirm` - Confirmar pedido
- `GET /api/order/user/:userId` - Pedidos del usuario
- `GET /api/order/:orderId` - Ver pedido

## 📝 Scripts Disponibles

```bash
npm start          # Producción
npm run dev        # Desarrollo (auto-reload)
npm run migrate    # Crear tablas en PostgreSQL
npm run seed       # Datos de ejemplo
```

## 📄 Documentación Completa

- `LEEME_PRIMERO.txt` - Instrucciones de instalación
- `SETUP_COMPLETO.md` - Guía completa de setup
- `GUIA_POSTGRESQL_WINDOWS.md` - Instalación PostgreSQL

## 🔒 Seguridad

⚠️ **MVP - No para producción sin:**
- Autenticación JWT
- Rate limiting
- Validación exhaustiva
- HTTPS
- Logging estructurado

## 📊 Estructura

```
src/
├── config/          # Configuración (database, etc.)
├── database/        # Scripts SQL y migración
├── routes/          # Endpoints API
├── services/        # Lógica de negocio
│   ├── stock.service.js
│   ├── cart.service.js
│   ├── order.service.js
│   ├── conversation.service.js
│   └── csv-import.service.js
└── middleware/      # Middleware Express
```

---

**Para iniciar el frontend:** Ve a `../imblasco-frontend`






