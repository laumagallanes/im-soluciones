/**
 * Configuración de contacto de IM Soluciones
 * ==========================================
 *
 * Este es el ÚNICO archivo que hay que tocar para activar los canales de contacto.
 * Después de editarlo, reconstruí/redeployá la imagen (ver README.md).
 *
 * whatsappNumber
 *   Número en formato internacional, SOLO dígitos, sin "+", espacios ni guiones.
 *   Argentina (celular): 54 + 9 + código de área sin 0 + número sin 15.
 *   Ejemplo de formato (NO es un número real): "5493510000000"
 *   - Si está vacío o es inválido: no se muestra el botón flotante ni el de WhatsApp,
 *     y los botones "Hablemos" / "Contanos tu proyecto" llevan a la sección #contacto.
 *   - Si es válido: esos botones abren https://wa.me/<número> con un mensaje precargado.
 *
 * contactEmail
 *   Casilla que recibe las consultas, p. ej. "tu-casilla@im-soluciones.com" (ejemplo).
 *   - Si está vacío o es inválido: no se muestra el botón "Enviar un email".
 *   - Si es válido: el formulario abre el cliente de correo (mailto:) con los datos cargados
 *     cuando no hay WhatsApp configurado.
 *
 * preferredChannel
 *   "whatsapp" o "email": canal que usa el formulario cuando ambos están configurados.
 *
 * Si no se configura ninguno de los dos, el formulario muestra un aviso en lugar de enviar.
 */
window.IM_CONFIG = {
  whatsappNumber: '5493415963582',
  contactEmail: '',
  preferredChannel: 'whatsapp',

  // Mensajes precargados (podés editarlos libremente).
  messages: {
    general: 'Hola IM Soluciones, quiero hacer una consulta sobre un proyecto.',
    emailSubject: 'Consulta desde im-soluciones.com',
  },
};
