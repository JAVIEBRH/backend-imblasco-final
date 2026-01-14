/**
 * COMPANY INFO SERVICE
 * Información general de la empresa ImBlasco
 * Esta información se pasa al agente Conkavo para responder consultas TIPO A
 */

/**
 * Información general de la empresa
 * TODO: Actualizar con información real de ImBlasco cuando esté disponible
 */
export const COMPANY_INFO = {
  nombre: "ImBlasco",
  direccion: "Dirección pendiente de actualización",
  comuna: "Comuna pendiente",
  horarios: {
    semana: "Lunes a Viernes: 9:00 - 18:00 hrs",
    sabado: "Sábado: 9:00 - 14:00 hrs",
    domingo: "Cerrado",
  },
  contacto: {
    telefono: "Teléfono pendiente",
    email: "Email pendiente",
    whatsapp: "WhatsApp pendiente",
  },
  politicas: {
    pago: "Formas de pago pendientes de actualización",
    devoluciones: "Política de devoluciones pendiente",
    garantia: "Política de garantía pendiente",
  },
  diasApertura: "Lunes a Sábado",
  diasCierre: "Domingo y festivos",
};

/**
 * Obtener información completa de la empresa
 * @returns {Object} Información de la empresa
 */
export function getCompanyInfo() {
  return COMPANY_INFO;
}

/**
 * Formatear información de la empresa para el contexto del agente
 * @returns {string} Información formateada
 */
export function formatCompanyInfoForAgent() {
  const info = COMPANY_INFO;

  return `
INFORMACIÓN GENERAL DE IMBLASCO:

📍 Dirección: ${info.direccion}, ${info.comuna}

🕐 Horarios de Atención:
   - ${info.horarios.semana}
   - ${info.horarios.sabado}
   - ${info.horarios.domingo}

📞 Contacto:
   - Teléfono: ${info.contacto.telefono}
   - Email: ${info.contacto.email}
   - WhatsApp: ${info.contacto.whatsapp}

💳 Formas de Pago: ${info.politicas.pago}

↩️ Devoluciones: ${info.politicas.devoluciones}

🛡️ Garantía: ${info.politicas.garantia}

📅 Días de Apertura: ${info.diasApertura}
📅 Días de Cierre: ${info.diasCierre}
`.trim();
}

export default {
  COMPANY_INFO,
  getCompanyInfo,
  formatCompanyInfoForAgent,
};
