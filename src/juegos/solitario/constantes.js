// Constantes de El numero solitario. Las reglas son las del original (dictadas por el usuario el 11 de octubre de 2026, con la
// opcion A de 12 rondas): aqui no hay perillas de balance.

export const JUGADORES = 5;
export const RONDAS = 12;
export const RONDAS_POR_CICLO = 6;
export const TURNOS = RONDAS * 2; // una fase = un turno de la arena
export const CARTAS = [1, 2, 3, 4, 5, 6, 7, 8];
export const CORTES = [3, 6]; // al final de estas rondas queda a salvo el de mas puntos
export const FINALISTAS = JUGADORES - CORTES.length;
// Puntos del marcador por puesto (no son los puntos de cartas): la pieza = mejor de la final.
export const PUESTO_PUNTOS = { pieza: 4, salvo: 3, medio: 2, eliminado: 0 };
export const LARGO_RAZON = 300;

export const cicloDe = (ronda) => Math.ceil(ronda / RONDAS_POR_CICLO);
