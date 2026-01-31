/**
 * SERVICIO: CHAT LOGGER
 * Guarda mensajes de chat en MongoDB usando el esquema ConversationDash.
 *
 * Base de datos única: dataimblasco.
 * Colección: conversationdash (dentro de dataimblasco).
 *
 * Maneja automáticamente:
 * - Creación de hilos nuevos
 * - Actualización de hilos existentes
 * - Reconstrucción de summary
 * - Manejo de errores sin afectar el flujo principal
 */

import { v4 as uuidv4 } from 'uuid';
import ConversationDash from '../models/ConversationDash.js';

/**
 * Guardar mensaje de chat en MongoDB
 *
 * @param {Object} params - Parámetros del mensaje
 * @param {string} params.threadId - ID del hilo (sessionId/userId)
 * @param {string} params.provider - Proveedor ('webchat', 'whatsapp', 'instagram', etc.)
 * @param {string} params.direction - Dirección ('inbound' o 'outbound')
 * @param {string} params.message - Contenido del mensaje
 * @param {Object} [params.customer] - Información del cliente { name?, email? }
 * @param {Object} [params.agent] - Información del agente { name?, email? }
 * @param {string} [params.externalMessageId] - ID externo del mensaje (opcional)
 * @returns {Promise<Object>} - Hilo actualizado o null si hay error
 */
export async function saveChatMessage({
    threadId,
    provider = 'webchat',
    direction,
    message,
    customer = {},
    agent = {},
    externalMessageId = null
}) {
    try {
        // Validar parámetros requeridos
        if (!threadId || !direction || !message) {
            throw new Error('threadId, direction y message son requeridos');
        }

        if (!['inbound', 'outbound'].includes(direction)) {
            throw new Error('direction debe ser "inbound" o "outbound"');
        }

        // Preparar mensaje para insertar
        const messageToSave = {
            id: uuidv4(),
            channel: 'chat',
            provider: provider,
            externalMessageId: externalMessageId,
            direction: direction,
            from: direction === 'inbound'
                ? { name: customer.name || null, email: customer.email || null }
                : { name: agent.name || null, email: agent.email || null },
            to: [],
            content: {
                text: String(message || ''),
                html: null
            },
            meta: {
                isRead: direction === 'outbound'
            },
            sentAt: new Date(),
            createdAt: new Date()
        };

        const filter = {
            provider: provider,
            'external.threadId': threadId,
            'external.mailbox': null
        };

        const update = {
            $setOnInsert: {
                channel: 'chat',
                provider: provider,
                external: {
                    threadId: threadId,
                    mailbox: null
                },
                participants: {
                    customer: {
                        name: customer.name || null,
                        email: customer.email || null
                    },
                    agent: {
                        name: agent.name || null,
                        email: agent.email || null
                    }
                },
                subject: null,
                // status no va aquí: se usa $set['status.stage']; incluirlo causaba conflicto en MongoDB
                summary: {
                    lastMessagePreview: '',
                    lastMessageAt: null,
                    messageCount: 0,
                    unreadCount: 0
                },
                tags: [],
                limits: {
                    maxMessages: 50
                }
            },
            $push: {
                messages: {
                    $each: [messageToSave],
                    $slice: -50
                }
            }
        };

        if (customer.name || customer.email) {
            update.$set = update.$set || {};
            update.$set['participants.customer'] = {
                name: customer.name || null,
                email: customer.email || null
            };
        }

        if (agent.name || agent.email) {
            update.$set = update.$set || {};
            update.$set['participants.agent'] = {
                name: agent.name || null,
                email: agent.email || null
            };
        }

        update.$set = update.$set || {};
        update.$set['status.stage'] = direction === 'inbound' ? 'awaiting_agent' : 'awaiting_customer';

        const thread = await ConversationDash.findOneAndUpdate(
            filter,
            update,
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true
            }
        );

        if (!thread) {
            throw new Error('findOneAndUpdate no devolvió documento');
        }

        thread.rebuildSummary();
        await thread.save();

        console.log(`[CHAT] ✅ Mensaje guardado en conversationdash threadId=${threadId} direction=${direction}`);
        return thread;
    } catch (error) {
        console.error('❌ Error al guardar mensaje de chat en MongoDB:', error.message);
        console.error('   threadId:', threadId);
        console.error('   direction:', direction);
        console.error('   provider:', provider);
        return null;
    }
}

/**
 * Obtener hilo de conversación por threadId
 *
 * @param {string} threadId - ID del hilo
 * @param {string} provider - Proveedor ('webchat', 'whatsapp', etc.)
 * @returns {Promise<Object|null>} - Hilo o null si no existe
 */
export async function getChatThread(threadId, provider = 'webchat') {
    try {
        const thread = await ConversationDash.findOne({
            provider: provider,
            'external.threadId': threadId,
            'external.mailbox': null
        });
        return thread;
    } catch (error) {
        console.error('❌ Error al obtener hilo de chat:', error.message);
        return null;
    }
}

export default {
    saveChatMessage,
    getChatThread
};
