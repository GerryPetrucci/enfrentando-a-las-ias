import { exigir, entero, objeto } from '../util.js';
import { anioDe } from './reglas-era.js';

// Estado de la era que entrega el puente (GET /v1/era/estado), normalizado y acotado. Nunca llega crudo al modelo ni al log.
const escalares = (o, max = 16) => {
  const r = {};
  for (const [k, v] of Object.entries(o ?? {}).slice(0, max)) {
    if (!/^[a-z_][a-z0-9_]{0,39}$/.test(k)) continue;
    if ((typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean') r[k] = v;
    else if (typeof v === 'string') r[k] = v.slice(0, 100);
  }
  return r;
};
const RECURSOS = ['wood', 'stone', 'gold', 'common_metals', 'silver', 'mythril', 'adamantine', 'gems', 'bones', 'leather'];
export function normalizarCivilizacion(c) {
  exigir(objeto(c) && typeof c.faccion === 'string' && typeof c.vivo === 'boolean', 'respuesta_invalida');
  const r = { id: c.faccion, especie: typeof c.especie === 'string' && /^[a-z_]{1,20}$/.test(c.especie) ? c.especie : null, vivo: c.vivo };
  for (const k of ['poblacion', 'ciudades', 'territorio', 'ejercito', 'edificios']) { exigir(entero(c[k], 0, 1e9), 'respuesta_invalida'); r[k] = c[k]; }
  const reinos = Array.isArray(c.reinos) ? c.reinos : [];
  r.reinos_vivos = reinos.filter(k => k?.vivo === true).length;
  r.reinos_total = reinos.length;
  r.almacen = Object.fromEntries(RECURSOS.map(k => [k, entero(c.almacen?.[k], 0, 1e9) ? c.almacen[k] : 0]));
  r.rasgos_era = Object.fromEntries(Object.entries(c.rasgos_era ?? {}).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.filter(x => typeof x === 'string').slice(0, 24)]));
  // E5: rasgos que el puente mantiene (cultura, idioma, religion, clan): {tipo: [{id, estado: 'activo'|'pendiente', perdidas, reaplicaciones, motivo?}]}.
  r.rasgos_mantenidos = Object.fromEntries(Object.entries(c.rasgos_mantenidos ?? {}).filter(([k, v]) => /^[a-z_]{1,20}$/.test(k) && Array.isArray(v)).map(([k, v]) => [k, v.filter(objeto).slice(0, 24).map(d => ({ id: String(d.id ?? '').slice(0, 60),
    estado: d.estado === 'activo' ? 'activo' : 'pendiente', perdidas: entero(d.perdidas, 0, 1e9) ? d.perdidas : 0, reaplicaciones: entero(d.reaplicaciones, 0, 1e9) ? d.reaplicaciones : 0, ...(typeof d.motivo === 'string' ? { motivo: d.motivo.slice(0, 40) } : {}) }))]));
  return r;
}
export function normalizarEstadoEra(x) {
  exigir(objeto(x) && typeof x.hay_era === 'boolean', 'respuesta_invalida');
  const eventos = Array.isArray(x.eventos) ? x.eventos.filter(objeto).map(e => escalares(e)).filter(e => typeof e.tipo === 'string' && Number.isInteger(e.i)) : [];
  const siguiente = entero(x.siguiente_evento, 0, 1e9) ? x.siguiente_evento : 0;
  if (!x.hay_era || !Array.isArray(x.civilizaciones)) return { hay_era: false, eventos, siguiente_evento: siguiente, civilizaciones: [] };
  exigir(Number.isFinite(x.tiempo_juego_s) && x.tiempo_juego_s >= 0, 'respuesta_invalida');
  return {
    hay_era: true, anio: entero(x.anio, 1, 1e6) ? x.anio : anioDe(x.tiempo_juego_s), tiempo_juego_s: x.tiempo_juego_s, tiempo_real_s: Number.isFinite(x.tiempo_real_s) ? x.tiempo_real_s : null,
    edad: typeof x.edad?.id === 'string' ? x.edad.id.slice(0, 40) : null, muro: { puesto: x.muro?.puesto === true },
    civilizaciones: x.civilizaciones.map(normalizarCivilizacion), reinos_sin_origen: Array.isArray(x.reinos_sin_origen) ? x.reinos_sin_origen.length : 0,
    depositos: Array.isArray(x.depositos) ? x.depositos.filter(objeto).map(d => ({ faccion: String(d.faccion ?? ''), mineral: String(d.mineral ?? ''), presente: d.presente === true })) : [],
    eventos, siguiente_evento: siguiente,
    mantenimiento: objeto(x.mantenimiento) ? escalares(x.mantenimiento, 16) : null,
  };
}
// Respuesta de POST /v1/era/rasgos: solo lo necesario para el registro.
export function normalizarRespuestaRasgos(x) {
  exigir(objeto(x) && ['ejecutada', 'rechazada', 'parcial'].includes(x.resultado), 'respuesta_invalida');
  const ids = a => (Array.isArray(a) ? a.filter(v => typeof v === 'string').slice(0, 24) : []);
  const lista = a => (Array.isArray(a) ? a : []).filter(objeto).slice(0, 24).map(r => ({ id: String(r.id ?? '').slice(0, 60), codigo: String(r.codigo ?? 'sin_codigo').slice(0, 40) }));
  // `pendientes` (E5, solo con mantener): validos pero que el juego aun no puede aplicar (el reino no tiene cultura/idioma); el puente los aplica en cuanto puede.
  return { resultado: x.resultado, tipo: String(x.tipo ?? '').slice(0, 20), aplicados: ids(x.aplicados), quitados: ids(x.quitados), pendientes: lista(x.pendientes), soltados: ids(x.soltados),
    rechazados: lista(x.rechazados), tope: entero(x.tope, 0, 1000) ? x.tope : null };
}
export const resumenCivilizacion = c => ({ id: c.id, especie: c.especie, vivo: c.vivo, poblacion: c.poblacion, ciudades: c.ciudades, territorio: c.territorio, ejercito: c.ejercito, edificios: c.edificios, reinos_vivos: c.reinos_vivos });
// Lo que ve un modelo: su civilizacion completa y, si el reglamento ya lo permite, la del rival. Mismos campos para los dos.
export function construirObservacionEra({ estado, yo, rival, revelarRival, partida, guerra, puntaje }) {
  const mia = estado.civilizaciones.find(c => c.id === yo), otra = estado.civilizaciones.find(c => c.id === rival);
  exigir(mia && otra, 'respuesta_invalida');
  return {
    anio: estado.anio, tiempo_juego_s: estado.tiempo_juego_s,
    tu: { ...resumenCivilizacion(mia), almacen: mia.almacen, depositos_de_mineral_que_quedan: estado.depositos.filter(d => d.faccion === yo && d.presente).length },
    rival: revelarRival ? resumenCivilizacion(otra) : null,
    muro: { puesto: estado.muro.puesto, anio_en_que_cae: partida.anioMuro },
    guerra_declarada: guerra === true, anio_limite: partida.anioLimite,
    puntaje: revelarRival && puntaje ? { tu: puntaje[yo], rival: puntaje[rival] } : null,
  };
}
