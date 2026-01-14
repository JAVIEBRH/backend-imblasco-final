/**
 * DUMMY ERP ADAPTER
 * Implementación de prueba que simula envío al ERP
 * 
 * Este adapter NO envía datos reales a ningún ERP.
 * Simula el proceso y devuelve una referencia mock.
 * 
 * En producción, reemplazar por el adapter real del ERP.
 */

import { ErpAdapter } from './ErpAdapter.js'

export class DummyErpAdapter extends ErpAdapter {
  /**
   * Simular envío de pedido al ERP
   * @param {Object} order - Pedido completo
   * @returns {Promise<ErpResult>}
   */
  async sendInvoice(order) {
    console.log(`[ERP] Simulando envío de pedido ${order.orderId} al ERP...`)
    
    // Simular delay de red
    await new Promise(resolve => setTimeout(resolve, 500))
    
    // Generar referencia mock
    const erpReference = `ERP-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
    
    console.log(`[ERP] Pedido ${order.orderId} enviado. Referencia ERP: ${erpReference}`)
    
    return {
      success: true,
      erpReference,
      status: 'pending',
      message: 'Pedido enviado al ERP (simulado)',
      metadata: {
        adapter: 'DummyErpAdapter',
        timestamp: new Date().toISOString()
      }
    }
  }
  
  /**
   * Simular verificación de estado
   * @param {string} erpReference 
   * @returns {Promise<ErpResult>}
   */
  async checkStatus(erpReference) {
    console.log(`[ERP] Verificando estado de referencia: ${erpReference} (simulado)`)
    
    // Simular que siempre está pendiente
    return {
      success: true,
      erpReference,
      status: 'pending',
      message: 'Estado verificado (simulado)',
      metadata: {
        adapter: 'DummyErpAdapter',
        timestamp: new Date().toISOString()
      }
    }
  }
}

export default DummyErpAdapter


