/**
 * OPENAI CONFIGURATION
 * Punto único de configuración para la integración con OpenAI.
 * Rama PROOF: preparado para la futura "nueva forma" de operar de OpenAI
 * (cambio de origen de API key, base URL, modelo) sin tocar servicios.
 *
 * Variables de entorno:
 * - OPENAI_API_KEY (obligatoria): clave API. En local puede venir de .env; en producción del host.
 * - OPENAI_MODEL (opcional): modelo a usar; por defecto gpt-4o-mini.
 * - OPENAI_BASE_URL (opcional): base URL del API; si no se define, usa la por defecto del SDK.
 * - OPENAI_VECTOR_STORE_ID / VECTOR_STORE_ID (opcional): ID del Vector Store para file_search (Responses API, rama PROOF).
 */

const DEFAULT_MODEL = 'gpt-4o-mini';

/**
 * Obtiene la configuración de OpenAI desde variables de entorno.
 * @returns {{ apiKey: string, model: string, baseURL?: string }}
 */
export function getOpenAIConfig() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
  const baseURL = process.env.OPENAI_BASE_URL?.trim() || undefined;

  return {
    apiKey,
    model,
    ...(baseURL && { baseURL }),
  };
}

/**
 * Configuración para la Responses API (rama PROOF: file_search + tools).
 * @returns {{ vectorStoreId: string | null }}
 */
export function getResponsesAPIConfig() {
  const vectorStoreId =
    process.env.OPENAI_VECTOR_STORE_ID?.trim() ||
    process.env.VECTOR_STORE_ID?.trim() ||
    null;
  return { vectorStoreId };
}

/**
 * Comprueba si la API key está definida y tiene formato válido (sk-).
 * @returns {boolean}
 */
export function isOpenAIConfigured() {
  const { apiKey } = getOpenAIConfig();
  return !!apiKey && apiKey.startsWith('sk-');
}
