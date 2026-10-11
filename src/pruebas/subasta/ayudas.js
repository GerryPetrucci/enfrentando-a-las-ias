// Ayudas compartidas por las pruebas de Subasta de tiempo. No es un archivo de pruebas.
import { crearRng } from '../../rng.js';
import { crearEstado } from '../../juegos/subasta/estado.js';
import { normalizarRespuesta } from '../../juegos/subasta/ordenes.js';
import { aplicarTurno } from '../../juegos/subasta/turno.js';

export const nuevoEstado = (seed = 7) => crearEstado(crearRng(seed));

// respuesta ya normalizada, como la recibe aplicarTurno (segundos)
export const apuesta = (segundos) => normalizarRespuesta({ apuesta: segundos, razon: 'prueba' });

// Una subasta con apuestas fijas en segundos; null = ese jugador no juega (la arena le pasa null porque no tiene tiempo).
export function subasta(E, apuestas) {
  return aplicarTurno(E, apuestas.map((x) => (x === null ? null : apuesta(x))));
}

// Una partida entera de bots (sin la arena): fns[s](E, s, rng) -> respuesta cruda. Devuelve el estado y los registros.
export function jugarConBots(seed, fns, { hasta = Infinity } = {}) {
  const E = nuevoEstado(seed);
  const rngs = fns.map((_, s) => crearRng((seed * 31 + s) >>> 0));
  const registros = [];
  while (!E.fin && registros.length < hasta) {
    const respuestas = fns.map((fn, s) => (E.bancos[s] > 0 ? normalizarRespuesta(fn(E, s, rngs[s])) : null));
    registros.push(aplicarTurno(E, respuestas));
  }
  return { E, registros };
}
