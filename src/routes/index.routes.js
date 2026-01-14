/**
 * RUTA DE INICIO - Página de administración simple
 * Para importar CSV y verificar estado
 */

import { Router } from 'express'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const indexRouter = Router()

/**
 * GET / - Página de administración
 */
indexRouter.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>ImBlasco B2B - Administración</title>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
        h1 { color: #092143; }
        .section { background: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 8px; }
        button { background: #f4a51c; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; }
        button:hover { background: #d8941a; }
        input[type="file"] { margin: 10px 0; }
        .status { padding: 10px; margin: 10px 0; border-radius: 5px; }
        .success { background: #d4edda; color: #155724; }
        .error { background: #f8d7da; color: #721c24; }
      </style>
    </head>
    <body>
      <h1>🚀 ImBlasco B2B - Panel de Administración</h1>
      
      <div class="section">
        <h2>📦 Importar Stock desde CSV</h2>
        <form id="uploadForm" enctype="multipart/form-data">
          <input type="file" name="file" accept=".csv" required>
          <br>
          <label>
            Encoding:
            <select name="encoding">
              <option value="utf8">UTF-8</option>
              <option value="latin1">Latin1 (Windows-1252)</option>
            </select>
          </label>
          <br><br>
          <button type="submit">📤 Importar CSV</button>
        </form>
        <div id="result"></div>
      </div>
      
      <div class="section">
        <h2>📊 Estado del Sistema</h2>
        <button onclick="checkStatus()">🔄 Verificar Estado</button>
        <div id="status"></div>
      </div>
      
      <script>
        document.getElementById('uploadForm').addEventListener('submit', async (e) => {
          e.preventDefault()
          const formData = new FormData(e.target)
          const resultDiv = document.getElementById('result')
          resultDiv.innerHTML = '<p>⏳ Importando...</p>'
          
          try {
            const res = await fetch('/api/stock/import', {
              method: 'POST',
              body: formData
            })
            const data = await res.json()
            
            if (data.success) {
              resultDiv.innerHTML = \`
                <div class="status success">
                  ✅ <strong>Importación exitosa</strong><br>
                  Nuevos: \${data.import.inserted} | Actualizados: \${data.import.updated}<br>
                  Total procesado: \${data.parse.processedRows} productos
                </div>
              \`
            } else {
              resultDiv.innerHTML = \`<div class="status error">❌ Error: \${data.error || data.message}</div>\`
            }
          } catch (error) {
            resultDiv.innerHTML = \`<div class="status error">❌ Error: \${error.message}</div>\`
          }
        })
        
        async function checkStatus() {
          const statusDiv = document.getElementById('status')
          statusDiv.innerHTML = '<p>⏳ Verificando...</p>'
          
          try {
            const [health, stock] = await Promise.all([
              fetch('/api/health').then(r => r.json()),
              fetch('/api/stock?limit=1').then(r => r.json())
            ])
            
            statusDiv.innerHTML = \`
              <div class="status success">
                ✅ <strong>Backend:</strong> \${health.status}<br>
                ✅ <strong>Productos en stock:</strong> \${stock.total || 0}<br>
                ✅ <strong>Servicio:</strong> \${health.service}
              </div>
            \`
          } catch (error) {
            statusDiv.innerHTML = \`<div class="status error">❌ Error: \${error.message}</div>\`
          }
        }
      </script>
    </body>
    </html>
  `)
})

export default indexRouter


