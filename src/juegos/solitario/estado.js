// Estado inicial de una partida de El numero solitario. TODO lo aleatorio sale de aqui y del seed: la jugada de reemplazo de una
// respuesta ilegal, el sorteo de desempate y la semilla de la narracion. Despues de crear el estado no se vuelve a tocar el rng.

import { JUGADORES, RONDAS, CARTAS, CORTES } from './constantes.js';

const por = (v) => Array.from({ length: JUGADORES }, () => (typeof v === 'function' ? v() : v));
const statsVacias = () => ({ respuestas: 0, validas: 0, invalidas: 0, rondasGanadas: 0, anuladas: 0, senuelos: 0 });

export function crearEstado(rng) {
  const azar = Array.from({ length: RONDAS }, () => ({
    pareja: por(() => [rng(), rng()]),
    marca: por(() => rng()),
  }));
  const sorteo = Array.from({ length: CORTES.length + 1 }, () => por(() => rng()));
  const semillaNarracion = Math.floor(rng() * 4294967296);
  return {
    ronda: 1,
    fase: 1,
    fin: false,
    final: null,
    jugando: por(true), // sigue en la partida (ni a salvo ni eliminado)
    puesto: por(null), // 'pieza' | 'salvo' | 'medio' | 'eliminado' mientras no termine
    corteSalvo: por(null), // numero de corte (1 o 2) en que quedo a salvo
    puntos: por(0), // puntos de cartas acumulados
    fichas: por(0),
    ultimaVictoria: por(0), // ronda de su ultima victoria (0 = nunca)
    mano: por(() => [...CARTAS]), // cartas sin descartar (incluye la bloqueada)
    bloqueada: por(null), // la carta que no jugo en la ronda anterior
    descartadas: por(() => []), // las que ya jugo en este ciclo
    parejas: por(null), // parejas de la ronda en curso, ya reveladas (despues de la fase 1)
    azar,
    sorteo,
    semillaNarracion,
    stats: por(statsVacias),
    historial: [], // una entrada por ronda terminada
  };
}

// Cartas que puede elegir en la ronda: su mano sin la bloqueada.
export const disponibles = (E, i) => E.mano[i].filter((c) => c !== E.bloqueada[i]);
