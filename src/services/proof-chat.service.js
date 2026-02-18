/**
 * PROOF CHAT - Servicio Responses API (rama PROOF)
 * Orquesta: system prompt, Vector Store (file_search), consultar_productos, contar_productos.
 * No modifica conversation.service ni assistant.service.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { consultarProductos, contarProductos } from './proof-chat-tools.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SYSTEM_PROMPT_PATH = path.resolve(__dirname, '../../config/system_prompt.txt');
const MAX_TOOL_LOOP = 10;
const HISTORY_MAX = 50;

let systemPromptCache = null;
let openaiClient = null;

const proofSessions = new Map();

function getSystemPrompt() {
  if (!systemPromptCache) {
    try {
      systemPromptCache = fs.readFileSync(SYSTEM_PROMPT_PATH, 'utf-8');
    } catch (err) {
      console.error('[PROOF-CHAT] Error leyendo system prompt:', err?.message);
      throw new Error('config/system_prompt.txt no encontrado');
    }
  }
  return systemPromptCache;
}

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY no definida');
  if (!openaiClient) openaiClient = new OpenAI({ apiKey });
  return openaiClient;
}

function getToolsDefinition() {
  const vectorStoreId = process.env.VECTOR_STORE_ID?.trim();
  const tools = [];

  if (vectorStoreId) {
    tools.push({
      type: 'file_search',
      vector_store_ids: [vectorStoreId]
    });
  }

  tools.push(
    {
      type: 'function',
      name: 'consultar_productos',
      description: 'Busca productos en el catálogo por texto, nombre, SKU o código. Usar para cualquier pregunta sobre productos, precios, stock o disponibilidad.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Término de búsqueda (nombre, SKU, código o descripción)' },
          limit: { type: 'number', description: 'Máximo de resultados (default 20)' }
        },
        required: ['query']
      },
      strict: false
    },
    {
      type: 'function',
      name: 'contar_productos',
      description: 'Devuelve el número total de productos en el catálogo. Usar cuando pregunten "cuántos productos tienen", "total de artículos", etc.',
      parameters: { type: 'object', properties: {} },
      strict: false
    }
  );

  return tools;
}

function getOrCreateSession(sessionId) {
  if (!proofSessions.has(sessionId)) {
    proofSessions.set(sessionId, { history: [] });
  }
  const session = proofSessions.get(sessionId);
  if (session.history.length > HISTORY_MAX) {
    session.history = session.history.slice(-HISTORY_MAX);
  }
  return session;
}

function extractTextFromOutput(output) {
  if (!Array.isArray(output)) return '';
  const parts = [];
  for (const item of output) {
    if (item.type === 'message' && Array.isArray(item.content)) {
      for (const c of item.content) {
        if (c && c.type === 'output_text' && typeof c.text === 'string') {
          parts.push(c.text);
        }
      }
    }
  }
  return parts.join('\n').trim() || '';
}

async function runTool(name, args) {
  if (name === 'consultar_productos') {
    const query = args?.query ?? '';
    const limit = args?.limit ?? 20;
    return consultarProductos(query, limit);
  }
  if (name === 'contar_productos') {
    return contarProductos();
  }
  return { error: `Tool desconocida: ${name}` };
}

/**
 * Procesa un mensaje con Responses API y loop de tools.
 * @param {string} sessionId
 * @param {string} message
 * @returns {Promise<{ response: string, session_id: string }>}
 */
export async function processMessage(sessionId, message) {
  const session = getOrCreateSession(sessionId);
  const instructions = getSystemPrompt();
  const client = getOpenAIClient();
  const model = process.env.OPENAI_MODEL_PROOF || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const tools = getToolsDefinition();

  const history = session.history.map((m) => ({
    type: 'message',
    role: m.role,
    content: m.content
  }));

  let input = [...history, { type: 'message', role: 'user', content: message }];
  let lastText = '';
  let iterations = 0;

  while (iterations < MAX_TOOL_LOOP) {
    iterations++;
    const body = {
      model,
      instructions,
      input,
      tools: tools.length ? tools : undefined
    };

    const response = await client.responses.create(body);
    const output = response.output || [];

    lastText = extractTextFromOutput(output);

    const functionCalls = output.filter((item) => item.type === 'function_call');
    if (functionCalls.length === 0) {
      break;
    }

    const newItems = [...output];
    for (const fc of functionCalls) {
      let args = {};
      try {
        args = JSON.parse(fc.arguments || '{}');
      } catch (_) {
        // ignore
      }
      const result = await runTool(fc.name, args);
      newItems.push({
        type: 'function_call_output',
        call_id: fc.call_id,
        id: `out_${fc.call_id}`,
        output: typeof result === 'string' ? result : JSON.stringify(result)
      });
    }
    input = [...input, ...newItems];
  }

  session.history.push({ role: 'user', content: message });
  session.history.push({ role: 'assistant', content: lastText || 'No pude generar una respuesta.' });

  return {
    response: lastText || 'No pude generar una respuesta.',
    session_id: sessionId
  };
}
