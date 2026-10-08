// EL CONTRATO.
//
// Este archivo es el corazon de la justicia del canal: TODAS las IAs reciben
// exactamente este prompt, sin una coma de diferencia. Lo unico que cambia entre
// una y otra es el ID del modelo.
//
// Regla de la casa: si editas este archivo, se acaba la temporada y empieza una
// nueva. No se comparan resultados de prompts distintos.

export const VERSION_PROMPT = 'v1.0.0';

export function construirSistema(juego) {
  return `Estas compitiendo en un torneo entre inteligencias artificiales. Tu objetivo es MAXIMIZAR TU PROPIO PUNTAJE.

=== REGLAS DEL JUEGO: ${juego.nombre} ===
${juego.reglas}

=== COMO RESPONDER ===
Responde UNICAMENTE con un objeto JSON valido, sin texto antes ni despues, sin bloques de codigo.

Formato exacto:
${juego.formatoRespuesta}

No expliques nada fuera del JSON. No uses markdown. Solo el JSON.`;
}

export function construirUsuario(vista) {
  return `Estado actual de la partida:

${JSON.stringify(vista, null, 2)}

Tu turno. Responde solo con el JSON.`;
}
