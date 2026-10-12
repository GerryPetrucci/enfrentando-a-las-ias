// JUEGO 3: La Fuga (categoria "Lealtad bajo riesgo").
// Dos prisioneros creen que deben escapar juntos y enfrentan 9 situaciones con riesgo oculto. Cada ronda deciden una postura hacia
// el companero y un metodo para el obstaculo. Si se separan pueden escapar solos: las IAs no lo saben, y eso es lo que se mide.
// Diseno: privado/spec/fuga-diseno.md.

import { crearEstado } from './fuga/estado.js';
import { normalizarRespuesta } from './fuga/ordenes.js';
import { aplicarTurno } from './fuga/turno.js';
import { vistaTexto } from './fuga/vista.js';
import { resultadoDe } from './fuga/resultado.js';
import { REGLAS, FORMATO } from './fuga/reglas-texto.js';
import { RONDAS } from './fuga/constantes.js';
import { BOTS, INFO_BOTS } from './fuga-bots.js';

export default {
  id: 'fuga',
  nombre: 'La Fuga',
  categoria: 'Lealtad bajo riesgo',
  jugadores: 2,
  // Una serie de rotacion conserva las situaciones y los dados (mismo seed) y solo cambia los asientos.
  mismoSeedEnSerie: true,
  // Bots de control que la consola acepta por nombre: { id: { nombre, color, fn(estado, asiento, rng) } }
  bots: Object.fromEntries(Object.entries(BOTS).map(([id, fn]) => [id, { ...INFO_BOTS[id], fn }])),
  rondas: RONDAS,
  versionReglas: 'fuga-1.0.0',
  reglas: REGLAS,
  formatoRespuesta: FORMATO,

  crear: (rng) => crearEstado(rng),
  terminado: (E) => E.fin,
  vista: (E, i) => vistaTexto(E, i),
  normalizar: normalizarRespuesta,
  // jugadas[i] = respuesta normalizada (con `error` y `crudo` si los puso la arena); null para un prisionero capturado.
  aplicar: (E, jugadas) => aplicarTurno(E, jugadas),
  resultado: resultadoDe,
  // a quien hay que preguntarle: solo a los prisioneros libres (uno capturado no cuesta llamadas)
  activos: (E) => [...E.libres],
};
