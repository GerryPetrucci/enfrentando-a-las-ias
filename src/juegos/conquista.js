// JUEGO 2: Guerra de territorios (categoria "Estrategia y conquista").
// De 2 a 5 reinos sobre un mapa de regiones; todos dan ordenes a la vez durante 30 turnos. Detalle en el documento de diseno.

import { crearEstado } from './conquista/estado.js';
import { normalizarRespuesta } from './conquista/ordenes.js';
import { aplicarTurno } from './conquista/turno/index.js';
import { vistaTexto } from './conquista/vista.js';
import { resultadoDe } from './conquista/resultado.js';
import { REGLAS, FORMATO } from './conquista/reglas-texto.js';
import { TURNOS } from './conquista/constantes.js';
import { BOTS, INFO_BOTS } from './conquista-bots.js';

// Cuantos caracteres de la respuesta cruda se guardan cuando una respuesta fue invalida (para ver por que).
const LARGO_CRUDO = 400;

export default {
  id: 'conquista',
  nombre: 'Guerra de territorios',
  categoria: 'Estrategia y conquista',
  jugadores: 4, // por defecto; crear(rng, { jugadores }) acepta de 2 a 5
  minJugadores: 2,
  maxJugadores: 5,
  // Una serie de rotacion conserva el mapa (mismo seed en todas las partidas) y solo cambia los asientos.
  mismoSeedEnSerie: true,
  // Bots de control que la consola acepta por nombre: { id: { nombre, color, fn(estado, asiento, rng) } }
  bots: Object.fromEntries(Object.entries(BOTS).map(([id, fn]) => [id, { ...INFO_BOTS[id], fn }])),
  rondas: TURNOS,
  versionReglas: 'conquista-1.1.0', // 1.1.0: Maravilla x1.5 de costo y 8 turnos de cuenta (18 de octubre de 2026)
  reglas: REGLAS,
  formatoRespuesta: FORMATO,

  crear: (rng, opciones = {}) => crearEstado(rng, opciones),
  terminado: (E) => E.ganador !== null,
  vista: (E, i) => vistaTexto(E, i),
  normalizar: normalizarRespuesta,
  // jugadas[s] = respuesta normalizada (con `error` y `crudo` si las puso la arena); null para los reinos caidos.
  // Ademas del registro del motor se guarda lo que el espectador ve: la razon de cada IA, sus ordenes, su propuesta de pacto,
  // la causa si la respuesta fue invalida y el error de la API (los fallos se registran, no se esconden).
  aplicar: (E, jugadas) => {
    const registro = aplicarTurno(E, jugadas);
    registro.errores = jugadas.map((j) => j?.error ?? null);
    registro.respuestas = jugadas.map((j) => (j ? {
      ordenes: j.invalida ? [] : j.ordenes.map((o) => o.texto),
      pactoCon: j.pactoCon, razon: j.razon, invalida: j.invalida, motivo: j.motivo,
      crudo: j.invalida && typeof j.crudo === 'string' ? j.crudo.slice(0, LARGO_CRUDO) : null,
    } : null));
    return registro;
  },
  resultado: resultadoDe,
  // a quien hay que preguntarle en el turno siguiente: solo a los reinos vivos (un reino caido no cuesta llamadas)
  activos: (E) => E.reinos.map((r) => r.vivo),
};
