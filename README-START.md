# 🚀 Guía de Inicio Rápido - IMBLASCO B2B

## 📋 Iniciar Todos los Servicios

### Opción 1: Script Automático (Recomendado)

**Windows:**
```bash
# Doble clic en el archivo o ejecuta:
iniciar-todo.bat
```

Este script iniciará automáticamente:
- ✅ Backend API (Puerto 3001)
- ✅ Frontend React (Puerto 5173)
- ✅ Servidor de Páginas Scrapeadas (Puerto 3002)

### Opción 2: Manual

**Backend:**
```bash
cd IMBLASCOASISTENTEBACKEND
npm run dev
```

**Frontend (en otra terminal):**
```bash
cd IMBLASCOASISTENTEFRONTEND
npm run dev
```

**Servidor de Páginas Scrapeadas (en otra terminal):**
```bash
cd IMBLASCOASISTENTEBACKEND
npm run serve-scraped
```

## 🌐 URLs Disponibles

### Aplicación Principal
- **Frontend React**: http://localhost:5173
- **Backend API**: http://localhost:3001

### Páginas Clonadas (Scrapeadas)
- **Home**: http://localhost:3002/
- **Políticas Comerciales**: http://localhost:3002/politicas-comerciales.html
- **Catálogos**: http://localhost:3002/catalogos.html
- **Descargas**: http://localhost:3002/descargas.html
- **Despachos**: http://localhost:3002/despachos.html

## 🛑 Detener Servicios

### Opción 1: Script Automático
```bash
detener-todo.bat
```

### Opción 2: Manual
- Presiona `Ctrl+C` en cada terminal que está corriendo
- O cierra las ventanas de terminal

## 📝 Notas

- Los servicios se ejecutan en ventanas de terminal separadas
- Cada servicio tiene su propio puerto para evitar conflictos
- El servidor de páginas scrapeadas muestra las páginas clonadas de imblasco.cl
- Todos los recursos (CSS, JS, imágenes, fuentes) están incluidos localmente

## 🔧 Comandos Útiles

### Backend
```bash
npm run dev        # Iniciar servidor en modo desarrollo
npm start          # Iniciar servidor en producción
npm run scrape     # Ejecutar scraper de imblasco.cl
npm run serve-scraped  # Servir páginas scrapeadas
```

### Frontend
```bash
npm run dev        # Iniciar servidor de desarrollo
npm run build      # Construir para producción
npm run preview    # Previsualizar build de producción
```

## ⚠️ Requisitos Previos

- Node.js instalado (v18 o superior)
- MongoDB corriendo localmente (para el backend)
- Dependencias instaladas en ambos proyectos:
  ```bash
  # Backend
  cd IMBLASCOASISTENTEBACKEND
  npm install
  
  # Frontend
  cd IMBLASCOASISTENTEFRONTEND
  npm install
  ```
