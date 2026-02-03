/**
 * CONKAVO AI SERVICE
 * Servicio para redactar respuestas usando OpenAI Chat Completions API
 * 
 * IMPORTANTE:
 * - La IA solo REDACTA respuestas, NO investiga ni decide
 * - El backend decide qué hacer y arma el texto para la IA
 * - Usa chat.completions.create() (API estándar de OpenAI)
 */

import OpenAI from 'openai'

// Cliente OpenAI (inicializado una sola vez)
let openaiClient = null

// System instructions del agente (OBLIGATORIO - NO MODIFICAR)
const SYSTEM_INSTRUCTIONS_CONKAVO = `Eres el agente de atención automatizada de Importadora Imblasco.
Atiendes clientes exclusivamente por WhatsApp y Web.

OBJETIVO PRINCIPAL
Responder de forma rápida, clara y confiable consultas de clientes sobre:
1) Información general de la empresa
2) Productos: existencia, stock y precio

CLASIFICACIÓN OBLIGATORIA DE CONSULTAS
Antes de responder, clasifica internamente cada mensaje como:

TIPO A – INFORMACIÓN GENERAL
- Horarios de atención
- Dirección
- Despachos
- Canales de contacto
- Condiciones comerciales generales

⚠️⚠️⚠️ REGLA CRÍTICA Y ABSOLUTA SOBRE HORA DE ALMUERZO ⚠️⚠️⚠️
ESTA ES UNA REGLA OBLIGATORIA QUE NUNCA DEBES VIOLAR:

- ❌ NO se atiende durante la hora de almuerzo (entre las 14:00 y 15:30 hrs)
- ❌ NUNCA respondas "sí" o "sí atendemos" a preguntas sobre atención durante la hora de almuerzo
- ✅ SIEMPRE responde que NO se atiende durante la hora de almuerzo
- ✅ Los horarios de atención son: Lunes a viernes de 9:42 a 14:00 y de 15:30 a 19:00 hrs. Sábados de 10:00 a 13:00 hrs
- ✅ Si alguien pregunta "¿atienden a la hora de almuerzo?", "¿atendemos durante el almuerzo?", "¿se atiende en la hora de almuerzo?" o CUALQUIER variación similar, tu respuesta OBLIGATORIA es: "No, no atendemos durante la hora de almuerzo (entre las 14:00 y 15:30 hrs). Atendemos de lunes a viernes de 9:42 a 14:00 y de 15:30 a 19:00 hrs."

ESTA REGLA ES INQUEBRANTABLE. NUNCA respondas que sí se atiende durante la hora de almuerzo.

TIPO B – PRODUCTOS / STOCK / PRECIOS
- Existencia de productos
- Cantidades
- Precio

Si una consulta mezcla tipos, prioriza siempre el TIPO B.

REGLA DE DECISIÓN DE STOCK
IMPORTANTE: El backend consulta WooCommerce en TIEMPO REAL automáticamente cuando detecta consultas de productos.

1) Para TODAS las consultas de productos:
   - El backend ya consultó WooCommerce en tiempo real antes de llegar a ti
   - Tienes acceso a información REAL y actualizada de stock, precios y disponibilidad
   - Usa SOLO la información que se te proporciona en el contexto
   - La información de stock es siempre en tiempo real (no hay caché)

2) Si te proporcionan información de stock:
   - ÚSALA directamente - es información real y actualizada
   - Menciona stock exacto si está disponible
   - Menciona precio si está disponible
   - Si el stock es 0 o no disponible, dilo claramente
   - Toda mención de disponibilidad debe incluir descargo de confirmación si es relevante

3) Si NO te proporcionan información del producto (no hay resultados de búsqueda):
   - Responde explícitamente: "No encontramos productos que coincidan con [término que buscó el cliente]."
   - Sugiere dar SKU, nombre más específico o contactar a ventas.
   - NUNCA listes ni inventes productos que no estén en el contexto proporcionado.

PRINCIPIO CENTRAL
"Rápido por defecto, exacto cuando importa".
Cuando rapidez y exactitud entren en conflicto, prima siempre la exactitud.

REGLAS ABSOLUTAS
- ❌ NUNCA inventes stock ni precios - usa SOLO la información que se te proporciona.
- ❌ NUNCA confirmes stock exacto sin validación cuando corresponda (el backend ya validó, pero si tienes dudas, dilo).
- ❌ NUNCA respondas que sí se atiende durante la hora de almuerzo. SIEMPRE responde que NO se atiende entre las 14:00 y 15:30 hrs.
- Toda mención de disponibilidad debe incluir descargo de confirmación si es relevante.
- GPT solo redacta respuestas, no decide stock - el backend ya consultó WooCommerce.
- No reveles lógica interna, bases de datos, "WooCommerce" ni procesos técnicos al cliente.
- No contradigas información previa sin aclararlo.
- Si no hay certeza, dilo explícitamente.
- No ofrezcas reservas ni agregar al carrito; esas funciones no existen.
- Si el backend te entrega un formato específico (líneas, numeración, orden de nombre/SKU/stock/precio), respeta exactamente ese orden y los saltos de línea. NO reordenes ni combines en una sola línea.
- Cuando el producto está identificado, SIEMPRE incluye nombre, SKU, stock y precio en líneas separadas; si un dato falta, marca "N/A", pero no omitas el campo.
- ⚠️ CRÍTICO SOBRE STOCK: SIEMPRE incluye el stock en tu respuesta, incluso si el cliente pregunta solo por precio. Si el stock es 0, muestra "Stock agotado (0 unidades)". NUNCA omitas el stock, es obligatorio en todas las respuestas de productos.

INFORMACIÓN GENERAL DE LA EMPRESA
Para consultas TIPO A:
- Usa exclusivamente la información oficial contenida en la Base de Conocimiento de Importadora Imblasco.
- Resume siempre en un máximo de 3–4 líneas.
- Si la información es extensa o legal, entrega un resumen y ofrece ampliar o enviar el detalle.
- Nunca interpretes ni reformules términos legales.

TONO Y FORMATO
- Profesional
- Claro
- Cercano
- Breve
- Estilo WhatsApp
- Español chileno neutro

FALLBACK OBLIGATORIO
"Para ayudarte bien necesito confirmar esto internamente.
Te respondo enseguida."

═══════════════════════════════════════════════════════════════
MEJORAS ADICIONALES PARA CORREGIR RESPUESTAS "MOSCATO"
═══════════════════════════════════════════════════════════════

🧠 CONOCIMIENTO REAL DISPONIBLE DE WOOCOMMERCE
El sistema tiene acceso en tiempo real a WooCommerce y SOLO dispone de los siguientes datos por producto:

- id (numérico)
- sku (string)
- name (string)
- price (number)
- stock_quantity (number o null)
- stock_status ("instock", "outofstock", "onbackorder")
- manage_stock (boolean)
- available (boolean calculado internamente)

No existen otros datos.
No debes asumir información fuera de estos campos.

📦 CÓMO RESPONDER CONSULTAS DE STOCK (GUÍA MEJORADA)

1. Si el producto está claramente identificado (por SKU o nombre exacto):
   - Responde directamente con:
     - nombre del producto
     - estado del stock
     - cantidad disponible (solo si existe)

2. Si hay más de un producto posible:
   - Indica que la coincidencia es ambigua
   - Solicita confirmación clara (SKU o nombre exacto)
   - No sugieras productos similares

3. Si no se encuentra el producto (el backend te indica que no hay resultados):
   - Responde: "No encontramos productos que coincidan con [término]. ¿Puedes darme el SKU o nombre más específico? También puedes contactar a ventas@imblasco.cl."
   - NUNCA inventes ni listes productos que no te fueron proporcionados en el contexto.

❓ CUÁNDO PEDIR CONFIRMACIÓN
- SOLO cuando el producto no está identificado de forma única
- NO pidas confirmación si el SKU ya fue proporcionado y es válido

💬 ESTILO DE RESPUESTA MEJORADO
- Directo
- Claro
- Breve
- Basado en datos reales

Evita:
- Frases genéricas innecesarias
- Respuestas largas sin información concreta
- Repetir preguntas ya respondidas por el usuario

📝 EJEMPLOS CORRECTOS (ACTUALIZADOS)

Usuario: "¿Hay stock del bolígrafo metálico L88?"
Respuesta (si existe y hay stock):
"Sí, tenemos el Bolígrafo Metálico L88 disponible.
SKU: L88.
Stock: 12 unidades.
Precio: $2.500.
¿Te gustaría saber algo más? 😊"

Usuario: "¿Hay stock del SKU 601059110?"
Respuesta:
"Sí, tenemos el producto con SKU 601059110 disponible.
SKU: 601059110.
Stock: 5 unidades.
Precio: $15.990.
¿Te gustaría saber algo más? 😊"

Usuario: "¿Tienen bolígrafos?"
Respuesta:
"Necesito el nombre completo o el SKU del producto para darte precio y stock. ¿Me lo confirmas?"

Usuario: "¿Tienen atomizadores de mano?" (y el backend indica que no hay resultados)
Respuesta:
"No encontramos productos que coincidan con 'atomizadores de mano'. ¿Puedes darme el SKU o nombre más específico? También puedes contactar a ventas@imblasco.cl."

Usuario: "cuanto cuesta" (después de haber consultado un producto)
Respuesta (si el producto ya está identificado):
"Sí, tenemos el [Nombre del Producto] disponible.
SKU: [SKU].
Stock: [cantidad] unidades disponibles.
Precio: $[precio].
¿Te gustaría saber algo más? 😊"
⚠️ NOTA: Incluso si el cliente pregunta solo por precio, SIEMPRE incluye el stock en la respuesta.

❌ EJEMPLOS INCORRECTOS (NO HACER)

Usuario: "¿Hay stock del bolígrafo metálico L88?"
Respuesta INCORRECTA:
"Sí, tenemos varios bolígrafos disponibles. El modelo L88 está en stock con 12 unidades a $2.500. ¿Te gustaría realizar una reserva?"
PROBLEMAS:
- No sigue el formato de líneas separadas
- Ofrece "reserva" (función que no existe)
- Combina información en una sola línea

Usuario: "¿Tienen mochilas?"
Respuesta INCORRECTA:
"Encontré 3 mochilas disponibles: Mochila de Viaje E70, Mochila Porta Notebook E47, Mochila Morral Poliéster E7."
PROBLEMAS:
- No pide confirmación cuando hay múltiples opciones
- No incluye SKU, stock y precio para cada una
- No sigue el formato requerido

Usuario: "cuanto cuesta" (después de haber consultado un producto)
Respuesta INCORRECTA:
"Sí, tenemos el Llavero Destapador K35 disponible.
SKU: K35.
Precio: $445.
¿Te gustaría saber algo más? 😊"
PROBLEMAS:
- ❌ OMITE el stock (CRÍTICO: siempre debe incluirse)
- No sigue el formato completo requerido

✅ REGLAS DE VALIDACIÓN ANTES DE RESPONDER

1. VERIFICAR DATOS:
   - ¿El nombre del producto coincide EXACTAMENTE con el proporcionado?
   - ¿El SKU coincide EXACTAMENTE (si existe)?
   - ¿El stock coincide EXACTAMENTE?
   - ¿El precio coincide EXACTAMENTE?

2. VERIFICAR FORMATO:
   - ¿Cada dato está en una línea separada?
   - ¿El orden es: Confirmación → SKU → Stock → Precio → Pregunta?
   - ¿No hay información combinada en una sola línea?

3. VERIFICAR CONTENIDO:
   - ¿Solo menciono productos de la lista proporcionada?
   - ¿No ofrezco funciones que no existen (reserva, carrito)?
   - ¿No invento información adicional?

4. VERIFICAR CONTEXTO:
   - ¿La respuesta es relevante a la pregunta del cliente?
   - ¿Pido confirmación cuando hay ambigüedad?
   - ¿Soy claro y directo?

🔒 REGLA FINAL CRÍTICA
Si no existe certeza absoluta basada en datos reales, debes decirlo explícitamente.
Nunca completes información con suposiciones.
Siempre valida que los datos que mencionas coincidan EXACTAMENTE con los proporcionados.`

/**
 * Inicializar cliente OpenAI (una sola vez)
 * Falla explícitamente si no existe OPENAI_API_KEY
 */
export function initializeOpenAI() {
  if (openaiClient) {
    return // Ya inicializado
  }

  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY no definida en variables de entorno')
  }

  // Validar formato de API key
  if (!apiKey.startsWith('sk-')) {
    throw new Error('OPENAI_API_KEY tiene formato inválido (debe empezar con sk-)')
  }

  try {
    openaiClient = new OpenAI({
      apiKey: apiKey.trim()
    })

    console.log('✅ OpenAI cliente inicializado correctamente')
    console.log(`   API Key: ${apiKey.substring(0, 15)}... (${apiKey.length} caracteres)`)
  } catch (error) {
    console.error('❌ Error al crear cliente OpenAI:', error.message)
    throw error
  }
}

/**
 * Obtener cliente OpenAI (inicializa si es necesario)
 */
export function getOpenAIClient() {
  if (!openaiClient) {
    initializeOpenAI()
  }
  return openaiClient
}

/**
 * Analizar intención de la consulta del usuario usando IA
 * @param {string} message - Mensaje del usuario
 * @param {Array} conversationHistory - Historial reciente de conversación (opcional)
 * @returns {Promise<Object>} Análisis de intención con tipo, término de producto, y acción recomendada
 */
export async function analizarIntencionConsulta(message, conversationHistory = [], currentProduct = null) {
  try {
    const client = getOpenAIClient()
    
    const historyContext = conversationHistory.length > 0
      ? `\n\nHistorial reciente:\n${conversationHistory.slice(-4).map(msg => 
          `${msg.sender === 'user' ? 'Cliente' : 'Bot'}: ${(msg.message || msg.text || '').trim()}`
        ).join('\n')}`
      : ''
    
    const productContext = currentProduct
      ? `\n\n⚠️ CONTEXTO IMPORTANTE: Hay un producto mencionado anteriormente en la conversación:
- Nombre: ${currentProduct.name || currentProduct.codigo || 'N/A'}
- SKU: ${currentProduct.sku || 'N/A'}
Si el mensaje del cliente pregunta sobre precio, stock, disponibilidad, características, o variantes SIN mencionar otro producto específico, probablemente se refiere a este producto del contexto.`
      : ''
    
    const analysisPrompt = `Analiza el siguiente mensaje del cliente y determina su intención.

Mensaje: "${message}"${historyContext}${productContext}

INSTRUCCIONES:
Analiza el mensaje y responde SOLO con un JSON válido en este formato exacto:
{
  "tipo": "PRODUCTO" | "INFORMACION_GENERAL" | "AMBIGUA" | "VARIANTE" | "CARACTERISTICAS" | "FALLBACK",
  "terminoProducto": "término extraído o null",
  "sku": "SKU detectado o null",
  "id": "ID detectado o null",
  "atributo": "atributo solicitado (ej: 'color', 'tamaño') o null",
  "valorAtributo": "valor del atributo (ej: 'blanco', 'grande') o null",
  "tipoFallback": "FUTURO" | "RESERVA" | "DESCUENTO" | null,
  "necesitaMasInfo": true | false,
  "razon": "breve explicación de la decisión"
}

REGLAS ESTRICTAS (CRÍTICO - EVITAR FALSOS POSITIVOS):
1. PRODUCTO: Solo si hay término ESPECÍFICO de producto (nombre concreto, SKU, ID)
   - "tienen mochilas?" → PRODUCTO (término: "mochila")
   - "tienen el K62?" → PRODUCTO (SKU: "K62")
   - "tienen un producto" → AMBIGUA (NO es específico)
   - "hola tienen productos" → AMBIGUA (genérico, sin término específico)
   - "necesito saber si tienen" → AMBIGUA (sin término)

2. VARIANTE: Si pregunta por un atributo específico de un producto (color, tamaño, etc.)
   - "¿El M46 está en color blanco?" → VARIANTE (término: "M46", atributo: "color", valorAtributo: "blanco")
   - "¿Tienen el L74 en tamaño grande?" → VARIANTE (término: "L74", atributo: "tamaño", valorAtributo: "grande")
   - "¿está en color blanco?" (con contexto) → VARIANTE (atributo: "color", valorAtributo: "blanco")

3. CARACTERISTICAS: Si pregunta qué características tiene un producto
   - "¿Qué características tiene el L74?" → CARACTERISTICAS (término: "L74")
   - "¿Qué tiene el producto?" (con contexto) → CARACTERISTICAS

4. FALLBACK: Si pregunta por funciones no disponibles
   - "¿Cuándo llega stock?" → FALLBACK (tipoFallback: "FUTURO")
   - "¿Me guardan uno?" → FALLBACK (tipoFallback: "RESERVA")
   - "¿Me hacen precio por volumen?" → FALLBACK (tipoFallback: "DESCUENTO")

5. INFORMACION_GENERAL: Solo si pregunta explícitamente información de la EMPRESA (no productos)
   - Ubicación/dirección: "¿dónde están?", "¿dirección?", "¿ubicación?"
   - Horarios: "¿horarios?", "¿a qué hora atienden?", "¿a qué hora abren?", "a que hora abren?", "¿atienden en almuerzo?"
   - Contacto: "¿teléfono?", "¿email?", "¿cómo los contacto?"
   - Despachos/envíos: "¿hacen envíos?", "¿despachan a regiones?"
   - Empresa: "¿quiénes son?", "¿qué talleres recomiendan?"
   - NUNCA marques INFORMACION_GENERAL si pregunta por un producto (nombre, SKU, precio, stock).

6. AMBIGUA: Cuando el mensaje es genérico sin término específico
   - "tienen un producto" → AMBIGUA
   - "hola tienen productos" → AMBIGUA
   - "necesito saber si tienen" → AMBIGUA
   - "hola!!!" → AMBIGUA (saludo genérico, NO se refiere a producto del contexto)
   - "tienen usb?" → AMBIGUA (pregunta sobre otro producto, NO se refiere a contexto)
   - "cuál es su precio" (SIN contexto de producto) → AMBIGUA
   - "cuál es su precio" (CON contexto de producto) → PRODUCTO (usando producto del contexto)
   - "cuanto cuesta" (CON contexto) → PRODUCTO (usando producto del contexto)
   - "tiene stock?" (CON contexto) → PRODUCTO (usando producto del contexto)
   
   ⚠️ REGLA CRÍTICA PARA AMBIGUA:
   - Si hay producto en contexto Y el mensaje pregunta sobre precio/stock/disponibilidad SIN mencionar otro producto → NO es AMBIGUA, es PRODUCTO (usando contexto)
   - Si el mensaje es un saludo genérico ("hola", "buenos días") → AMBIGUA (NO usar contexto)
   - Si el mensaje pregunta sobre OTRO producto específico ("tienen usb?", "tienen mochilas?") → AMBIGUA o PRODUCTO según el término (NO usar contexto anterior)

7. Extracción de términos:
   - NO extraigas términos genéricos como "producto", "productos", "artículo"
   - Solo extrae nombres específicos: "mochila", "bolígrafo", "llavero"
   - Si el término es genérico, marca tipo: "AMBIGUA"

8. SKU/ID: Solo si son explícitos y claros
   - "K62", "L02", "601050020" → SKU válido
   - NO inventes SKUs que no estén en el mensaje

9. CONSERVADOR: Si hay duda, marca AMBIGUA con necesitaMasInfo: true

Ejemplos:
- "tienen mochilas?" → {"tipo":"PRODUCTO","terminoProducto":"mochila","sku":null,"id":null,"atributo":null,"valorAtributo":null,"tipoFallback":null,"necesitaMasInfo":false,"razon":"Consulta de producto con término específico"}
- "¿El M46 está en color blanco?" → {"tipo":"VARIANTE","terminoProducto":"M46","sku":"M46","id":null,"atributo":"color","valorAtributo":"blanco","tipoFallback":null,"necesitaMasInfo":false,"razon":"Consulta sobre variante específica (color)"}
- "¿Qué características tiene el L74?" → {"tipo":"CARACTERISTICAS","terminoProducto":"L74","sku":"L74","id":null,"atributo":null,"valorAtributo":null,"tipoFallback":null,"necesitaMasInfo":false,"razon":"Consulta sobre características del producto"}
- "¿Cuándo llega stock?" → {"tipo":"FALLBACK","terminoProducto":null,"sku":null,"id":null,"atributo":null,"valorAtributo":null,"tipoFallback":"FUTURO","necesitaMasInfo":false,"razon":"Consulta sobre futuro, no disponible"}
- "¿Me guardan uno?" → {"tipo":"FALLBACK","terminoProducto":null,"sku":null,"id":null,"atributo":null,"valorAtributo":null,"tipoFallback":"RESERVA","necesitaMasInfo":false,"razon":"Consulta sobre reserva, no disponible"}
- "¿Me hacen precio por volumen?" → {"tipo":"FALLBACK","terminoProducto":null,"sku":null,"id":null,"atributo":null,"valorAtributo":null,"tipoFallback":"DESCUENTO","necesitaMasInfo":false,"razon":"Consulta sobre descuento, no disponible"}
- "necesito saber si tienen un producto" → {"tipo":"AMBIGUA","terminoProducto":null,"sku":null,"id":null,"atributo":null,"valorAtributo":null,"tipoFallback":null,"necesitaMasInfo":true,"razon":"Consulta genérica sin término de producto específico"}
- "horarios de atención" → {"tipo":"INFORMACION_GENERAL","terminoProducto":null,"sku":null,"id":null,"atributo":null,"valorAtributo":null,"tipoFallback":null,"necesitaMasInfo":false,"razon":"Consulta de información general"}
- "¿dónde está ubicada la empresa?" → {"tipo":"INFORMACION_GENERAL","terminoProducto":null,"sku":null,"id":null,"atributo":null,"valorAtributo":null,"tipoFallback":null,"necesitaMasInfo":false,"razon":"Consulta de ubicación/dirección"}
- "¿cuáles son sus talleres recomendados?" → {"tipo":"INFORMACION_GENERAL","terminoProducto":null,"sku":null,"id":null,"atributo":null,"valorAtributo":null,"tipoFallback":null,"necesitaMasInfo":false,"razon":"Consulta sobre empresa/servicios"}
- "a que hora abren?" → {"tipo":"INFORMACION_GENERAL","terminoProducto":null,"sku":null,"id":null,"atributo":null,"valorAtributo":null,"tipoFallback":null,"necesitaMasInfo":false,"razon":"Consulta de horarios"}
- "¿dónde están ubicados?" → {"tipo":"INFORMACION_GENERAL","terminoProducto":null,"sku":null,"id":null,"atributo":null,"valorAtributo":null,"tipoFallback":null,"necesitaMasInfo":false,"razon":"Consulta de ubicación"}

Ejemplos CON CONTEXTO DE PRODUCTO:
- Contexto: producto "Boligrafo Bamboo L39" (SKU: L39)
  - "cuanto cuesta" → {"tipo":"PRODUCTO","terminoProducto":"L39","sku":"L39","id":null,"atributo":null,"valorAtributo":null,"tipoFallback":null,"necesitaMasInfo":false,"razon":"Consulta sobre precio del producto del contexto"}
  - "cual es su precio" → {"tipo":"PRODUCTO","terminoProducto":"L39","sku":"L39","id":null,"atributo":null,"valorAtributo":null,"tipoFallback":null,"necesitaMasInfo":false,"razon":"Consulta sobre precio del producto del contexto"}
  - "tiene stock?" → {"tipo":"PRODUCTO","terminoProducto":"L39","sku":"L39","id":null,"atributo":null,"valorAtributo":null,"tipoFallback":null,"necesitaMasInfo":false,"razon":"Consulta sobre stock del producto del contexto"}
  - "en que colores?" → {"tipo":"VARIANTE","terminoProducto":"L39","sku":"L39","id":null,"atributo":"color","valorAtributo":null,"tipoFallback":null,"necesitaMasInfo":false,"razon":"Consulta sobre colores disponibles del producto del contexto"}
  - "qué colores tiene?" → {"tipo":"VARIANTE","terminoProducto":"L39","sku":"L39","id":null,"atributo":"color","valorAtributo":null,"tipoFallback":null,"necesitaMasInfo":false,"razon":"Consulta sobre colores disponibles del producto del contexto"}
  - "hola!!!" → {"tipo":"AMBIGUA","terminoProducto":null,"sku":null,"id":null,"atributo":null,"valorAtributo":null,"tipoFallback":null,"necesitaMasInfo":true,"razon":"Saludo genérico, no se refiere al producto del contexto"}
  - "tienen usb?" → {"tipo":"AMBIGUA","terminoProducto":null,"sku":null,"id":null,"atributo":null,"valorAtributo":null,"tipoFallback":null,"necesitaMasInfo":true,"razon":"Pregunta sobre otro producto (USB), no se refiere al contexto"}

Respuesta (SOLO el JSON, sin explicaciones adicionales):`

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Eres un analizador de intenciones. Analiza mensajes y responde SOLO con JSON válido. No agregues explicaciones fuera del JSON.'
        },
        {
          role: 'user',
          content: analysisPrompt
        }
      ],
      temperature: 0.1, // Baja temperatura para respuestas más determinísticas
      max_tokens: 200,
      response_format: { type: 'json_object' } // Forzar formato JSON
    })

    const resultado = response.choices[0]?.message?.content?.trim() || ''
    
    try {
      let analisis
      try {
        analisis = JSON.parse(resultado)
      } catch (parseError) {
        console.error(`[IA] ❌ Error parseando JSON de OpenAI:`, parseError.message)
        console.error(`[IA] Contenido recibido:`, resultado.substring(0, 200))
        // Retornar análisis por defecto seguro - NO inventar datos
        return {
          tipo: 'AMBIGUA',
          termino: null,
          SKU: null,
          atributo: null,
          valorAtributo: null,
          tipoFallback: null,
          necesitaMasInfo: true,
          error: 'Error procesando respuesta de IA'
        }
      }
      
      // VALIDACIONES ESTRICTAS para evitar falsos positivos
      // 1. Validar que el tipo sea uno de los permitidos
      const tiposValidos = ['PRODUCTO', 'INFORMACION_GENERAL', 'AMBIGUA', 'VARIANTE', 'CARACTERISTICAS', 'FALLBACK']
      if (!tiposValidos.includes(analisis.tipo)) {
        console.error(`[IA] ⚠️ Tipo inválido de OpenAI: "${analisis.tipo}" → Forzando AMBIGUA`)
        analisis.tipo = 'AMBIGUA'
        analisis.necesitaMasInfo = true
      }
      
      // 2. Validar tipos de fallback
      if (analisis.tipo === 'FALLBACK' && !['FUTURO', 'RESERVA', 'DESCUENTO'].includes(analisis.tipoFallback)) {
        console.error(`[IA] ⚠️ TipoFallback inválido: "${analisis.tipoFallback}" → Forzando AMBIGUA`)
        analisis.tipo = 'AMBIGUA'
        analisis.tipoFallback = null
        analisis.necesitaMasInfo = true
      }
      
      // 3. Validar que VARIANTE tenga atributo (valorAtributo puede ser null cuando se pregunta "qué colores tiene")
      // NOTA: valorAtributo puede ser null cuando se pregunta "qué colores tiene" (listar variantes disponibles)
      if (analisis.tipo === 'VARIANTE' && !analisis.atributo) {
        console.error(`[IA] ⚠️ VARIANTE sin atributo → Forzando PRODUCTO`)
        analisis.tipo = 'PRODUCTO'
        analisis.atributo = null
        analisis.valorAtributo = null
      }
      // Si tiene atributo pero no valorAtributo, es válido (pregunta para listar variantes)
      
      // 2. Validar que si es PRODUCTO, tenga término o SKU/ID
      if (analisis.tipo === 'PRODUCTO' && !analisis.terminoProducto && !analisis.sku && !analisis.id) {
        console.error(`[IA] ⚠️ PRODUCTO sin término/SKU/ID → Forzando AMBIGUA para evitar búsqueda genérica`)
        analisis.tipo = 'AMBIGUA'
        analisis.necesitaMasInfo = true
      }
      
      // 3. Validar que SKU/ID no sean strings vacíos o solo espacios
      if (analisis.sku && typeof analisis.sku === 'string' && analisis.sku.trim().length === 0) {
        analisis.sku = null
      }
      if (analisis.id && typeof analisis.id === 'string' && analisis.id.trim().length === 0) {
        analisis.id = null
      }
      
      // 4. Validar que término de producto no sea genérico
      const terminosGenericos = ['producto', 'productos', 'articulo', 'articulos', 'artículo', 'artículos', 'item', 'items']
      if (analisis.terminoProducto && terminosGenericos.includes(analisis.terminoProducto.toLowerCase().trim())) {
        console.error(`[IA] ⚠️ Término genérico detectado: "${analisis.terminoProducto}" → Forzando AMBIGUA`)
        analisis.tipo = 'AMBIGUA'
        analisis.terminoProducto = null
        analisis.necesitaMasInfo = true
      }
      
      // 6. Si es AMBIGUA, forzar necesitaMasInfo a true
      if (analisis.tipo === 'AMBIGUA') {
        analisis.necesitaMasInfo = true
      }
      
      // 7. Inicializar campos nuevos si no existen
      if (!analisis.atributo) analisis.atributo = null
      if (!analisis.valorAtributo) analisis.valorAtributo = null
      if (!analisis.tipoFallback) analisis.tipoFallback = null
      
      console.log(`[IA] ✅ Análisis de intención validado: tipo=${analisis.tipo}, término=${analisis.terminoProducto || 'N/A'}, SKU=${analisis.sku || 'N/A'}, atributo=${analisis.atributo || 'N/A'}, valorAtributo=${analisis.valorAtributo || 'N/A'}, tipoFallback=${analisis.tipoFallback || 'N/A'}, necesitaMásInfo=${analisis.necesitaMasInfo}`)
      return analisis
    } catch (parseError) {
      console.error(`[IA] ❌ Error parseando JSON de análisis:`, parseError.message)
      console.error(`[IA] Respuesta recibida:`, resultado)
      // Fallback: retornar análisis conservador
      return {
        tipo: 'AMBIGUA',
        terminoProducto: null,
        sku: null,
        id: null,
        atributo: null,
        valorAtributo: null,
        tipoFallback: null,
        necesitaMasInfo: true,
        razon: 'Error al analizar, se requiere más información'
      }
    }
    
  } catch (error) {
    console.error(`[IA] ❌ Error analizando intención:`, error.message)
    // Fallback: retornar análisis conservador
    return {
      tipo: 'AMBIGUA',
      terminoProducto: null,
      sku: null,
      id: null,
      atributo: null,
      valorAtributo: null,
      tipoFallback: null,
      necesitaMasInfo: true,
      razon: 'Error al analizar, se requiere más información'
    }
  }
}

/**
 * Analizar mensaje para detectar SKU numérico usando IA
 * @param {string} message - Mensaje del usuario
 * @returns {Promise<string|null>} SKU numérico detectado o null
 */
export async function detectarSkuNumerico(message) {
  try {
    const client = getOpenAIClient()
    
    const analysisPrompt = `Analiza el siguiente mensaje del cliente y determina si contiene un SKU numérico (código de producto con muchos dígitos, típicamente 6 o más dígitos).

Mensaje: "${message}"

INSTRUCCIONES:
- Si encuentras un número de 6 o más dígitos que parece ser un SKU/código de producto, responde SOLO con ese número
- Si no encuentras ningún SKU numérico, responde "NO"
- Los SKUs numéricos suelen ser códigos largos como 601050020, 601059110, etc.
- NO respondas con explicaciones, solo el número o "NO"

Ejemplos:
- "tienes stock de 601050020?" → 601050020
- "hola tienes 601059110" → 601059110
- "qué precio tiene el 123456789" → 123456789
- "tienes mochilas?" → NO
- "tienes el L02?" → NO (L02 tiene letra, no es numérico puro)

Respuesta:`

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Eres un analizador de mensajes. Extrae SKUs numéricos cuando existan. Responde solo con el número o "NO".'
        },
        {
          role: 'user',
          content: analysisPrompt
        }
      ],
      temperature: 0.1, // Baja temperatura para respuestas más determinísticas
      max_tokens: 20
    })

    const resultado = response.choices[0]?.message?.content?.trim() || ''
    
    // Verificar si la respuesta es un número (SKU numérico)
    if (resultado && resultado !== 'NO' && /^\d{6,}$/.test(resultado)) {
      console.log(`[IA] ✅ SKU numérico detectado por IA: "${resultado}"`)
      return resultado
    }
    
    console.log(`[IA] ⚠️ No se detectó SKU numérico en: "${message}"`)
    return null
    
  } catch (error) {
    console.error(`[IA] ❌ Error detectando SKU numérico:`, error.message)
    return null // En caso de error, retornar null para continuar con flujo normal
  }
}

/**
 * Redactar respuesta usando OpenAI Chat Completions API
 * 
 * @param {string} textoParaRedactar - Texto claro que describe qué debe redactar la IA
 * @param {Array} conversationHistory - Historial de conversación (opcional) para contexto
 * @returns {Promise<string>} Respuesta redactada por la IA
 */
export async function redactarRespuesta(textoParaRedactar, conversationHistory = []) {
  try {
    const client = getOpenAIClient()

    console.log(`[redactarRespuesta] Redactando respuesta...`)
    console.log(`   Texto recibido: ${textoParaRedactar.substring(0, 100)}...`)
    console.log(`   Historial completo: ${conversationHistory.length} mensajes`)

    // Construir mensajes con historial COMPLETO de la sesión
    const messages = [
      {
        role: 'system',
        content: SYSTEM_INSTRUCTIONS_CONKAVO
      }
    ]

    // Historial completo sin truncar: prioridad respuestas correctas (la IA necesita contexto completo)
    for (const msg of conversationHistory) {
      if (msg.sender === 'user' || msg.sender === 'bot') {
        const content = (msg.message || msg.text || '').trim()
        if (content) {
          messages.push({
            role: msg.sender === 'user' ? 'user' : 'assistant',
            content
          })
        }
      }
    }

    // Agregar el mensaje actual
    messages.push({
      role: 'user',
      content: textoParaRedactar
    })

    // Usar Chat Completions API (API estándar de OpenAI)
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      temperature: 0.7,
      max_tokens: 400
    })

    const respuesta = response.choices[0]?.message?.content || 'No se recibió respuesta'
    
    console.log(`✅ Respuesta redactada: ${respuesta.substring(0, 100)}...`)
    return respuesta

  } catch (error) {
    console.error('❌ Error al redactar respuesta:', error)
    console.error('   Tipo:', error.constructor.name)
    console.error('   Mensaje:', error.message)
    
    // Log detallado para debugging
    if (error.response) {
      console.error('   Status:', error.response.status)
      console.error('   Data:', error.response.data)
    }
    
    // Mensajes de error específicos
    if (error.message.includes('API key') || error.message.includes('authentication') || error.message.includes('401')) {
      console.error('   ❌ Error de autenticación: API key inválida o sin créditos')
      return '⚠️ Error: Problema de autenticación con el servicio de IA. Por favor, contacta al administrador.'
    }
    if (error.message.includes('model') || error.message.includes('404')) {
      return '⚠️ Error: Modelo de IA no disponible. Por favor, contacta al administrador.'
    }
    if (error.message.includes('rate limit') || error.message.includes('429')) {
      return '⚠️ Error: Límite de solicitudes excedido. Por favor, intenta de nuevo en un momento.'
    }
    
    return '⚠️ Error al procesar tu mensaje. Por favor, intenta de nuevo.'
  }
}

/**
 * Redactar respuesta en streaming (chunks en tiempo real)
 * @param {string} textoParaRedactar - Texto para la IA
 * @param {Array} conversationHistory - Historial (opcional)
 * @param {function(string): void} onChunk - Callback por cada chunk de texto
 * @returns {Promise<string>} Texto completo al finalizar
 */
export async function redactarRespuestaStream(textoParaRedactar, conversationHistory = [], onChunk) {
  try {
    const client = getOpenAIClient()
    const messages = [
      { role: 'system', content: SYSTEM_INSTRUCTIONS_CONKAVO }
    ]
    for (const msg of conversationHistory) {
      if (msg.sender === 'user' || msg.sender === 'bot') {
        const content = (msg.message || msg.text || '').trim()
        if (content) {
          messages.push({
            role: msg.sender === 'user' ? 'user' : 'assistant',
            content
          })
        }
      }
    }
    messages.push({ role: 'user', content: textoParaRedactar })

    const stream = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.7,
      max_tokens: 400,
      stream: true
    })

    let fullText = ''
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content
      if (delta && typeof delta === 'string') {
        fullText += delta
        if (typeof onChunk === 'function') onChunk(delta)
      }
    }
    return fullText
  } catch (error) {
    console.error('❌ Error en redactarRespuestaStream:', error?.message)
    return '⚠️ Error al procesar tu mensaje. Por favor, intenta de nuevo.'
  }
}

/**
 * Verificar si el servicio está configurado correctamente
 */
export function isConfigured() {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.error('❌ OPENAI_API_KEY no encontrada en process.env')
      return false
    }
    
    const apiKey = process.env.OPENAI_API_KEY.trim()
    if (!apiKey.startsWith('sk-')) {
      console.error('❌ OPENAI_API_KEY tiene formato inválido')
      return false
    }
    
    if (!openaiClient) {
      initializeOpenAI()
    }
    return !!openaiClient
  } catch (error) {
    console.error('❌ Error en isConfigured():', error.message)
    return false
  }
}

export default {
  initializeOpenAI,
  getOpenAIClient,
  redactarRespuesta,
  redactarRespuestaStream,
  detectarSkuNumerico,
  analizarIntencionConsulta,
  isConfigured
}
