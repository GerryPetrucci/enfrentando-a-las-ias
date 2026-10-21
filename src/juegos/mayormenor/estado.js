// Estado inicial de una partida de Mayor o menor. TODO lo aleatorio sale de aqui y del seed: el orden de los dos mazos del crupier, la jugada
// de reemplazo de una respuesta ilegal y la semilla de la narracion. Despues de crear el estado no se vuelve a tocar el rng.

import { JUGADORES, RONDAS, FICHAS, CARTAS, CARTAS_CRUPIER, COPIAS_MAZO, BANDAS_DOBLES, REGLAS_ACTIVAS, activoDe } from './constantes.js';

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

// El mazo que se reparte con la mano oculta: COPIAS_MAZO copias de cada carta del 0 al 10. Sin mano oculta no hay reparto: cada jugador tiene las 11 cartas.
export const mazoCompleto = (reglas = REGLAS_ACTIVAS) => (reglas.manoOculta ? CARTAS.flatMap((c) => Array(COPIAS_MAZO).fill(c)) : [...CARTAS]);

export function crearEstado(rng, reglas = REGLAS_ACTIVAS) {
  const crupier = por(() => barajar(rng, CARTAS_CRUPIER)); // mazo del crupier de cada asiento, en orden de salida (el futuro es secreto)
  const azar = Array.from({ length: RONDAS }, () => ({ carta: rng(), lado: rng() })); // sorteos de reemplazo por ronda
  const semillaNarracion = Math.floor(rng() * 4294967296);
  // lo de las reglas 2.0.0 se sortea DESPUES de todo lo anterior: el mundo de un seed (mazos del crupier, reemplazos, narracion) no cambia con las perillas
  let mano = por(() => [...CARTAS]);
  if (reglas.manoOculta) {
    const barajado = barajar(rng, mazoCompleto(reglas));
    mano = [0, 1].map((s) => barajado.slice(s * CARTAS.length, (s + 1) * CARTAS.length).sort((x, y) => x - y)); // 11 cada uno, ordenadas para leerse
  }
  const dobles = BANDAS_DOBLES.slice(0, reglas.dobles).map(([desde, hasta]) => desde + Math.floor(rng() * (hasta - desde + 1)));
  return {
    reglas,
    dobles, // rondas en que las ganancias se pagan al doble (publico: se dicen al empezar)
    ronda: 1,
    fin: false,
    final: null,
    fichas: por(FICHAS),
    mano, // cartas que le quedan a cada jugador (con la mano oculta, secretas para el rival)
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

// Lo maximo que puede apostar el predictor p: sus fichas, sin pasar del tope fijo (reglas 2.0.0: 6) y, solo al medir variantes, sin pasar de las fichas de su rival.
export const apuestaMaxima = (E, p) => {
  const base = E.reglas.topeRival ? Math.min(E.fichas[p], E.fichas[1 - p]) : E.fichas[p];
  return E.reglas.topeFijo ? Math.min(base, E.reglas.topeFijo) : base;
};

// Las cartas que el jugador i NO conoce: el mazo menos su mano y menos lo que su rival ya jugo. De ahi sale el resto de la mano del rival (11 menos las que ya jugo),
// junto con las que no se reparten. Con la mano publica no se desconoce nada. Publico: solo usa la mano de i y las jugadas.
export function cartasDesconocidas(E, i) {
  if (!E.reglas.manoOculta) return [];
  const resto = mazoCompleto(E.reglas);
  for (const c of [...E.mano[i], ...E.jugadas[i], ...E.jugadas[1 - i]]) resto.splice(resto.indexOf(c), 1);
  return resto.sort((x, y) => x - y);
}
