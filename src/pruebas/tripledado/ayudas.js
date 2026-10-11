// Ayudas compartidas por las pruebas de Triple dado. No es un archivo de pruebas.
import { crearRng } from '../../rng.js';
import { crearEstado, disponibles } from '../../juegos/tripledado/estado.js';
import { normalizarRespuesta } from '../../juegos/tripledado/ordenes.js';
import { aplicarTurno } from '../../juegos/tripledado/turno.js';
import { TARJETAS, RONDAS } from '../../juegos/tripledado/constantes.js';

export const nuevoEstado = (seed = 7) => crearEstado(crearRng(seed));

// Fija los dados de un jugador en la ronda dada (por defecto la en curso). Para ejemplos exactos.
export function fijarDados(E, s, { blancos, rojo = 1, azul = 1 }, ronda = E.ronda) {
  E.dados[ronda - 1][s] = { blancos: [...blancos], rojo, azul };
}

// Dados de la ronda en curso con un primer enfrentamiento conocido si todos juegan sus tres primeros blancos (b1 b2 b3):
// J1 5-5-2 doble, J2 3-4-5 escalera, J3 6-4-1 sencillo, J4 2-1-1 doble de unos -> puntos 3, 6, 0 y 1.
export function escenarioBasico(E) {
  fijarDados(E, 0, { blancos: [5, 5, 2, 1, 1, 1, 1, 1, 1], rojo: 6, azul: 3 });
  fijarDados(E, 1, { blancos: [3, 4, 5, 2, 2, 2, 2, 2, 2], rojo: 1, azul: 1 });
  fijarDados(E, 2, { blancos: [6, 4, 1, 3, 3, 3, 3, 3, 3], rojo: 5, azul: 2 });
  fijarDados(E, 3, { blancos: [2, 1, 1, 6, 6, 6, 6, 6, 6], rojo: 4, azul: 4 });
}

// Una prediccion con tarjetas fijas; null = ese jugador no responde (modelo caido).
export function prediccion(E, tarjetas) {
  return aplicarTurno(E, tarjetas.map((t) => (t === null ? null : normalizarRespuesta({ tarjeta: t, razon: 'prueba' }))));
}

// Un enfrentamiento con tres dados por jugador (ids); null = ese jugador no responde.
export function enfrentamiento(E, jugadas) {
  return aplicarTurno(E, jugadas.map((d) => (d === null ? null : normalizarRespuesta({ dados: d, razon: 'prueba' }))));
}

export const PRIMEROS = [['b1', 'b2', 'b3'], ['b1', 'b2', 'b3'], ['b1', 'b2', 'b3'], ['b1', 'b2', 'b3']];

// Politica sencilla de prueba: la primera tarjeta que queda y los tres primeros dados que quedan.
export const politicaSimple = (E, s) => (E.fase === 'prediccion'
  ? { tarjeta: TARJETAS.find((t) => !E.tarjetasUsadas[s].includes(t)), razon: 'prueba' }
  : { dados: disponibles(E, s).slice(0, 3), razon: 'prueba' });

// Una partida entera sin la arena: fns[s](E, s, rng) -> respuesta cruda. En la prediccion de la ronda 4 nadie responde (como en la arena).
// Devuelve el estado, los registros y las llamadas (respuestas pedidas).
export function jugarConBots(seed, fns, { hasta = Infinity } = {}) {
  const E = nuevoEstado(seed);
  const rngs = fns.map((_, s) => crearRng((seed * 31 + s) >>> 0));
  const registros = [];
  let llamadas = 0;
  while (!E.fin && registros.length < hasta) {
    const forzada = E.fase === 'prediccion' && E.ronda === RONDAS;
    const respuestas = fns.map((fn, s) => (forzada ? null : normalizarRespuesta(fn(E, s, rngs[s]))));
    llamadas += respuestas.filter(Boolean).length;
    registros.push(aplicarTurno(E, respuestas));
  }
  return { E, registros, llamadas };
}
