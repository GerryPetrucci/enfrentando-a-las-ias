// Estado inicial de una partida de Duda y apuesta. TODO lo aleatorio sale de aqui y del seed: las cartas de las 16 manos (se reparten de antemano POR ASIENTO, asi no
// dependen de las decisiones y una serie de rotacion repite las mismas cartas por asiento), los sorteos de las jugadas de reemplazo de una respuesta ilegal y la
// semilla de la narracion. Despues de crear el estado no se vuelve a tocar el rng.
//
// Los espacios para cartas son SIEMPRE fichas de espacio + 1 (empiezan 4 fichas y 5 espacios): por eso el estado solo guarda las fichas de espacio.

import { JUGADORES, MAZO, MANOS, ESPACIOS_MAX, FICHAS, FICHAS_ESPACIO_MAX, ANUNCIOS_MAX, TURNOS } from './constantes.js';

const por = (v) => Array.from({ length: JUGADORES }, () => (typeof v === 'function' ? v() : v));
const statsVacias = () => ({
  respuestas: 0, validas: 0, invalidas: 0, // obediencia
  anuncios: 0, anunciosFalsos: 0, // anuncios que eligio la IA (anunciar o aceptar) y los que no se cumplian con las cartas reales
  dudas: 0, dudasGanadas: 0, // dudas que eligio la IA y las que acabaron a su favor (incluida la retirada del rival)
  retiradas: 0, // veces que se retiro
  manosJugadas: 0, manosGanadas: 0, // enfrentamientos en que participo (como quien anuncio o como quien dudo)
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
  // manos[h - 1][s] = las 5 cartas que recibiria el asiento s en la mano h; solo cuentan las primeras `espacios(E, s)`
  const manos = Array.from({ length: MANOS }, () => {
    const mazo = barajar(rng, MAZO);
    return Array.from({ length: JUGADORES }, (_, s) => mazo.slice(s * ESPACIOS_MAX, (s + 1) * ESPACIOS_MAX));
  });
  const azar = Array.from({ length: TURNOS + 2 }, () => [rng(), rng(), rng()]); // sorteos de la jugada de reemplazo de cada turno
  const semillaNarracion = Math.floor(rng() * 4294967296);
  return {
    mano: 1,
    decision: 1, // numero de decision dentro de la mano
    turno: 0, // turnos (decisiones) ya jugados en toda la partida
    fase: 'anuncio', // 'anuncio' (abre la mano) | 'respuesta' (acepta o duda) | 'defensa' (le subieron la apuesta: iguala o se retira)
    inicia: 0, // asiento que abre la mano en curso
    cadena: [], // anuncios de la mano en curso: { asiento, color, cantidad, apuesta: { fichas, espacios }, reemplazo }
    duda: null, // { asiento, apuesta, reemplazo } de la duda en curso
    defensa: null, // { accion, reemplazo } cuando quien anuncio respondio a la subida
    pideEspacio: por(false), // pidio comprar un espacio durante la mano en curso (se aplica al cerrar la mano)
    fin: false,
    final: null,
    fichas: por(FICHAS), // fichas de juego: llegar a 0 es quedar eliminado
    fichasEspacio: por(FICHAS_ESPACIO_MAX),
    historial: [], // una entrada PUBLICA por mano terminada
    puesto: por(null), // 'pieza' | 'medio' | 'eliminado' al terminar
    manos,
    azar,
    semillaNarracion,
    stats: por(statsVacias),
  };
}

export const espacios = (E, s) => E.fichasEspacio[s] + 1;
// Las cartas de s en la mano en curso (solo el las ve; el publico las ve en el registro `oculto`).
export const cartasDe = (E, s) => E.manos[E.mano - 1][s].slice(0, espacios(E, s));
export const totalCartas = (E) => Array.from({ length: JUGADORES }, (_, s) => espacios(E, s)).reduce((a, b) => a + b, 0);
// Todas las fichas que tiene s (de juego y de espacio): lo maximo que puede poner en una apuesta.
export const totalFichas = (E, s) => E.fichas[s] + E.fichasEspacio[s];
// El asiento al que le toca decidir ahora.
export function actorDe(E) {
  const ult = E.cadena.at(-1);
  if (E.fase === 'anuncio') return E.inicia;
  if (E.fase === 'respuesta') return (ult.asiento + 1) % JUGADORES;
  return ult.asiento; // defensa
}
// Se puede aceptar el ultimo anuncio: quedan anuncios y todavia cabe una cantidad mayor.
export const puedeAceptar = (E) => E.cadena.length > 0 && E.cadena.length < ANUNCIOS_MAX && E.cadena.at(-1).cantidad < totalCartas(E);
// Maximo que s puede apostar frente a r: nunca mas fichas de las que tiene cualquiera de los dos (asi r siempre puede igualar).
export const limiteApuesta = (E, s, r) => Math.min(totalFichas(E, s), totalFichas(E, r));
// Cuantas cartas cuentan para un color en la mano en curso (las arcoiris cuentan como cualquier color), por jugador.
export const cuentasDe = (E, color) => Array.from({ length: JUGADORES }, (_, s) => cartasDe(E, s).filter((c) => c === color || c === 'arcoiris').length);
