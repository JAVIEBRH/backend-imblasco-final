/**
 * SCRAPER PROFESIONAL - IMBLASCO.CL
 * Scraper completo para clonar páginas web con todos sus recursos
 * 
 * Captura:
 * - HTML completo
 * - CSS (inline, externo, estilos)
 * - Imágenes (todas las referencias)
 * - JavaScript
 * - Tipografías
 * - Colores y estilos
 * - Estructura completa
 */

import puppeteer from 'puppeteer';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración
const BASE_URL = 'https://imblasco.cl';
const PAGES = [
  { url: '/', name: 'home', output: 'index.html' },
  { url: '/politicas-comerciales/', name: 'politicas-comerciales', output: 'politicas-comerciales.html' },
  { url: '/catalogos/', name: 'catalogos', output: 'catalogos.html' },
  { url: '/descargas/', name: 'descargas', output: 'descargas.html' },
  { url: '/despachos/', name: 'despachos', output: 'despachos.html' }
];

const OUTPUT_DIR = path.resolve(__dirname, '../../scraped-pages');
const ASSETS_DIR = path.resolve(OUTPUT_DIR, 'assets');

/**
 * Descargar recurso (imagen, CSS, JS, etc.)
 */
async function downloadAsset(url, outputPath) {
  try {
    // Si ya existe, no descargar de nuevo
    if (await fs.pathExists(outputPath)) {
      return outputPath;
    }

    const response = await axios({
      url,
      method: 'GET',
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    await fs.writeFile(outputPath, response.data);
    console.log(`  ✅ Descargado: ${path.basename(outputPath)}`);
    return outputPath;
  } catch (error) {
    console.error(`  ❌ Error descargando ${url}:`, error.message);
    return null;
  }
}

/**
 * Normalizar URL
 */
function normalizeUrl(url, baseUrl) {
  if (!url) return null;
  
  // URLs absolutas
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  
  // URLs relativas
  if (url.startsWith('//')) {
    return `https:${url}`;
  }
  
  if (url.startsWith('/')) {
    return `${BASE_URL}${url}`;
  }
  
  return `${baseUrl}/${url}`;
}

/**
 * Extraer recursos de CSS
 */
async function extractCssResources(cssContent, cssUrl, outputDir) {
  const resources = [];
  
  // Buscar URLs en CSS (url(...))
  const urlRegex = /url\(['"]?([^'")]+)['"]?\)/gi;
  let match;
  
  while ((match = urlRegex.exec(cssContent)) !== null) {
    const resourceUrl = match[1];
    const fullUrl = normalizeUrl(resourceUrl, cssUrl);
    
    if (fullUrl) {
      const urlObj = new URL(fullUrl);
      const ext = path.extname(urlObj.pathname) || '.css';
      const filename = path.basename(urlObj.pathname) || `resource-${Date.now()}${ext}`;
      const outputPath = path.resolve(outputDir, filename);
      
      resources.push({
        original: resourceUrl,
        full: fullUrl,
        local: `assets/${ext === '.woff' || ext === '.woff2' || ext === '.ttf' || ext === '.otf' ? 'fonts' : ext === '.css' ? 'css' : 'images'}/${filename}`
      });
    }
  }
  
  return resources;
}

/**
 * Scrapear una página completa
 */
async function scrapePage(pageUrl, pageName, outputFilename) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📄 Scrapeando: ${pageName}`);
  console.log(`   URL: ${pageUrl}`);
  console.log(`${'='.repeat(60)}\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    
    // Configurar viewport
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Interceptar requests para capturar recursos
    const resources = {
      images: new Set(),
      css: new Set(),
      js: new Set(),
      fonts: new Set()
    };

    page.on('response', async (response) => {
      const url = response.url();
      const contentType = response.headers()['content-type'] || '';
      
      if (contentType.includes('image/')) {
        resources.images.add(url);
      } else if (contentType.includes('text/css') || url.endsWith('.css')) {
        resources.css.add(url);
      } else if (contentType.includes('javascript') || url.endsWith('.js')) {
        resources.js.add(url);
      } else if (contentType.includes('font') || url.match(/\.(woff|woff2|ttf|otf)/i)) {
        resources.fonts.add(url);
      }
    });

    // Navegar a la página
    console.log('⏳ Cargando página...');
    await page.goto(pageUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Esperar a que cargue completamente
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Obtener HTML completo
    console.log('📝 Extrayendo HTML...');
    const html = await page.content();
    
    // Extraer todas las imágenes del HTML (incluyendo srcset, data-src, etc.)
    const htmlImages = await page.evaluate(() => {
      const images = new Set();
      
      // Imágenes en <img>
      document.querySelectorAll('img').forEach(img => {
        if (img.src) images.add(img.src);
        if (img.srcset) {
          img.srcset.split(',').forEach(src => {
            const url = src.trim().split(' ')[0];
            if (url) images.add(url);
          });
        }
        if (img.dataset.src) images.add(img.dataset.src);
        if (img.dataset.lazySrc) images.add(img.dataset.lazySrc);
      });
      
      // Imágenes de fondo CSS
      const allElements = document.querySelectorAll('*');
      allElements.forEach(el => {
        const style = window.getComputedStyle(el);
        const bgImage = style.backgroundImage;
        if (bgImage && bgImage !== 'none') {
          const matches = bgImage.match(/url\(['"]?([^'")]+)['"]?\)/g);
          if (matches) {
            matches.forEach(match => {
              const url = match.replace(/url\(['"]?([^'")]+)['"]?\)/, '$1');
              if (url && !url.startsWith('data:')) images.add(url);
            });
          }
        }
      });
      
      return Array.from(images);
    });
    
    // Agregar imágenes del HTML a la lista
    htmlImages.forEach(imgUrl => {
      if (imgUrl && !imgUrl.startsWith('data:')) {
        resources.images.add(imgUrl);
      }
    });

    // Obtener todos los estilos computados
    console.log('🎨 Extrayendo estilos...');
    const styles = await page.evaluate(() => {
      const styleSheets = [];
      
      // Estilos inline
      Array.from(document.querySelectorAll('style')).forEach(style => {
        styleSheets.push({
          type: 'inline',
          content: style.textContent
        });
      });
      
      // Estilos de elementos con style attribute
      const inlineStyles = Array.from(document.querySelectorAll('[style]')).map(el => ({
        selector: el.tagName + (el.className ? '.' + el.className : '') + (el.id ? '#' + el.id : ''),
        styles: el.getAttribute('style')
      }));
      
      return {
        inlineSheets: styleSheets,
        inlineElements: inlineStyles,
        computedStyles: window.getComputedStyle(document.body).cssText
      };
    });

    // Descargar CSS
    console.log('📦 Descargando archivos CSS...');
    const cssFiles = [];
    for (const cssUrl of resources.css) {
      try {
        const urlObj = new URL(cssUrl);
        const filename = path.basename(urlObj.pathname) || `style-${Date.now()}.css`;
        const outputPath = path.resolve(ASSETS_DIR, 'css', filename);
        
        const response = await axios.get(cssUrl, { responseType: 'text' });
        let cssContent = response.data;
        
        // Extraer recursos del CSS (imágenes, fuentes)
        const cssResources = await extractCssResources(cssContent, cssUrl, ASSETS_DIR);
        
        // Reemplazar URLs en CSS con rutas locales
        for (const resource of cssResources) {
          const resourceUrl = new URL(resource.full);
          const ext = path.extname(resourceUrl.pathname) || '';
          const resourceFilename = path.basename(resourceUrl.pathname) || `resource-${Date.now()}${ext}`;
          const resourceOutputPath = path.resolve(
            ASSETS_DIR,
            ext === '.woff' || ext === '.woff2' || ext === '.ttf' || ext === '.otf' ? 'fonts' : 'images',
            resourceFilename
          );
          
          await downloadAsset(resource.full, resourceOutputPath);
          // Usar ruta relativa correcta desde assets/css/ hacia assets/fonts/ o assets/images/
          const relativePath = ext === '.woff' || ext === '.woff2' || ext === '.ttf' || ext === '.otf' 
            ? `../fonts/${resourceFilename}`
            : `../images/${resourceFilename}`;
          cssContent = cssContent.replace(new RegExp(resource.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), relativePath);
        }
        
        // Corregir cualquier ruta ../assets/ que quede (debería ser ../)
        cssContent = cssContent.replace(/\.\.\/assets\//g, '../');
        
        await fs.writeFile(outputPath, cssContent);
        cssFiles.push({
          original: cssUrl,
          local: `assets/css/${filename}`
        });
        console.log(`  ✅ CSS: ${filename}`);
      } catch (error) {
        console.error(`  ❌ Error CSS ${cssUrl}:`, error.message);
      }
    }

    // Descargar JavaScript
    console.log('📜 Descargando archivos JavaScript...');
    const jsFiles = [];
    for (const jsUrl of resources.js) {
      try {
        const urlObj = new URL(jsUrl);
        const filename = path.basename(urlObj.pathname) || `script-${Date.now()}.js`;
        const outputPath = path.resolve(ASSETS_DIR, 'js', filename);
        
        await downloadAsset(jsUrl, outputPath);
        jsFiles.push({
          original: jsUrl,
          local: `assets/js/${filename}`
        });
        console.log(`  ✅ JS: ${filename}`);
      } catch (error) {
        console.error(`  ❌ Error JS ${jsUrl}:`, error.message);
      }
    }

    // Descargar imágenes
    console.log('🖼️  Descargando imágenes...');
    const imageFiles = [];
    for (const imgUrl of resources.images) {
      try {
        const urlObj = new URL(imgUrl);
        const ext = path.extname(urlObj.pathname) || '.jpg';
        const filename = path.basename(urlObj.pathname) || `image-${Date.now()}${ext}`;
        const outputPath = path.resolve(ASSETS_DIR, 'images', filename);
        
        await downloadAsset(imgUrl, outputPath);
        imageFiles.push({
          original: imgUrl,
          local: `assets/images/${filename}`
        });
        console.log(`  ✅ Imagen: ${filename}`);
      } catch (error) {
        console.error(`  ❌ Error imagen ${imgUrl}:`, error.message);
      }
    }

    // Descargar fuentes
    console.log('🔤 Descargando fuentes...');
    const fontFiles = [];
    for (const fontUrl of resources.fonts) {
      try {
        const urlObj = new URL(fontUrl);
        const ext = path.extname(urlObj.pathname) || '.woff2';
        const filename = path.basename(urlObj.pathname) || `font-${Date.now()}${ext}`;
        const outputPath = path.resolve(ASSETS_DIR, 'fonts', filename);
        
        await downloadAsset(fontUrl, outputPath);
        fontFiles.push({
          original: fontUrl,
          local: `assets/fonts/${filename}`
        });
        console.log(`  ✅ Fuente: ${filename}`);
      } catch (error) {
        console.error(`  ❌ Error fuente ${fontUrl}:`, error.message);
      }
    }

    // Procesar HTML: reemplazar URLs con rutas locales
    console.log('🔧 Procesando HTML...');
    let processedHtml = html;

    // Reemplazar CSS
    for (const css of cssFiles) {
      processedHtml = processedHtml.replace(new RegExp(css.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), css.local);
    }

    // Reemplazar JS
    for (const js of jsFiles) {
      processedHtml = processedHtml.replace(new RegExp(js.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), js.local);
    }

    // Reemplazar imágenes
    for (const img of imageFiles) {
      processedHtml = processedHtml.replace(new RegExp(img.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), img.local);
    }

    // Reemplazar fuentes
    for (const font of fontFiles) {
      processedHtml = processedHtml.replace(new RegExp(font.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), font.local);
    }

    // Reemplazar URLs absolutas de imblasco.cl con rutas relativas
    processedHtml = processedHtml.replace(/https?:\/\/imblasco\.cl\//g, './');
    processedHtml = processedHtml.replace(/https?:\/\/www\.imblasco\.cl\//g, './');
    
    // También reemplazar imágenes en atributos src y srcset
    processedHtml = processedHtml.replace(/src="https?:\/\/[^"]*imblasco\.cl\/([^"]+)"/g, (match, path) => {
      // Buscar si la imagen ya fue descargada
      const found = imageFiles.find(img => img.original.includes(path));
      return found ? `src="${found.local}"` : match;
    });
    
    // Reemplazar enlaces internos
    processedHtml = processedHtml.replace(/href="https?:\/\/[^"]*imblasco\.cl\/([^"]+)"/g, (match, path) => {
      // Convertir a HTML local
      const localPath = path.endsWith('/') ? path.slice(0, -1) + '.html' : path + '.html';
      return `href="./${localPath}"`;
    });

    // Guardar HTML procesado
    const htmlPath = path.resolve(OUTPUT_DIR, outputFilename);
    await fs.writeFile(htmlPath, processedHtml, 'utf-8');
    console.log(`\n✅ HTML guardado: ${outputFilename}`);

    // Guardar metadatos
    const metadata = {
      page: pageName,
      url: pageUrl,
      scrapedAt: new Date().toISOString(),
      resources: {
        css: cssFiles.length,
        js: jsFiles.length,
        images: imageFiles.length,
        fonts: fontFiles.length
      },
      styles: {
        inlineSheets: styles.inlineSheets.length,
        inlineElements: styles.inlineElements.length
      }
    };

    await fs.writeJSON(
      path.resolve(OUTPUT_DIR, `${pageName}-metadata.json`),
      metadata,
      { spaces: 2 }
    );

    console.log(`📊 Recursos capturados:`);
    console.log(`   - CSS: ${cssFiles.length}`);
    console.log(`   - JS: ${jsFiles.length}`);
    console.log(`   - Imágenes: ${imageFiles.length}`);
    console.log(`   - Fuentes: ${fontFiles.length}`);

    return metadata;

  } catch (error) {
    console.error(`❌ Error scrapeando ${pageName}:`, error);
    throw error;
  } finally {
    await browser.close();
  }
}

/**
 * Scrapear todas las páginas
 */
async function scrapeAll() {
  console.log('\n🚀 INICIANDO SCRAPER DE IMBLASCO.CL');
  console.log('='.repeat(60));
  console.log(`📁 Directorio de salida: ${OUTPUT_DIR}`);
  console.log('='.repeat(60));

  // Crear directorios
  await fs.ensureDir(OUTPUT_DIR);
  await fs.ensureDir(ASSETS_DIR);
  await fs.ensureDir(path.resolve(ASSETS_DIR, 'images'));
  await fs.ensureDir(path.resolve(ASSETS_DIR, 'css'));
  await fs.ensureDir(path.resolve(ASSETS_DIR, 'js'));
  await fs.ensureDir(path.resolve(ASSETS_DIR, 'fonts'));

  const results = [];

  for (const page of PAGES) {
    try {
      const fullUrl = `${BASE_URL}${page.url}`;
      const result = await scrapePage(fullUrl, page.name, page.output);
      results.push(result);
    } catch (error) {
      console.error(`❌ Error en página ${page.name}:`, error.message);
      results.push({ page: page.name, error: error.message });
    }
  }

  // Resumen final
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMEN FINAL');
  console.log('='.repeat(60));
  
  const total = {
    css: 0,
    js: 0,
    images: 0,
    fonts: 0
  };

  results.forEach(result => {
    if (result.resources) {
      total.css += result.resources.css;
      total.js += result.resources.js;
      total.images += result.resources.images;
      total.fonts += result.resources.fonts;
    }
  });

  console.log(`\n✅ Páginas scrapeadas: ${results.filter(r => !r.error).length}/${PAGES.length}`);
  console.log(`📦 Total de recursos:`);
  console.log(`   - CSS: ${total.css}`);
  console.log(`   - JS: ${total.js}`);
  console.log(`   - Imágenes: ${total.images}`);
  console.log(`   - Fuentes: ${total.fonts}`);
  console.log(`\n📁 Archivos guardados en: ${OUTPUT_DIR}`);
  console.log('\n✅ SCRAPER COMPLETADO\n');
}

// Ejecutar
scrapeAll().catch(console.error);
