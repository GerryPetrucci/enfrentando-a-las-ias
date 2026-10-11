// La historia publica de Duda y apuesta. Se cuenta desde lo que registro el motor, con frases de plantilla que varian segun el seed: no hay llamadas extra a
// modelos y lo que se ve es lo que paso. Los nombres de las IAs son {0} a {3} (el asiento): el reproductor los reemplaza con resolverNombres.
// El texto es PUBLICO (lleva acentos); lo que ven las IAs vive en vista.js. Las lineas de tipo "comentario" son los disparadores de la voz narradora.
// Vocabulario suave: se habla de "farol" y de anuncios que no se cumplen; nunca de mentir ni de enganar.
//
// La narracion usa su PROPIO flujo aleatorio (derivado de estado.semillaNarracion): cambiar una frase nunca cambia el juego.

import { crearRng } from '../../rng.js';
import { MANOS, JUGADORES } from './constantes.js';

const elegir = (rng, lista) => lista[Math.floor(rng() * lista.length)];
const quien = (s) => `{${s}}`;
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const unir = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`);
const rngDe = (E, clave) => crearRng((E.semillaNarracion ^ Math.imul(clave + 1, 0x9e3779b1)) >>> 0);
const asientos = [...Array(JUGADORES).keys()];
const CARTAS = { rojo: 'rojas', amarillo: 'amarillas', azul: 'azules', verde: 'verdes', morado: 'moradas' };
const cartas = (color) => CARTAS[color] ?? color;

// "2 fichas", "1 ficha y 1 de espacio", "1 ficha de espacio"
export function textoApuesta(ap) {
  const f = ap.fichas, e = ap.espacios;
  if (f && e) return `${plural(f, 'ficha', 'fichas')} y ${e} de espacio`;
  if (e) return `${plural(e, 'ficha de espacio', 'fichas de espacio')}`;
  return plural(f, 'ficha', 'fichas');
}

// Un anuncio (anunciar o aceptar). previo = el anuncio que se acepta (null al abrir). reemplazo = lo puso el juego por una respuesta ilegal.
export function narrarAnuncio({ E, mano, decision, s, accion, anuncio, apuesta, reemplazo, previo }) {
  const rng = rngDe(E, mano * 10 + decision);
  const lineas = [];
  const agregar = (tipo, texto) => lineas.push({ tipo, texto });
  if (decision === 1) {
    agregar('apertura', `Mano ${mano} de ${MANOS}. Empieza ${quien(s)}${mano > 1 ? ', que perdió la mano anterior' : ''}.`);
  }
  const cuerpo = `al menos ${anuncio.cantidad} cartas ${cartas(anuncio.color)}`;
  if (reemplazo) {
    agregar('hecho', `${quien(s)} no responde bien y el juego ${accion === 'aceptar' ? 'acepta y ' : ''}anuncia por ${quien(s)}: ${cuerpo}, con una apuesta de ${textoApuesta(apuesta)}.`);
    return lineas;
  }
  if (accion === 'aceptar') {
    agregar('hecho', `${quien(s)} acepta: ${quien(previo.asiento)} recupera su apuesta. ${elegir(rng, ['Ahora anuncia', 'Y anuncia', 'Responde anunciando'])} ${cuerpo} y apuesta ${textoApuesta(apuesta)}.`);
  } else {
    agregar('hecho', `${quien(s)} ${elegir(rng, ['anuncia', 'declara', 'asegura que hay'])} ${cuerpo} y apuesta ${textoApuesta(apuesta)}.`);
  }
  return lineas;
}

// Quien duda. p = quien hizo el ultimo anuncio; subio = el que duda apuesta mas que el anuncio.
export function narrarDuda({ E, mano, decision, s, p, apuesta, subio, reemplazo }) {
  const rng = rngDe(E, mano * 10 + decision);
  if (reemplazo) return [{ tipo: 'hecho', texto: `${quien(s)} no responde bien y el juego duda por ${quien(s)} del anuncio de ${quien(p)}.` }];
  const frase = subio
    ? `${quien(s)} duda del anuncio de ${quien(p)} y sube la apuesta a ${textoApuesta(apuesta)}.`
    : `${quien(s)} ${elegir(rng, ['duda', 'no se lo cree y duda'])} del anuncio de ${quien(p)}${apuesta ? ` e iguala con ${textoApuesta(apuesta)}` : ''}.`;
  return [{ tipo: 'hecho', texto: frase }];
}

// La respuesta de quien anuncio cuando le subieron la apuesta.
export function narrarDefensa({ p, accion, reemplazo }) {
  const por = reemplazo ? ` (el juego responde por ${quien(p)})` : '';
  return [{ tipo: 'hecho', texto: accion === 'igualar'
    ? `${quien(p)} iguala la subida${por}.`
    : `${quien(p)} se retira${por} y pierde lo que había apostado; las cartas no se revelan.` }];
}

// El desenlace de la mano. res = lo que devuelve resolver() en turno.js.
export function narrarResolucion({ res }) {
  const lineas = [];
  const agregar = (tipo, texto) => lineas.push({ tipo, texto });
  const gana = `${quien(res.ganador)} gana ${textoApuesta(res.movidas)}`;
  if (res.tipo === 'retirada') {
    agregar('hecho', `${gana} sin que se revelen las cartas.`);
    agregar('comentario', `${quien(res.predictor)} prefiere no averiguarlo.`);
    return lineas;
  }
  const detalle = asientos.map((s) => `${quien(s)} ${res.cuentas[s]}`).join(', ');
  agregar('hecho', `Se revelan las cartas: hay ${res.real} ${cartas(res.color)} (${detalle}).`);
  agregar('hecho', `${gana}.`);
  if (res.ganador === res.predictor) {
    if (res.real === res.cantidad) agregar('comentario', `Justo: había exactamente ${res.cantidad}.`);
    else agregar('comentario', `${quien(res.dudador)} dudó y el anuncio era cierto.`);
  } else {
    agregar('comentario', `El anuncio de ${quien(res.predictor)} no se cumplía: era un farol y ${quien(res.dudador)} lo descubre.`);
  }
  return lineas;
}

// Lo que pasa al cerrar la mano: el pago a la banca y los espacios comprados.
export function narrarCierreMano({ mano, pago, compras }) {
  const lineas = [];
  if (pago) lineas.push({ tipo: 'hecho', texto: `Después de la mano ${mano}, cada jugador paga una ficha de juego a la banca.` });
  for (const s of compras) lineas.push({ tipo: 'hecho', texto: `${quien(s)} cambia una ficha de juego por un espacio más.` });
  return lineas;
}

// El cierre de la historia. Solo existe cuando la partida termino.
export function narrarEpilogo(E) {
  if (!E.fin || !E.final) return [];
  const f = E.final;
  const lineas = [];
  const agregar = (texto) => lineas.push({ tipo: 'epilogo', texto });
  agregar(f.motivo === 'eliminacion'
    ? `${unir(f.eliminados.map(quien))} se ${f.eliminados.length === 1 ? 'queda' : 'quedan'} sin fichas de juego y ${f.eliminados.length === 1 ? 'queda eliminado' : 'quedan eliminados'}.`
    : `Se acaban las ${MANOS} manos${f.eliminados.length ? `: ${quien(f.eliminados[0])} queda eliminado con menos fichas.` : ' y los de abajo empatan en fichas: nadie queda eliminado.'}`);
  agregar(f.pieza === null
    ? 'Nadie gana la pieza: los de arriba empatan en fichas.'
    : `${quien(f.pieza)} gana la pieza con ${plural(E.fichas[f.pieza], 'ficha', 'fichas')}.`);
  agregar(`Fichas finales: ${asientos.map((s) => `${quien(s)} ${E.fichas[s]}`).join(', ')}.`);
  return lineas;
}

// {0}..{3} -> los nombres de las IAs de esa partida (jugadores = lo que guarda la arena en cada partida)
export const resolverNombres = (texto, jugadores) =>
  String(texto).replace(/\{([0-3])\}/g, (_, k) => jugadores?.[k]?.nombre ?? `Jugador ${Number(k) + 1}`);
