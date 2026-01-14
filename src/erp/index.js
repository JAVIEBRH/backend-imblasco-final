/**
 * ERP MODULE EXPORT
 * Exporta el adapter configurado
 * 
 * Para cambiar de adapter, modificar solo este archivo
 */

import { DummyErpAdapter } from './DummyErpAdapter.js'

// Configurar el adapter a usar
// En producción, cambiar por el adapter real (ej: SapErpAdapter, OdooErpAdapter, etc.)
const erpAdapter = new DummyErpAdapter()

export { erpAdapter }
export default erpAdapter


