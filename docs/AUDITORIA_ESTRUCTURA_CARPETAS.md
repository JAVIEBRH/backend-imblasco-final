# Auditoría: estructura de carpetas y organización del código

**Alcance:** Backend (IMBLASCOASISTENTEBACKEND) y Frontend (IMBLASCOASISTENTEFRONTEND).  
**Objetivo:** Evaluar si la separación de carpetas es ordenada y eficiente, con vista a la futura integración (WordPress, auth, etc.).  
**Nota:** Esta auditoría no propone cambios de orden ni refactors; solo describe el estado actual y observaciones.

---

## 1. Backend (IMBLASCOASISTENTEBACKEND)

### 1.1 Vista general

```
backend/
├── src/
│   ├── config/          # Configuración (DB)
│   ├── database/        # Migraciones, schema, seed
│   ├── erp/             # Adaptador ERP
│   ├── middleware/      # Middlewares Express
│   ├── models/          # Modelos de datos (MongoDB/PostgreSQL)
│   ├── routes/          # Rutas API
│   ├── scripts/         # Scripts CLI / herramientas
│   ├── services/        # Lógica de negocio + __tests__
│   ├── utils/            # Utilidades puras
│   └── index.js          # Entrada de la aplicación
├── docs/                 # Documentación técnica (auth, etc.)
├── reports/              # Salidas de tests/baterías
├── server.js             # Wrapper que importa src/index.js
├── package.json
└── *.md, *.bat           # Docs y scripts en raíz
```

**Punto de entrada:** `npm run dev` → `server.js` → `src/index.js`. `package.json` "main" apunta a `src/index.js`. Coherente.

---

### 1.2 Carpeta por carpeta (backend)

| Carpeta | Contenido | Valoración | Observaciones |
|---------|-----------|------------|---------------|
| **config/** | `database.js` (conexión PostgreSQL) | ✅ Clara | Solo hay configuración de DB. Si más adelante se añaden configs (WC, OpenAI, etc.), esta carpeta es el lugar natural. |
| **database/** | `migrate*.js`, `migrations/*.sql`, `schema.sql`, `seed.js` | ✅ Muy ordenada | Migraciones versionadas, schema y seed separados. Encaja con integración futura (más tablas/migraciones). |
| **erp/** | `ErpAdapter.js`, `DummyErpAdapter.js`, `index.js` | ✅ Buena separación | Dominio ERP aislado; fácil sustituir por adaptador real. |
| **middleware/** | `chat-auth.js`, `errorHandler.js`, `logger.js`, `validation.js` | ✅ Correcta | Auth del chat, errores, logging y validación en un solo lugar. Rutas importan desde aquí de forma consistente. |
| **models/** | Cart, Conversation, Order, Product, User, etc. + `index.js` | ✅ Estándar | Un modelo por archivo; barrel en `index.js`. Compatible con más modelos (p. ej. sesiones WP). |
| **routes/** | `auth`, `cart`, `chat`, `client`, `index`, `order`, `stock` | ✅ Por dominio | Una ruta por recurso/dominio. Fácil añadir rutas (p. ej. `webhook.routes.js` para WP). |
| **scripts/** | Scraper, import-products, migrate helpers, free-port, woocommerce-audit, etc. | ⚠️ Mezcla | Incluye tanto utilidades de desarrollo (free-port, scraper) como tareas cercanas a datos (import-products, woocommerce-audit). No es un problema de orden; solo que son “herramientas” distintas (dev vs datos). Para futura integración no estorba. |
| **services/** | Lógica de negocio + `__tests__/` dentro | ✅ Fuerte | Servicios por dominio (auth, cart, chat, conversation, wordpress, wordpress-auth, etc.). Tests dentro de `services/__tests__` es una decisión válida; alternativa sería `src/__tests__/` o carpeta `tests/` en raíz. |
| **utils/** | `normalization.js`, `resilience.js`, `structured-logger.js`, `attribute-value.js` | ✅ Correcta | Funciones reutilizables sin dependencias de negocio. Servicios importan desde aquí. |

**Resumen backend:** La separación sigue un esquema tipo “capas”: rutas → middleware → services → models/utils/config. Es ordenada y adecuada para crecer (más rutas, más servicios, integración WordPress).

---

### 1.3 Documentación y archivos en raíz (backend)

- **docs/** contiene `AUTH_CHAT_WORDPRESS.md` (y ahora esta auditoría). Bien para documentación técnica.
- En **raíz** hay muchos `.md` (README, CONECTAR_MONGODB, RENDER_DEPLOY, VARIABLES_RENDER, etc.) y `.bat`.  
  **Observación:** No es desorden; es decisión de tener guías rápidas en raíz. Si se quisiera unificar, se podría mover la mayoría a `docs/` (sin cambiar estructura de código).

---

## 2. Frontend (IMBLASCOASISTENTEFRONTEND)

### 2.1 Vista general

```
frontend/
├── public/
│   └── images/           # categorías, icons, products, slides
├── src/
│   ├── components/       # Por dominio: Auth, B2BChat, Cart, Header, etc.
│   ├── config/           # api.js, chatResponses.js
│   ├── hooks/             # useChat.js
│   ├── pages/             # Páginas por ruta (Home, Catalogos, ERP, etc.)
│   ├── styles/            # index.css global
│   ├── utils/             # imageUtils.js
│   ├── App.jsx
│   └── main.jsx
├── index.html, vite.config.js, tailwind.config.js, postcss.config.js
└── package.json
```

**Punto de entrada:** `main.jsx` → `App.jsx`. Típico de Vite + React.

---

### 2.2 Carpeta por carpeta (frontend)

| Carpeta | Contenido | Valoración | Observaciones |
|---------|-----------|------------|---------------|
| **components/** | Subcarpetas por dominio: Auth, B2BChat, Cart, Categories, ERP, Footer, Header, Hero, Info, Product, Products; más `ImageWithFallback.jsx` suelto | ✅ Ordenado por feature | Nomenclatura consistente (PascalCase por carpeta). `ImageWithFallback` en raíz de components es aceptable como componente genérico. |
| **config/** | `api.js` (API_URL), `chatResponses.js` (mensajes y reglas del chat) | ✅ Clara | Configuración y datos de configuración del chat en un solo sitio. `chatResponses.js` es más “datos/constants” que config pura; sigue siendo razonable aquí para integración (cambiar API_URL o respuestas según entorno). |
| **hooks/** | `useChat.js` | ✅ Correcto | Un hook por archivo. Espacio listo para más hooks (p. ej. `useAuth`, `useCart`) cuando integren WordPress/auth. |
| **pages/** | Una página por ruta; algunos con CSS colocado junto al JSX (Clientes.css, ERPDashboard.css, etc.) | ✅ Estándar | Páginas = rutas. Los CSS por página junto al componente son fáciles de localizar. |
| **styles/** | `index.css` (global) | ✅ Mínimo y claro | Un solo punto para estilos globales (Tailwind + custom). |
| **utils/** | `imageUtils.js` | ✅ Aceptable | Pocas utilidades; si crecen, se puede seguir añadiendo aquí. |

**Resumen frontend:** Estructura típica de React (components, pages, hooks, config, utils). Escalable para más páginas, más componentes por dominio y futura capa de auth (hooks, context, env).

---

### 2.3 Detalles menores (frontend)

- **components:** Hay `Product/` y `Products/` (singular vs plural). Uno suele ser “detalle/producto” y el otro “listado”; la distinción es válida. No genera desorden.
- **config/chatResponses.js:** Contenido más bien de “constants” o “data”; si en el futuro las respuestas vienen del backend, este archivo podría convertirse en fallback o eliminarse. No afecta a la ordenación de carpetas.

---

## 3. Separación Front / Back e integración futura

### 3.1 Repositorios y responsabilidades

- **Backend:** API REST (Express), lógica de negocio, BD, WooCommerce/WordPress (servicios), auth (login interno + validación token chat).
- **Frontend:** SPA (Vite + React), UI, llamadas a la API (config/api.js), estado local y hooks.

La separación entre front y back es clara: un proyecto por capa. Para integración con WordPress puede darse:

- **Opción A:** Frontend sigue siendo la SPA actual; WordPress solo provee login/token; la SPA envía ese token al backend (ya preparado con `Authorization: Bearer` / `body.token`).
- **Opción B:** Parte del sitio se sirve desde WordPress y el chat se incrusta (iframe o widget); el token/sesión WP se envía al backend de la misma forma.

En ambos casos, la estructura actual de ambos proyectos permite esa integración sin reordenar carpetas.

### 3.2 Puntos de acople ya definidos

- **API base:** Frontend usa `config/api.js` (API_URL). Un solo lugar para cambiar la base URL del backend.
- **Chat:** Frontend usa `useChat.js` y componentes B2BChat que llaman a `/api/chat/message` (y similares). Backend tiene `chat.routes.js`, `conversation.service.js`, `wordpress-auth.service.js` y middleware `resolveChatAuth`. El contrato (token en header o body, `userId`, `message`) está claro.
- **Auth:** Backend tiene `auth.routes.js`, `auth.service.js`, `wordpress-auth.service.js` y `/api/auth/validate`. Frontend tiene `Auth/LoginModal.jsx` y estado de usuario en `App.jsx`. Cuando WordPress aporte el token, el frontend solo tendría que enviarlo en las peticiones al backend; no exige reestructurar carpetas.

---

## 4. Resumen ejecutivo

| Aspecto | Valoración | Comentario |
|---------|------------|------------|
| **Backend: capas** | ✅ Ordenado | config → database → middleware → models → routes → services → utils. Fácil de navegar y extender. |
| **Backend: dominio** | ✅ Ordenado | Rutas y servicios por dominio (auth, chat, cart, client, order, stock). ERP y WordPress separados. |
| **Frontend: estructura** | ✅ Ordenada | components por feature, pages por ruta, config/hooks/utils en su sitio. |
| **Separación front/back** | ✅ Clara | Proyectos independientes; integración vía API y token bien encajada. |
| **Preparación para integración** | ✅ Adecuada | Auth chat y WordPress preparados en backend; frontend con un solo punto de config de API y hooks reutilizables. |

**Conclusión:** La estructura de carpetas está ordenada y es eficiente para el tamaño actual del proyecto y para una futura integración (WordPress, más endpoints, más dominios). No se identifican cambios de orden necesarios; la auditoría no propone mover carpetas ni archivos, solo describe el estado y confirma que es adecuado.
