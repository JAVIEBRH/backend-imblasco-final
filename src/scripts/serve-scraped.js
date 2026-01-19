/**
 * Servidor local para visualizar páginas scrapeadas
 * Sirve los archivos estáticos desde scraped-pages/
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3002; // Puerto diferente al backend

// Directorio estático
const STATIC_DIR = path.resolve(__dirname, '../../scraped-pages');

// Servir archivos estáticos
app.use(express.static(STATIC_DIR));

// Ruta raíz - redirigir a index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

// Manejar rutas sin extensión como .html
app.get('/*', (req, res, next) => {
  const requestedPath = req.path;
  
  // Si no tiene extensión, intentar con .html
  if (!path.extname(requestedPath)) {
    const htmlPath = path.join(STATIC_DIR, requestedPath + '.html');
    res.sendFile(htmlPath, (err) => {
      if (err) {
        next();
      }
    });
  } else {
    next();
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🌐 SERVIDOR LOCAL DE PÁGINAS SCRAPEADAS');
  console.log('='.repeat(60));
  console.log(`\n✅ Servidor corriendo en:`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`\n📄 Páginas disponibles:`);
  console.log(`   🏠 Home: http://localhost:${PORT}/`);
  console.log(`   📋 Políticas: http://localhost:${PORT}/politicas-comerciales.html`);
  console.log(`   📚 Catálogos: http://localhost:${PORT}/catalogos.html`);
  console.log(`   💾 Descargas: http://localhost:${PORT}/descargas.html`);
  console.log(`   🚚 Despachos: http://localhost:${PORT}/despachos.html`);
  console.log(`\n📁 Directorio: ${STATIC_DIR}`);
  console.log('\n⚠️  Presiona Ctrl+C para detener el servidor\n');
});
