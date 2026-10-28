// JUEGO 2: Guerra de territorios (categoria "Estrategia y conquista").
// De 2 a 5 reinos sobre un mapa de regiones; todos dan ordenes a la vez durante 30 turnos. Detalle en el documento de diseno.

import { crearEstado } from './conquista/estado.js';
import { normalizarRespuesta } from './conquista/ordenes.js';
import { aplicarTurno } from './conquista/turno/index.js';
import { vistaTexto } from './conquista/vista.js';
import { resultadoDe } from './conquista/resultado.js';
import { nombresDeReinos } from './conquista/nombres.js';
import { evaluarSerie } from './conquista/evaluacion.js';
import { reconstruirPrompts } from './conquista/replay.js';
import { PRESENTACION, REGLAS, GUIA_ESTADO, FORMATO, EXPLICACION_RESPUESTA, ERRORES_FRECUENTES } from './conquista/reglas-texto.js';
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
  versionReglas: 'conquista-2.3.0', // 2.3.0 (28-10-2026): prompt COMPLETO (presentacion, orden del turno, ordenes con sintaxis, combate con ejemplo, como leer el estado, formato campo por campo, errores frecuentes); las reglas del motor NO cambian (privado/spec/guerra-prompt-2.3.0.md). 2.2.0 (26-10-2026): Maravilla de 25 de cada recurso, 3 turnos de obra y 7 de pie (privado/spec/guerra-maravilla-2.2.0.md). 2.1.1: auditoria del 25-10-2026: extincion mutua termina la partida, prioridad de la Maravilla simultanea, puntos, desempates, orden del turno y redondeos dentro del texto; el cerco 2.1.0 no cambia.
  // Secciones del prompt (el envoltorio comun es src/prompt.js; guia: docs/guia-de-prompts.md)
  presentacion: PRESENTACION,
  reglas: REGLAS,
  guiaDelEstado: GUIA_ESTADO,
  formatoRespuesta: FORMATO,
  explicacionDeRespuesta: EXPLICACION_RESPUESTA,
  erroresFrecuentes: ERRORES_FRECUENTES,

  crear: (rng, opciones = {}) => crearEstado(rng, opciones),
  // El nombre de reino de cada asiento sale del modelo que lo ocupa (nombres.js): la arena lo pide antes de crear la partida.
  opcionesDeAgentes: (agentes) => ({ nombres: nombresDeReinos(agentes.map((a) => a.id)) }),
  terminado: (E) => E.ganador !== null,
  vista: (E, i) => vistaTexto(E, i),
  normalizar: normalizarRespuesta, // (respuesta, estado): el estado le dice los nombres de reino de la partida
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
  reconstruirPrompts, // lo que vio cada IA en cada turno de una partida guardada (rejugada): lo usa la publicacion (src/publicar.js)
  evaluar: evaluarSerie, // al final de la serie: caracteristicas de cada IA y comentario (correr.js lo guarda y lo imprime)
  // a quien hay que preguntarle en el turno siguiente: solo a los reinos vivos (un reino caido no cuesta llamadas)
  activos: (E) => E.reinos.map((r) => r.vivo),
};
