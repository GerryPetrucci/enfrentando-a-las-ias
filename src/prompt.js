// EL CONTRATO.
//
// Este archivo es el corazon de la justicia del canal: TODAS las IAs reciben
// exactamente este prompt, sin una coma de diferencia. Lo unico que cambia entre
// una y otra es el ID del modelo.
//
// Regla de la casa: si editas este archivo, sube la version de reglas del juego:
// las partidas anteriores no se comparan con las nuevas (resultados de prompts distintos).

import { PARAMETROS } from './parametros.js';

export const VERSION_PROMPT = 'v1.0.0';

// Secciones OPCIONALES de un juego (docs/guia-de-prompts.md, regla del 28 de octubre de 2026). Un juego que no las define recibe EXACTAMENTE el texto de siempre
// (su huella y sus partidas ya jugadas no cambian); uno que las define explica el juego entero:
//   presentacion            parrafo de papel y reglas del arbitraje, justo despues de la frase del torneo
//   guiaDelEstado           "COMO LEER TU ESTADO": que significa cada linea del mensaje de estado que recibe cada turno
//   explicacionDeRespuesta  el formato campo por campo (tipo, limites, significado); con ella el JSON de `formatoRespuesta` es un EJEMPLO con valores inventados
//   erroresFrecuentes       lo que hace perder ordenes o turnos, sacado de los motivos de descarte del motor
//   avisoDeEspacio          true = avisa del tope de tokens (PARAMETROS.maxTokens, razonamiento incluido) y de que una respuesta cortada pierde el turno
export function construirSistema(juego) {
  const aparte = (texto) => (texto ? `\n\n${texto}` : '');
  const etiqueta = juego.explicacionDeRespuesta ? 'Ejemplo del formato (los valores son inventados; no los copies):' : 'Formato exacto:';
  const aviso = juego.avisoDeEspacio
    ? `=== ESPACIO PARA RESPONDER ===\nTienes un limite de unos ${PARAMETROS.maxTokens} tokens para pensar y responder juntos. Si te quedas sin espacio antes de terminar el JSON pierdes el turno entero. No hace falta encontrar la jugada perfecta: revisa lo urgente, decide un plan razonable y escribe el JSON.`
    : '';
  return `Estas compitiendo en un torneo entre inteligencias artificiales. Tu objetivo es MAXIMIZAR TU PROPIO PUNTAJE.${aparte(juego.presentacion)}

=== REGLAS DEL JUEGO: ${juego.nombre} ===
${juego.reglas}${aparte(juego.guiaDelEstado ? `=== COMO LEER TU ESTADO ===\n${juego.guiaDelEstado}` : '')}

=== COMO RESPONDER ===
Responde UNICAMENTE con un objeto JSON valido, sin texto antes ni despues, sin bloques de codigo.

${etiqueta}
${juego.formatoRespuesta}${aparte(juego.explicacionDeRespuesta)}${aparte(juego.erroresFrecuentes ? `=== ERRORES FRECUENTES ===\n${juego.erroresFrecuentes}` : '')}${aparte(aviso)}

No expliques nada fuera del JSON. No uses markdown. Solo el JSON.`;
}

export function construirUsuario(vista) {
  // El Dilema entrega un objeto y se muestra como JSON; juegos con mapa entregan ya la vista armada en texto.
  const estado = typeof vista === 'string' ? vista : JSON.stringify(vista, null, 2);
  return `Estado actual de la partida:

${estado}

Tu turno. Responde solo con el JSON.`;
}
