// Estrategias de control de Mayor o menor. No son IAs: sirven para probar el motor y para medir el juego. Leen el estado COMPLETO (por eso saben quien es
// el activo de esta ronda y la carta del crupier), nunca lo modifican y devuelven una respuesta cruda como la de una IA: {carta} si son el activo,
// {lado, fichas} si son el predictor. El azar usa solo el rng de su asiento. Solo leen lo que la vista tambien muestra (manos y crupier de esta ronda).

import { activoDe } from './mayormenor/constantes.js';
import { crupierDeRonda } from './mayormenor/estado.js';

const razon = 'bot de control';
const esActivo = (E, s) => activoDe(E.ronda) === s;

// Probabilidad de que la carta oculta del activo sea mayor / menor que la del crupier, segun las cartas que le quedan (son publicas).
function chances(E) {
  const mano = E.mano[activoDe(E.ronda)];
  const c = crupierDeRonda(E);
  return { may: mano.filter((x) => x > c).length / mano.length, men: mano.filter((x) => x < c).length / mano.length };
}
const ladoProbable = (E) => {
  const { may, men } = chances(E);
  return may >= men ? 'mayor' : 'menor';
};

// La carta mas baja que supera al crupier (gana poco pero seguro); si ninguna lo supera, la mas baja que tiene.
function cartaPrudente(E, s) {
  const c = crupierDeRonda(E);
  const mayores = E.mano[s].filter((x) => x > c);
  return mayores.length ? Math.min(...mayores) : Math.min(...E.mano[s]);
}
const apuestaPrudente = (E) => ({ lado: ladoProbable(E), fichas: 1, razon });

// Todo al azar: carta de su mano; lado al azar y de 1 a la mitad de sus fichas.
export function azar(E, s, rng) {
  if (esActivo(E, s)) return { carta: E.mano[s][Math.floor(rng() * E.mano[s].length)], razon };
  const tope = Math.max(1, Math.floor(E.fichas[s] / 2));
  return { lado: rng() < 0.5 ? 'mayor' : 'menor', fichas: 1 + Math.floor(rng() * tope), razon };
}

// Activo: gana poco pero seguro. Predictor: el lado mas probable con 1 ficha.
export function prudente(E, s) {
  return esActivo(E, s) ? { carta: cartaPrudente(E, s), razon } : apuestaPrudente(E);
}

// Activo como el prudente. Predictor: el lado mas probable y apuesta en proporcion a su ventaja (|P(mayor) - P(menor)| de sus fichas, minimo 1).
export function contador(E, s) {
  if (esActivo(E, s)) return { carta: cartaPrudente(E, s), razon };
  const { may, men } = chances(E);
  return { lado: may >= men ? 'mayor' : 'menor', fichas: Math.max(1, Math.round(Math.abs(may - men) * E.fichas[s])), razon };
}

// Activo: siempre la carta mas alta. Predictor: todas sus fichas al lado mas probable.
export function temerario(E, s) {
  if (esActivo(E, s)) return { carta: Math.max(...E.mano[s]), razon };
  return { lado: ladoProbable(E), fichas: E.fichas[s], razon };
}

// Activo: juega lo contrario de lo que un predictor que lee su mano apostaria. Si lo probable es "mayor", la mas alta que NO supera al crupier;
// si es "menor", la mas alta que tiene. Predictor: como el prudente.
export function contrario(E, s) {
  if (!esActivo(E, s)) return apuestaPrudente(E);
  const c = crupierDeRonda(E);
  if (ladoProbable(E) === 'mayor') {
    const menores = E.mano[s].filter((x) => x < c);
    return { carta: menores.length ? Math.max(...menores) : Math.min(...E.mano[s]), razon };
  }
  return { carta: Math.max(...E.mano[s]), razon };
}

export const BOTS = { azar, prudente, contador, temerario, contrario };

// Como se muestran en el marcador y el video (texto publico: lleva acentos si hace falta). Los colores son de control, no de una IA.
export const INFO_BOTS = {
  azar: { nombre: 'Al azar', color: '#9C8FB8' },
  prudente: { nombre: 'Prudente', color: '#B8A86F' },
  contador: { nombre: 'Contador', color: '#6FB8A0' },
  temerario: { nombre: 'Temerario', color: '#B87F6F' },
  contrario: { nombre: 'Contrario', color: '#8FA3B8' },
};
