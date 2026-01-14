/**
 * ERP ADAPTER INTERFACE
 * Interfaz para adaptadores de ERP externos
 * 
 * Este módulo permite desacoplar la integración con ERPs
 * sin modificar el core del sistema.
 */

/**
 * Resultado de envío al ERP
 * @typedef {Object} ErpResult
 * @property {boolean} success - Si el envío fue exitoso
 * @property {string|null} erpReference - Referencia del pedido en el ERP
 * @property {string} status - Estado: 'pending' | 'processed' | 'error'
 * @property {string|null} message - Mensaje descriptivo
 * @property {Object|null} metadata - Metadatos adicionales
 */

/**
 * Interfaz que deben implementar todos los adaptadores ERP
 */
export class ErpAdapter {
  /**
   * Enviar pedido al ERP
   * @param {Object} order - Pedido completo con datos facturables
   * @returns {Promise<ErpResult>}
   */
  async sendInvoice(order) {
    throw new Error('sendInvoice must be implemented by adapter')
  }
  
  /**
   * Verificar estado de un pedido en el ERP
   * @param {string} erpReference - Referencia del pedido en el ERP
   * @returns {Promise<ErpResult>}
   */
  async checkStatus(erpReference) {
    throw new Error('checkStatus must be implemented by adapter')
  }
}

export default ErpAdapter


