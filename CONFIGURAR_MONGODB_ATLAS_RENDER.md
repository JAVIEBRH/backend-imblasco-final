# 🔐 Configurar MongoDB Atlas para Render.com

## 📍 Paso 1: Ir a IP Access List

En MongoDB Atlas, desde donde estás ahora (Database Users):

1. **En el panel izquierdo**, busca la sección **"NETWORK ACCESS"**
2. Haz clic en **"IP Access List"** (Lista de Acceso IP)
3. Verás una página con la lista de IPs permitidas

---

## 📍 Paso 2: Agregar IP para Render

Render usa IPs dinámicas, así que tienes dos opciones:

### ✅ Opción 1: Permitir todas las IPs (Recomendado para desarrollo)

1. Haz clic en el botón **"+ ADD IP ADDRESS"** (o **"+ ADD IP ADDRESS"**)
2. En el campo de IP, ingresa:
   ```
   0.0.0.0/0
   ```
   Esto permite conexiones desde cualquier IP (incluyendo Render)
3. Opcionalmente, agrega un comentario: `"Render.com - All IPs"`
4. Haz clic en **"Confirm"** o **"Add"**

⚠️ **Nota de Seguridad:** Esto permite conexiones desde cualquier IP. Para producción, considera usar Network Peering o agregar IPs específicas.

---

### ✅ Opción 2: Agregar IPs específicas de Render (Más seguro)

Si prefieres ser más restrictivo:

1. Render no tiene IPs fijas, pero puedes:
   - Agregar `0.0.0.0/0` temporalmente
   - O usar **Network Peering** si Render está en AWS (requiere configuración avanzada)

---

## 📍 Paso 3: Obtener la Connection String de MongoDB Atlas

Después de configurar la whitelist:

1. En MongoDB Atlas, ve a **"Database"** en el panel izquierdo
2. Haz clic en **"Connect"** en tu cluster
3. Selecciona **"Connect your application"**
4. Copia la **Connection String** que se ve así:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
5. Reemplaza `<username>` y `<password>` con tus credenciales de usuario de base de datos

---

## 📍 Paso 4: Configurar en Render

1. Ve a tu **Web Service** en Render.com
2. Ve a la pestaña **"Environment"** o **"Environment Variables"**
3. Agrega la variable:

```env
DATABASE_URL=mongodb+srv://barahonajavier34_db_user:TU_PASSWORD@cluster0.xxxxx.mongodb.net/imblasco_b2b?retryWrites=true&w=majority
```

**Reemplaza:**
- `TU_PASSWORD` con la contraseña de tu usuario de base de datos
- `cluster0.xxxxx.mongodb.net` con tu cluster real
- `imblasco_b2b` con el nombre de tu base de datos

---

## ✅ Checklist

- [ ] IP Access List configurada en MongoDB Atlas (0.0.0.0/0 agregado)
- [ ] Connection String copiada desde MongoDB Atlas
- [ ] Variable `DATABASE_URL` agregada en Render con la connection string completa
- [ ] Usuario de base de datos creado (ya lo tienes: `barahonajavier34_db_user`)
- [ ] Contraseña del usuario guardada de forma segura

---

## 🆘 Solución de Problemas

### Error: "IP not whitelisted"
- Verifica que hayas agregado `0.0.0.0/0` en IP Access List
- Espera 1-2 minutos después de agregar la IP (puede tardar en propagarse)

### Error: "Authentication failed"
- Verifica que el username y password en `DATABASE_URL` sean correctos
- Asegúrate de que el usuario tenga permisos en la base de datos

### Error: "Connection timeout"
- Verifica que el cluster esté activo en MongoDB Atlas
- Revisa que la connection string esté completa y correcta

---

## 🔒 Seguridad en Producción

Para producción, considera:

1. **Network Peering:** Conecta MongoDB Atlas directamente con Render (si ambos están en AWS)
2. **IPs específicas:** Si conoces las IPs de Render, agrégalas individualmente
3. **Usuarios con permisos limitados:** Crea usuarios solo con los permisos necesarios

---

¡Listo! 🎉 Tu aplicación en Render debería poder conectarse a MongoDB Atlas.
