/**
 * Analizar logs para identificar problemas
 */
const logs = `
[WooCommerce] 🤖 Consulta sin SKU/ID explícito → OpenAI analizará intención...
[IA] ✅ Análisis de intención validado: tipo=PRODUCTO, término=mochila, SKU=N/A, atributo=N/A, valorAtributo=N/A, tipoFallback=N/A, necesitaMásInfo=false
[WooCommerce] 🤖 OpenAI decidió: tipo=PRODUCTOS, término=mochila, SKU=N/A, ID=N/A, necesitaMásInfo=false
[WooCommerce] Buscando productos para consulta: "tienen mochilas?" (tipo decidido por: OpenAI)
[WooCommerce] 🤖 Consultando IA para detectar SKU numérico en el mensaje...
[IA] ⚠️ No se detectó SKU numérico en: "tienen mochilas?"
[WooCommerce] ⚠️ IA no detectó SKU numérico en el mensaje
[WooCommerce] 🔄 Usando producto del contexto: Llavero Destapador Encobrizado K62 (SKU: 601055385)
[WooCommerce] ✅ Producto ya encontrado desde contexto (sin SKU/ID explícito), omitiendo búsquedas adicionales
✅ Respuesta redactada: Lo siento, no tengo información sobre mochilas en este momento. Si necesitas ayuda con algún otro pr...

[WooCommerce] 🤖 Consulta sin SKU/ID explícito → OpenAI analizará intención...
[IA] ✅ Análisis de intención validado: tipo=PRODUCTO, término=Calculadora Fashion Rojo T74, SKU=N/A, atributo=N/A, valorAtributo=N/A, tipoFallback=N/A, necesitaMásInfo=false
[WooCommerce] 🤖 OpenAI decidió: tipo=PRODUCTOS, término=Calculadora Fashion Rojo T74, SKU=N/A, ID=N/A, necesitaMásInfo=false
[WooCommerce] Buscando productos para consulta: "Tienen Calculadora Fashion Rojo T74?" (tipo decidido por: OpenAI)
[WooCommerce] 🤖 Consultando IA para detectar SKU numérico en el mensaje...
[IA] ⚠️ No se detectó SKU numérico en: "Tienen Calculadora Fashion Rojo T74?"
[WooCommerce] ⚠️ IA no detectó SKU numérico en el mensaje
[WooCommerce] 🔄 Usando producto del contexto: Llavero Destapador Encobrizado K62 (SKU: 601055385)
[WooCommerce] ✅ Producto ya encontrado desde contexto (sin SKU/ID explícito), omitiendo búsquedas adicionales
✅ Respuesta redactada: Lo siento, no tenemos la Calculadora Fashion Rojo T74 disponible.

[WooCommerce] 🤖 Consulta sin SKU/ID explícito → OpenAI analizará intención...
[IA] ✅ Análisis de intención validado: tipo=PRODUCTO, término=almohadilla de repuesto, SKU=N/A, atributo=N/A, valorAtributo=N/A, tipoFallback=N/A, necesitaMásInfo=false
[WooCommerce] 🤖 OpenAI decidió: tipo=PRODUCTOS, término=almohadilla de repuesto, SKU=N/A, ID=N/A, necesitaMásInfo=false
[WooCommerce] Buscando productos para consulta: "Almohadilla de repuesto?" (tipo decidido por: OpenAI)
[WooCommerce] 🤖 Consultando IA para detectar SKU numérico en el mensaje...
[IA] ⚠️ No se detectó SKU numérico en: "Almohadilla de repuesto?"
[WooCommerce] ⚠️ IA no detectó SKU numérico en el mensaje
[WooCommerce] 🔄 Usando producto del contexto: Llavero Destapador Encobrizado K62 (SKU: 601055385)
[WooCommerce] ✅ Producto ya encontrado desde contexto (sin SKU/ID explícito), omitiendo búsquedas adicionales
✅ Respuesta redactada: Lo siento, no tengo inf
`

console.log('╔════════════════════════════════════════════════════════╗')
console.log('║        ANÁLISIS DE PROBLEMAS EN LOGS                    ║')
console.log('╚════════════════════════════════════════════════════════╝')
console.log()

const problemas = [
  {
    id: 1,
    descripcion: 'Contexto persistente con término diferente',
    ejemplo: 'Usuario pregunta "tienen mochilas?" pero sistema usa contexto de "Llavero Destapador Encobrizado K62"',
    severidad: 'CRÍTICO',
    frecuencia: 'Alta (múltiples veces en los logs)',
    estado: 'CORREGIDO (validación de término agregada)'
  },
  {
    id: 2,
    descripcion: 'Contexto no se limpia al reiniciar chat',
    ejemplo: 'Después de [POST] /api/chat/init, el sistema sigue usando contexto anterior',
    severidad: 'ALTO',
    frecuencia: 'Media',
    estado: 'PENDIENTE VERIFICAR'
  },
  {
    id: 3,
    descripcion: 'Productos específicos no se buscan cuando hay contexto',
    ejemplo: '"Calculadora Fashion Rojo T74" y "Almohadilla de repuesto" no se buscan, se usa contexto del llavero',
    severidad: 'CRÍTICO',
    frecuencia: 'Alta',
    estado: 'CORREGIDO (mismo fix que problema 1)'
  },
  {
    id: 4,
    descripcion: 'Respuestas genéricas cuando debería buscar',
    ejemplo: '"Lo siento, no tengo información sobre mochilas" sin haber buscado realmente',
    severidad: 'ALTO',
    frecuencia: 'Alta',
    estado: 'CORREGIDO (al corregir problema 1)'
  }
]

problemas.forEach(p => {
  console.log(`🔴 PROBLEMA #${p.id}: ${p.descripcion}`)
  console.log(`   Severidad: ${p.severidad}`)
  console.log(`   Frecuencia: ${p.frecuencia}`)
  console.log(`   Estado: ${p.estado}`)
  console.log(`   Ejemplo: ${p.ejemplo}`)
  console.log()
})

console.log('╔════════════════════════════════════════════════════════╗')
console.log('║              RESUMEN                                    ║')
console.log('╚════════════════════════════════════════════════════════╝')
console.log()
console.log(`✅ Problemas corregidos: ${problemas.filter(p => p.estado.includes('CORREGIDO')).length}`)
console.log(`⚠️  Problemas pendientes: ${problemas.filter(p => p.estado.includes('PENDIENTE')).length}`)
console.log()
