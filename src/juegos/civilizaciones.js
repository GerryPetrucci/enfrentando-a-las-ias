// JUEGO 9: Carrera de civilizaciones (categoria "Desarrollo y civilización").
// Dos IAs fundan una civilizacion cada una, en mundos gemelos (mismo mapa, eventos y dados), y la llevan 30 turnos por 6 eras; gana el mayor Indice de Avance.
// Sin combate entre ellas. Detalle: privado/spec/civilizaciones-diseno.md (1.2.0).

import { crearEstado } from './civilizaciones/estado.js';
import { normalizarRespuesta } from './civilizaciones/ordenes.js';
import { aplicarTurno } from './civilizaciones/turno/index.js';
import { vistaTexto } from './civilizaciones/vista.js';
import { resultadoDe } from './civilizaciones/resultado.js';
import { REGLAS, FORMATO } from './civilizaciones/reglas-texto.js';
import { TURNOS, JUGADORES } from './civilizaciones/constantes.js';
import { BOTS, INFO_BOTS } from './civilizaciones-bots.js';

// Cuantos caracteres de la respuesta cruda se guardan cuando una respuesta fue invalida (para ver por que).
const LARGO_CRUDO = 400;

export default {
  id: 'civilizaciones',
  nombre: 'Carrera de civilizaciones',
  categoria: 'Desarrollo y civilización',
  jugadores: JUGADORES,
  minJugadores: JUGADORES,
  maxJugadores: JUGADORES,
  // Cada partida de una serie usa otro seed (otro mundo); los asientos rotan.
  bots: Object.fromEntries(Object.entries(BOTS).map(([id, fn]) => [id, { ...INFO_BOTS[id], fn }])),
  rondas: TURNOS,
  // 60 decisiones por partida (una llamada por civilizacion por turno): el corte duro del proyecto es 100 y los agentes no reintentan por dentro, asi que nunca se vuelven 180.
  llamadasMax: 100,
  limiteLlamadasDuro: 100,
  versionReglas: 'civilizaciones-1.3.0', // Capa 2: dilemas, eventos e invasiones; contrato de texto sin cambios.
  reglas: REGLAS,
  formatoRespuesta: FORMATO,

  crear: (rng, opciones = {}) => crearEstado(rng, opciones),
  terminado: (E) => E.turno >= TURNOS,
  vista: (E, i) => vistaTexto(E, i),
  normalizar: normalizarRespuesta, // (respuesta, estado)
  // jugadas[s] = respuesta normalizada (con `error` y `crudo` si las puso la arena). Ademas del registro del motor se guarda lo que ve el espectador: las ordenes de cada
  // civilizacion con su motivo si se descartaron, su razon, la causa si la respuesta fue invalida y el error de la API (los fallos se registran, no se esconden).
  aplicar: (E, jugadas) => {
    const registro = aplicarTurno(E, jugadas);
    registro.errores = jugadas.map((j) => j?.error ?? null);
    registro.respuestas = jugadas.map((j) => (j ? {
      razon: j.razon, nota: j.nota, mensaje: j.mensaje, invalida: j.invalida, motivo: j.motivo,
      crudo: j.invalida && typeof j.crudo === 'string' ? j.crudo.slice(0, LARGO_CRUDO) : null,
    } : null));
    return registro;
  },
  resultado: resultadoDe,
  // Las dos civilizaciones juegan siempre (nadie cae).
  activos: (E) => E.civs.map(() => true),
};
