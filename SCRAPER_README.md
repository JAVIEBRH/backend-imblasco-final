# 🕷️ Scraper de IMBLASCO.CL

Scraper profesional para clonar páginas web de imblasco.cl con todos sus recursos.

## 📋 Características

El scraper captura:
- ✅ **HTML completo** - Estructura completa de la página
- ✅ **CSS** - Todos los archivos CSS (externos e inline)
- ✅ **JavaScript** - Todos los archivos JS
- ✅ **Imágenes** - Todas las imágenes (img, background, srcset, etc.)
- ✅ **Fuentes** - Tipografías (woff, woff2, ttf, otf)
- ✅ **Estilos** - Colores, tamaños, proporciones, tipografías
- ✅ **Metadatos** - Información sobre recursos capturados

## 🚀 Uso

### Ejecutar el scraper

```bash
npm run scrape
```

### Páginas que se scrapean

1. **Home** - `https://imblasco.cl/`
2. **Políticas Comerciales** - `https://imblasco.cl/politicas-comerciales/`
3. **Catálogos** - `https://imblasco.cl/catalogos/`
4. **Descargas** - `https://imblasco.cl/descargas/`
5. **Despachos** - `https://imblasco.cl/despachos/`

## 📁 Estructura de Salida

Los archivos se guardan en `scraped-pages/`:

```
scraped-pages/
├── index.html
├── politicas-comerciales.html
├── catalogos.html
├── descargas.html
├── despachos.html
├── home-metadata.json
├── politicas-comerciales-metadata.json
├── catalogos-metadata.json
├── descargas-metadata.json
├── despachos-metadata.json
└── assets/
    ├── css/
    │   └── [archivos CSS]
    ├── js/
    │   └── [archivos JavaScript]
    ├── images/
    │   └── [todas las imágenes]
    └── fonts/
        └── [tipografías]
```

## 🔧 Configuración

El scraper está configurado en `src/scripts/scraper.js`:

- **BASE_URL**: URL base del sitio
- **PAGES**: Lista de páginas a scrapear
- **OUTPUT_DIR**: Directorio de salida

## 📊 Metadatos

Cada página genera un archivo JSON con metadatos:
- URL original
- Fecha de scraping
- Cantidad de recursos (CSS, JS, imágenes, fuentes)
- Información de estilos

## 🌐 Ver las páginas localmente

Después de ejecutar el scraper, puedes abrir los archivos HTML directamente en tu navegador o usar un servidor local:

```bash
# Opción 1: Abrir directamente
# Navega a scraped-pages/ y abre index.html

# Opción 2: Servidor local simple
cd scraped-pages
python -m http.server 8000
# Luego abre http://localhost:8000
```

## ⚠️ Notas

- El scraper reemplaza automáticamente todas las URLs absolutas con rutas relativas
- Los recursos duplicados se descargan una sola vez
- El proceso puede tardar varios minutos dependiendo del tamaño de las páginas
- Se requiere conexión a internet para descargar los recursos

## 🔐 Autorización

Este scraper está autorizado por el dueño de IMBLASCO para uso en desarrollo y clonación local.
