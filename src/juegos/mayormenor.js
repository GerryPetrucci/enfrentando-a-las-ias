// JUEGO 6: Mayor o menor (categoria "Estrategia de eliminación").
// Dos jugadores, 11 cartas del 0 al 10 y 10 fichas cada uno, y 18 rondas. En cada ronda el crupier revela una carta de su mazo (9 cartas del 1 al 9
// por jugador); el jugador activo juega una carta boca abajo y el predictor apuesta si sera mayor o menor, a la vez. Gana quien termina con mas fichas.
// Cada ronda es un turno de la arena con dos llamadas. Diseno: privado/spec/mayor-o-menor-diseno.md.

import { crearEstado } from './mayormenor/estado.js';
import { normalizarRespuesta } from './mayormenor/ordenes.js';
import { aplicarTurno } from './mayormenor/turno.js';
import { vistaTexto } from './mayormenor/vista.js';
import { resultadoDe } from './mayormenor/resultado.js';
import { REGLAS, FORMATO } from './mayormenor/reglas-texto.js';
import { JUGADORES, RONDAS } from './mayormenor/constantes.js';
import { evaluarSerie } from './mayormenor/evaluacion.js';
import { BOTS, INFO_BOTS } from './mayormenor-bots.js';

export default {
  id: 'mayormenor',
  nombre: 'Mayor o menor', // entra en el prompt: sin acentos
  categoria: 'Estrategia de eliminación',
  jugadores: JUGADORES,
  minJugadores: JUGADORES,
  maxJugadores: JUGADORES,
  // El orden de los mazos del crupier y los reemplazos salen del seed: una serie de rotacion conserva el mismo mundo.
  mismoSeedEnSerie: true,
  // Bots de control que la consola acepta por nombre: { id: { nombre, color, fn(estado, asiento, rng) } }
  bots: Object.fromEntries(Object.entries(BOTS).map(([id, fn]) => [id, { ...INFO_BOTS[id], fn }])),
  rondas: RONDAS, // turnos de la arena (1 por ronda): la arena corta una partida que no termina despues de RONDAS + 2
  versionReglas: 'mayormenor-1.0.0',
  reglas: REGLAS,
  formatoRespuesta: FORMATO,

  crear: (rng) => crearEstado(rng),
  terminado: (E) => E.fin,
  vista: (E, i) => vistaTexto(E, i),
  normalizar: normalizarRespuesta,
  // jugadas[i] = respuesta normalizada (con `error` y `crudo` si los puso la arena).
  aplicar: (E, jugadas) => aplicarTurno(E, jugadas),
  resultado: resultadoDe,
  // al final de la serie: caracteristicas de cada IA y un comentario del resultado (la consola lo imprime y lo guarda en la serie)
  evaluar: evaluarSerie,
  // a quien hay que preguntarle: a los dos, mientras la partida siga (el activo juega una carta y el predictor apuesta a la vez)
  activos: (E) => [!E.fin, !E.fin],
};
