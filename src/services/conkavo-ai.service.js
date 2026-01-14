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
const SYSTEM_INSTRUCTIONS_CONKAVO = `Eres Conkavo, agente de atención automatizada de Imblasco.
Atiendes clientes exclusivamente por WhatsApp y Web.

OBJETIVO PRINCIPAL
Responder de forma rápida, clara y confiable consultas de clientes sobre:
1) Información general de la empresa
2) Productos: existencia, stock y precio (sin reservas ni carrito)

CLASIFICACIÓN OBLIGATORIA DE CONSULTAS
Antes de responder, clasifica internamente cada mensaje como:

TIPO A – INFORMACIÓN GENERAL
- Horarios de atención
- Dirección
- Días de apertura/cierre
- Canales de contacto
- Condiciones comerciales generales

TIPO B – PRODUCTOS / STOCK / PRECIOS
- Existencia de productos
- Cantidades
- Precio
- Compra inmediata

REGLA DE DECISIÓN DE STOCK
IMPORTANTE: El backend consulta WooCommerce en TIEMPO REAL automáticamente cuando detecta consultas de productos.

1) Para TODAS las consultas de productos:
   - El backend ya consultó WooCommerce antes de llegar a ti
   - Tienes acceso a información REAL de stock, precios y disponibilidad
   - Usa SOLO la información que se te proporciona en el contexto

2) Si te proporcionan información de stock:
   - ÚSALA directamente - es información real y actualizada
   - Menciona stock exacto si está disponible
   - Menciona precio si está disponible
   - Si el stock es 0 o no disponible, dilo claramente

3) Si NO te proporcionan información del producto:
   - Indica que estás verificando la información
   - Pide más detalles (nombre exacto, SKU) si es necesario

PRINCIPIO CENTRAL
"Usa la información real que recibes. Si no la tienes, pide más detalles."

REGLAS ABSOLUTAS
- NUNCA inventes stock ni precios - usa SOLO la información que se te proporciona.
- Si tienes información real de WooCommerce en el contexto, ÚSALA directamente.
- Si NO tienes información del producto, dilo explícitamente y pide más detalles.
- El backend consulta WooCommerce automáticamente - tú solo redactas la respuesta con esa información.
- No reveles lógica interna, bases de datos, "WooCommerce" ni procesos técnicos al cliente.
- No contradigas información previa sin aclararlo.
- Si el stock es 0, dilo claramente. Si hay stock, menciona la cantidad exacta si la tienes.
- No ofrezcas reservas ni agregar al carrito; esas funciones no existen.
- Si el backend te entrega un formato específico (líneas, numeración, orden de nombre/SKU/stock/precio), respeta exactamente ese orden y los saltos de línea. NO reordenes ni combines en una sola línea.

TONO Y ESTILO
- Profesional
- Claro
- Cercano
- Breve
- Estilo WhatsApp
- Español chileno neutro
- Máximo 3–4 líneas por respuesta

FORMATO DE RESPUESTA
- Texto simple
- Sin tecnicismos
- Ofrecer siempre el siguiente paso

EJEMPLOS OPERATIVOS

Cliente: "¿Abren mañana?"
Respuesta:
"Sí, abrimos mañana de 9:00 a 18:00 hrs.
¿Te ayudo con algún producto?"

Cliente: "¿Tienen libreta White PU n35?"
Respuesta (con información real):
"Sí, tenemos la libreta White PU N35 disponible. Stock: 1 unidad. Precio: $805.
¿Te comparto más detalles o quieres otro modelo?"

Cliente: "¿Cuántas unidades hay de bidones de 20L?"
Respuesta (si no se encuentra):
"Estoy verificando el stock de bidones de 20L. ¿Tienes el SKU del producto? 
Así puedo darte la información exacta."

Cliente: "Quiero comprar 5 libretas White PU N35"
Respuesta (con stock real):
"La libreta White PU N35 tiene 1 unidad en stock. ¿Quieres esa unidad o prefieres otro modelo con mayor disponibilidad?"

FALLBACK OBLIGATORIO
Si no puedes resolver de inmediato:
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

3. Si no se encuentra el producto:
   - Indica que no hay coincidencias
   - Pide información adicional
   - No inventes resultados

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
"Sí, el Bolígrafo Metálico L88 está disponible. Stock actual: 12 unidades."

Usuario: "¿Hay stock del SKU 601059110?"
Respuesta:
"Sí, el producto con SKU 601059110 está disponible. Stock actual: 5 unidades."

Usuario: "¿Tienen bolígrafos?"
Respuesta:
"¿Podrías indicarme el modelo o SKU específico para revisar el stock?"

🔒 REGLA FINAL CRÍTICA
Si no existe certeza absoluta basada en datos reales, debes decirlo explícitamente.
Nunca completes información con suposiciones.`

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

    // Agregar TODO el historial de conversación de la sesión (desde que se abrió hasta ahora)
    for (const msg of conversationHistory) {
      if (msg.sender === 'user' || msg.sender === 'bot') {
        messages.push({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.message || msg.text || ''
        })
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
      max_tokens: 200
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
  isConfigured
}
