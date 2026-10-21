// El cierre de CADA video (parte, clip o gancho): la voz pide seguirnos y reaccionar con una frase que cambia de un video a otro, y en pantalla queda el logo, el @ de cada red y la pagina donde se
// publican los resultados. Es un beat mas al final de la pieza (tipo 'cierre'), como la tarjeta de arranque lo es al principio (intro.js); la pagina lo agrega con cierre=1 (escena.js).
// La frase se elige con un seed sacado de la pieza (nunca Math.random: el mismo video es siempre igual) y el id del beat dice cual es (`cierre-N`): la voz se genera para TODAS las frases
// (herramientas/narrar.mjs) y cada pieza usa el audio que le toca. Puro: sin DOM ni red. Los @ y la pagina salen de web/redes.js (una sola fuente).

import { REDES, SITIO } from '../redes.js';
import { seedDeTexto } from './azar.js';
import { duracion } from './linea-comun.js';
import { duracionDeBeat } from './escena-config.js';

// Texto publico (con acentos). Todas piden seguir o reaccionar; la primera es la que pidio el usuario tal cual.
export const FRASES_CIERRE = [
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
];

export const MIN_MS_CIERRE = 6500; // lo que se queda en pantalla como minimo: hay que poder leer los @ (la voz puede alargarlo)

// Lo que identifica a una pieza: el seed de la partida, cual partida del archivo y que parte de ella (unidades desde..hasta, o el gancho N). Dos partidas con el mismo seed no comparten clave.
export function claveDeCierre(p) {
  const { seed = 0, partida = 1, desde = 0, hasta = 0, gancho = null } = p && typeof p === 'object' ? p : {};
  return gancho ? `${seed}:p${partida}:hk${gancho}` : `${seed}:p${partida}:${desde}-${hasta}`;
}

export const indiceDeCierre = (clave) => seedDeTexto(`cierre:${clave}`) % FRASES_CIERRE.length;
export const esCierre = (id) => /^cierre-\d+$/.test(String(id ?? ''));

// El beat que va al final de la pieza. `mano` es la unidad del ultimo beat (asi un recorte por unidades no lo pierde).
export function beatDeCierre(clave, mano = 0) {
  const i = indiceDeCierre(clave), frase = FRASES_CIERRE[i];
  return {
    id: `cierre-${i}`, mano, tipo: 'cierre', registro: 0, asiento: null, camara: [],
    texto: frase, lineas: [{ tipo: 'hecho', texto: frase, clave: 'cierre' }],
    minMs: Math.max(MIN_MS_CIERRE, duracion(0, frase)), reemplazo: false,
    pasos: [{ tipo: 'cierre', frase, redes: REDES.map((r) => ({ id: r.id, nombre: r.nombre, usuario: r.usuario })), sitio: SITIO.texto }],
  };
}

// Los beats con el cierre al final; si ya lo traen, tal cual. Lista vacia o basura -> lista vacia (no hay pieza a la que cerrar).
export function conCierre(beats, clave) {
  if (!Array.isArray(beats) || !beats.length) return [];
  if (beats.at(-1)?.tipo === 'cierre') return beats;
  return [...beats, beatDeCierre(clave, beats.at(-1)?.mano ?? 0)];
}

// El gancho no se narra (la musica la pone quien lo sube): de su voz solo se queda el cierre.
export function vozSoloCierre(voz) {
  if (!voz || typeof voz !== 'object') return null;
  return Object.fromEntries(Object.entries(voz).filter(([id]) => esCierre(id)));
}

// Lo que narrar.mjs genera ademas de los beats de la partida: una voz por frase (cada pieza usa la suya).
export const planDeFrases = () => FRASES_CIERRE.map((texto, i) => ({ id: `cierre-${i}`, texto }));

// Lo que dura el cierre de una pieza (ms): para el paquete, que suma esto a lo que dura la pieza.
export const duracionDeCierre = (clave, voz = null) => duracionDeBeat(beatDeCierre(clave), voz, 1);

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
