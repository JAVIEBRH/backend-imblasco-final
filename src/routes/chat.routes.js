/**
 * CHAT ROUTES
 * Endpoints para el motor conversacional basado en ACCIONES
 */

import { Router } from 'express'
import * as conversationService from '../services/conversation.service.js'
import { handleChat } from '../services/assistant.service.js'
import { saveChatMessage } from '../services/chat-logger.service.js'

export const chatRouter = Router()

/**
 * POST /api/chat
 * Endpoint principal del asistente IA (function calling)
 *
 * Body:
 * {
 *   session_id: string,
 *   message: string
 * }
 */
chatRouter.post('/', async (req, res, next) => {
  try {
    const { session_id, message } = req.body
    console.log(`[CHAT] /api/chat session_id=${session_id} message="${(message || '').slice(0, 120)}"`)

    if (!session_id || typeof session_id !== 'string' || session_id.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'session_id debe ser un string no vacío'
      })
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'message debe ser un string no vacío'
      })
    }

    const threadId = session_id.trim()
    console.log(`[CHAT] /api/chat guardando inbound threadId=${threadId}`)
    await saveChatMessage({
      threadId,
      provider: 'webchat',
      direction: 'inbound',
      message: message.trim()
    }).catch(err => console.error('[CHAT] Error guardando inbound:', err?.message || err))

    const response = await handleChat({ session_id, message })
    const botText = response?.response ?? ''
    await saveChatMessage({
      threadId,
      provider: 'webchat',
      direction: 'outbound',
      message: typeof botText === 'string' ? botText : String(botText)
    }).catch(err => console.error('[CHAT] Error guardando outbound:', err?.message || err))

    res.json({
      success: true,
      ...response
    })
  } catch (error) {
    console.error('[CHAT] Error en /api/chat:', error?.message || error)
    next(error)
  }
})

/**
 * POST /api/chat/init
 * Inicializar chat para usuario
 */
chatRouter.post('/init', async (req, res, next) => {
  try {
    const { userId } = req.body

    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'userId debe ser un string no vacío'
      })
    }

    const response = await conversationService.initChat(userId)
    res.json({
      success: true,
      ...response
    })
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/chat/action
 * Procesar acción del usuario
 * 
 * Body:
 * {
 *   userId: string,
 *   action: string,  // START_ORDER, SELECT_PRODUCT, SET_QUANTITY, etc.
 *   value?: any      // Valor asociado (SKU, cantidad, etc.)
 * }
 */
chatRouter.post('/action', async (req, res, next) => {
  try {
    const { userId, action, value } = req.body

    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'userId debe ser un string no vacío'
      })
    }

    if (!action || typeof action !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'action debe ser un string válido'
      })
    }
    
    const validActions = [
      'START_ORDER', 'SELECT_PRODUCT', 'SET_QUANTITY', 'ADD_MORE',
      'FINISH_ORDER', 'VIEW_CART', 'CANCEL_ORDER', 'SEARCH_PRODUCT'
    ]
    
    if (!validActions.includes(action)) {
      return res.status(400).json({
        success: false,
        error: `action inválido. Válidos: ${validActions.join(', ')}`
      })
    }

    const response = await conversationService.processAction(userId, action, value)
    res.json({
      success: true,
      ...response
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/chat/history/:userId
 * Obtener historial del chat
 */
chatRouter.get('/history/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params
    
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'userId debe ser un string no vacío'
      })
    }
    
    const history = conversationService.getChatHistory(userId.trim())
    res.json({
      success: true,
      userId: userId.trim(),
      history
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/chat/state/:userId
 * Obtener estado actual del chat
 */
chatRouter.get('/state/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params
    
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'userId debe ser un string no vacío'
      })
    }
    
    const state = conversationService.getState(userId.trim())
    res.json({
      success: true,
      userId: userId.trim(),
      ...state
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/chat/actions
 * Obtener lista de acciones disponibles
 */
chatRouter.get('/actions', (req, res) => {
  res.json({
    success: true,
    actions: conversationService.ACTIONS,
    states: conversationService.STATES
  })
})

/**
 * POST /api/chat/reset/:userId
 * Resetear sesión de chat (legacy)
 */
chatRouter.post('/reset/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params
    // Cancelar orden actual
    const response = await conversationService.processAction(userId, 'CANCEL_ORDER')
    res.json({
      success: true,
      message: 'Sesión reiniciada',
      ...response
    })
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/chat/message
 * Procesar mensaje de texto libre con IA
 * 
 * Body:
 * {
 *   userId: string,
 *   message: string,  // Mensaje del usuario
 *   conversationHistory?: Array  // Historial opcional
 * }
 */
chatRouter.post('/message', async (req, res, next) => {
  try {
    const { userId, message } = req.body

    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'userId debe ser un string no vacío'
      })
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'message debe ser un string no vacío'
      })
    }

    const threadId = userId.trim()
    console.log(`[CHAT] Guardando mensaje inbound threadId=${threadId}`)
    await saveChatMessage({
      threadId,
      provider: 'webchat',
      direction: 'inbound',
      message: message.trim()
    }).catch(err => console.error('[CHAT] Error guardando inbound:', err?.message || err))

    // Procesar mensaje con IA (el historial se obtiene de la sesión internamente)
    try {
      const response = await conversationService.processMessageWithAI(
        threadId,
        message.trim()
      )

      const botText = response?.botMessage ?? ''
      console.log(`[CHAT] Guardando mensaje outbound threadId=${threadId}`)
      await saveChatMessage({
        threadId,
        provider: 'webchat',
        direction: 'outbound',
        message: typeof botText === 'string' ? botText : String(botText)
      }).catch(err => console.error('[CHAT] Error guardando outbound:', err?.message || err))

      res.json({
        success: true,
        ...response
      })
    } catch (error) {
      console.error('❌ Error en /api/chat/message:', error)
      console.error('   Stack:', error.stack)
      console.error('   userId:', userId)
      console.error('   message:', message)
      
      // Enviar respuesta de error más clara
      res.status(500).json({
        success: false,
        error: true,
        message: 'Error al procesar el mensaje',
        botMessage: '⚠️ Error en el servidor. Por favor, intenta de nuevo en un momento.'
      })
    }
  } catch (error) {
    console.error('❌ Error general en /api/chat/message:', error)
    next(error)
  }
})

export default chatRouter
