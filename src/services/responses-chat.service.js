/**
 * RESPONSES API CHAT SERVICE (rama PROOF)
 * Flujo según documento: OpenAI Responses API con instructions, input y tools
 * (file_search + consultar_productos + contar_productos + obtener_detalle_producto).
 * obtener_detalle_producto consulta WooCommerce en tiempo real (stock, precio, variantes).
 * Solo existe en rama PROOF. No mergear a main/develop sin indicación explícita.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { getOpenAIConfig, getResponsesAPIConfig } from '../config/openai.js';
import { initializeOpenAI, getOpenAIClient } from './conkavo-ai.service.js';
import ProductIndex from '../models/ProductIndex.js';
import {
  getProductById,
  getProductStock,
  getProductVariations,
  isWordPressConfigured,
} from './wordpress.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SYSTEM_PROMPT_PATH = path.resolve(__dirname, '../../config/system_prompt.txt');
const MAX_TOOL_ITERATIONS = 10;

let systemPromptCache = null;

function getSystemPrompt() {
  if (!systemPromptCache) {
    if (!fs.existsSync(SYSTEM_PROMPT_PATH)) {
      throw new Error(`config/system_prompt.txt no encontrado: ${SYSTEM_PROMPT_PATH}`);
    }
    systemPromptCache = fs.readFileSync(SYSTEM_PROMPT_PATH, 'utf-8');
  }
  return systemPromptCache;
}

/**
 * Construye la lista de tools para la Responses API.
 * Incluye file_search (si hay VECTOR_STORE_ID), consultar_productos, contar_productos y obtener_detalle_producto (WooCommerce).
 */
function buildTools() {
  const { vectorStoreId } = getResponsesAPIConfig();
  const tools = [];

  if (vectorStoreId) {
    tools.push({
      type: 'file_search',
      vector_store_ids: [vectorStoreId],
    });
  }

  tools.push(
    {
      type: 'function',
      name: 'consultar_productos',
      description: 'Busca productos en el catálogo por texto. Devuelve lista con woo_id, codigo, sku, nombre, tipo. Usar para saber qué productos hay; luego usar obtener_detalle_producto si el usuario pide precio, stock o variantes.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Término de búsqueda' },
          limit: { type: 'number', description: 'Máximo de resultados (por defecto 10)', default: 10 },
        },
        required: ['query'],
      },
      strict: false,
    },
    {
      type: 'function',
      name: 'contar_productos',
      description: 'Devuelve el número total de productos en el catálogo.',
      parameters: { type: 'object', properties: {} },
      strict: false,
    },
    {
      type: 'function',
      name: 'obtener_detalle_producto',
      description: 'Obtiene stock, precio y variaciones de un producto desde WooCommerce en tiempo real. Pasar woo_id (número) o sku (string, ej. "L88", "E6"). Útil cuando el usuario pide precio/stock/variantes, o cuando consultar_productos devuelve vacío pero el usuario dio un código/SKU claro: puedes intentar esta tool con ese sku para comprobar si existe en WooCommerce.',
      parameters: {
        type: 'object',
        properties: {
          woo_id: { type: 'number', description: 'ID del producto en WooCommerce (woo_id de consultar_productos)' },
          sku: { type: 'string', description: 'SKU del producto (alternativa a woo_id)' },
        },
        required: [],
      },
      strict: false,
    }
  );

  return tools;
}

async function buscarProductos(termino, limit = 10) {
  if (!termino || typeof termino !== 'string') return [];
  const cleanTerm = termino.trim();
  if (!cleanTerm) return [];
  const cap = Math.min(Math.max(1, Number(limit) || 10), 50);

  const totalEnCatalogo = await ProductIndex.countDocuments();
  if (totalEnCatalogo === 0) {
    console.warn('[PROOF] buscarProductos: catálogo vacío (0 documentos en productos). Ejecutar npm run import-products.');
  }

  let results = [];
  try {
    results = await ProductIndex.find(
      { $text: { $search: cleanTerm } },
      { score: { $meta: 'textScore' } }
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(cap)
      .lean();
  } catch (e) {
    console.warn('[PROOF] buscarProductos $text falló (¿índice text?):', e?.message);
  }

  if (!results || results.length === 0) {
    const regex = new RegExp(cleanTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    results = await ProductIndex.find({
      $or: [{ sku: regex }, { codigo: regex }, { nombre: regex }],
    })
      .limit(cap)
      .lean();
  }

  return results.map((p) => ({
    woo_id: p.woo_id,
    codigo: p.codigo,
    sku: p.sku,
    nombre: p.nombre,
    tipo: p.tipo,
  }));
}

async function contarProductos() {
  return ProductIndex.countDocuments();
}

/**
 * Obtiene detalle de un producto desde WooCommerce (stock, precio, variaciones).
 * @param {number|string} wooIdOrSku - woo_id (número) o sku (string)
 * @returns {Promise<Object|null>} Objeto para la IA o null si no configurado/no encontrado
 */
async function getDetalleProductoWoo(wooIdOrSku) {
  if (!isWordPressConfigured()) {
    return { error: 'WooCommerce no configurado. No hay stock ni precios en tiempo real.' };
  }
  const id = wooIdOrSku != null && wooIdOrSku !== '' ? wooIdOrSku : null;
  if (id === null) return { error: 'Falta woo_id o sku.' };

  try {
    const isNumeric = typeof id === 'number' || (typeof id === 'string' && /^\d+$/.test(String(id).trim()));
    let product = null;
    if (isNumeric) {
      product = await getProductById(Number(id));
    }
    if (!product) {
      product = await getProductStock(String(id));
    }
    if (!product) {
      return { error: 'Producto no encontrado en WooCommerce.' };
    }

    const base = {
      nombre: product.name || '',
      sku: product.sku || '',
      precio: product.price != null ? product.price : null,
      stock_quantity: product.stock_quantity != null ? product.stock_quantity : null,
      stock_status: product.stock_status || 'unknown',
      tipo: product.type || 'simple',
      woo_id: product.id,
    };
    if (product.short_description) base.descripcion_corta = String(product.short_description).trim().substring(0, 300);

    if (product.type === 'variable' && product.id) {
      const variations = await getProductVariations(product.id);
      base.variaciones = (variations || []).map((v) => ({
        sku: v.sku || '',
        precio: v.price != null ? v.price : null,
        stock_quantity: v.stock_quantity != null ? v.stock_quantity : null,
        stock_status: v.stock_status || 'unknown',
        atributos: Array.isArray(v.attributes) ? v.attributes.map((a) => `${a.name}: ${a.option || a.value || ''}`).join(', ') : '',
      }));
      base.total_variaciones = base.variaciones.length;
    }

    return base;
  } catch (err) {
    console.error('[responses-chat] Error obteniendo detalle WooCommerce:', err?.message || err);
    return { error: 'Error al consultar WooCommerce. Intenta más tarde.' };
  }
}

/**
 * Convierte historial (array de { role, message/content }) + mensaje nuevo en input para Responses API.
 * Formato: array de { role, content } (EasyInputMessage).
 */
function buildInput(history, newMessage) {
  const input = [];
  for (const msg of history || []) {
    const content = msg.message ?? msg.content ?? msg.text ?? '';
    if (content && msg.sender !== undefined) {
      const role = msg.sender === 'user' ? 'user' : 'assistant';
      input.push({ role, content: String(content) });
    } else if (msg.role && (msg.content || msg.message)) {
      input.push({
        role: msg.role,
        content: String(msg.content ?? msg.message ?? ''),
      });
    }
  }
  input.push({ role: 'user', content: String(newMessage) });
  return input;
}

/**
 * Procesa un mensaje con la Responses API: instructions + input + tools.
 * Si el modelo pide tool calls (consultar_productos, contar_productos), los ejecutamos
 * y volvemos a llamar a la API hasta tener respuesta final.
 */
export async function processMessageWithResponsesAPI(userId, message, history = []) {
  const log = (prefix, ...args) => console.log('[PROOF]', prefix, ...args);

  log('entrada', 'userId=', userId, 'message=', JSON.stringify((message || '').slice(0, 200)));

  initializeOpenAI();
  const client = getOpenAIClient();
  const { model } = getOpenAIConfig();
  const instructions = getSystemPrompt();
  const tools = buildTools();

  let input = buildInput(history, message);

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    log('iteración', iter + 1, 'de', MAX_TOOL_ITERATIONS);

    const body = {
      model,
      instructions,
      input,
      tools: tools.length ? tools : undefined,
    };

    const response = await client.responses.create(body);

    if (response.error) {
      console.error('[PROOF] OpenAI error:', response.error);
      return 'Lo siento, hubo un error al procesar tu mensaje. Intenta de nuevo.';
    }

    const output = response.output || [];
    const functionCalls = output.filter((item) => item && item.type === 'function_call');

    if (functionCalls.length === 0) {
      log('respuesta final (sin más tool calls)', 'output_text length=', (response.output_text || '').length);
      log('respuesta preview', (response.output_text || '').slice(0, 150));
      return response.output_text || '';
    }

    log('tool calls', functionCalls.length, functionCalls.map((fc) => ({ name: fc.name, args: fc.arguments })));

    const functionOutputs = [];
    for (const fc of functionCalls) {
      const callId = fc.call_id;
      const name = fc.name;
      let args = {};
      try {
        args = typeof fc.arguments === 'string' ? JSON.parse(fc.arguments) : fc.arguments || {};
      } catch (_) {}

      let result;
      if (name === 'consultar_productos') {
        const query = args.query || '';
        const limit = args.limit;
        log('consultar_productos', 'query=', JSON.stringify(query), 'limit=', limit);
        result = await buscarProductos(query, limit);
        log('consultar_productos resultado', 'cantidad=', result.length, result.length ? 'primeros=' + JSON.stringify(result.slice(0, 2)) : '');
        result = JSON.stringify(result);
      } else if (name === 'contar_productos') {
        const count = await contarProductos();
        log('contar_productos', 'total=', count);
        result = JSON.stringify({ total: count });
      } else if (name === 'obtener_detalle_producto') {
        const wooIdOrSku = args.woo_id != null ? args.woo_id : (args.sku != null && args.sku !== '' ? args.sku : null);
        log('obtener_detalle_producto', 'woo_id=', args.woo_id, 'sku=', args.sku, '-> idOrSku=', wooIdOrSku);
        const detalle = await getDetalleProductoWoo(wooIdOrSku);
        const hasError = detalle && detalle.error;
        log('obtener_detalle_producto resultado', hasError ? 'error=' + detalle.error : 'ok nombre=' + (detalle && detalle.nombre));
        result = JSON.stringify(detalle);
      } else {
        log('tool desconocida', name);
        result = JSON.stringify({ error: 'Herramienta no implementada: ' + name });
      }

      functionOutputs.push({
        type: 'function_call_output',
        call_id: callId,
        output: result,
      });
    }

    input = input.concat(output).concat(functionOutputs);
  }

  log('max iteraciones alcanzado');
  return 'La conversación requirió demasiadas llamadas a herramientas. Intenta reformular tu pregunta.';
}

export { getSystemPrompt as getResponsesSystemPrompt };
