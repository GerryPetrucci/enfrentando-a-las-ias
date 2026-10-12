// Estrategias de control de Triple dado. No son IAs: sirven para probar el motor y para medir el juego. Leen el estado COMPLETO (leen solo lo suyo: sus dados,
// su tarjeta y sus tarjetas usadas), nunca lo modifican y devuelven una respuesta cruda como la de una IA: {tarjeta} en la prediccion, {dados} en un
// enfrentamiento. El azar usa solo el rng de su asiento. Empatan por orden de ids, asi que son deterministas.

import { TARJETAS } from './tripledado/constantes.js';
import { disponibles, valorDe } from './tripledado/estado.js';
import { evaluarCombinacion, compararClaves } from './tripledado/combinaciones.js';

const razon = 'bot de control';
const quedan = (E, s) => TARJETAS.filter((t) => !E.tarjetasUsadas[s].includes(t));
// la primera de la lista de preferencia que aun tiene; si ninguna, la primera que le quede
const preferida = (E, s, orden) => orden.find((t) => quedan(E, s).includes(t)) ?? quedan(E, s)[0];

// todas las combinaciones de tres ids
function tercias(ids) {
  const out = [];
  for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) for (let c = b + 1; c < ids.length; c++) out.push([ids[a], ids[b], ids[c]]);
  return out;
}

// la mejor (o la peor) combinacion de tres dados entre los ids dados
function extremo(E, s, ids, peor) {
  let mejor = null;
  for (const t of tercias(ids)) {
    const clave = evaluarCombinacion(t.map((id) => valorDe(E, s, id))).clave;
    if (mejor === null || (peor ? compararClaves(clave, mejor.clave) < 0 : compararClaves(clave, mejor.clave) > 0)) mejor = { t, clave };
  }
  return mejor.t;
}

// solo los blancos que le quedan (si son menos de tres, todos los dados)
const blancos = (E, s) => {
  const b = disponibles(E, s).filter((id) => id.startsWith('b'));
  return b.length >= 3 ? b : disponibles(E, s);
};

// Todo al azar: una tarjeta que le quede y tres dados distintos de los que le quedan.
export function azar(E, s, rng) {
  if (E.fase === 'prediccion') {
    const q = quedan(E, s);
    return { tarjeta: q[Math.floor(rng() * q.length)], razon };
  }
  const pool = [...disponibles(E, s)], dados = [];
  for (let n = 0; n < 3; n++) dados.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return { dados, razon };
}

// Siempre la mejor combinacion que puede formar con lo que le queda; predice MORE.
export function goloso(E, s) {
  if (E.fase === 'prediccion') return { tarjeta: preferida(E, s, ['MORE', 'MAX', 'MIN', 'ZERO']), razon };
  return { dados: extremo(E, s, disponibles(E, s), false), razon };
}

// Guarda lo mejor para el ultimo enfrentamiento de la ronda: en los dos primeros juega su peor combinacion con blancos; en el tercero, la mejor. Predice MIN.
export function reservado(E, s) {
  if (E.fase === 'prediccion') return { tarjeta: preferida(E, s, ['MIN', 'MORE', 'MAX', 'ZERO']), razon };
  return { dados: E.enfrentamiento < 3 ? extremo(E, s, blancos(E, s), true) : extremo(E, s, disponibles(E, s), false), razon };
}

// Va por el ZERO lo antes posible: en la ronda en que lo predijo juega siempre su peor combinacion; en las demas, la mejor.
export function tanque(E, s) {
  if (E.fase === 'prediccion') return { tarjeta: preferida(E, s, ['ZERO', 'MIN', 'MORE', 'MAX']), razon };
  return { dados: extremo(E, s, disponibles(E, s), E.tarjetaActual[s] === 'ZERO'), razon };
}

// Puntos esperados por tarjeta (con premio) entre jugadores que buscan puntos, medidos con 4,000 partidas de golosos: MAX 10.9 > MORE 10.0 > MIN 9.1 > ZERO 8.5.
const POR_PUNTOS_ESPERADOS = ['MAX', 'MORE', 'MIN', 'ZERO'];

// Predice la tarjeta que mas puntos esperados da entre las que le quedan y cuida los ocultos: los dos primeros enfrentamientos juega la mejor combinacion solo
// con blancos; el tercero, con todo.
export function calculador(E, s) {
  if (E.fase === 'prediccion') return { tarjeta: preferida(E, s, POR_PUNTOS_ESPERADOS), razon };
  return { dados: E.enfrentamiento < 3 ? extremo(E, s, blancos(E, s), false) : extremo(E, s, disponibles(E, s), false), razon };
}

export const BOTS = { azar, goloso, reservado, tanque, calculador };

// Como se muestran en el marcador y el video (texto publico: lleva acentos si hace falta). Los colores son de control, no de una IA.
export const INFO_BOTS = {
  azar: { nombre: 'Al azar', color: '#9C8FB8' },
  goloso: { nombre: 'Goloso', color: '#B87F6F' },
  reservado: { nombre: 'Reservado', color: '#8FA3B8' },
  tanque: { nombre: 'Tanque', color: '#6FB8A0' },
  calculador: { nombre: 'Calculador', color: '#B8A86F' },
};
