// Kit de casino de las escenas: cartas, fichas y placas como TEXTO HTML/SVG (funciones puras, sin DOM), para que la escena los inserte
// con innerHTML y las pruebas los revisen en Node. El aspecto esta en mesa.css; las posiciones, en layout.js.
//
// Reglas de marca que cumple este archivo:
//  - el logo (dos discos que se cruzan, interseccion dorada) va solo sobre fondo Noche y sin recolorear (por eso el dorso es Noche);
//  - el color de cada IA sale de web/paleta.js por su id (colorDe, textoDe, fondoCSS): aqui no se define ninguno;
//  - nada de logos de proveedores: el avatar es la inicial del nombre.
// Los textos publicos llevan acentos. Todo lo que viene de los datos (nombres de modelos) pasa por esc().

import { colorDe, textoDe, fondoCSS } from '../paleta.js';

export const LOGO = { verde: '#5fa877', rojo: '#d8584e', oro: '#e0b25c', noche: '#101014' };

const ENTIDADES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ENTIDADES[c]);

// Las cartas de Duda y apuesta. Cada color tiene su FORMA y su LETRA para leerse sin depender del color (daltonismo); `tinta` es el color del texto de la carta.
export const CARTAS = {
  rojo:     { nombre: 'Rojo',     letra: 'R', tinta: '#c8423a', forma: 'círculo',   gema: '<circle cx="40" cy="40" r="30" fill="#d8584e" stroke="#7d1d17" stroke-width="4"/><circle cx="31" cy="30" r="9" fill="#fff" opacity=".45"/>' },
  amarillo: { nombre: 'Amarillo', letra: 'A', tinta: '#b88a00', forma: 'triángulo', gema: '<polygon points="40,8 72,66 8,66" fill="#f2c744" stroke="#8a6500" stroke-width="4" stroke-linejoin="round"/><polygon points="40,18 48,34 30,34" fill="#fff" opacity=".4"/>' },
  azul:     { nombre: 'Azul',     letra: 'Z', tinta: '#2f62c9', forma: 'cuadrado',  gema: '<rect x="10" y="10" width="60" height="60" rx="8" fill="#4d8bf5" stroke="#1b3680" stroke-width="4"/><rect x="17" y="17" width="20" height="14" rx="4" fill="#fff" opacity=".4"/>' },
  verde:    { nombre: 'Verde',    letra: 'V', tinta: '#2f8a55', forma: 'hexágono',  gema: '<polygon points="40,6 70,23 70,57 40,74 10,57 10,23" fill="#5fa877" stroke="#1c5a38" stroke-width="4" stroke-linejoin="round"/><polygon points="40,14 56,24 40,30 24,24" fill="#fff" opacity=".4"/>' },
  morado:   { nombre: 'Morado',   letra: 'M', tinta: '#7d3fb8', forma: 'rombo',     gema: '<polygon points="40,5 72,40 40,75 8,40" fill="#a65ce0" stroke="#58257f" stroke-width="4" stroke-linejoin="round"/><polygon points="40,14 52,34 40,38 28,34" fill="#fff" opacity=".4"/>' },
  arcoiris: { nombre: 'Arcoíris', letra: '★', tinta: '#7d3fb8', forma: 'estrella',  gema: '<polygon points="40,4 49,29 76,30 55,47 62,74 40,58 18,74 25,47 4,30 31,29" fill="url(#arcoiris)" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>' },
};

// La forma de un color (para el recuadro del anuncio); un color desconocido no lanza: sale vacia.
export const gemaDe = (color) => (Object.hasOwn(CARTAS, color) ? CARTAS[color].gema : '');

// Definiciones SVG que usan las cartas: el logo, el degradado del arcoiris y la trama del dorso. Se inserta una sola vez por pagina.
export const htmlDefs = () => `<svg width="0" height="0" style="position:absolute"><defs>
<symbol id="logo" viewBox="80 140 352 232"><clipPath id="clipV"><circle cx="196" cy="256" r="116"/></clipPath><circle cx="196" cy="256" r="116" fill="${LOGO.verde}"/><circle cx="316" cy="256" r="116" fill="${LOGO.rojo}"/><circle cx="316" cy="256" r="116" fill="${LOGO.oro}" clip-path="url(#clipV)"/></symbol>
<linearGradient id="arcoiris" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d8584e"/><stop offset=".25" stop-color="#f2c744"/><stop offset=".5" stop-color="#5fa877"/><stop offset=".75" stop-color="#4d8bf5"/><stop offset="1" stop-color="#a65ce0"/></linearGradient>
<pattern id="rombos" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="16" height="16" fill="${LOGO.noche}"/><rect width="16" height="1.2" fill="${LOGO.oro}" opacity=".16"/><rect width="1.2" height="16" fill="${LOGO.oro}" opacity=".16"/></pattern>
</defs></svg>`;

// El simbolo del logo se dibuja desde (0, 0) del svg que lo usa, por eso este svg parte de 0 0 (no de 80 140, que es el viewBox interno del simbolo).
export const htmlLogo = (clase = 'logo') => `<svg class="${esc(clase)}" viewBox="0 0 352 232"><use href="#logo"/></svg>`;

// Dorso: Noche con reticula dorada y el logo en sus colores dentro de un medallon.
export const htmlDorso = () => `<div class="dorso"><svg class="fondo" viewBox="0 0 124 174"><rect width="124" height="174" fill="url(#rombos)"/><rect x="8" y="8" width="108" height="158" rx="7" fill="none" stroke="${LOGO.oro}" stroke-width="2" opacity=".85"/><rect x="13" y="13" width="98" height="148" rx="5" fill="none" stroke="${LOGO.oro}" stroke-width=".8" opacity=".5"/><circle cx="62" cy="87" r="42" fill="${LOGO.noche}" stroke="${LOGO.oro}" stroke-width="1.4" opacity=".95"/><use href="#logo" x="26" y="63" width="72" height="48"/></svg><div class="brillo"></div></div>`;

// Frente de una carta (forma + letra + nombre). Un color desconocido no lanza: devuelve una cara en blanco.
export function htmlFrente(color) {
  const c = CARTAS[color];
  if (!c) return '<div class="cara"><div class="brillo"></div></div>';
  const esquina = (abajo) => `<div class="esq${abajo ? ' abajo' : ''}">${c.letra}<svg viewBox="0 0 80 80">${c.gema}</svg></div>`;
  return `<div class="cara" style="--k:${c.tinta}">${esquina(false)}<svg class="gema" viewBox="0 0 80 80">${c.gema}</svg><div class="nombre">${c.nombre}</div>${esquina(true)}<div class="brillo"></div></div>`;
}

// Una carta. color = null cuando el publico NO debe verla todavia: entonces el HTML no lleva el frente (no se filtra ni en el DOM) y la escena
// lo pone con htmlFrente() en el momento de voltearla.
export const htmlCarta = (color = null) => `<div class="carta"${color ? ` data-color="${esc(color)}"` : ''}><div class="giro">${color ? htmlFrente(color) : '<div class="cara"></div>'}${htmlDorso()}</div></div>`;

export const TIPOS_FICHA = ['juego', 'espacio'];
export const htmlFicha = (tipo, top = 0) => `<div class="ficha ${TIPOS_FICHA.includes(tipo) ? tipo : 'juego'}" style="top:${Math.round(top)}px"></div>`;

// Una pila de n fichas (como mucho `max`, para que no se salga de su sitio; el numero exacto va en el texto de al lado).
export function htmlPila(n, tipo, max = 8) {
  const cuantas = Number.isInteger(n) ? Math.max(0, Math.min(max, n)) : 0;
  return `<div class="pila">${Array.from({ length: cuantas }, (_, i) => htmlFicha(tipo, 22 - i * 5)).join('')}</div>`;
}

export const htmlFichasPlaca = (fichas, espacios) => `<div class="fichas"><div class="grupo">${htmlPila(fichas, 'juego')}<span class="cuenta">${esc(fichas)}</span></div><div class="grupo">${htmlPila(espacios, 'espacio')}<span class="cuenta">${esc(espacios)}</span></div></div>`;

// La placa de un jugador: color de su IA (de paleta.js; los bots usan el que trae el resultado guardado), inicial y nombre. `rol` es el texto chico de abajo.
export function htmlPlaca(jugador, rol = '', fichas = 0, espacios = 0, reemplazo = false) {
  const j = jugador ?? {};
  const nombre = j.nombre ?? 'Jugador';
  return `<div class="placa${reemplazo ? ' reemplazo' : ''}" style="--c:${esc(colorDe(j.id, j.color))};--t:${esc(textoDe(j.id, j.color))}"><div class="avatar" style="--fondo:${esc(fondoCSS(j.id, j.color))}">${esc(j.inicial ?? [...nombre][0] ?? '?')}</div><div class="quien"><div class="nom">${esc(nombre)}</div><div class="rol">${esc(rol)}</div></div>${htmlFichasPlaca(fichas, espacios)}</div>`;
}
