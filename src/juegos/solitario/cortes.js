// Quien va arriba y como se desempata. Funciones puras: no tocan el estado.

import { JUGADORES } from './constantes.js';

const asientos = [...Array(JUGADORES).keys()];

// k = 0 y 1: los cortes. k = 2: la final. Es el indice del sorteo guardado en el estado.
export function clasificar(E, k) {
  return asientos
    .filter((s) => E.jugando[s])
    .map((s) => ({ s, puntos: E.puntos[s], fichas: E.fichas[s], ultimaVictoria: E.ultimaVictoria[s], sorteo: E.sorteo[k][s] }))
    .sort((a, b) => b.puntos - a.puntos || b.fichas - a.fichas || b.ultimaVictoria - a.ultimaVictoria || a.sorteo - b.sorteo);
}

// Que criterio separo al primero del segundo (para contarlo en la narracion y en los datos).
export function criterioEntre(a, b) {
  if (a.puntos !== b.puntos) return 'puntos';
  if (a.fichas !== b.fichas) return 'fichas';
  if (a.ultimaVictoria !== b.ultimaVictoria) return 'ultima victoria';
  return 'sorteo';
}

// Los de mas puntos entre los que siguen jugando (vacio si nadie ha puntuado).
export function lideres(E) {
  const vivos = asientos.filter((s) => E.jugando[s]);
  const max = Math.max(0, ...vivos.map((s) => E.puntos[s]));
  return max === 0 ? [] : vivos.filter((s) => E.puntos[s] === max);
}
