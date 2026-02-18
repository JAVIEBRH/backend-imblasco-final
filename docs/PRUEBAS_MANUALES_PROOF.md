# Pruebas manuales con PROOF (sin mezclar con develop)

Para probar la nueva arquitectura (Responses API) desde el front sin tocar develop:

- **Develop** sigue en `localhost:3001` (backend) y `localhost:5173` (front).
- **PROOF** usa **puerto 3002** (backend) y **puerto 5174** (front), y el front apunta al backend 3002.

## 1. Backend PROOF (puerto 3002)

En Cursor, abre una **terminal** y asegúrate de estar en la carpeta del **backend** y en la **rama PROOF**:

```bash
cd "C:\Users\Javier\backend imblasco jsreact funcional\IMBLASCOASISTENTEBACKEND"
git branch
# Si no estás en PROOF: git checkout PROOF
npm run dev:proof
```

El script `dev:proof` libera el puerto 3002 y arranca el servidor en **http://localhost:3002**.

## 2. Frontend PROOF (puerto 5174, apuntando a 3002)

En Cursor, abre **otra terminal** y ejecuta el front en modo PROOF (rama PROOF):

```bash
cd "C:\Users\Javier\frontend imblsco jsreact funcional\IMBLASCOASISTENTEFRONTEND"
git branch
# Si no estás en PROOF: git checkout PROOF
npm run dev:proof
```

El script `dev:proof` pone `VITE_API_URL=http://localhost:3002/api` y `VITE_USE_PROOF_CHAT=true` y arranca Vite en el puerto **5174**.

3. Abre en el navegador: **http://localhost:5174**

El chat usará `POST http://localhost:3002/api/chat/responses` (Responses API). Develop puede seguir en 5173 (front) y 3001 (backend).

## 3. Resumen

| Rama    | Backend      | Frontend     | Chat endpoint        |
|--------|--------------|-------------|-----------------------|
| develop| :3001        | :5173       | /api/chat/message     |
| PROOF  | :3002        | :5174       | /api/chat/responses   |

Así puedes tener develop y PROOF a la vez y probar el flujo nuevo solo en **http://localhost:5174**.
