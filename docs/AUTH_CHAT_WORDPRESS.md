# Autenticación del chat e integración futura con WordPress

## Resumen

El chat puede restringir información sensible (precios, stock, instrucciones de cotización) a usuarios no registrados. La decisión de si un usuario está "logueado" se toma en el backend y está preparada para que, a futuro, provenga de una validación contra **WordPress** (o WooCommerce).

## Estructura actual del código

```
Frontend (WordPress / SPA)
    │
    │  POST /api/chat/message   (body: userId, message; opcional: token)
    │  Header: Authorization: Bearer <token>  (opcional)
    ▼
chat.routes.js
    │  resolveChatAuth (middleware)
    ▼
middleware/chat-auth.js
    │  getTokenFromRequest(req) → token
    │  validateTokenForChat({ token, userId })
    ▼
services/wordpress-auth.service.js
    │  Ahora: CHAT_AUTH_AS_LOGGED_IN (env)
    │  A futuro: llamada a WordPress para validar token
    ▼
req.chatAuth = { isLoggedIn, wpUser? }
    │
    ▼
conversation.service.js  processMessageWithAI(userId, message, options)
    │  options.isLoggedIn → restringe o no precios/stock/cotización
```

## Dónde se usa la autenticación

| Componente | Uso |
|------------|-----|
| **chat.routes.js** | Aplica `resolveChatAuth` en `POST /message` y `POST /message/stream`. Pasa `req.chatAuth.isLoggedIn` como `options.isLoggedIn` a `processMessageWithAI`. |
| **conversation.service.js** | `resolveIsLoggedIn(options)` usa `options.isLoggedIn` si viene; si no, usa env `CHAT_AUTH_AS_LOGGED_IN`. Si el usuario no está logueado, no se consulta catálogo para productos y se responde con "necesitas cuenta" + flujo de solicitud de cuenta. |
| **auth.routes.js** | `POST /api/auth/validate` y `GET /api/auth/validate` permiten al frontend comprobar si un token es válido y si el usuario tiene acceso a contenido restringido (`valid` / `isLoggedIn`). |

## Contrato de token (frontend → backend)

El backend acepta el token en cualquiera de estas formas (en orden de preferencia):

1. **Header:** `Authorization: Bearer <token>`
2. **Body:** `{ token: "<token>", userId: "...", message: "..." }`
3. **Query (solo GET /api/auth/validate):** `?token=...&userId=...`

Cuando se integre WordPress, el frontend (sitio WP o SPA que use login WP) enviará el mismo token que el usuario obtiene al iniciar sesión en WordPress.

## Integración futura con WordPress

El sistema está preparado para que la validación la haga WordPress. Opciones típicas:

### 1. JWT emitido por WordPress

- Plugins: *JWT Authentication for WP REST API*, *Simple JWT Auth*.
- El usuario hace login en WP; el frontend recibe un JWT y lo envía en `Authorization: Bearer <token>` al backend.
- En **wordpress-auth.service.js** → `validateTokenForChat`:
  - Llamar a un endpoint de WP que valide el token (p. ej. `GET /wp-json/.../token/validate`) **o**
  - Validar el JWT en este backend (misma clave secreta que WP) y opcionalmente obtener el usuario con `GET /wp-json/wp/v2/users/me` usando ese token.

### 2. Application Passwords (WP 5.6+)

- El usuario genera una "contraseña de aplicación" en su perfil de WordPress.
- El frontend envía esa contraseña (o un token derivado) al backend.
- El backend valida haciendo una petición autenticada a la REST API de WP (p. ej. `GET /wp-json/wp/v2/users/me` con Basic Auth).

### 3. Cookie / nonce de sesión WP

- Si el chat se sirve en el mismo dominio que WordPress, el frontend puede enviar cookie de sesión o nonce.
- El backend enviaría esa cookie/nonce a un endpoint de WP que compruebe la sesión y devuelva el usuario.

## Variables de entorno

| Variable | Uso |
|----------|-----|
| `CHAT_AUTH_AS_LOGGED_IN` | Si es `'false'` o `'0'`, todos los usuarios se tratan como **no** logueados (no ven precios/stock/cotización). Cualquier otro valor o no definida → todos como logueados (pruebas/producción actual). Cuando la validación venga de WordPress, esta variable puede seguir usarse como fallback o desactivarse. |

## Endpoints relacionados

| Método | Ruta | Uso |
|--------|------|-----|
| POST | /api/chat/message | Enviar mensaje; acepta token en header o body. |
| POST | /api/chat/message/stream | Igual, respuesta en streaming. |
| POST | /api/auth/validate | Validar token (body: `token`, `userId` opcional). Respuesta: `{ valid, isLoggedIn }`. |
| GET | /api/auth/validate | Validar token (query: `token`, `userId` opcional). |

## Próximos pasos (cuando conecten WordPress)

1. En WordPress: elegir mecanismo (JWT, Application Passwords o cookie/nonce) y exponer endpoint de validación o emisión de token.
2. En **wordpress-auth.service.js**: implementar la llamada a WordPress dentro de `validateTokenForChat` cuando exista `token` (p. ej. HTTP a la REST API de WP o validación JWT local).
3. Opcional: dejar de usar `CHAT_AUTH_AS_LOGGED_IN` cuando la validación real esté activa, o usarla solo como fallback en desarrollo.
