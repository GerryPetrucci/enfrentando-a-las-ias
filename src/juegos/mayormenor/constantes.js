// Constantes de Mayor o menor. Las reglas son las dictadas por el usuario el 11 de octubre de 2026: aqui no hay perillas de balance.

export const JUGADORES = 2;
export const RONDAS = 18;
export const FICHAS = 10; // fichas de apuesta con que empieza cada jugador
export const CARTAS = Array.from({ length: 11 }, (_, i) => i); // cartas de cada jugador: 0 a 10
export const CARTAS_CRUPIER = Array.from({ length: 9 }, (_, i) => i + 1); // cada mazo del crupier: 1 a 9
// Puntos del marcador por partida (no son las fichas): ganador 4, perdedor 0, empate 2 y 2.
export const PUNTOS = { gana: 4, empata: 2, pierde: 0 };
export const LARGO_RAZON = 300;

// Quien es el jugador activo en la ronda r (1 a 18): el asiento 0 en las impares y el 1 en las pares.
export const activoDe = (ronda) => (ronda % 2 === 1 ? 0 : 1);
