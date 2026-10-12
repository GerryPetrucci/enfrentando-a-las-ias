// Ayudas compartidas por las pruebas de El numero solitario. No es un archivo de pruebas.
import { crearRng } from '../../rng.js';
import { crearEstado, disponibles } from '../../juegos/solitario/estado.js';
import { normalizarRespuesta } from '../../juegos/solitario/ordenes.js';
import { aplicarTurno } from '../../juegos/solitario/turno.js';

export const nuevoEstado = (seed = 7) => crearEstado(crearRng(seed));

// respuestas ya normalizadas, como las recibe aplicarTurno
export const pareja = (a, b) => normalizarRespuesta({ cartas: [a, b], razon: 'prueba' });
export const marca = (n) => normalizarRespuesta({ juega: n, razon: 'prueba' });

// Una ronda completa con jugadas fijas. parejas[s] = [a, b] (o null si ese asiento ya no juega); marcas[s] = la carta que juega.
export function ronda(E, parejas, marcas) {
  const f1 = aplicarTurno(E, parejas.map((p) => (p ? pareja(p[0], p[1]) : null)));
  const f2 = aplicarTurno(E, marcas.map((m) => (m === null ? null : marca(m))));
  return [f1, f2];
}

// Una ronda "natural": cada jugador elige sus dos primeras cartas disponibles y juega la primera.
export function rondaBasica(E) {
  const parejas = [0, 1, 2, 3, 4].map((s) => (E.jugando[s] ? disponibles(E, s).slice(0, 2) : null));
  return ronda(E, parejas, parejas.map((p) => (p ? p[0] : null)));
}

// Una partida entera de bots (sin la arena): fns[s](E, s, rng) -> respuesta cruda. Devuelve el estado y los registros.
export function jugarConBots(seed, fns, { hasta = Infinity } = {}) {
  const E = nuevoEstado(seed);
  const rngs = fns.map((_, s) => crearRng((seed * 31 + s) >>> 0));
  const registros = [];
  while (!E.fin && registros.length < hasta) {
    const respuestas = fns.map((fn, s) => (E.jugando[s] ? normalizarRespuesta(fn(E, s, rngs[s])) : null));
    registros.push(aplicarTurno(E, respuestas));
  }
  return { E, registros };
}
