// JUEGO 8: Duda y apuesta (categoria "Engaño y deducción").
// Cuatro jugadores, un mazo de 60 cartas con arcoiris comodin. Cada mano: se anuncia "hay al menos N cartas de un color entre todos" y se apuesta; el siguiente acepta
// (subiendo el anuncio) o duda, y quien duda puede subir la apuesta; se igualan y se revelan las cartas, o quien anuncio se retira. Gana quien conserva sus fichas: la partida
// termina cuando alguien se queda sin fichas de juego o tras la mano 16. Es el unico juego secuencial: un turno = una decision de un solo jugador (hasta 96 llamadas).
// Diseno: privado/spec/duda-y-apuesta-diseno.md.

import { crearEstado, actorDe } from './dudaapuesta/estado.js';
import { normalizarRespuesta } from './dudaapuesta/ordenes.js';
import { aplicarTurno } from './dudaapuesta/turno.js';
import { vistaTexto } from './dudaapuesta/vista.js';
import { resultadoDe } from './dudaapuesta/resultado.js';
import { REGLAS, FORMATO } from './dudaapuesta/reglas-texto.js';
import { JUGADORES, TURNOS } from './dudaapuesta/constantes.js';
import { BOTS, INFO_BOTS } from './dudaapuesta-bots.js';

export default {
  id: 'dudaapuesta',
  nombre: 'Duda y apuesta', // entra en el prompt: sin acentos
  categoria: 'Engaño y deducción',
  jugadores: JUGADORES,
  minJugadores: JUGADORES,
  maxJugadores: JUGADORES,
  // Las cartas y los reemplazos salen del seed: una serie de rotacion conserva las mismas cartas por asiento.
  mismoSeedEnSerie: true,
  // Bots de control que la consola acepta por nombre: { id: { nombre, color, fn(estado, asiento, rng) } }
  bots: Object.fromEntries(Object.entries(BOTS).map(([id, fn]) => [id, { ...INFO_BOTS[id], fn }])),
  rondas: TURNOS, // turnos de la arena (1 por decision): la arena corta una partida que no termina despues de TURNOS + 2
  versionReglas: 'dudaapuesta-1.0.0',
  reglas: REGLAS,
  formatoRespuesta: FORMATO,

  crear: (rng) => crearEstado(rng),
  terminado: (E) => E.fin,
  vista: (E, i) => vistaTexto(E, i),
  normalizar: normalizarRespuesta,
  // jugadas[i] = respuesta normalizada (con `error` y `crudo` si los puso la arena); null si no se pregunto (solo se le pregunta a quien le toca).
  aplicar: (E, jugadas) => aplicarTurno(E, jugadas),
  resultado: resultadoDe,
  // a quien hay que preguntarle: solo al que le toca decidir (es un juego por turnos)
  activos: (E) => {
    const a = Array(JUGADORES).fill(false);
    if (!E.fin) a[actorDe(E)] = true;
    return a;
  },
};
