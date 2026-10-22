// Un turno completo de la Guerra de territorios, en el orden del diseno (seccion 3.2).

import { nuevoContexto } from './contexto.js';
import { recoleccion, honorYPactos, hambre, ordenesEconomicas, entregas } from './economia.js';
import { rupturas, pactosNuevos, mensajesYNotas } from './diplomacia.js';
import { movimientos } from './movimiento.js';
import { eventosDelMundo } from './mundo.js';
import { maravillaYVictoria, cerrarRegistro } from './cierre.js';

// jugadas[s]: respuesta ya normalizada de cada reino (null para los caidos o sin respuesta). Devuelve el registro del turno.
export function aplicarTurno(E, jugadas = []) {
  if (E.ganador !== null) throw new Error('la partida ya termino');
  const ctx = nuevoContexto(E, jugadas);
  eventosDelMundo(ctx);
  recoleccion(ctx);
  honorYPactos(ctx);
  hambre(ctx);
  ordenesEconomicas(ctx);
  entregas(ctx);
  rupturas(ctx);
  movimientos(ctx);
  pactosNuevos(ctx);
  mensajesYNotas(ctx);
  maravillaYVictoria(ctx);
  return cerrarRegistro(ctx);
}
