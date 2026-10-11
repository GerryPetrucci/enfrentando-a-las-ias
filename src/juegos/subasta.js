// JUEGO 5: Subasta de tiempo (categoria "Estrategia de eliminación").
// Cinco jugadores, un banco de 10 minutos cada uno y 19 subastas. Cada subasta responden cuantos segundos mantienen su apuesta (0 = retirarse);
// todas las apuestas se pagan, gana la mas alta si es unica y el empate en lo mas alto anula la subasta. Al final, la pieza para el de mas fichas
// y la eliminacion para el de menos. Una subasta = un turno de la arena. Diseno: privado/spec/subasta-tiempo-diseno.md.

import { crearEstado } from './subasta/estado.js';
import { normalizarRespuesta } from './subasta/ordenes.js';
import { aplicarTurno } from './subasta/turno.js';
import { vistaTexto } from './subasta/vista.js';
import { resultadoDe } from './subasta/resultado.js';
import { REGLAS, FORMATO } from './subasta/reglas-texto.js';
import { JUGADORES, SUBASTAS } from './subasta/constantes.js';
import { evaluarSerie } from './subasta/evaluacion.js';
import { BOTS, INFO_BOTS } from './subasta-bots.js';

export default {
  id: 'subasta',
  nombre: 'Subasta de tiempo',
  categoria: 'Estrategia de eliminación',
  jugadores: JUGADORES,
  minJugadores: JUGADORES,
  maxJugadores: JUGADORES,
  // No hay azar de partida (ni reemplazos al azar ni sorteos): una serie de rotacion conserva el mismo mundo.
  mismoSeedEnSerie: true,
  // Bots de control que la consola acepta por nombre: { id: { nombre, color, fn(estado, asiento, rng) } }
  bots: Object.fromEntries(Object.entries(BOTS).map(([id, fn]) => [id, { ...INFO_BOTS[id], fn }])),
  rondas: SUBASTAS, // turnos de la arena (1 por subasta): la arena corta una partida que no termina despues de SUBASTAS + 2
  versionReglas: 'subasta-1.0.0',
  reglas: REGLAS,
  formatoRespuesta: FORMATO,

  crear: (rng) => crearEstado(rng),
  terminado: (E) => E.fin,
  vista: (E, i) => vistaTexto(E, i),
  normalizar: normalizarRespuesta,
  // jugadas[i] = respuesta normalizada (con `error` y `crudo` si los puso la arena); null para quien ya no tiene tiempo.
  aplicar: (E, jugadas) => aplicarTurno(E, jugadas),
  resultado: resultadoDe,
  // al final de la serie: caracteristicas de cada IA y un comentario del resultado (la consola lo imprime y lo guarda en la serie)
  evaluar: evaluarSerie,
  // a quien hay que preguntarle: solo a los que aun tienen banco (quien lo agoto no cuesta llamadas)
  activos: (E) => E.bancos.map((b) => b > 0),
};
