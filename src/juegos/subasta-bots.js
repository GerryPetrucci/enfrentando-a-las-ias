// Estrategias de control de Subasta de tiempo. No son IAs: sirven para probar el motor y para medir el juego. Leen el estado COMPLETO (por
// eso conocen su propio banco y cuantas subastas faltan), nunca lo modifican y devuelven una respuesta cruda como la de una IA. El azar usa
// solo el rng de su asiento. Nunca piden mas de lo que tienen y apuestan con una sola decima.

import { SUBASTAS, segundos } from './subasta/constantes.js';

const razon = 'bot de control';
const faltan = (E) => SUBASTAS - E.subasta + 1; // incluida la actual
const tope = (E, s, pedidos) => Math.max(0, Math.min(Math.floor(pedidos * 10) / 10, segundos(E.bancos[s])));

// Nunca apuesta: siempre se retira (conserva todo su tiempo y casi nunca gana una ficha).
export function retirado() {
  return { apuesta: 0, razon };
}

// Reparte lo que le queda entre las subastas que faltan.
export function parejo(E, s) {
  return { apuesta: tope(E, s, segundos(E.bancos[s]) / faltan(E)), razon };
}

// Una fraccion al azar (de 0 a 2 veces lo que le tocaria si repartiera parejo).
export function azar(E, s, rng) {
  return { apuesta: tope(E, s, rng() * 2 * (segundos(E.bancos[s]) / faltan(E))), razon };
}

// Apuesta fuerte (60 segundos) en cada subasta hasta quedarse sin tiempo.
export function gastador(E, s) {
  return { apuesta: tope(E, s, 60), razon };
}

// Apuesta poco y constante (5 segundos): gana solo cuando los demas se retiran o apuestan menos.
export function cuentagotas(E, s) {
  return { apuesta: tope(E, s, 5), razon };
}

export const BOTS = { retirado, parejo, azar, gastador, cuentagotas };

// Como se muestran en el marcador y el video (texto publico: lleva acentos si hace falta). Los colores son de control, no de una IA.
export const INFO_BOTS = {
  retirado: { nombre: 'Retirado', color: '#8FA3B8' },
  parejo: { nombre: 'Parejo', color: '#B8A86F' },
  azar: { nombre: 'Al azar', color: '#9C8FB8' },
  gastador: { nombre: 'Gastador', color: '#B87F6F' },
  cuentagotas: { nombre: 'Cuentagotas', color: '#6FB8A0' },
};
