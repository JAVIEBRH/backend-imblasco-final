# 🔍 ANÁLISIS DE LÓGICA - MANEJO DE STOCK

## 📋 RESUMEN EJECUTIVO

Este documento analiza la lógica del código relacionada con el manejo de stock de productos en WooCommerce, identificando posibles errores, inconsistencias y casos edge.

---

## 🎯 ÁREAS CRÍTICAS ANALIZADAS

### 1. **Lógica de Stock en Productos Variables** (`conversation.service.js` líneas 2341-2364)

#### ✅ **Lógica Actual:**
```javascript
if (hasVariations) {
  // Si el producto principal tiene stock definido, es stock compartido
  if (productStockData.stock_quantity !== null && productStockData.stock_quantity !== undefined) {
    const mainStock = parseInt(productStockData.stock_quantity)
    if (mainStock > 0) {
      stockInfo = `${mainStock} unidad${mainStock !== 1 ? 'es' : ''} disponible${mainStock > 1 ? 's' : ''}`
    } else {
      stockInfo = 'Stock agotado (0 unidades)'
    }
  } else {
    // Stock gestionado por variaciones - calcular suma
    const totalStock = context.productVariations.reduce((sum, v) => {
      const vStock = v.stock_quantity !== null && v.stock_quantity !== undefined 
        ? parseInt(v.stock_quantity) 
        : 0
      return sum + (vStock > 0 ? vStock : 0)  // ⚠️ PROBLEMA AQUÍ
    }, 0)
    
    if (totalStock > 0) {
      stockInfo = `${totalStock} unidad${totalStock !== 1 ? 'es' : ''} disponible${totalStock > 1 ? 's' : ''} (suma de variaciones)`
    } else {
      stockInfo = 'Stock agotado (0 unidades)'
    }
  }
}
```

#### ⚠️ **PROBLEMAS IDENTIFICADOS:**

**PROBLEMA #1: Filtrado de valores negativos en suma de variaciones**
- **Línea 2356:** `return sum + (vStock > 0 ? vStock : 0)`
- **Impacto:** Si una variación tiene stock negativo (error de datos), se trata como 0
- **Severidad:** BAJA (ya hay validación en csv-import.service.js)
- **Recomendación:** Mantener, pero agregar log de advertencia si se detecta stock negativo

**PROBLEMA #2: Inconsistencia en manejo de stock = 0**
- **Línea 2356:** Solo suma valores > 0, ignora stock = 0
- **Impacto:** Si todas las variaciones tienen stock = 0, mostrará "Stock agotado" correctamente
- **Severidad:** BAJA (comportamiento esperado)
- **Recomendación:** Mantener lógica actual

**PROBLEMA #3: No valida si `parseInt` retorna NaN**
- **Línea 2354:** `parseInt(v.stock_quantity)` podría retornar `NaN` si el valor no es numérico
- **Impacto:** `NaN > 0` es `false`, pero `sum + NaN` = `NaN`, lo que causaría error
- **Severidad:** MEDIA
- **Recomendación:** Agregar validación `isNaN`

---

### 2. **Lógica de Stock en Productos Simples** (`conversation.service.js` líneas 2365-2382)

#### ✅ **Lógica Actual:**
```javascript
else if (productStockData.stock_quantity !== null && productStockData.stock_quantity !== undefined) {
  if (productStockData.stock_quantity > 0) {
    stockInfo = `${productStockData.stock_quantity} unidad${productStockData.stock_quantity > 1 ? 'es' : ''} disponible${productStockData.stock_quantity > 1 ? 's' : ''}`
  } else {
    stockInfo = 'Stock agotado (0 unidades)'
  }
} else if (productStockData.stock_status === 'instock') {
  stockInfo = 'disponible en stock'  // ⚠️ Sin número exacto
} else if (productStockData.stock_status === 'outofstock') {
  stockInfo = 'Stock agotado (0 unidades)'
} else {
  stockInfo = 'Stock agotado (0 unidades)'
}
```

#### ⚠️ **PROBLEMAS IDENTIFICADOS:**

**PROBLEMA #4: Mensaje genérico cuando stock_quantity es null pero status es 'instock'**
- **Línea 2375:** Muestra "disponible en stock" sin número exacto
- **Impacto:** El usuario no sabe cuántas unidades hay disponibles
- **Severidad:** MEDIA
- **Recomendación:** Intentar obtener stock de otra fuente o mostrar mensaje más específico

**PROBLEMA #5: No valida tipo de dato antes de comparar**
- **Línea 2367:** `productStockData.stock_quantity > 0` podría fallar si es string
- **Impacto:** Comparación incorrecta si viene como string "5"
- **Severidad:** BAJA (parseInt se hace en wordpress.service.js)
- **Recomendación:** Agregar validación defensiva

---

### 3. **Lógica de Stock en Variaciones Individuales** (`conversation.service.js` líneas 2396-2402)

#### ✅ **Lógica Actual:**
```javascript
const variationsList = context.productVariations.slice(0, 5).map(v => {
  const vStock = v.stock_quantity !== null && v.stock_quantity !== undefined
    ? `${v.stock_quantity} unidad${v.stock_quantity !== 1 ? 'es' : ''}`
    : v.stock_status === 'instock' ? 'disponible' : 'sin stock'
  const vPrice = v.price ? `$${parseFloat(v.price).toLocaleString('es-CL')}` : 'Precio N/A'
  return `  - ${v.name}${v.sku ? ` (SKU: ${v.sku})` : ''} - ${vStock} - ${vPrice}`
}).join('\n')
```

#### ⚠️ **PROBLEMAS IDENTIFICADOS:**

**PROBLEMA #6: Inconsistencia entre stock del producto principal y variaciones**
- **Escenario:** Producto principal muestra "1 unidad" (stock compartido)
- **Variaciones muestran:** "Rojo - 1 unidad", "Negro - 0 unidades", "Azul - 1 unidad"
- **Impacto:** Confusión del usuario: ¿hay 1 unidad total o 2 unidades (1+0+1)?
- **Severidad:** ALTA (caso real reportado por usuario)
- **Recomendación:** Si el producto principal tiene stock compartido, las variaciones NO deberían mostrar stock individual, o debería aclararse que es stock compartido

**PROBLEMA #7: No valida si stock_quantity es negativo en variaciones**
- **Línea 2397:** No valida si `v.stock_quantity < 0`
- **Impacto:** Podría mostrar "-1 unidad" si hay error de datos
- **Severidad:** MEDIA
- **Recomendación:** Agregar validación `v.stock_quantity >= 0`

---

### 4. **Validación de Stock en CSV Import** (`csv-import.service.js`)

#### ✅ **Lógica Actual:**
```javascript
// Parsear stock (solo valores positivos o cero)
const stockRawStr = stockRaw.toString().trim()
// Remover todo excepto dígitos (no permitir negativos)
const stock = parseInt(stockRawStr.replace(/[^\d]/g, ''), 10)
if (isNaN(stock) || stock < 0) {
  errors.push(`Línea ${idx + 2}: Stock inválido para ${sku} (valor: ${stockRaw}). El stock debe ser un número positivo o cero.`)
  return
}
```

#### ✅ **ESTADO:** Correcto - Valida correctamente valores negativos y NaN

---

## 🔧 CORRECCIONES RECOMENDADAS

### **CORRECCIÓN #1: Validar NaN en suma de variaciones**
```javascript
const totalStock = context.productVariations.reduce((sum, v) => {
  const vStock = v.stock_quantity !== null && v.stock_quantity !== undefined 
    ? parseInt(v.stock_quantity) 
    : 0
  
  // Validar que no sea NaN ni negativo
  if (isNaN(vStock) || vStock < 0) {
    console.warn(`[WooCommerce] ⚠️ Stock inválido en variación ${v.sku || v.id}: ${v.stock_quantity}`)
    return sum
  }
  
  return sum + vStock  // Incluir 0 en la suma para consistencia
}, 0)
```

### **CORRECCIÓN #2: Manejar stock compartido vs individual en variaciones**
```javascript
if (hasVariations) {
  // Si el producto principal tiene stock definido, es stock compartido
  if (productStockData.stock_quantity !== null && productStockData.stock_quantity !== undefined) {
    const mainStock = parseInt(productStockData.stock_quantity)
    if (mainStock > 0) {
      stockInfo = `${mainStock} unidad${mainStock !== 1 ? 'es' : ''} disponible${mainStock > 1 ? 's' : ''} (stock compartido entre variaciones)`
    } else {
      stockInfo = 'Stock agotado (0 unidades)'
    }
    
    // En stock compartido, las variaciones NO tienen stock individual
    // Mostrar solo el stock compartido en la lista de variaciones
    const variationsList = context.productVariations.slice(0, 5).map(v => {
      const vPrice = v.price ? `$${parseFloat(v.price).toLocaleString('es-CL')}` : 'Precio N/A'
      return `  - ${v.name}${v.sku ? ` (SKU: ${v.sku})` : ''} - Stock compartido - ${vPrice}`
    }).join('\n')
  } else {
    // Stock individual por variación - calcular suma
    // ... (código existente)
  }
}
```

### **CORRECCIÓN #3: Validar stock negativo en variaciones individuales**
```javascript
const vStock = v.stock_quantity !== null && v.stock_quantity !== undefined
  ? (() => {
      const stock = parseInt(v.stock_quantity)
      if (isNaN(stock) || stock < 0) {
        console.warn(`[WooCommerce] ⚠️ Stock inválido en variación ${v.sku || v.id}: ${v.stock_quantity}`)
        return v.stock_status === 'instock' ? 'disponible' : 'sin stock'
      }
      return `${stock} unidad${stock !== 1 ? 'es' : ''}`
    })()
  : v.stock_status === 'instock' ? 'disponible' : 'sin stock'
```

### **CORRECCIÓN #4: Validación defensiva en productos simples**
```javascript
else if (productStockData.stock_quantity !== null && productStockData.stock_quantity !== undefined) {
  const stockQty = parseInt(productStockData.stock_quantity)
  
  if (isNaN(stockQty)) {
    console.warn(`[WooCommerce] ⚠️ Stock inválido (NaN) para producto ${productStockData.sku || productStockData.id}`)
    stockInfo = productStockData.stock_status === 'instock' ? 'disponible en stock' : 'Stock agotado (0 unidades)'
  } else if (stockQty > 0) {
    stockInfo = `${stockQty} unidad${stockQty !== 1 ? 'es' : ''} disponible${stockQty > 1 ? 's' : ''}`
  } else {
    stockInfo = 'Stock agotado (0 unidades)'
  }
}
```

---

## 📊 CASOS EDGE IDENTIFICADOS

| Caso | Descripción | Estado Actual | Impacto |
|------|-------------|---------------|---------|
| **Caso 1** | Producto variable con stock compartido: principal = 1, variaciones muestran stock individual | ❌ Inconsistente | ALTA |
| **Caso 2** | Variación con stock_quantity = null pero stock_status = 'instock' | ⚠️ Muestra "disponible" sin número | MEDIA |
| **Caso 3** | stock_quantity como string "5" en lugar de número | ✅ Funciona (parseInt) | BAJA |
| **Caso 4** | stock_quantity = NaN por error de datos | ❌ No validado | MEDIA |
| **Caso 5** | stock_quantity negativo (ya filtrado en CSV) | ✅ Filtrado | BAJA |
| **Caso 6** | Producto con stock_quantity = 0 pero stock_status = 'instock' | ✅ Muestra "Stock agotado" | BAJA |
| **Caso 7** | Variación con stock_quantity = 0 | ✅ Muestra "0 unidades" | BAJA |

---

## ✅ RECOMENDACIONES FINALES

1. **PRIORIDAD ALTA:** Corregir inconsistencia entre stock compartido y stock individual en variaciones
2. **PRIORIDAD MEDIA:** Agregar validación de NaN en todas las operaciones de stock
3. **PRIORIDAD MEDIA:** Mejorar mensajes cuando stock_quantity es null pero stock_status es 'instock'
4. **PRIORIDAD BAJA:** Agregar logs de advertencia para valores inválidos

---

## 🧪 CASOS DE PRUEBA SUGERIDOS

1. **Test 1:** Producto variable con stock compartido (principal = 1)
   - Verificar que variaciones muestren "stock compartido" o no muestren stock individual
   
2. **Test 2:** Producto variable con stock individual (principal = null, variaciones: 1, 0, 1)
   - Verificar que suma sea 2 unidades
   
3. **Test 3:** Variación con stock_quantity = NaN
   - Verificar que no cause error y muestre mensaje apropiado
   
4. **Test 4:** Producto simple con stock_quantity = null pero stock_status = 'instock'
   - Verificar mensaje mostrado

---

**Fecha de análisis:** 2026-01-19
**Archivos analizados:**
- `src/services/conversation.service.js` (líneas 2326-2405)
- `src/services/wordpress.service.js` (líneas 369-432)
- `src/services/csv-import.service.js` (líneas 80-120)
