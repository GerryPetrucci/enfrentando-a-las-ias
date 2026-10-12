// Ayudas compartidas por las pruebas de Mayor o menor. No es un archivo de pruebas.
import { crearRng } from '../../rng.js';
import { crearEstado } from '../../juegos/mayormenor/estado.js';
import { normalizarRespuesta } from '../../juegos/mayormenor/ordenes.js';
import { aplicarTurno } from '../../juegos/mayormenor/turno.js';
import { activoDe } from '../../juegos/mayormenor/constantes.js';

export const nuevoEstado = (seed = 7) => crearEstado(crearRng(seed));

// Fija la carta que revela el crupier en la ronda en curso (para ejemplos exactos). Rompe la permutacion del mazo: solo para pruebas de una ronda.
export function fijarCrupier(E, carta) {
  const a = activoDe(E.ronda);
  E.crupier[a][E.crupierSalidas[a].length] = carta;
}

// Una ronda con jugadas fijas: la carta del activo y (lado, fichas) del predictor. Devuelve el registro.
export function ronda(E, { crupier = null, carta, lado, fichas }) {
  if (crupier !== null) fijarCrupier(E, crupier);
  const a = activoDe(E.ronda), p = 1 - a;
  const respuestas = [null, null];
  respuestas[a] = normalizarRespuesta({ carta, razon: 'prueba' });
  respuestas[p] = normalizarRespuesta({ lado, fichas, razon: 'prueba' });
  return aplicarTurno(E, respuestas);
}

// Politica sencilla de prueba: el activo juega su carta mas baja y el predictor apuesta 1 ficha a "mayor". Nunca termina antes de la ronda 18
// (un predictor pierde a lo sumo 1 ficha en cada una de sus 9 rondas y empieza con 10).
export const politicaMinima = (E, s) => (activoDe(E.ronda) === s
  ? { carta: E.mano[s][0], razon: 'prueba' }
  : { lado: 'mayor', fichas: 1, razon: 'prueba' });

// Una partida entera sin la arena: fns[s](E, s, rng) -> respuesta cruda. Devuelve el estado y los registros.
export function jugarConBots(seed, fns, { hasta = Infinity } = {}) {
  const E = nuevoEstado(seed);
  const rngs = fns.map((_, s) => crearRng((seed * 31 + s) >>> 0));
  const registros = [];
  while (!E.fin && registros.length < hasta) {
    const respuestas = fns.map((fn, s) => normalizarRespuesta(fn(E, s, rngs[s])));
    registros.push(aplicarTurno(E, respuestas));
  }
  return { E, registros };
}
