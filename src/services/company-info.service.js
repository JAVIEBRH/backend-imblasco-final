/**
 * COMPANY INFO SERVICE
 * Información general de la empresa ImBlasco
 * Esta información se pasa al agente Conkavo para responder consultas TIPO A
 */

/**
 * Información general de la empresa
 * Actualizada con información oficial de ImBlasco
 */
export const COMPANY_INFO = {
  nombre: "Importadora Blas y Cía. Ltda. (Imblasco)",
  nombreCorto: "Imblasco",
  experiencia: "Más de 50 años de experiencia en el mercado chileno",
  condicionComercial: "Importador mayorista exclusivo. No se realizan ventas a clientes finales.",
  direccion: "Álvarez de Toledo 981, San Miguel, Santiago",
  comuna: "San Miguel",
  referencia: "A pasos del Metro San Miguel. Estacionamiento para clientes.",
  rubros: [
    "Pesca y caza deportiva",
    "Trofeos y premiación",
    "Artículos publicitarios",
    "Grabado personalizado"
  ],
  horarios: {
    semana: "Lunes a viernes: 9:42 a 14:00 y 15:30 a 19:00 hrs",
    sabado: "Sábados: 10:00 a 13:00 hrs",
    domingo: "Cerrado",
  },
  contacto: {
    email: "ventas@imblasco.cl",
    telefonos: ["225443327", "225443382", "225440418"],
    telefono: "225443327 / 225443382 / 225440418",
  },
  despachos: {
    regiones: {
      envios: "Envíos por transporte por pagar",
      diasFijos: "Martes y jueves",
      condiciones: "La carga viaja a costo y riesgo del cliente",
      noTrabajan: "No se trabaja con Chilexpress, Correos de Chile ni Blue Express"
    },
    santiago: "Retiro en casa matriz. No se realizan envíos dentro de Santiago."
  },
  empresasTransporte: [
    "JAC", "Económico", "Express", "Chevalier", "Poblete", "Tur Bus", 
    "Pullman del Sur", "Binder", "LIT", "Rapid Cargo", "Espinoza (V Región)", 
    "Mena", "Merco Sur", "Transcargo", "Tromen", "entre otras"
  ],
  comoRealizarPedido: {
    paso1: "Solicitar cuenta para consultar precios y stock. En nuestra página web, específicamente en el apartado solicitud de cuenta, podrá realizar el trámite pertinente",
    paso2: "Enviar datos de la empresa a ventas@imblasco.cl: RUT, razón social, giro, dirección y comuna",
    paso3: "Recibirás un email confirmando tu solicitud. Nuestro equipo revisará tu información (24-48 hrs). Te notificaremos por email cuando tu cuenta sea aprobada. Podrás acceder a precios mayoristas y realizar pedidos",
    paso4: "Posterior a eso, podrás pedir tu cotización enviando un correo a la siguiente dirección: cesar.barahona.b@gmail.com",
    paso5: "Clientes activos deben enviar cotización con modelos, tamaños y cantidades"
  },
  retiroPedidos: {
    pago: "Pago previo por transferencia bancaria",
    documentos: "Presentar RUT de compra o nota de venta",
    sinFacturar: "Si no está facturado, presentar comprobante de pago"
  },
  datosBancarios: {
    rut: "76.274.594-1",
    nombreEmpresa: "Importadora Blas y Cía. Ltda.",
    tipoCuenta: "Cuenta Corriente",
    cuentas: [
      { banco: "SANTANDER", numero: "06-699 114-8" },
      { banco: "ESTADO", numero: "64 34 282" },
      { banco: "ITAÚ", numero: "20-5518-518" },
      { banco: "SCOTIABANK", numero: "975-730-255" }
    ]
  },
  garantia: {
    productosNuevos: "6 meses",
    pereciblesUsoBreve: "7 días",
    requisitos: "Requiere comprobante de compra. Producto debe entregarse para revisión técnica"
  },
  derechoRetracto: {
    aplica: "Aplica solo a compras a distancia, dentro de los plazos legales",
    costos: "Costos de envío a cargo del consumidor",
    noAplica: "No aplica a productos a medida, perecibles ni servicios"
  },
  diasApertura: "Lunes a Sábado",
  diasCierre: "Domingo y festivos",
  cotizacion: {
    email: "cesar.barahona.b@gmail.com",
    asunto: "Cotización",
    cuerpo: "Indicar en el cuerpo del correo: producto(s) a consultar con su SKU, cantidad y RUT de la empresa."
  },
};

/**
 * Obtener información completa de la empresa
 * @returns {Object} Información de la empresa
 */
export function getCompanyInfo() {
  return COMPANY_INFO;
}

/**
 * Mensaje normalizado de datos bancarios para el cliente.
 * - Etiquetas en negrita con ** (RUT:, Tipo de cuenta:, Cuentas disponibles:, nombre del banco).
 * - Sin guiones separadores (----); separación por líneas en blanco.
 * - Incluye intro y cierre (pago previo, ofrecer más info).
 * @returns {string}
 */
export function getDatosBancariosMensajeCliente() {
  const d = COMPANY_INFO.datosBancarios
  const nombreEmpresa = d.nombreEmpresa || COMPANY_INFO.nombre
  const lineas = [
    'Para realizar la transferencia, puedes utilizar los siguientes datos bancarios:',
    '',
    `**RUT:** ${d.rut} — ${nombreEmpresa}`,
    `**Tipo de cuenta:** ${d.tipoCuenta}`,
    '',
    '**Cuentas disponibles:**',
    ...d.cuentas.map(c => `- **${c.banco}:** ${c.numero}`),
    '',
    'Recuerda que el pago debe ser previo a la entrega de tu pedido. Si necesitas más información, no dudes en preguntar.'
  ]
  return lineas.join('\n')
}

/**
 * Mensaje normalizado de garantía y devoluciones para el cliente.
 * Misma lineación que datos bancarios (saltos de línea, sin guiones), sin asteriscos.
 * @returns {string}
 */
export function getGarantiaDevolucionMensajeCliente() {
  const g = COMPANY_INFO.garantia
  const d = COMPANY_INFO.derechoRetracto
  const lineas = [
    'Para devoluciones, ten en cuenta lo siguiente:',
    '',
    'GARANTÍA:',
    `- Productos nuevos: ${g.productosNuevos}.`,
    `- Perecibles o de uso breve: ${g.pereciblesUsoBreve}.`,
    `- Necesitas el comprobante de compra y el producto debe entregarse para revisión técnica.`,
    '',
    'DERECHO A RETRACTO:',
    `- ${d.aplica}.`,
    `- Los costos de envío son a cargo del consumidor.`,
    `- ${d.noAplica}.`,
    '',
    'Si necesitas más información, no dudes en preguntar.'
  ]
  return lineas.join('\n')
}

/**
 * Formatear información de la empresa para el contexto del agente
 * @returns {string} Información formateada
 */
export function formatCompanyInfoForAgent() {
  const info = COMPANY_INFO;

  return `
INFORMACIÓN GENERAL – IMBLASCO

EMPRESA
${info.nombre}
${info.experiencia}
Condición comercial: ${info.condicionComercial}

RUBROS
${info.rubros.map(r => `- ${r}`).join('\n')}

DIRECCIÓN
${info.direccion}
${info.referencia}

HORARIO DE ATENCIÓN
${info.horarios.semana}
${info.horarios.sabado}

No se atiende durante la hora de almuerzo (entre las 14:00 y 15:30 hrs). Si alguien pregunta por atención en ese horario, responde claramente que no atendemos entre 14:00 y 15:30 hrs.

DESPACHOS
Regiones:
- ${info.despachos.regiones.envios}
- Días fijos: ${info.despachos.regiones.diasFijos}
- ${info.despachos.regiones.condiciones}
- ${info.despachos.regiones.noTrabajan}

Santiago:
- ${info.despachos.santiago}

EMPRESAS DE TRANSPORTE FRECUENTES
${info.empresasTransporte.join(', ')}

CÓMO REALIZAR UN PEDIDO
- ${info.comoRealizarPedido.paso1}
- ${info.comoRealizarPedido.paso2}
- ${info.comoRealizarPedido.paso3}
- ${info.comoRealizarPedido.paso4}
- ${info.comoRealizarPedido.paso5}

RETIRO DE PEDIDOS
- ${info.retiroPedidos.pago}
- ${info.retiroPedidos.documentos}
- ${info.retiroPedidos.sinFacturar}

DATOS BANCARIOS PARA TRANSFERENCIA/DEPÓSITO
Cuando pregunten por transferencia, datos bancarios, cuenta para depositar o RUT, responde usando EXACTAMENTE este formato (etiquetas en **negrita**, sin guiones separadores, con intro y cierre):

${getDatosBancariosMensajeCliente()}

GARANTÍA Y DEVOLUCIONES
Cuando pregunten por devolución, garantía, retracto o "quiero devolver un producto", responde usando EXACTAMENTE este formato (sin asteriscos, sin guiones separadores, con intro y cierre):

${getGarantiaDevolucionMensajeCliente()}

CONTACTO
Correo: ${info.contacto.email}
Teléfonos: ${info.contacto.telefono}
`.trim();
}

/**
 * Mensaje normalizado de instrucciones de cotización para el cliente (usuario logueado).
 * Usar cuando pregunten cómo cotizar o quieran una cotización.
 * @returns {string}
 */
export function getCotizacionMensajeCliente() {
  const c = COMPANY_INFO.cotizacion;
  return [
    'Para solicitar una cotización:',
    '',
    `- Enviar correo a: ${c.email}`,
    `- Asunto del correo: ${c.asunto}`,
    `- En el cuerpo: ${c.cuerpo}`,
    '',
    'Si necesitas más información, no dudes en preguntar.'
  ].join('\n');
}

export default {
  COMPANY_INFO,
  getCompanyInfo,
  getDatosBancariosMensajeCliente,
  getGarantiaDevolucionMensajeCliente,
  getCotizacionMensajeCliente,
  formatCompanyInfoForAgent,
};
