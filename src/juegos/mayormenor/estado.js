// Estado inicial de una partida de Mayor o menor. TODO lo aleatorio sale de aqui y del seed: el orden de los dos mazos del crupier, la jugada
// de reemplazo de una respuesta ilegal y la semilla de la narracion. Despues de crear el estado no se vuelve a tocar el rng.

import { JUGADORES, RONDAS, FICHAS, CARTAS, CARTAS_CRUPIER, activoDe } from './constantes.js';

const por = (v) => Array.from({ length: JUGADORES }, () => (typeof v === 'function' ? v() : v));
const statsVacias = () => ({
  respuestas: 0, validas: 0, invalidas: 0, // obediencia
  apuestas: 0, aciertos: 0, fichasApostadas: 0, apostoTodo: 0, // como predictor (solo apuestas que eligio la IA)
  rondasActivo: 0, fichasActivo: 0, // como activo
});

// Fisher-Yates con el rng recibido.
function barajar(rng, cartas) {
  const m = [...cartas];
  for (let i = m.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [m[i], m[j]] = [m[j], m[i]];
  }
  return m;
}

export function crearEstado(rng) {
  const crupier = por(() => barajar(rng, CARTAS_CRUPIER)); // mazo del crupier de cada asiento, en orden de salida (el futuro es secreto)
  const azar = Array.from({ length: RONDAS }, () => ({ carta: rng(), lado: rng() })); // sorteos de reemplazo por ronda
  const semillaNarracion = Math.floor(rng() * 4294967296);
  return {
    ronda: 1,
    fin: false,
    final: null,
    fichas: por(FICHAS),
    mano: por(() => [...CARTAS]), // cartas que le quedan a cada jugador (publico: las jugadas se ven)
    jugadas: por(() => []), // cartas que ya jugo cada uno, en orden
    crupier,
    crupierSalidas: por(() => []), // cartas del crupier ya reveladas, por mazo y en orden de salida
    historial: [], // una entrada PUBLICA por ronda terminada
    azar,
    semillaNarracion,
    stats: por(statsVacias),
  };
}

// La carta que el crupier revela en la ronda en curso: la siguiente del mazo del jugador activo.
export function crupierDeRonda(E) {
  const a = activoDe(E.ronda);
  return E.crupier[a][E.crupierSalidas[a].length];
}

// Cartas del mazo del crupier del asiento s que siguen SIN conocerse: ni salieron ni es la de esta ronda. Es un conjunto ordenado: no dice nada del orden.
export function crupierFaltan(E, s) {
  const conocidas = new Set(E.crupierSalidas[s]);
  if (!E.fin && activoDe(E.ronda) === s) conocidas.add(crupierDeRonda(E));
  return CARTAS_CRUPIER.filter((c) => !conocidas.has(c));
}
