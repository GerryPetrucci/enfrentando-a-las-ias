// JUEGO 4: El numero solitario (categoria "Estrategia de eliminación").
// Cinco jugadores, 8 cartas cada uno, 12 rondas. Cada ronda eligen una pareja de cartas, ven las parejas de los demas y marcan
// cual juegan; gana el menor numero que nadie mas jugo. Dos cortes a salvo (rondas 3 y 6) y una final de tres (ronda 12).
// Cada ronda son dos turnos de la arena (una fase cada uno). Diseno: privado/spec/numero-solitario-diseno.md.

import { crearEstado } from './solitario/estado.js';
import { normalizarRespuesta } from './solitario/ordenes.js';
import { aplicarTurno } from './solitario/turno.js';
import { vistaTexto } from './solitario/vista.js';
import { resultadoDe } from './solitario/resultado.js';
import { REGLAS, FORMATO } from './solitario/reglas-texto.js';
import { JUGADORES, TURNOS } from './solitario/constantes.js';
import { evaluarSerie } from './solitario/evaluacion.js';
import { BOTS, INFO_BOTS } from './solitario-bots.js';

export default {
  id: 'solitario',
  nombre: 'El numero solitario', // entra en el prompt: sin acentos
  categoria: 'Estrategia de eliminación',
  jugadores: JUGADORES,
  minJugadores: JUGADORES,
  maxJugadores: JUGADORES,
  // Casi no hay azar (solo el sorteo de desempate y la jugada de reemplazo): una serie de rotacion conserva el mismo mundo.
  mismoSeedEnSerie: true,
  // Bots de control que la consola acepta por nombre: { id: { nombre, color, fn(estado, asiento, rng) } }
  bots: Object.fromEntries(Object.entries(BOTS).map(([id, fn]) => [id, { ...INFO_BOTS[id], fn }])),
  rondas: TURNOS, // turnos de la arena (2 por ronda): la arena corta una partida que no termina despues de TURNOS + 2
  versionReglas: 'solitario-1.0.0',
  reglas: REGLAS,
  formatoRespuesta: FORMATO,

  crear: (rng) => crearEstado(rng),
  terminado: (E) => E.fin,
  vista: (E, i) => vistaTexto(E, i),
  normalizar: normalizarRespuesta,
  // jugadas[i] = respuesta normalizada (con `error` y `crudo` si los puso la arena); null para quien ya no juega.
  aplicar: (E, jugadas) => aplicarTurno(E, jugadas),
  resultado: resultadoDe,
  // al final de la serie: caracteristicas de cada IA y un comentario del resultado (la consola lo imprime y lo guarda en la serie)
  evaluar: evaluarSerie,
  // a quien hay que preguntarle: solo a los que siguen en juego (quien quedo a salvo no cuesta llamadas)
  activos: (E) => [...E.jugando],
};
