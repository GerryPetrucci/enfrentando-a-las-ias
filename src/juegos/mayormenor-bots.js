// Estrategias de control de Mayor o menor. No son IAs: sirven para probar el motor y para medir el juego. Leen el estado COMPLETO (por eso saben quien es
// el activo de esta ronda y la carta del crupier), nunca lo modifican y devuelven una respuesta cruda como la de una IA: {carta} si son el activo,
// {lado, fichas} si son el predictor. El azar usa solo el rng de su asiento. Solo leen lo que la vista tambien muestra: con las reglas 2.0.0 la mano del rival
// es secreta y un bot nunca la lee (una prueba cambia la mano del rival y exige la misma respuesta); lo que se sabe de ella sale de las cartas desconocidas.

import { activoDe } from './mayormenor/constantes.js';
import { crupierDeRonda, apuestaMaxima, cartasDesconocidas } from './mayormenor/estado.js';

const razon = 'bot de control';
const esActivo = (E, s) => activoDe(E.ronda) === s;

// Las cartas de las que un predictor cree que sale la del activo: con la mano publica, la mano del activo; con la mano oculta, lo que el predictor no conoce
// (junto con la propia mano del activo cuando es el activo quien se imagina la lectura del predictor: es lo mas cerca que puede estar de lo que ese ve).
function poblacion(E, quien) {
  const a = activoDe(E.ronda);
  if (!E.reglas.manoOculta) return E.mano[a];
  return quien === a ? [...E.mano[a], ...cartasDesconocidas(E, a)] : cartasDesconocidas(E, quien);
}

// Probabilidad de que la carta oculta del activo sea mayor / menor que la del crupier segun lo que sabe `quien` (la carta igual cuenta como menor si la regla lo dice).
function chances(E, quien) {
  const pob = poblacion(E, quien);
  const c = crupierDeRonda(E);
  const men = (x) => (E.reglas.igualEsMenor ? x <= c : x < c);
  return { may: pob.filter((x) => x > c).length / pob.length, men: pob.filter(men).length / pob.length };
}
const ladoProbable = (E, quien) => {
  const { may, men } = chances(E, quien);
  return may >= men ? 'mayor' : 'menor';
};

// La carta mas baja que supera al crupier (gana poco pero seguro); si ninguna lo supera, la mas baja que tiene.
function cartaPrudente(E, s) {
  const c = crupierDeRonda(E);
  const mayores = E.mano[s].filter((x) => x > c);
  return mayores.length ? Math.min(...mayores) : Math.min(...E.mano[s]);
}
// Juega lo contrario de lo que un predictor que lee su mano apostaria. Si lo probable es "mayor", la mas alta que NO supera al crupier; si es "menor", la mas alta que tiene.
function cartaContraria(E, s) {
  const c = crupierDeRonda(E);
  if (ladoProbable(E, s) === 'mayor') {
    const menores = E.mano[s].filter((x) => x < c);
    return menores.length ? Math.max(...menores) : Math.min(...E.mano[s]);
  }
  return Math.max(...E.mano[s]);
}
const apuestaPrudente = (E, s) => ({ lado: ladoProbable(E, s), fichas: 1, razon });

// Todo al azar: carta de su mano; lado al azar y de 1 a la mitad de lo que puede apostar.
export function azar(E, s, rng) {
  if (esActivo(E, s)) return { carta: E.mano[s][Math.floor(rng() * E.mano[s].length)], razon };
  const tope = Math.max(1, Math.floor(apuestaMaxima(E, s) / 2));
  return { lado: rng() < 0.5 ? 'mayor' : 'menor', fichas: 1 + Math.floor(rng() * tope), razon };
}

// Activo: gana poco pero seguro. Predictor: el lado mas probable con 1 ficha.
export function prudente(E, s) {
  return esActivo(E, s) ? { carta: cartaPrudente(E, s), razon } : apuestaPrudente(E, s);
}

// Activo como el prudente. Predictor: el lado mas probable y apuesta en proporcion a su ventaja (|P(mayor) - P(menor)| de lo que puede apostar, minimo 1).
export function contador(E, s) {
  if (esActivo(E, s)) return { carta: cartaPrudente(E, s), razon };
  const { may, men } = chances(E, s);
  return { lado: may >= men ? 'mayor' : 'menor', fichas: Math.max(1, Math.round(Math.abs(may - men) * apuestaMaxima(E, s))), razon };
}

// Activo: siempre la carta mas alta. Predictor: todo lo que puede apostar al lado mas probable.
export function temerario(E, s) {
  if (esActivo(E, s)) return { carta: Math.max(...E.mano[s]), razon };
  return { lado: ladoProbable(E, s), fichas: apuestaMaxima(E, s), razon };
}

// Activo: juega lo contrario de lo que lee el predictor. Predictor: como el prudente.
export function contrario(E, s) {
  return esActivo(E, s) ? { carta: cartaContraria(E, s), razon } : apuestaPrudente(E, s);
}

// El mejor de control: como activo mezcla (una de cada tres veces juega la carta contraria, el resto la prudente) para que su jugada no se lea; como predictor apuesta
// como el contador pero eleva el exponente de la ventaja (apuesta fuerte solo cuando esta muy seguro) para no perderlo todo en rondas dudosas.
export const ENGANO = 1 / 3;
export function astuto(E, s, rng) {
  if (esActivo(E, s)) return { carta: rng() < ENGANO ? cartaContraria(E, s) : cartaPrudente(E, s), razon };
  const { may, men } = chances(E, s);
  const ventaja = Math.abs(may - men);
  return { lado: may >= men ? 'mayor' : 'menor', fichas: Math.max(1, Math.round(ventaja * ventaja * apuestaMaxima(E, s))), razon };
}

export const BOTS = { azar, prudente, contador, temerario, contrario, astuto };

// Como se muestran en el marcador y el video (texto publico: lleva acentos si hace falta). Los colores son de control, no de una IA.
export const INFO_BOTS = {
  azar: { nombre: 'Al azar', color: '#9C8FB8' },
  prudente: { nombre: 'Prudente', color: '#B8A86F' },
  contador: { nombre: 'Contador', color: '#6FB8A0' },
  temerario: { nombre: 'Temerario', color: '#B87F6F' },
  contrario: { nombre: 'Contrario', color: '#8FA3B8' },
  astuto: { nombre: 'Astuto', color: '#C28FB8' },
};
