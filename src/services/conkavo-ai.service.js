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
import { withTimeout, withRetry } from '../utils/resilience.js'
import { logEvent } from '../utils/structured-logger.js'

const OPENAI_TIMEOUT_MS = 60000
const OPENAI_MAX_RETRIES = 2
const OPENAI_RETRY_DELAY_MS = 1000

/** Llamada a chat.completions.create con timeout y reintentos. */
function openaiCreate(client, params) {
  return withRetry(
    () => withTimeout(OPENAI_TIMEOUT_MS, client.chat.completions.create(params)),
    { maxRetries: OPENAI_MAX_RETRIES, delayMs: OPENAI_RETRY_DELAY_MS }
  )
}

// Cliente OpenAI (inicializado una sola vez)
let openaiClient = null

// System instructions del agente (OBLIGATORIO - NO MODIFICAR)
const SYSTEM_INSTRUCTIONS_CONKAVO = `Eres el asistente de ventas de Importadora Imblasco. Atiendes consultas de clientes por un chat en una pagina web.

===========================
OBJETIVO PRINCIPAL
===========================
Responder consultas sobre:
1) Información general de la empresa
2) Productos: stock, precio, variaciones, características, descripciones.
3) Recomendaciones (cuando el backend entrega lista de candidatos)

===========================
ARQUITECTURA DEL SISTEMA (CRÍTICO)
===========================
El backend orquesta TODO. Tú SOLO redactas respuestas finales.
- El backend analiza intención, consulta WooCommerce en tiempo real y prepara datos.
- Tú NO consultas stock ni buscas productos.
- Tú NO decides cuándo consultar: el backend ya lo hizo.
- Tu función es redactar según instrucciones OBLIGATORIAS.

NO reveles procesos internos (“API”, “WooCommerce”, “base de datos”, etc.).

===========================
FUENTES DE VERDAD
===========================
- Productos y stock: entregados por el backend.
- Información de empresa: entregada por el backend.
- Si falta un dato, NO lo inventes; usa “N/A” si el formato lo exige.

===========================
REGLAS ABSOLUTAS
===========================
1) No inventes stock/precios/características.  
2) No inventes información de la empresa.  
3) No lenguaje inapropiado.  
4) No confirmes disponibilidad sin datos.  
5) Solo ventas mayoristas (NO clientes finales).  
6) No ofrezcas reservar/guardar/comprar.  
7) Si hay duda, dilo explícitamente.  
8) No uses lenguaje técnico interno.  
9) Toda información viene del backend.  

===========================
TONO Y ESTILO
===========================
- Profesional y cercano
- Claro y directo
- Conciso (4–5 líneas salvo necesidad)
- Español chileno neutro
- Chat tipo WhatsApp
- Emojis ocasionales

===========================
FORMATO OBLIGATORIO PRODUCTOS
===========================
ORDEN ESTRICTO:
1. Confirmación
2. SKU
3. Stock
4. Precio
5. Variaciones (si aplica)
6. Pregunta de cierre (si aplica)

REGLAS:
- Cada dato en línea separada.
- Stock SIEMPRE incluido, incluso si es 0.
- Si falta un dato: “N/A”.
- Stock 0: “Stock agotado (0 unidades)”.

EJEMPLO:
Sí, tenemos el Llavero Metálico K34 disponible.
SKU: K34.
Stock: 8 unidades disponibles.
Precio: $5.990.

===========================
DETENCIÓN DE CASOS ESPECIALES
===========================
SALUDOS GENÉRICOS:
- Respuesta fija: “¡Hola! 👋 ¿En qué puedo ayudarte hoy? Si tienes alguna pregunta sobre nuestros productos o servicios, no dudes en decírmelo.”

MENSAJES INCOMPRENSIBLES (GIBBERISH):
- Respuesta fija: “No entendí tu mensaje. ¿Podrías repetirlo o decirme en qué te ayudo?”

FRASES GENÉRICAS (PUERTA DURA):
- Respuesta fija: “¡Hola! ¿En qué puedo ayudarte? Puedes preguntarme por un producto (nombre o SKU), stock, precios, o información de la empresa.”

CORRECCIONES/QUEJAS:
- Respuesta de disculpa + pedir aclaración.

===========================
MANEJO DE CONTEXTO
===========================
- Se mantiene el último producto consultado.
- Preguntas como “cuánto cuesta”, “cuántos tienen”, usan el producto en contexto.
- Si el mensaje es solo un saludo genérico, NO uses contexto.
- Si el usuario pregunta por otro producto específico, se limpia el contexto.
- Seguimiento corto (“el primero”, “ese”, “el rojo”) se interpreta con la lista previa.

===========================
BÚSQUEDA Y MATCHING
===========================
- Los códigos se normalizan automáticamente (mayúsculas, sin guiones/espacios ni signos).
- El matching determinístico es la primera capa (SKU/ID/nombre normalizado exacto).
- Si hay múltiples coincidencias exactas, se listan para desambiguar.
- Si no hay match exacto, se activa búsqueda parcial (singular/plural y sinónimos).
- Si aún falla, se hace fallback a búsqueda nativa de WooCommerce.

===========================
PRODUCTOS VARIABLES Y VARIACIONES
===========================
- Si el cliente pide una variación específica, se responde PRIMERO por esa variación exacta (SKU/stock/precio).
- Luego, si aporta valor, ofrecer otras variaciones disponibles (color/talla/tamaño), sin tecnicismos.
- PROHIBIDO mencionar “producto padre”, “SKU padre” o “SKU hijo”.
- Si se responde por variación específica, usar stock/precio de ESA variación.
- Si se responde por el producto variable general, el stock total = suma de variaciones.
- Si todas las variaciones tienen stock 0, indicar: “sin stock en variantes (0 unidades en cada variante por el momento)”.
- Validar que atributo/valor exista antes de responder.

===========================
CARACTERÍSTICAS
===========================
- Usa descripción y atributos entregados.
- Prioridad: short_description > description > attributes > categories.
- Si no hay info, decir: “No hay información adicional disponible sobre este producto.”

===========================
RECOMENDACIONES
===========================
- Solo recomendar productos de la lista entregada.
- Elegir 3 a 5 con razón breve.
- Incluir nombre, SKU (si existe) y precio.
- Invitar a pedir detalle de uno en concreto.
- Si no hay lista, pedir más detalles (presupuesto, ocasión, cantidad).

===========================
INFORMACIÓN EMPRESA (LITERAL)
===========================
EMPRESA:
Importadora Blas y Cía. Ltda. (Imblasco)
Más de 50 años de experiencia.
Importador mayorista exclusivo. No se realizan ventas a clientes finales.

DIRECCIÓN:
Álvarez de Toledo 981, San Miguel, Santiago.
A pasos del Metro San Miguel. Estacionamiento para clientes.

HORARIO:
Lunes a viernes: 9:42 a 14:00 y 15:30 a 19:00 hrs
Sábados: 10:00 a 13:00 hrs
No se atiende durante la hora de almuerzo (14:00–15:30)

DESPACHOS:
Regiones:
- Envíos por transporte por pagar
- Días fijos: Martes y jueves
- La carga viaja a costo y riesgo del cliente
- No se trabaja con Chilexpress, Correos de Chile ni Blue Express
Santiago:
- Retiro en casa matriz
- No se realizan envíos dentro de Santiago.

TRANSPORTES FRECUENTES:
JAC, Económico, Express, Chevalier, Poblete, Tur Bus, Pullman del Sur, Binder, LIT, Rapid Cargo, Espinoza (V Región), Mena, Merco Sur, Transcargo, Tromen, entre otras.

CÓMO REALIZAR PEDIDO:
- Solicitar cuenta para consultar precios y stock. En nuestra página web, específicamente en el apartado solicitud de cuenta, podrá realizar el trámite pertinente.
- Enviar datos de la empresa a ventas@imblasco.cl: RUT, razón social, giro, dirección y comuna. 
- Recibirás un email confirmando tu solicitud. Nuestro equipo revisará tu información (24-48 hrs). Te notificaremos por email cuando tu cuenta sea aprobada. Podrás acceder a precios mayoristas y realizar pedidos.
- Posterior a eso, podrás pedir tu cotización enviando un correo a la siguiente dirección: cesar.barahona.b@gmail.com
- Clientes activos: enviar cotización con modelos, tamaños y cantidades

RETIRO DE PEDIDOS:
- Pago previo por transferencia bancaria
- Presentar RUT de compra o nota de venta
- Si no está facturado, presentar comprobante de pago

DATOS BANCARIOS PARA TRANSFERENCIA/DEPOSITO:
RUT: 76.274.594-1
Tipo de cuenta: Cuenta Corriente
Cuentas disponibles:
- SANTANDER: 06-699 114-8
- ESTADO: 64 34 282
- ITAÚ: 20-5518-518
- SCOTIABANK: 975-730-255

GARANTÍA:
- Productos nuevos: 6 meses
- Perecibles o uso breve: 7 días
- Requiere comprobante de compra y revisión técnica

DERECHO A RETRACTO:
Aplica solo a compras a distancia, dentro de plazos legales.
Costos de envío a cargo del consumidor.
No aplica a productos a medida, perecibles ni servicios.

CONTACTO:
ventas@imblasco.cl
225443327 / 225443382 / 225440418

===========================
FALLBACKS / CASOS ESPECIALES
===========================
- Reclamos: empatía + derivar a ventas.
- Descuentos / precios especiales: derivar a ventas.
- Reposición: derivar a ventas.
- Consultas mixtas (producto + info empresa): entregar ambas.

===========================
ERRORES
===========================
Si hay error técnico:
“⚠️ Lo siento, hubo un error al procesar tu mensaje. Por favor, intenta de nuevo.”`

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
  "tipo": "PRODUCTO" | "INFORMACION_GENERAL" | "AMBIGUA" | "VARIANTE" | "CARACTERISTICAS" | "FALLBACK" | "RECOMENDACION",
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

5. RECOMENDACION: Si pide sugerencias/recomendaciones de productos
   - "qué me recomiendan?" → RECOMENDACION (sin término)
   - "recomiéndame algo para regalo" → RECOMENDACION (término: "regalo")
   - "no sé qué comprar" → RECOMENDACION
   - EXCEPCIONES (no es recomendación de productos):
     - "talleres recomendados" → INFORMACION_GENERAL
     - "empresas recomendadas" → INFORMACION_GENERAL
     - "recomiéndame el K34" → PRODUCTO (tiene SKU específico)

6. INFORMACION_GENERAL: Solo si pregunta explícitamente información de la EMPRESA (no productos)
   - Ubicación/dirección: "¿dónde están?", "¿dirección?", "¿ubicación?"
   - Horarios: "¿horarios?", "¿a qué hora atienden?", "¿a qué hora abren?", "a que hora abren?", "¿atienden en almuerzo?"
   - Contacto: "¿teléfono?", "¿email?", "¿cómo los contacto?"
   - Despachos/envíos: "¿hacen envíos?", "¿despachan a regiones?"
   - Empresa: "¿quiénes son?", "¿qué talleres recomiendan?"
   - Datos bancarios / transferencia: "¿a qué cuenta transfiero?", "datos para transferencia", "¿dónde deposito?", "cuenta para transferir", "datos bancarios", "RUT para transferencia"
   - NUNCA marques INFORMACION_GENERAL si pregunta por un producto (nombre, SKU, precio, stock).

7. AMBIGUA: Cuando el mensaje es genérico sin término específico
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

8. Extracción de términos:
   - NO extraigas términos genéricos como "producto", "productos", "artículo"
   - Solo extrae nombres específicos: "mochila", "bolígrafo", "llavero"
   - Si el término es genérico, marca tipo: "AMBIGUA"

9. SKU/ID: Solo si son explícitos y claros
   - "K62", "L02", "601050020" → SKU válido
   - NO inventes SKUs que no estén en el mensaje

10. CONSERVADOR: Si hay duda, marca AMBIGUA con necesitaMasInfo: true

Ejemplos:
- "tienen mochilas?" → {"tipo":"PRODUCTO","terminoProducto":"mochila","sku":null,"id":null,"atributo":null,"valorAtributo":null,"tipoFallback":null,"necesitaMasInfo":false,"razon":"Consulta de producto con término específico"}
- "¿El M46 está en color blanco?" → {"tipo":"VARIANTE","terminoProducto":"M46","sku":"M46","id":null,"atributo":"color","valorAtributo":"blanco","tipoFallback":null,"necesitaMasInfo":false,"razon":"Consulta sobre variante específica (color)"}
- "¿Qué características tiene el L74?" → {"tipo":"CARACTERISTICAS","terminoProducto":"L74","sku":"L74","id":null,"atributo":null,"valorAtributo":null,"tipoFallback":null,"necesitaMasInfo":false,"razon":"Consulta sobre características del producto"}
- "¿Cuándo llega stock?" → {"tipo":"FALLBACK","terminoProducto":null,"sku":null,"id":null,"atributo":null,"valorAtributo":null,"tipoFallback":"FUTURO","necesitaMasInfo":false,"razon":"Consulta sobre futuro, no disponible"}
- "¿Me guardan uno?" → {"tipo":"FALLBACK","terminoProducto":null,"sku":null,"id":null,"atributo":null,"valorAtributo":null,"tipoFallback":"RESERVA","necesitaMasInfo":false,"razon":"Consulta sobre reserva, no disponible"}
- "¿Me hacen precio por volumen?" → {"tipo":"FALLBACK","terminoProducto":null,"sku":null,"id":null,"atributo":null,"valorAtributo":null,"tipoFallback":"DESCUENTO","necesitaMasInfo":false,"razon":"Consulta sobre descuento, no disponible"}
- "qué me recomiendan?" → {"tipo":"RECOMENDACION","terminoProducto":null,"sku":null,"id":null,"atributo":null,"valorAtributo":null,"tipoFallback":null,"necesitaMasInfo":false,"razon":"Solicitud de recomendaciones"}
- "recomiéndame algo para regalo" → {"tipo":"RECOMENDACION","terminoProducto":"regalo","sku":null,"id":null,"atributo":null,"valorAtributo":null,"tipoFallback":null,"necesitaMasInfo":false,"razon":"Solicitud de recomendaciones con contexto"}
- "necesito saber si tienen un producto" → {"tipo":"AMBIGUA","terminoProducto":null,"sku":null,"id":null,"atributo":null,"valorAtributo":null,"tipoFallback":null,"necesitaMasInfo":true,"razon":"Consulta genérica sin término de producto específico"}
- "horarios de atención" → {"tipo":"INFORMACION_GENERAL","terminoProducto":null,"sku":null,"id":null,"atributo":null,"valorAtributo":null,"tipoFallback":null,"necesitaMasInfo":false,"razon":"Consulta de información general"}
- "¿dónde está ubicada la empresa?" → {"tipo":"INFORMACION_GENERAL","terminoProducto":null,"sku":null,"id":null,"atributo":null,"valorAtributo":null,"tipoFallback":null,"necesitaMasInfo":false,"razon":"Consulta de ubicación/dirección"}
- "¿cuáles son sus talleres recomendados?" → {"tipo":"INFORMACION_GENERAL","terminoProducto":null,"sku":null,"id":null,"atributo":null,"valorAtributo":null,"tipoFallback":null,"necesitaMasInfo":false,"razon":"Consulta sobre empresa/servicios"}
- "a que hora abren?" → {"tipo":"INFORMACION_GENERAL","terminoProducto":null,"sku":null,"id":null,"atributo":null,"valorAtributo":null,"tipoFallback":null,"necesitaMasInfo":false,"razon":"Consulta de horarios"}
- "¿dónde están ubicados?" → {"tipo":"INFORMACION_GENERAL","terminoProducto":null,"sku":null,"id":null,"atributo":null,"valorAtributo":null,"tipoFallback":null,"necesitaMasInfo":false,"razon":"Consulta de ubicación"}
- "¿a qué cuenta les transfiero?" → {"tipo":"INFORMACION_GENERAL","terminoProducto":null,"sku":null,"id":null,"atributo":null,"valorAtributo":null,"tipoFallback":null,"necesitaMasInfo":false,"razon":"Consulta datos bancarios/transferencia"}
- "datos para transferencia" → {"tipo":"INFORMACION_GENERAL","terminoProducto":null,"sku":null,"id":null,"atributo":null,"valorAtributo":null,"tipoFallback":null,"necesitaMasInfo":false,"razon":"Consulta datos bancarios"}

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

    const response = await openaiCreate(client, {
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
      const tiposValidos = ['PRODUCTO', 'INFORMACION_GENERAL', 'AMBIGUA', 'VARIANTE', 'CARACTERISTICAS', 'FALLBACK', 'RECOMENDACION']
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

    const response = await openaiCreate(client, {
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
 * Interpretar seguimiento corto: el usuario eligió uno de la lista recién mostrada ("el primero", "el rojo", "ese", etc.).
 * @param {string} message - Mensaje corto del usuario
 * @param {Array<{name: string, sku?: string}>} productList - Lista de productos mostrados (índice 1 = primer producto)
 * @returns {Promise<number>} Índice 1-based del producto elegido, o 0 si no está claro
 */
export async function interpretarSeguimientoCorto(message, productList = []) {
  if (!message || !Array.isArray(productList) || productList.length === 0) return 0
  try {
    const client = getOpenAIClient()
    const listText = productList.slice(0, 10).map((p, i) => `${i + 1}. ${p.name || 'N/A'}${p.sku ? ` (SKU: ${p.sku})` : ''}`).join('\n')
    const prompt = `El cliente acaba de ver esta lista de productos:
${listText}

El cliente respondió: "${message}"

¿A cuál producto se refiere? Responde SOLO un número: el índice (1, 2, 3...) del producto elegido, o 0 si no está claro o no se refiere a ninguno de la lista.

Ejemplos: "el primero" → 1, "el 1" → 1, "el rojo" → número de la opción que tiene rojo, "ese" → 1 si suele ser el primero, "el de 990" → índice del que cuesta 990, "ninguno" → 0.
Respuesta:`
    const response = await openaiCreate(client, {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Responde solo con un número: índice 1-based del producto o 0.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 10
    })
    const raw = (response.choices[0]?.message?.content || '0').trim()
    const n = parseInt(raw.replace(/\D/g, ''), 10)
    if (Number.isFinite(n) && n >= 1 && n <= productList.length) {
      console.log(`[IA] ✅ Seguimiento corto: usuario eligió índice ${n} - ${productList[n - 1]?.name || 'N/A'}`)
      return n
    }
    return 0
  } catch (error) {
    console.error(`[IA] ❌ Error interpretarSeguimientoCorto:`, error.message)
    return 0
  }
}

/**
 * Desambiguar varios productos: cuál es más probable que busque el usuario.
 * @param {string} message - Mensaje original del usuario
 * @param {Array<{name: string, sku?: string}>} productList - Lista de productos encontrados
 * @returns {Promise<number>} Índice 1-based del producto más probable, o 0 si ambiguo
 */
export async function desambiguarProductos(message, productList = []) {
  if (!message || !Array.isArray(productList) || productList.length < 2) return 0
  try {
    const client = getOpenAIClient()
    const listText = productList.slice(0, 10).map((p, i) => `${i + 1}. ${p.name || 'N/A'}${p.sku ? ` (SKU: ${p.sku})` : ''}`).join('\n')
    const prompt = `El cliente buscó algo y encontramos estos productos:
${listText}

Mensaje del cliente: "${message}"

¿Cuál es el producto que más probablemente busca? Responde SOLO un número: 1, 2, 3... (índice del más probable), o 0 si es ambiguo y no se puede decidir.

Respuesta:`
    const response = await openaiCreate(client, {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Responde solo con un número: 1-based del producto más probable o 0.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 10
    })
    const raw = (response.choices[0]?.message?.content || '0').trim()
    const n = parseInt(raw.replace(/\D/g, ''), 10)
    if (Number.isFinite(n) && n >= 1 && n <= productList.length) {
      console.log(`[IA] ✅ Desambiguación: producto más probable índice ${n} - ${productList[n - 1]?.name || 'N/A'}`)
      return n
    }
    return 0
  } catch (error) {
    console.error(`[IA] ❌ Error desambiguarProductos:`, error.message)
    return 0
  }
}

/**
 * Validar si una palabra/candidato en el mensaje es un código de producto (SKU) que el usuario está pidiendo.
 * Evita depender de una lista fija de "palabras comunes": la IA decide si el mensaje pregunta por un producto con ese código.
 * @param {string} message - Mensaje completo del usuario
 * @param {string} candidato - Palabra candidata (ej. "como", "K33", "gal")
 * @returns {Promise<boolean>} true solo si el usuario está preguntando por un producto con ese código
 */
export async function esCodigoProductoEnMensaje(message, candidato) {
  if (!message || !candidato || candidato.length < 2) return false
  try {
    const client = getOpenAIClient()
    const prompt = `El cliente escribió: "${message}"

En el mensaje aparece la palabra o código "${candidato}".

¿El cliente está preguntando por un PRODUCTO o SKU con ese código/nombre? (ej. "tienen K33?", "busco el N35")
NO es código de producto si: es pregunta genérica ("¿cómo comprar?", "¿cómo los contacto?"), saludo, adverbio, o palabra común ("qué", "donde", "como" en "cómo").

Responde SOLO: SI o NO
Respuesta:`
    const response = await openaiCreate(client, {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Responde solo SI o NO. SI solo si el cliente pide un producto con ese código.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 10
    })
    const raw = (response.choices[0]?.message?.content || 'NO').trim()
    const esCodigo = /^\s*s[ií]\s*$/i.test(raw) || /^\s*s[ií]\s*[\.\s]/.test(raw)
    if (!esCodigo) console.log(`[IA] ✅ "${candidato}" no es código de producto en este mensaje`)
    return esCodigo
  } catch (error) {
    console.error(`[IA] ❌ Error esCodigoProductoEnMensaje:`, error.message)
    return false // En error, no tratar como SKU (evitar falsos positivos)
  }
}

/**
 * Detectar tipo de seguimiento: ¿repite la misma búsqueda, elige uno de la lista, o otra cosa?
 * @param {string} message - Mensaje actual del usuario
 * @param {string} lastSearchTerm - Término de la última búsqueda (normalizado)
 * @param {number} lastShownCount - Cantidad de productos en la lista mostrada
 * @returns {Promise<'REPITE_BUSQUEDA'|'ELIGE_UNO'|'OTRA_COSA'>}
 */
export async function detectarTipoSeguimiento(message, lastSearchTerm, lastShownCount) {
  if (!message || lastShownCount < 1) return 'OTRA_COSA'
  try {
    const client = getOpenAIClient()
    const prompt = `En la última respuesta mostramos ${lastShownCount} producto(s) al cliente (búsqueda: "${lastSearchTerm || 'N/A'}").

El cliente ahora dice: "${message}"

¿Qué está haciendo el cliente?
- REPITE_BUSQUEDA: repite el mismo término o pide lo mismo otra vez (ej. "k33", "el K33", "busco el k33").
- ELIGE_UNO: está eligiendo uno de la lista (ej. "el primero", "el 1", "ese", "el rojo", "el de 990", "el llavero").
- OTRA_COSA: pregunta otra cosa, saludo, o no está claro.

Responde SOLO una de estas tres palabras: REPITE_BUSQUEDA, ELIGE_UNO, OTRA_COSA
Respuesta:`
    const response = await openaiCreate(client, {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Responde solo: REPITE_BUSQUEDA, ELIGE_UNO o OTRA_COSA.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 20
    })
    const raw = (response.choices[0]?.message?.content || 'OTRA_COSA').trim().toUpperCase()
    if (raw.includes('REPITE')) return 'REPITE_BUSQUEDA'
    if (raw.includes('ELIGE')) return 'ELIGE_UNO'
    console.log(`[IA] ✅ Tipo seguimiento: ${raw}`)
    return 'OTRA_COSA'
  } catch (error) {
    console.error(`[IA] ❌ Error detectarTipoSeguimiento:`, error.message)
    return 'OTRA_COSA'
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
    const openaiStart = Date.now()
    const response = await openaiCreate(client, {
      model: 'gpt-4o-mini',
      messages: messages,
      temperature: 0.7,
      max_tokens: 400
    })
    logEvent({ event: 'openai_request', latencyMs: Date.now() - openaiStart })

    const respuesta = response.choices[0]?.message?.content || 'No se recibió respuesta'
    
    console.log(`✅ Respuesta redactada: ${respuesta.substring(0, 100)}...`)
    return respuesta

  } catch (error) {
    logEvent({ event: 'openai_request', error: error.message })
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

    const stream = await openaiCreate(client, {
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
  interpretarSeguimientoCorto,
  desambiguarProductos,
  detectarTipoSeguimiento,
  esCodigoProductoEnMensaje,
  isConfigured
}
