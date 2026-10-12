// JUEGO 7: Triple dado (categoria "Estrategia de eliminación").
// Cuatro jugadores, 4 rondas. Cada ronda: cada uno predice en secreto su puntuacion con una tarjeta (ZERO, MIN, MORE o MAX; cada una se usa una sola vez),
// se lanzan 11 dados por jugador (9 blancos visibles y 2 ocultos) y se juegan 3 enfrentamientos de tres dados. Acertar la tarjeta da un premio. Al final,
// la pieza para el de mas puntos y la eliminacion para el de menos. Son 16 turnos; la prediccion de la ronda 4 no cuesta llamadas. Diseno: privado/spec/triple-dado-diseno.md.

import { crearEstado } from './tripledado/estado.js';
import { normalizarRespuesta } from './tripledado/ordenes.js';
import { aplicarTurno } from './tripledado/turno.js';
import { vistaTexto } from './tripledado/vista.js';
import { resultadoDe } from './tripledado/resultado.js';
import { REGLAS, FORMATO } from './tripledado/reglas-texto.js';
import { JUGADORES, RONDAS, TURNOS } from './tripledado/constantes.js';
import { evaluarSerie } from './tripledado/evaluacion.js';
import { BOTS, INFO_BOTS } from './tripledado-bots.js';

export default {
  id: 'tripledado',
  nombre: 'Triple dado', // entra en el prompt: sin acentos
  categoria: 'Estrategia de eliminación',
  jugadores: JUGADORES,
  minJugadores: JUGADORES,
  maxJugadores: JUGADORES,
  // Los dados y los reemplazos salen del seed: una serie de rotacion conserva los mismos dados por asiento.
  mismoSeedEnSerie: true,
  // Bots de control que la consola acepta por nombre: { id: { nombre, color, fn(estado, asiento, rng) } }
  bots: Object.fromEntries(Object.entries(BOTS).map(([id, fn]) => [id, { ...INFO_BOTS[id], fn }])),
  rondas: TURNOS, // turnos de la arena (4 por ronda): la arena corta una partida que no termina despues de TURNOS + 2
  versionReglas: 'tripledado-1.0.0',
  reglas: REGLAS,
  formatoRespuesta: FORMATO,

  crear: (rng) => crearEstado(rng),
  terminado: (E) => E.fin,
  vista: (E, i) => vistaTexto(E, i),
  normalizar: normalizarRespuesta,
  // jugadas[i] = respuesta normalizada (con `error` y `crudo` si los puso la arena); null si no se pregunto.
  aplicar: (E, jugadas) => aplicarTurno(E, jugadas),
  resultado: resultadoDe,
  // al final de la serie: caracteristicas de cada IA y un comentario del resultado (la consola lo imprime y lo guarda en la serie)
  evaluar: evaluarSerie,
  // a quien hay que preguntarle: a los cuatro, salvo en la prediccion de la ronda 4 (solo queda una tarjeta y se pone sola: ese turno no cuesta llamadas)
  activos: (E) => {
    const preguntar = !E.fin && !(E.fase === 'prediccion' && E.ronda === RONDAS);
    return Array(JUGADORES).fill(preguntar);
  },
};
