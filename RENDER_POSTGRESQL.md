# 🗄️ Crear PostgreSQL en Render.com - Guía Paso a Paso

## 📋 Paso 1: Crear la Base de Datos PostgreSQL

1. **En el dashboard de Render:**
   - Haz clic en el botón **"+ New"** (arriba a la derecha)
   - Selecciona **"PostgreSQL"**

2. **Configuración:**
   - **Name:** `imblasco-db` (o el nombre que prefieras)
   - **Database:** `imblasco_b2b` (o déjalo en el default, puedes cambiarlo después)
   - **User:** (se genera automáticamente - NO lo cambies)
   - **Region:** Elige la misma región que tu Web Service (recomendado: `Oregon (US West)`)

3. **Plan:**
   - Para desarrollo/testing: **Free** (90 días gratis, luego $7/mes)
   - Para producción: Elige el plan que necesites

4. Haz clic en **"Create Database"**

---

## 🔑 Paso 2: Obtener las Credenciales

Una vez creada la base de datos:

1. **Haz clic en el nombre de tu base de datos** (ej: `imblasco-db`)
2. Verás la página de configuración con varias secciones:

### **Opción A: Connection String (RECOMENDADO - Más Fácil)**

Busca la sección **"Connection String"**:

- Hay dos opciones:
  - **Internal Database URL** (si tu backend está en Render - USA ESTA)
  - **External Database URL** (para conexiones fuera de Render)

**Copia el Internal Database URL**, se ve así:
```
postgresql://usuario:password@dpg-xxxxx-a/imblasco_b2b
```

### **Opción B: Credenciales Individuales**

Si prefieres usar variables individuales, busca estas secciones:

- **Host:** `dpg-xxxxx-a.singapore-postgres.render.com`
- **Port:** `5432`
- **Database:** `imblasco_b2b`
- **User:** (nombre de usuario generado)
- **Password:** (contraseña generada - **IMPORTANTE: solo se muestra una vez**, cópiala)

---

## ⚙️ Paso 3: Configurar Variables de Entorno en tu Web Service

Ahora ve a tu **Web Service** del backend:

1. **Haz clic en tu Web Service** (ej: `imblasco-backend`)
2. Ve a la pestaña **"Environment"**
3. Haz clic en **"Add Environment Variable"**

### **Opción A: Usar Connection String (Con DATABASE_URL)**

Si copiaste el Connection String completo, agrega:

```env
DATABASE_URL=postgresql://usuario:password@dpg-xxxxx-a/imblasco_b2b
```

**NOTA:** Tu código actual usa variables individuales (DB_HOST, DB_USER, etc.), así que usa la **Opción B** mejor.

### **Opción B: Usar Variables Individuales (RECOMENDADO para tu código)**

Agrega estas variables una por una:

```env
DB_HOST=dpg-xxxxx-a.singapore-postgres.render.com
DB_PORT=5432
DB_NAME=imblasco_b2b
DB_USER=usuario_generado_por_render
DB_PASSWORD=contraseña_generada_por_render
```

**Ejemplo real:**
```env
DB_HOST=dpg-abc123xyz-a.singapore-postgres.render.com
DB_PORT=5432
DB_NAME=imblasco_b2b
DB_USER=imblasco_user
DB_PASSWORD=abc123XYZ789
```

---

## 🔄 Paso 4: Actualizar el Código (Opcional)

Tu código actual ya está bien configurado para usar estas variables individuales, así que **NO necesitas cambiar nada**.

Pero si quieres usar `DATABASE_URL` directamente, necesitarías modificar `src/config/database.js`.

---

## ✅ Paso 5: Verificar la Conexión

1. **Guarda las variables de entorno** en Render
2. **Re-despliega** tu Web Service (Render lo hace automáticamente al cambiar variables)
3. Ve a los **Logs** del Web Service
4. Deberías ver un mensaje como:
   ```
   ✅ Database connected: [fecha]
   ```

---

## 🚨 IMPORTANTE: Seguridad

- **NUNCA** subas el `.env` a GitHub (ya está en `.gitignore`)
- **NUNCA** compartas las credenciales públicamente
- Las credenciales en Render están **encriptadas** y seguras
- Si pierdes la contraseña, Render NO puede recuperarla (tendrás que crear una nueva)

---

## 🔍 Si no ves la contraseña

Si no copiaste la contraseña la primera vez:

1. Ve a tu base de datos en Render
2. Haz clic en **"Reset Password"**
3. **Copia la nueva contraseña** (solo se muestra una vez)
4. Actualiza `DB_PASSWORD` en las variables de entorno

---

## 📝 Resumen Rápido

1. **Crear PostgreSQL:** "+ New" → "PostgreSQL" → Configurar → "Create"
2. **Copiar credenciales:** Host, Port, Database, User, Password
3. **Agregar variables:** En Web Service → Environment → Agregar DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
4. **Re-desplegar:** Render lo hace automáticamente
5. **Verificar logs:** Debe mostrar conexión exitosa

---

¡Listo! 🎉
