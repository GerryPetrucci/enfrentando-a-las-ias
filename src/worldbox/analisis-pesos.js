import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { readdir } from 'node:fs/promises';
import { leerTelemetria } from './telemetria.js';
import { exigir } from './util.js';

// Justificacion de la tabla de pesos con partidas reales, SOLO desde los logs (no juega, no llama a nada).
//   ruido  : desviacion tipica de (f1 - f2) en partidas pasivo-pasivo completas: lo que el mapa y el azar del juego
//            separan a dos reinos que hacen exactamente lo mismo. Una metrica con mucho ruido no mide habilidad.
//   senal  : diferencia media entre un participante que ACTUA (por defecto bot-expansionista) y uno pasivo.
//   snr    : senal / ruido. Con snr < 1 la metrica no discrimina conductas con las partidas disponibles.
//   peso   : peso que aporta `ruidoObjetivo` puntos de ruido (peso = ruidoObjetivo / ruido); se redondea a un valor de la tabla de pesos.
export const METRICAS = ['poblacion', 'territorio', 'edificios', 'recursos', 'comida', 'ejercito', 'salud_media_pct', 'ciudades', 'objetivos'];
const media = v => v.reduce((s, x) => s + x, 0) / (v.length || 1);
const sd = v => { const m = media(v); return Math.sqrt(media(v.map(x => (x - m) ** 2))); };
const redondear = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

export function resumirCorrida(eventos) {
  const inicio = eventos.find(e => e.tipo === 'inicio'), fin = eventos.findLast(e => e.tipo === 'fin');
  exigir(inicio, 'log_sin_inicio');
  if (!fin) return null;
  return { modelos: inicio.participantes.map(p => p.modelo), ids: inicio.participantes.map(p => p.id), final: fin.snapshot, turnos: fin.turnos, razon: fin.razon, completo: fin.completo,
    calidad_sitio: inicio.escenario?.calidad_sitio ?? null, hash_mundo: inicio.escenario?.hash_mundo ?? null, turnosEvento: eventos.filter(e => e.tipo === 'turno') };
}
export async function cargarCorridas(carpetas) {
  const corridas = [];
  for (const raiz of carpetas) for (const d of await readdir(raiz, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    try { const c = resumirCorrida(await leerTelemetria(join(raiz, d.name, 'eventos.jsonl'))); if (c) corridas.push(c); } catch { /* carpeta que no es una corrida */ }
  }
  return corridas;
}
const completas = (corridas, turnos) => corridas.filter(c => c.turnos === turnos && c.completo);
// identicos: conductas deterministas cuyas parejas (A contra A) miden el ruido puro del mapa y del azar del juego.
export function analizarPesos(corridas, { turnos = 24, activo = 'bot-expansionista', pasivo = 'bot-pasivo', identicos = [pasivo], metricas = METRICAS, ruidoObjetivo = 5 } = {}) {
  const pasivos = completas(corridas, turnos).filter(c => c.modelos.length === 2 && c.modelos[0] === c.modelos[1] && identicos.includes(c.modelos[0]));
  const contra = completas(corridas, turnos).filter(c => c.modelos.length === 2 && c.modelos.includes(activo) && c.modelos.includes(pasivo));
  exigir(pasivos.length >= 2, 'datos_insuficientes');
  const filas = metricas.map(m => {
    const ruido = sd(pasivos.map(c => c.final[0][m] - c.final[1][m])), mediaAbs = media(pasivos.map(c => Math.abs(c.final[0][m] - c.final[1][m])));
    const senal = contra.length ? media(contra.map(c => { const i = c.modelos.indexOf(activo); return c.final[i][m] - c.final[1 - i][m]; })) : null;
    return { metrica: m, ruido: redondear(ruido), diferencia_abs_media_pasivos: redondear(mediaAbs), senal: senal === null ? null : redondear(senal), snr: senal === null || ruido === 0 ? null : redondear(senal / ruido),
      peso_sugerido: ruido === 0 ? null : redondear(ruidoObjetivo / ruido, 3) };
  });
  const sitio = pasivos.filter(c => c.calidad_sitio).map(c => Object.values(c.calidad_sitio));
  return { partidas_ruido: pasivos.length, partidas_activo_contra_pasivo: contra.length, ruido_objetivo_puntos: ruidoObjetivo, metricas: filas,
    sitio: { diferencia_abs_media: redondear(media(sitio.map(([a, b]) => Math.abs(a - b)))), diferencia_abs_max: Math.max(0, ...sitio.map(([a, b]) => Math.abs(a - b))) } };
}
// Con una tabla de pesos: cuantos puntos de ruido (sd de f1 - f2 entre pasivos) y cuantos de senal aporta cada termino.
export function evaluarPesos(corridas, pesos, { turnos = 24, activo = 'bot-expansionista', pasivo = 'bot-pasivo', identicos = [pasivo] } = {}) {
  const a = analizarPesos(corridas, { turnos, activo, pasivo, identicos });
  const filas = Object.keys(pesos).filter(k => k !== 'supervivencia' && k !== 'penalizacion').map(k => {
    const f = a.metricas.find(x => x.metrica === k);
    return { metrica: k, peso: pesos[k], puntos_de_ruido: f ? redondear(pesos[k] * f.ruido) : null, puntos_de_senal: f?.senal == null ? null : redondear(pesos[k] * f.senal) };
  });
  return { filas, ruido_total: redondear(Math.sqrt(filas.reduce((s, f) => s + (f.puntos_de_ruido ?? 0) ** 2, 0))), senal_total: redondear(filas.reduce((s, f) => s + (f.puntos_de_senal ?? 0), 0)) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const carpetas = process.argv.slice(2).filter(a => !a.startsWith('--')).map(a => resolve(a));
  cargarCorridas(carpetas).then(c => console.log(JSON.stringify({ corridas: c.length, ...analizarPesos(c, { identicos: ['bot-pasivo', 'bot-expansionista'] }) }, null, 2))).catch(e => { console.error(`WorldBox: ${e.codigo ?? 'error_interno'}`); process.exitCode = 1; });
}
