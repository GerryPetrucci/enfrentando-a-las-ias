// El cierre de CADA video (parte, clip o gancho): la voz pide seguirnos y reaccionar con una frase que cambia de un video a otro, y en pantalla queda el logo, el @ de cada red y la pagina donde se
// publican los resultados. Es un beat mas al final de la pieza (tipo 'cierre'), como la tarjeta de arranque lo es al principio (intro.js); la pagina lo agrega con cierre=1 (escena.js).
// La frase se elige con un seed sacado de la pieza (nunca Math.random: el mismo video es siempre igual) y el id del beat dice cual es (`cierre-N`): la voz se genera para TODAS las frases
// (herramientas/narrar.mjs) y cada pieza usa el audio que le toca. Puro: sin DOM ni red. Los @ y la pagina salen de web/redes.js (una sola fuente).

import { REDES, SITIO } from '../redes.js';
import { seedDeTexto } from './azar.js';
import { duracion } from './linea-comun.js';
import { duracionDeBeat, TIPOS_DE_CIERRE } from './escena-config.js';

// Texto publico (con acentos). La frase depende de la pieza (decidido por el usuario el 25 de octubre de 2026): no se le dice lo mismo a quien ve un gancho, un clip, una parte que todavia
// no termina el juego o la parte que lo cierra. No todas piden «síguenos»: tambien hay avisos, preguntas y llamadas a ver la partida completa o a proponer el siguiente enfrentamiento.
export const FRASES_POR_TIPO = {
  // la parte que llega al final del juego: el desenlace ya se vio, asi que se invita a seguir para ver mas juegos (la primera es la que pidio el usuario tal cual)
  final: [
    'No olvides seguirnos y reaccionar.',
    'Síguenos y reacciona para no perderte la próxima partida.',
    'Si te gustó, reacciona y síguenos: aquí hay más IAs enfrentadas.',
    '¿Quieres ver más? Síguenos y deja tu reacción.',
    'Reacciona a este video y síguenos para ver quién gana la próxima.',
    'Síguenos y cuéntanos con tu reacción qué IA te sorprendió.',
    'La próxima partida ya viene: síguenos y reacciona.',
    'Todos los resultados están en nuestra página. Síguenos y reacciona.',
    'Reacciona, síguenos y propón el próximo enfrentamiento en nuestra página.',
    'Gracias por ver. No olvides seguirnos y dejar tu reacción.',
    'Síguenos en nuestras redes y reacciona si quieres más partidas.',
    '¿Quién crees que gana la próxima? Síguenos y reacciona.',
    // sin «síguenos»: la partida ya terminó, asi que tambien se puede cerrar con una pregunta o una invitacion a opinar
    'Gracias por ver. Cuéntanos en los comentarios quién merecía ganar.',
    'Así terminó esta partida. ¿Quién debería enfrentarse la próxima vez?',
    'Todos los resultados están en nuestra página. ¿A quién ponemos contra quién después?',
    'Una partida más para la historia. Reacciona si te sorprendió el final.',
    '¿Estás de acuerdo con el resultado? Cuéntanoslo en los comentarios.',
  ],
  // una parte que NO llega al ultimo turno: el juego sigue en la parte siguiente, sin adelantar quien gana
  parte: [
    'La partida continúa: síguenos para no perderte la siguiente parte.',
    'No te pierdas el desenlace: la siguiente parte ya viene.',
    'Esto todavía no termina. Síguenos y mira la siguiente parte.',
    'Todavía falta lo mejor. Síguenos para ver cómo termina.',
    '¿Quién se llevará la partida? Lo sabrás en la siguiente parte.',
    'La siguiente parte llega pronto: síguenos para verla apenas salga.',
    'Aún no hay ganador. Reacciona y no te pierdas la siguiente parte.',
    'Deja tu predicción en los comentarios y no te pierdas la siguiente parte.',
    'Se viene el desenlace. Síguenos para no perdértelo.',
    'Esto se pone mejor en la siguiente parte. Síguenos para verla.',
    '¿Quién crees que va ganando? Lo confirmamos en la siguiente parte.',
    'Guarda este video y sigue la partida en la siguiente parte.',
  ],
  // un fragmento de la partida: se invita a verla completa
  clip: [
    'Esto es solo un momento de la partida: síguenos y mírala completa.',
    'La partida completa está en nuestras redes. Síguenos para verla.',
    '¿Te gustó este momento? Mira la partida completa y síguenos.',
    'Hay mucho más de donde salió esto: ve la partida completa.',
    'Este fue solo un fragmento. La partida completa te espera en nuestras redes.',
    'Para ver cómo se llegó hasta aquí, busca la partida completa. Síguenos.',
    'Todo el contexto está en la partida completa. Síguenos para verla.',
    '¿Quieres ver el resto? La partida completa está en nuestras redes.',
    'Reacciona si te sorprendió y ve la partida completa en nuestras redes.',
    'Mira la partida completa y descubre cómo terminó. Síguenos.',
    'Si esto te gustó, la partida entera te va a encantar.',
    'La partida completa está en nuestra página. No te la pierdas.',
  ],
  // el adelanto «Proximamente»: se pide estar al pendiente de la partida que viene
  gancho: [
    'Muy pronto: la partida completa. Síguenos para no perdértela.',
    'Próximamente en nuestras redes. Síguenos y mantente al pendiente.',
    'Esto apenas comienza. Estate atento: la partida llega pronto.',
    'La partida está por llegar. Síguenos para ser de los primeros en verla.',
    'Activa las notificaciones: la partida llega muy pronto.',
    'Prepárate: las IAs se enfrentan muy pronto. Síguenos para verlo.',
    '¿Quién ganará? Muy pronto lo sabrás. Síguenos y estate atento.',
    'No te lo pierdas: la partida completa llega muy pronto.',
    'Vuelve pronto: la partida ya viene.',
    'Pronto sabrás quién gana. Estate atento.',
    'Esto es solo el adelanto. Síguenos para ver la partida completa.',
    'La cuenta regresiva ya empezó. No te pierdas la partida.',
  ],
};

// Los tipos de pieza, en el orden en que sus frases se numeran: `cierre-0`...`cierre-11` siguen siendo las del final (las voces ya generadas valen) y los demas tipos siguen a continuacion.
export const TIPOS_CIERRE = TIPOS_DE_CIERRE; // la direccion de la escena (cierre=parte...) y estas frases hablan de los mismos tipos: una prueba ata ambos
export const FRASES_CIERRE = TIPOS_CIERRE.flatMap((t) => FRASES_POR_TIPO[t]);
const DESDE = Object.fromEntries(TIPOS_CIERRE.map((t, i) => [t, TIPOS_CIERRE.slice(0, i).reduce((suma, x) => suma + FRASES_POR_TIPO[x].length, 0)]));
export const esTipoDeCierre = (tipo) => TIPOS_CIERRE.includes(tipo);
const tipoDe = (tipo) => (esTipoDeCierre(tipo) ? tipo : 'final'); // sin tipo (una direccion vieja, cierre=1) o desconocido: la frase de siempre

export const MIN_MS_CIERRE = 6500; // lo que se queda en pantalla como minimo: hay que poder leer los @ (la voz puede alargarlo)

// Lo que identifica a una pieza: el seed de la partida, cual partida del archivo y que parte de ella (unidades desde..hasta, o el gancho N). Dos partidas con el mismo seed no comparten clave.
export function claveDeCierre(p) {
  const { seed = 0, partida = 1, desde = 0, hasta = 0, gancho = null } = p && typeof p === 'object' ? p : {};
  return gancho ? `${seed}:p${partida}:hk${gancho}` : `${seed}:p${partida}:${desde}-${hasta}`;
}

// El numero global de la frase (`cierre-N`): se elige entre las frases del tipo de pieza con el seed de la clave.
export const indiceDeCierre = (clave, tipo = 'final') => DESDE[tipoDe(tipo)] + seedDeTexto(`cierre:${clave}`) % FRASES_POR_TIPO[tipoDe(tipo)].length;
export const esCierre = (id) => /^cierre-\d+$/.test(String(id ?? ''));

// El beat que va al final de la pieza. `mano` es la unidad del ultimo beat (asi un recorte por unidades no lo pierde). `tipo`: final | parte | clip | gancho (que frase le toca).
export function beatDeCierre(clave, mano = 0, tipo = 'final') {
  const i = indiceDeCierre(clave, tipo), frase = FRASES_CIERRE[i];
  return {
    id: `cierre-${i}`, mano, tipo: 'cierre', registro: 0, asiento: null, camara: [],
    texto: frase, lineas: [{ tipo: 'hecho', texto: frase, clave: 'cierre' }],
    minMs: Math.max(MIN_MS_CIERRE, duracion(0, frase)), reemplazo: false,
    pasos: [{ tipo: 'cierre', frase, redes: REDES.map((r) => ({ id: r.id, nombre: r.nombre, usuario: r.usuario })), sitio: SITIO.texto }],
  };
}

// Los beats con el cierre al final; si ya lo traen, tal cual. Lista vacia o basura -> lista vacia (no hay pieza a la que cerrar).
export function conCierre(beats, clave, tipo = 'final') {
  if (!Array.isArray(beats) || !beats.length) return [];
  if (beats.at(-1)?.tipo === 'cierre') return beats;
  return [...beats, beatDeCierre(clave, beats.at(-1)?.mano ?? 0, tipo)];
}

// El gancho no se narra (la musica la pone quien lo sube): de su voz solo se queda el cierre.
export function vozSoloCierre(voz) {
  if (!voz || typeof voz !== 'object') return null;
  return Object.fromEntries(Object.entries(voz).filter(([id]) => esCierre(id)));
}

// Lo que narrar.mjs genera ademas de los beats de la partida: una voz por frase (cada pieza usa la suya).
export const planDeFrases = () => FRASES_CIERRE.map((texto, i) => ({ id: `cierre-${i}`, texto }));

// Lo que dura el cierre de una pieza (ms): para el paquete, que suma esto a lo que dura la pieza.
export const duracionDeCierre = (clave, voz = null, tipo = 'final') => duracionDeBeat(beatDeCierre(clave, 0, tipo), voz, 1);

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// La tarjeta: logo, la frase, una fila por red (icono, nombre y @) y la pagina de los resultados. La mesa la pone a pantalla completa dentro de la zona segura.
export function htmlDeCierre(paso) {
  if (!paso || typeof paso !== 'object') return '';
  const filas = REDES.map((r) => `<div class="cr-red"><span class="cr-icono">${r.icono}</span><span class="cr-nombre">${esc(r.nombre)}</span><span class="cr-usuario">${esc(r.usuario)}</span></div>`).join('');
  return `<img class="cr-logo" src="logo.svg" alt="">`
    + `<div class="cr-marca">Enfrentando a las IAs</div>`
    + `<div class="cr-frase">${esc(paso.frase)}</div>`
    + `<div class="cr-redes">${filas}</div>`
    + `<div class="cr-sitio"><span class="cr-sitio-t">Los resultados de todas las partidas</span><b>${esc(SITIO.texto)}</b></div>`;
}
