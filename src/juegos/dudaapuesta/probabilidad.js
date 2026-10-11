// Probabilidades exactas del mazo (hipergeometrica). Las usan los bots de control y las pruebas; las IAs no reciben esto (no se les da estrategia).
//
// Un anuncio "al menos n cartas de un color" cuenta las del color y las arcoiris: 20 de las 60 cartas "cuentan" para cualquier color.

import { MAZO, CARTAS_POR_TIPO, ARCOIRIS } from './constantes.js';
import { cartasDe, espacios, totalCartas } from './estado.js';

const N = MAZO.length; // 60
const CUENTAN = 2 * CARTAS_POR_TIPO; // 20 cartas cuentan para cualquier color

// C(n, k) por el triangulo de Pascal, hasta 60.
const C = Array.from({ length: N + 1 }, () => Array(N + 1).fill(0));
for (let n = 0; n <= N; n++) {
  C[n][0] = 1;
  for (let k = 1; k <= n; k++) C[n][k] = C[n - 1][k - 1] + (C[n - 1][k] ?? 0);
}

// P(X >= x) con X hipergeometrica: poblacion M, K exitos, d extracciones.
export function pAlMenos(x, M, K, d) {
  if (x <= 0) return 1;
  if (x > Math.min(K, d)) return 0;
  let p = 0;
  for (let j = x; j <= Math.min(K, d); j++) p += (C[K][j] * C[M - K][d - j]) / C[M][d];
  return p;
}

// Cuantas cartas de mi mano cuentan para el color.
export const cuentoYo = (E, s, color) => cartasDe(E, s).filter((c) => c === color || c === ARCOIRIS).length;

// Probabilidad (desde las cartas de s) de que entre TODAS las cartas haya al menos n del color. Solo usa lo que s ve.
export function pTotalAlMenos(E, s, color, n) {
  const m = cuentoYo(E, s, color), propias = espacios(E, s);
  return pAlMenos(n - m, N - propias, CUENTAN - m, totalCartas(E) - propias);
}
