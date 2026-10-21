// Constantes de Mayor o menor. Las reglas 1.0.0 son las dictadas por el usuario el 11 de octubre de 2026; las 2.0.0 (21 de octubre de 2026, abajo) cambian cuatro cosas para que cualquiera pueda ganar.
// Las perillas de REGLAS_* existen para medir cada cambio por separado con los bots; el juego usa REGLAS_ACTIVAS.

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

// ---- Reglas 2.0.0 (21 de octubre de 2026): que cualquiera pueda ganar. Privado: privado/spec/mayor-o-menor-balance.md ----
// Decidido con la medicion con bots (privado/spec/mayor-o-menor-medicion.md): el tope por el rival casi no ayudaba; un tope fijo de apuesta si.
//   topeFijo      nadie apuesta mas de TOPE_APUESTA fichas en una ronda (0 = sin tope)
//   igualEsMenor  la carta igual a la del crupier cuenta como «menor» (se acaba el escudo del empate)
//   manoOculta    mazo de 33 cartas (3 de cada numero): cada jugador recibe 11 al azar y en secreto
//   dobles        cuantas rondas dobles se sortean (una por franja de BANDAS_DOBLES): las ganancias se pagan al doble
//   topeRival     (solo para medir; el juego no la usa) nadie apuesta mas fichas de las que tiene su rival
export const TOPE_APUESTA = 6;
export const REGLAS_1_0 = Object.freeze({ version: 'mayormenor-1.0.0', topeFijo: 0, igualEsMenor: false, manoOculta: false, dobles: 0, topeRival: false });
export const REGLAS_2_0 = Object.freeze({ version: 'mayormenor-2.0.0', topeFijo: TOPE_APUESTA, igualEsMenor: true, manoOculta: true, dobles: 3, topeRival: false });
export const REGLAS_ACTIVAS = REGLAS_2_0;
export const COPIAS_MAZO = 3; // con la mano oculta: copias de cada carta del 0 al 10 en el mazo que se reparte
export const BANDAS_DOBLES = [[3, 6], [8, 12], [14, 18]]; // la ronda doble de cada franja se sortea con el seed
