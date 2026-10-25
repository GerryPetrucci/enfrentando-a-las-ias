import { crearEstado, activosDe } from './lobo/estado.js';
import { normalizarRespuesta } from './lobo/ordenes.js';
import { aplicarTurno, cerrarPorLimiteLlamadas } from './lobo/turno.js';
import { vistaTexto } from './lobo/vista.js';
import { resultadoDe } from './lobo/resultado.js';
import { REGLAS, FORMATO } from './lobo/reglas-texto.js';
import { VERSION } from './lobo/constantes.js';
import { BOTS, INFO_BOTS } from './lobo-bots.js';

export default {
  id: 'lobo', nombre: 'Lobo en la aldea', categoria: 'Identidad oculta',
  jugadores: 8, minJugadores: 8, maxJugadores: 12, jugadoresPermitidos: [8, 12],
  mismoSeedEnSerie: true, soloEnVivo: true,
  // Ocho rondas narrativas requieren hasta 4*8 + Cupido + cazador = 34
  // pasos de decisión. 48 deja 14 de margen (y la arena admite otros dos).
  // No modifica los topes narrativos aceptados de CONFIGURACIONES.
  rondas: 48, llamadasMax: 100, limiteLlamadasDuro: 100, versionReglas: VERSION,
  reglas: REGLAS, formatoRespuesta: FORMATO,
  bots: Object.fromEntries(Object.entries(BOTS).map(([id, fn]) => [id, { ...INFO_BOTS[id], fn }])),
  crear: crearEstado, terminado: (E) => E.fin, vista: vistaTexto,
  normalizar: normalizarRespuesta, aplicar: aplicarTurno, resultado: resultadoDe, activos: activosDe,
  cerrarPorLimiteLlamadas,
};
