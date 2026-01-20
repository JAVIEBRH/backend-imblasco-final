/**
 * ASISTENTE VIRTUAL - IMBLASCO
 * Servicio principal con OpenAI function calling
 *
 * Reglas:
 * - NO cachear stock (consultas directas a WooCommerce)
 * - MongoDB solo como índice de productos y historial de conversación
 * - Enviar TODO el historial a OpenAI en cada request
 * - System prompt se carga EXACTO desde ARQUITECTURA_ACORDADA.md
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import ProductIndex from '../models/ProductIndex.js';
import Conversation from '../models/Conversation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SYSTEM_PROMPT_PATH = path.resolve(__dirname, '../../ARQUITECTURA_ACORDADA.md');

let systemPromptCache = null;
let openaiClient = null;

function getSystemPrompt() {
  if (!systemPromptCache) {
    systemPromptCache = fs.readFileSync(SYSTEM_PROMPT_PATH, 'utf-8');
  }
  return systemPromptCache;
}

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY no definida en variables de entorno');
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

function getWooCommerceConfig() {
  const WC_URL = process.env.WC_URL || 'https://imblasco.cl';
  const WC_KEY = process.env.WC_KEY;
  const WC_SECRET = process.env.WC_SECRET;
  if (!WC_KEY || !WC_SECRET) {
    throw new Error('WC_KEY o WC_SECRET no configuradas en .env');
  }
  return { WC_URL, WC_KEY, WC_SECRET };
}

async function wcRequest(endpoint) {
  const { WC_URL, WC_KEY, WC_SECRET } = getWooCommerceConfig();
  const url = `${WC_URL}/wp-json/wc/v3/${endpoint}`;
  const auth = Buffer.from(`${WC_KEY}:${WC_SECRET}`).toString('base64');

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WooCommerce API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
  }

  return response.json();
}

function normalizeCode(code) {
  if (!code || typeof code !== 'string') return '';
  return code.toUpperCase().replace(/[-.\s_]/g, '').trim();
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function buscarProductos(termino) {
  if (!termino || typeof termino !== 'string') return [];
  const cleanTerm = termino.trim();
  if (!cleanTerm) return [];

  // Búsqueda por texto (Mongo text index)
  let results = await ProductIndex.find(
    { $text: { $search: cleanTerm } },
    { score: { $meta: 'textScore' } }
  )
    .sort({ score: { $meta: 'textScore' } })
    .limit(8)
    .lean();

  // Fallback por SKU/codigo exacto o parcial
  if (!results || results.length === 0) {
    const regex = new RegExp(cleanTerm, 'i');
    results = await ProductIndex.find({
      $or: [
        { sku: regex },
        { codigo: regex },
        { nombre: regex }
      ]
    })
      .limit(8)
      .lean();
  }

  return results.map(p => ({
    woo_id: p.woo_id,
    codigo: p.codigo,
    sku: p.sku,
    nombre: p.nombre,
    tipo: p.tipo
  }));
}

async function consultarStock(codigo) {
  if (!codigo || typeof codigo !== 'string') {
    return { found: false, message: 'Código inválido' };
  }

  const rawCode = codigo.trim();
  const normalized = normalizeCode(rawCode);

  // Buscar en índice por SKU/codigo exacto (normalizado)
  let productIndex = await ProductIndex.findOne({
    $or: [
      { sku: new RegExp(`^${rawCode}$`, 'i') },
      { codigo: new RegExp(`^${rawCode}$`, 'i') }
    ]
  }).lean();

  // Fallback por SKU normalizado
  if (!productIndex && normalized) {
    productIndex = await ProductIndex.findOne({
      $or: [
        { sku: normalized },
        { codigo: normalized }
      ]
    }).lean();
  }

  // Fallback por nombre (cuando el SKU real es numérico y el código va en el nombre)
  if (!productIndex) {
    const codeWord = new RegExp(`\\b${escapeRegex(rawCode)}\\b`, 'i');
    productIndex = await ProductIndex.findOne({
      nombre: codeWord
    }).lean();
  }
  // Si está en el nombre y el código no coincide, usar el código solicitado
  if (productIndex && normalizeCode(productIndex.codigo) !== normalized && normalized) {
    productIndex = { ...productIndex, codigo: normalized };
  }

  if (!productIndex) {
    return { found: false, codigo: rawCode };
  }

  const productId = productIndex.woo_id;

  // Consultas en paralelo si es variable
  const product = await wcRequest(`products/${productId}`);

  let variations = [];
  if (product.type === 'variable') {
    const [productDetails, variationList] = await Promise.all([
      wcRequest(`products/${productId}`),
      wcRequest(`products/${productId}/variations?per_page=100`)
    ]);
    variations = Array.isArray(variationList) ? variationList : [];
    return buildProductResponse(productDetails, variations, productIndex);
  }

  return buildProductResponse(product, [], productIndex);
}

function buildProductResponse(product, variations, productIndex) {
  const stockQuantity = product.stock_quantity !== null && product.stock_quantity !== undefined
    ? parseInt(product.stock_quantity, 10)
    : null;

  const variationDetails = Array.isArray(variations)
    ? variations.map(v => {
        const attrs = {};
        (v.attributes || []).forEach(attr => {
          if (attr && attr.name && attr.option) {
            attrs[attr.name.toLowerCase()] = attr.option;
          }
        });
        return {
          id: v.id,
          sku: v.sku || '',
          stock: v.stock_quantity !== null && v.stock_quantity !== undefined ? parseInt(v.stock_quantity, 10) : null,
          stock_status: v.stock_status || 'unknown',
          ...attrs
        };
      })
    : [];

  const variationStockValues = variationDetails
    .map(v => v.stock)
    .filter(v => v !== null && v !== undefined);
  const totalVariationStock = variationStockValues.length > 0
    ? variationStockValues.reduce((sum, v) => sum + v, 0)
    : null;

  const hasVariationInStock = variationDetails.some(v => v.stock_status === 'instock');
  const available = totalVariationStock !== null
    ? totalVariationStock > 0
    : (product.stock_status === 'instock' || hasVariationInStock || (stockQuantity !== null && stockQuantity > 0));

  const resolvedStock = totalVariationStock !== null ? totalVariationStock : stockQuantity;

  return {
    found: true,
    woo_id: product.id,
    codigo: productIndex?.codigo || product.sku || '',
    sku: product.sku || '',
    nombre: product.name || '',
    tipo: product.type || 'simple',
    precio: product.price ? parseFloat(product.price) : null,
    stock: resolvedStock,
    disponible: available,
    stock_status: product.stock_status || 'unknown',
    descripcion: product.description || '',
    variaciones: variationDetails
  };
}

function formatStockResponse(result) {
  if (!result || !result.found) {
    return 'No encontré el producto en nuestro catálogo. ¿Podrías verificar el código o darme una descripción del producto que buscas? También puedo ayudarte a buscarlo por nombre o categoría.';
  }

  const name = result.nombre || result.sku || result.codigo || 'Producto';
  const stockText = result.stock !== null && result.stock !== undefined ? `${result.stock} unidad${result.stock === 1 ? '' : 'es'}` : 'N/A';
  const priceText = result.precio !== null && result.precio !== undefined ? `$${result.precio}` : 'N/A';

  let response = `Sí, tenemos el ${name} disponible.\n` +
    `Stock: ${stockText}\n` +
    `Precio: ${priceText}`;

  if (Array.isArray(result.variaciones) && result.variaciones.length > 0) {
    const formatAttrKey = key => {
      if (!key || typeof key !== 'string') return key;
      return key.charAt(0).toUpperCase() + key.slice(1);
    };
    const variationsList = result.variaciones.map(v => {
      const attrs = Object.entries(v)
        .filter(([k]) => !['id', 'sku', 'stock', 'stock_status'].includes(k))
        .map(([k, val]) => `${formatAttrKey(k)}: ${val}`)
        .join(', ');
      const stockVar = v.stock !== null && v.stock !== undefined ? v.stock : 'N/A';
      return `- ${attrs || v.sku || 'Variación'}: ${stockVar}`;
    }).join('\n');
    response += `\nVariaciones:\n${variationsList}`;
  }

  response += '\n¿Necesitas algo más sobre este producto?';
  return response;
}

function shouldUseContextForAttributes(message) {
  if (!message || typeof message !== 'string') return false;
  const text = message.toLowerCase();
  return (
    text.includes('color') ||
    text.includes('colores') ||
    text.includes('talla') ||
    text.includes('tallas') ||
    text.includes('tamaño') ||
    text.includes('tamanos') ||
    text.includes('tamaños') ||
    text.includes('variacion') ||
    text.includes('variación') ||
    text.includes('acabado') ||
    text.includes('modelo')
  );
}

function hasProductCode(message) {
  if (!message || typeof message !== 'string') return false;
  return /(?:^|\b)[A-Z]{1,3}[-\s]?\d{2,4}(?:\b|$)/i.test(message);
}

function isCompanyInfoQuery(message) {
  if (!message || typeof message !== 'string') return false;
  const text = message.toLowerCase();
  return (
    text.includes('horario') ||
    text.includes('hora') ||
    text.includes('direccion') ||
    text.includes('dirección') ||
    text.includes('ubicacion') ||
    text.includes('ubicación') ||
    text.includes('despacho') ||
    text.includes('despachos') ||
    text.includes('envio') ||
    text.includes('envíos') ||
    text.includes('envio') ||
    text.includes('envíos')
  );
}

function isGenericProductSearchQuery(message) {
  if (!message || typeof message !== 'string') return false;
  const text = message.toLowerCase();
  if (hasProductCode(message)) return false;
  if (isCompanyInfoQuery(message)) return false;
  return (
    text.includes('tienes') ||
    text.includes('tienen') ||
    text.includes('hay') ||
    text.includes('qué tienen') ||
    text.includes('que tienen') ||
    text.includes('qué productos') ||
    text.includes('que productos') ||
    text.includes('articulos') ||
    text.includes('artículos')
  );
}

function extractSearchTerm(message) {
  const text = (message || '').toLowerCase();
  if (text.includes('articulos de pesca') || text.includes('artículos de pesca') || text.includes('pesca')) {
    return 'pesca';
  }
  return message;
}

function detectColorMention(message) {
  if (!message || typeof message !== 'string') return null;
  const text = message.toLowerCase();
  const colors = [
    'negro',
    'blanco',
    'rojo',
    'azul',
    'verde',
    'amarillo',
    'dorado',
    'plateado',
    'gris',
    'cafe',
    'café',
    'naranjo',
    'naranja',
    'morado',
    'violeta',
    'celeste',
    'rosado',
    'turquesa'
  ];

  for (const color of colors) {
    const pattern = new RegExp(`\\b${color}(s|es)?\\b`, 'i');
    if (pattern.test(text)) {
      return color;
    }
  }
  return null;
}

function getVariationColorValue(variation) {
  if (!variation || typeof variation !== 'object') return '';
  const keys = Object.keys(variation);
  const colorKey = keys.find(k => k.includes('color') || k.includes('colour'));
  if (!colorKey) return '';
  const value = variation[colorKey];
  return typeof value === 'string' ? value : '';
}

function formatAttrKey(key) {
  if (!key || typeof key !== 'string') return key;
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function listAvailableColors(variations) {
  if (!Array.isArray(variations)) return [];
  const colors = new Set();
  variations.forEach(v => {
    const color = getVariationColorValue(v);
    if (color) {
      colors.add(color);
    }
  });
  return Array.from(colors);
}

function formatColorListResponse(result) {
  if (!result || !result.found) {
    return 'No encontré el producto en nuestro catálogo. ¿Podrías verificar el código o darme una descripción del producto que buscas? También puedo ayudarte a buscarlo por nombre o categoría.';
  }

  const name = result.nombre || result.sku || result.codigo || 'Producto';
  const variations = Array.isArray(result.variaciones) ? result.variaciones : [];

  if (variations.length === 0) {
    const stockText = result.stock !== null && result.stock !== undefined
      ? `${result.stock} unidad${result.stock === 1 ? '' : 'es'}`
      : 'N/A';
    return `El ${name} no tiene variaciones de color registradas. Stock total: ${stockText}.`;
  }

  const colorVariations = variations.filter(v => getVariationColorValue(v));
  if (colorVariations.length === 0) {
    return `El ${name} no tiene variaciones de color registradas.`;
  }

  const list = colorVariations.map(v => {
    const color = getVariationColorValue(v) || 'Variación';
    const stockVar = v.stock !== null && v.stock !== undefined ? v.stock : 'N/A';
    return `- ${color}: ${stockVar}`;
  }).join('\n');

  return `El ${name} está disponible en los siguientes colores:\n${list}`;
}

function formatColorVariationResponse(result, colorQuery) {
  if (!result || !result.found) {
    return 'No encontré el producto en nuestro catálogo. ¿Podrías verificar el código o darme una descripción del producto que buscas? También puedo ayudarte a buscarlo por nombre o categoría.';
  }

  const name = result.nombre || result.sku || result.codigo || 'Producto';
  const variations = Array.isArray(result.variaciones) ? result.variaciones : [];
  const colorQueryLower = (colorQuery || '').toLowerCase();

  if (variations.length === 0) {
    const stockText = result.stock !== null && result.stock !== undefined
      ? `${result.stock} unidad${result.stock === 1 ? '' : 'es'}`
      : 'N/A';
    return `El ${name} no tiene variaciones de color registradas. Stock total: ${stockText}.`;
  }

  const matching = variations.filter(v => {
    const color = getVariationColorValue(v);
    return color && color.toLowerCase().includes(colorQueryLower);
  });

  if (matching.length === 0) {
    const availableColors = listAvailableColors(variations);
    if (availableColors.length > 0) {
      return `No veo la variación "${colorQuery}" para el ${name}. Colores disponibles: ${availableColors.join(', ')}.`;
    }
    return `No veo variaciones de color registradas para el ${name}.`;
  }

  const matchingList = matching.map(v => {
    const attrs = Object.entries(v)
      .filter(([k]) => !['id', 'sku', 'stock', 'stock_status'].includes(k))
      .map(([k, val]) => `${formatAttrKey(k)}: ${val}`)
      .join(', ');
    const stockVar = v.stock !== null && v.stock !== undefined ? v.stock : 'N/A';
    return `- ${attrs || v.sku || 'Variación'}: ${stockVar}`;
  }).join('\n');

  return `El ${name} en color ${colorQuery} tiene:\n${matchingList}\n¿Necesitas algo más sobre este producto?`;
}

function isLunchHoursQuery(message) {
  if (!message || typeof message !== 'string') return false;
  const text = message.toLowerCase();
  return (
    text.includes('hora de almuerzo') ||
    text.includes('horario de almuerzo') ||
    text.includes('colación') ||
    text.includes('colacion') ||
    text.includes('atienden a la hora') ||
    text.includes('atienden en la hora')
  );
}

function fixedLunchHoursResponse() {
  return 'Atendemos de lunes a viernes de 9:42 a 14:00 y de 15:30 a 19:00 hrs. Los sábados de 10:00 a 13:00 hrs. No atendemos durante la hora de almuerzo.';
}

function isOrderIntentMessage(message) {
  if (!message || typeof message !== 'string') return false;
  const text = message.toLowerCase();
  return (
    text.includes('comprar') ||
    text.includes('compra') ||
    text.includes('pedido') ||
    text.includes('pedir') ||
    text.includes('reservar') ||
    text.includes('reserva') ||
    text.includes('guardar') ||
    text.includes('agregar') ||
    text.includes('añadir') ||
    text.includes('ordenar') ||
    text.includes('encargar') ||
    text.includes('apartar') ||
    text.includes('separar') ||
    text.includes('pagar') ||
    text.includes('confirmar')
  );
}

function stripOrderLanguage(text) {
  if (!text || typeof text !== 'string') return text;
  const cleaned = text.replace(
    /[^.!?]*\b(pedir|pedido|pedidos|comprar|compra|compras|reservar|reserva|reservas|guardar|agregar|añadir|solicitar|ordenar|encargar|apartar|separar|pagar|confirmar)\b[^.!?]*[.!?]?/gi,
    ''
  );
  const noSalesyQuestions = cleaned.replace(
    /¿[^?]*(te interesa|te gustar(i|í)a)[^?]*\?/gi,
    ''
  );
  return noSalesyQuestions.replace(/\s{2,}/g, ' ').trim();
}

function formatProductSearchResponse(results) {
  if (!Array.isArray(results) || results.length === 0) {
    return 'No encontré productos con ese término. ¿Podrías darme más detalles o el código del producto?';
  }
  const list = results.slice(0, 8).map(p => {
    const codigo = p.codigo || p.sku || '';
    const nombre = p.nombre || 'Producto';
    return `- ${codigo ? `${codigo} - ` : ''}${nombre}`;
  }).join('\n');
  return `Sí, tengo estas opciones:\n${list}\n¿Cuál te gustaría consultar?`;
}

function getToolsDefinition() {
  return [
    {
      type: 'function',
      function: {
        name: 'consultar_stock',
        description: 'Consulta stock y precio en tiempo real de un producto por codigo o SKU',
        parameters: {
          type: 'object',
          properties: {
            codigo: {
              type: 'string',
              description: 'Código o SKU del producto a consultar'
            }
          },
          required: ['codigo']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'buscar_productos',
        description: 'Busca productos por texto en el índice MongoDB (sin stock/precio)',
        parameters: {
          type: 'object',
          properties: {
            termino: {
              type: 'string',
              description: 'Texto o término para buscar productos'
            }
          },
          required: ['termino']
        }
      }
    }
  ];
}

async function getOrCreateConversation(sessionId) {
  let convo = await Conversation.findOne({ session_id: sessionId });
  if (!convo) {
    convo = new Conversation({
      session_id: sessionId,
      mensajes: [],
      contexto_actual: { codigo_producto: null }
    });
  }
  return convo;
}

export async function handleChat({ session_id, message }) {
  if (!session_id || typeof session_id !== 'string') {
    throw new Error('session_id es obligatorio');
  }
  if (!message || typeof message !== 'string') {
    throw new Error('message es obligatorio');
  }

  console.log(`[ASSISTANT] handleChat session_id=${session_id} message="${message.slice(0, 120)}"`);

  const convo = await getOrCreateConversation(session_id);
  const contextCode = convo.contexto_actual?.codigo_producto || null;

  // Construir historial completo (user/assistant/system)
  const historyMessages = convo.mensajes.map(m => ({
    role: m.role,
    content: m.content
  }));

  const systemPrompt = getSystemPrompt();

  const contextMessage = convo.contexto_actual?.codigo_producto
    ? `contexto_actual: codigo_producto=${convo.contexto_actual.codigo_producto}`
    : 'contexto_actual: codigo_producto=null';

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'system', content: contextMessage },
    ...historyMessages,
    { role: 'user', content: message }
  ];

  const openai = getOpenAIClient();
  const tools = getToolsDefinition();

  if (isLunchHoursQuery(message)) {
    const response = fixedLunchHoursResponse();
    convo.mensajes.push(
      { role: 'user', content: message },
      { role: 'assistant', content: response }
    );
    await convo.save();
    return {
      session_id,
      response,
      contexto_actual: convo.contexto_actual || { codigo_producto: null }
    };
  }

  if (isGenericProductSearchQuery(message)) {
    const term = extractSearchTerm(message);
    const results = await buscarProductos(term);
    const response = formatProductSearchResponse(results);
    convo.mensajes.push(
      { role: 'user', content: message },
      { role: 'assistant', content: response }
    );
    await convo.save();
    return {
      session_id,
      response,
      contexto_actual: convo.contexto_actual || { codigo_producto: null }
    };
  }

  // Si la consulta pide atributos (colores/tallas/etc.) o menciona un color y hay contexto, consultar directo
  const colorMention = detectColorMention(message);
  if (contextCode && (shouldUseContextForAttributes(message) || colorMention)) {
    const result = await consultarStock(contextCode);
    const asksColors = message.toLowerCase().includes('color') || message.toLowerCase().includes('colores');
    const formatted = asksColors
      ? formatColorListResponse(result)
      : (colorMention ? formatColorVariationResponse(result, colorMention) : formatStockResponse(result));
    convo.mensajes.push(
      { role: 'user', content: message },
      { role: 'assistant', content: formatted }
    );
    convo.contexto_actual = { codigo_producto: result?.codigo || contextCode };
    await convo.save();
    return {
      session_id,
      response: formatted,
      contexto_actual: convo.contexto_actual
    };
  }

  const firstResponse = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    tools,
    tool_choice: 'auto'
  });

  const assistantMessage = firstResponse.choices?.[0]?.message;
  if (!assistantMessage) {
    throw new Error('OpenAI no devolvió respuesta');
  }

  const toolCalls = assistantMessage.tool_calls || [];
  console.log(`[ASSISTANT] tool_calls=${toolCalls.length}`);
  let finalResponseContent = assistantMessage.content || '';
  let updatedContext = convo.contexto_actual || { codigo_producto: null };

  if (toolCalls.length > 0) {
    const toolResults = [];
    let lastStockResult = null;
    let lastSearchResults = null;

    for (const toolCall of toolCalls) {
      const toolName = toolCall.function.name;
      let args
      try {
        args = JSON.parse(toolCall.function.arguments || '{}');
      } catch (parseError) {
        console.error(`[ASSISTANT] ❌ Error parseando arguments de toolCall:`, parseError.message)
        console.error(`[ASSISTANT] Arguments recibidos:`, toolCall.function.arguments?.substring(0, 200))
        // Continuar con objeto vacío - NO inventar argumentos
        args = {}
      }
      console.log(`[ASSISTANT] Ejecutando tool=${toolName} args=${JSON.stringify(args)}`);

      if (toolName === 'consultar_stock') {
        const result = await consultarStock(args.codigo);
        console.log(`[ASSISTANT] consultar_stock result.found=${result?.found}`);
        lastStockResult = result;
        if (result?.found && result.codigo) {
          updatedContext = { codigo_producto: result.codigo };
        }
        toolResults.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          name: toolName,
          content: JSON.stringify(result)
        });
      }

      if (toolName === 'buscar_productos') {
        const result = await buscarProductos(args.termino);
        console.log(`[ASSISTANT] buscar_productos results=${Array.isArray(result) ? result.length : 0}`);
        lastSearchResults = result;
        toolResults.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          name: toolName,
          content: JSON.stringify(result)
        });
      }
    }

    if (lastStockResult) {
      finalResponseContent = formatStockResponse(lastStockResult);
      console.log('[ASSISTANT] Respuesta formateada (stock)');
    } else if (lastSearchResults) {
      finalResponseContent = formatProductSearchResponse(lastSearchResults);
      console.log('[ASSISTANT] Respuesta formateada (busqueda)');
    } else {
      const secondResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          ...messages,
          assistantMessage,
          ...toolResults
        ]
      });

      finalResponseContent = secondResponse.choices?.[0]?.message?.content || '';
      console.log('[ASSISTANT] Respuesta final generada');
    }
  }

  // Evitar cualquier mención a pedidos/reservas en respuestas finales
  finalResponseContent = stripOrderLanguage(finalResponseContent);
  if (isOrderIntentMessage(message)) {
    const addendum = 'Puedo informarte stock, precio y características.';
    if (!finalResponseContent.toLowerCase().includes('stock')) {
      finalResponseContent = `${addendum}\n${finalResponseContent}`.trim();
    } else if (!finalResponseContent.includes(addendum)) {
      finalResponseContent = `${finalResponseContent}\n${addendum}`.trim();
    }
  }

  // Guardar historial completo
  convo.mensajes.push(
    { role: 'user', content: message },
    { role: 'assistant', content: finalResponseContent }
  );
  convo.contexto_actual = updatedContext;
  await convo.save();
  console.log('[ASSISTANT] Conversación guardada');

  return {
    session_id,
    response: finalResponseContent,
    contexto_actual: updatedContext
  };
}

export default {
  handleChat
};
