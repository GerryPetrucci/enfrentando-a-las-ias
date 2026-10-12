// Estado inicial de una partida de Subasta de tiempo. No hay azar de partida (ni jugadas de reemplazo al azar ni sorteos): lo unico que sale del
// seed es la semilla de la narracion. Todos los tiempos, en decimas enteras.

import { JUGADORES, BANCO } from './constantes.js';

const por = (v) => Array.from({ length: JUGADORES }, () => (typeof v === 'function' ? v() : v));
const statsVacias = () => ({ respuestas: 0, validas: 0, invalidas: 0, retiradas: 0, ganadas: 0, empates: 0, todoElBanco: 0 });

export function crearEstado(rng) {
  const semillaNarracion = Math.floor(rng() * 4294967296);
  return {
    subasta: 1,
    fin: false,
    final: null,
    bancos: por(BANCO), // decimas que le quedan a cada uno (los demas NO lo ven)
    fichas: por(0), // fichas de victoria (publicas: se anuncia quien gana)
    apostado: por(0), // decimas gastadas en total
    apuestas: por(() => []), // la apuesta de cada subasta, por jugador (solo el propio jugador la ve)
    puesto: por(null), // 'pieza' | 'medio' | 'eliminado' al terminar
    stats: por(statsVacias),
    historial: [], // una entrada PUBLICA por subasta: { subasta, ganador, sinGanador }
    semillaNarracion,
  };
}
