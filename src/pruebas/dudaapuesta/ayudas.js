// Ayudas compartidas por las pruebas de Duda y apuesta. No es un archivo de pruebas.
import { crearRng } from '../../rng.js';
import { crearEstado, actorDe } from '../../juegos/dudaapuesta/estado.js';
import { normalizarRespuesta } from '../../juegos/dudaapuesta/ordenes.js';
import { aplicarTurno } from '../../juegos/dudaapuesta/turno.js';
import { JUGADORES } from '../../juegos/dudaapuesta/constantes.js';

export const nuevoEstado = (seed = 7) => crearEstado(crearRng(seed));

// Fija las cartas que recibiria un asiento en una mano (siempre 5; solo cuentan las que le dan sus espacios).
export function fijarCartas(E, s, cartas, mano = E.mano) {
  E.manos[mano - 1][s] = [...cartas];
}

// Mano 1 conocida (5 espacios cada uno): rojo cuenta 6 (J1 2, J2 2, J3 0, J4 2) y azul cuenta 6 (J1 1, J2 3, J3 0, J4 2), con las arcoiris incluidas.
export function escenarioBasico(E) {
  fijarCartas(E, 0, ['rojo', 'rojo', 'azul', 'verde', 'amarillo']);
  fijarCartas(E, 1, ['rojo', 'arcoiris', 'azul', 'azul', 'verde']);
  fijarCartas(E, 2, ['morado', 'morado', 'amarillo', 'verde', 'verde']);
  fijarCartas(E, 3, ['arcoiris', 'amarillo', 'azul', 'rojo', 'morado']);
}

// Aplica la respuesta cruda del jugador al que le toca (los demas no responden, como en la arena).
export function paso(E, cruda, extra = {}) {
  const r = Array(JUGADORES).fill(null);
  r[actorDe(E)] = { ...normalizarRespuesta(cruda), ...extra };
  return aplicarTurno(E, r);
}

export const anunciar = (E, color, cantidad, fichas = 1, espacios = 0, resto = {}) => paso(E, { accion: 'anunciar', color, cantidad, fichas, espacios, razon: 'prueba', ...resto });
export const aceptar = (E, color, cantidad, fichas = 1, espacios = 0, resto = {}) => paso(E, { accion: 'aceptar', color, cantidad, fichas, espacios, razon: 'prueba', ...resto });
export const dudar = (E, fichas, espacios, resto = {}) => paso(E, { accion: 'dudar', ...(fichas === undefined ? {} : { fichas, espacios: espacios ?? 0 }), razon: 'prueba', ...resto });
export const igualar = (E, resto = {}) => paso(E, { accion: 'igualar', razon: 'prueba', ...resto });
export const retirarse = (E, resto = {}) => paso(E, { accion: 'retirarse', razon: 'prueba', ...resto });

// Politica sencilla de prueba: abre con 1 rojo y 1 ficha, duda siempre y nunca sube.
export const politicaSimple = (E) => (E.fase === 'anuncio'
  ? { accion: 'anunciar', color: 'rojo', cantidad: 1, fichas: 1, espacios: 0, razon: 'prueba' }
  : E.fase === 'respuesta' ? { accion: 'dudar', razon: 'prueba' } : { accion: 'igualar', razon: 'prueba' });

// Una partida entera sin la arena: fns[s](E, s, rng) -> respuesta cruda del que decide. Devuelve el estado, los registros y las llamadas (una por turno).
// `fichas` cambia las fichas de juego iniciales (para que nadie se elimine y la partida llegue lejos).
export function jugarConBots(seed, fns, { hasta = Infinity, fichas = null } = {}) {
  const E = nuevoEstado(seed);
  if (fichas !== null) E.fichas = Array(JUGADORES).fill(fichas);
  const rngs = fns.map((_, s) => crearRng((seed * 31 + s) >>> 0));
  const registros = [];
  while (!E.fin && registros.length < hasta) {
    const s = actorDe(E);
    const respuestas = Array(JUGADORES).fill(null);
    respuestas[s] = normalizarRespuesta(fns[s](E, s, rngs[s]));
    registros.push(aplicarTurno(E, respuestas));
  }
  return { E, registros, llamadas: registros.length };
}
