// Constantes de Duda y apuesta. Las reglas son las dictadas por el usuario el 11 de octubre de 2026; FICHAS, MANOS y el pago a la banca se calibraron con
// bots (privado/spec/duda-y-apuesta-diseno.md). Las fichas de juego (la "vida") se llaman FICHAS; la PIEZA es el premio del marcador.

export const JUGADORES = 4;
export const COLORES = ['rojo', 'amarillo', 'azul', 'verde', 'morado']; // los unicos que se pueden anunciar
export const ARCOIRIS = 'arcoiris'; // cuenta como cualquier color
export const CARTAS_POR_TIPO = 10; // 10 de cada color y 10 arcoiris: 60 cartas
export const MAZO = [...COLORES, ARCOIRIS].flatMap((c) => Array(CARTAS_POR_TIPO).fill(c));
export const ESPACIOS_MAX = 5; // los espacios son siempre fichas de espacio + 1: nunca menos de 1, nunca mas de 5
export const FICHAS_ESPACIO_MAX = ESPACIOS_MAX - 1; // 4: tambien las que se tienen al empezar
export const FICHAS = 3; // fichas de juego iniciales (decidido el 11 de octubre; respaldo: 4)
export const MANOS = 16; // tope de manos
export const ANUNCIOS_MAX = 4; // por mano; quien responde al cuarto debe dudar
export const PAGO_DESDE = 15; // al terminar las manos 15, 20, 25...: cada jugador paga una ficha de juego a la banca
export const PAGO_CADA = 5;
export const DECISIONES_MAX_POR_MANO = ANUNCIOS_MAX + 2; // 4 anuncios, la duda y la respuesta del que anuncio
export const TURNOS = MANOS * DECISIONES_MAX_POR_MANO; // 96: peor caso de turnos (= llamadas) de una partida
export const PUNTOS = { pieza: 4, medio: 2, eliminado: 0 }; // puntos del marcador por puesto
export const LARGO_RAZON = 300;
export const ACCIONES = ['anunciar', 'aceptar', 'dudar', 'igualar', 'retirarse'];
