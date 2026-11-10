import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { leerTelemetria } from '../telemetria.js';
import { validarRespuesta, validarAccion } from '../contrato-acciones.js';
import { canonico, hash } from '../util.js';
import { CATALOGO_ERA, accionesIntervencion, clasificarEra, evaluarEleccion, puntuarEra, reglasEtapa } from './reglas-era.js';
import { construirSistemaEra } from './prompt-era.js';
import { reconstruirReporteEra } from './reporte-era.js';

// Auditoría del formato «era» SOLO desde el log: coherencia, repetición de la validación de cada respuesta, texto de sistema reconstruible,
// costos y puntaje final recalculados, y reporte.json idéntico al reconstruido. No vuelve a jugar ni llama al juego.
export async function auditarEra(carpeta, { cat = CATALOGO_ERA } = {}) {
  const problemas = [];
  const falla = m => problemas.push(m);
  const eventos = await leerTelemetria(join(carpeta, 'eventos.jsonl'));
  const inicio = eventos.find(e => e.tipo === 'inicio'), fin = eventos.find(e => e.tipo === 'fin');
  if (!inicio) falla('falta el evento inicio');
  if (!fin) falla('falta el evento fin (registro interrumpido)');
  const p = inicio?.config?.partida;
  if (p) {
    const sistema = construirSistemaEra(p, cat);
    if (hash(sistema) !== inicio.config.sistema_hash) falla('el texto de sistema reconstruido no coincide con sistema_hash (otra versión del prompt o del catálogo)');
    if (inicio.config.catalogo_hash !== hash(cat)) falla('el catálogo actual no es el de la partida (catalogo_hash distinto)');
    for (const d of eventos.filter(e => e.tipo === 'decision')) {
      if (d.sistema_hash !== inicio.config.sistema_hash) falla(`llamada ${d.turn_number} de ${d.participant_id}: sistema_hash distinto`);
      if (d.prompt_hash !== hash({ sistema, usuario: JSON.stringify({ llamada: d.observation.llamada, anio: d.observation.anio, presupuesto: d.observation.presupuesto, observation: d.observation.observation ?? null, tus_elecciones: d.observation.tus_elecciones ?? null, elecciones_del_rival: d.observation.elecciones_del_rival ?? null, correccion: d.correccion ? undefined : null }) }) && !d.correccion)
        falla(`llamada ${d.turn_number} de ${d.participant_id}: el prompt no se reconstruye idéntico`);
      if (d.observation_hash !== hash(d.observation)) falla(`llamada ${d.turn_number} de ${d.participant_id}: observation_hash no coincide`);
      // Se vuelve a validar la respuesta con el validador de la versión de reglas.
      const v = validarRespuesta(d.action_raw, { maxAcciones: d.llamada?.tipo === 'intervencion' ? 3 : 1 });
      const errorTecnico = ['proveedor', '429', 'tiempo_agotado', 'circuito_abierto', 'conexion', 'presupuesto', 'presupuesto_excedido', 'limite_tokens', 'limite_tiempo', 'tarifa_requerida'].includes(d.error_type);
      if (errorTecnico) continue;
      let errores = [];
      if (!v.ok) errores = [v.error];
      else if (d.llamada.tipo !== 'intervencion') {
        const etapa = d.llamada.etapa, val = validarAccion(v.acciones[0], { acciones: reglasEtapa(etapa, cat), turno: 1, puntos: 0 });
        if (!val.ok || v.acciones.length !== 1) errores = [val.error ?? 'numero_de_acciones'];
        else errores = evaluarEleccion(etapa, v.acciones[0].parameters, cat).errores.map(e => e.codigo);
      } else {
        const reglas = accionesIntervencion(d.llamada.fase);
        let puntos = d.observation.presupuesto.puntos_accion;
        v.acciones.forEach(a => { const val = a.action === 'rasgo_extra' ? { ok: true, regla: { puntos: 0 } } : validarAccion(a, { acciones: reglas, turno: 1, puntos, rivalesVivos: ['f1', 'f2'].filter(x => x !== d.participant_id) }); if (!val.ok) errores.push(val.error); else puntos -= val.regla.puntos; });
      }
      const registrado = (d.errores ?? []).map(e => e.codigo);
      // Los errores de contenido que dependen del estado (rasgo_extra, topes) no se rederivan aquí: solo se exige que, si el log dice que NO hubo errores, la repetición tampoco los encuentre.
      if (registrado.length === 0 && errores.length > 0) falla(`llamada ${d.turn_number} de ${d.participant_id}: el log la da por válida y la validación repetida la rechaza (${errores.join(',')})`);
      if (registrado.length > 0 && errores.length === 0 && d.llamada.tipo !== 'intervencion') falla(`llamada ${d.turn_number} de ${d.participant_id}: el log la da por inválida y la validación repetida la acepta`);
    }
    const llamadasEsperadas = inicio.config.llamadas;
    for (const x of inicio.participantes) {
      const hechas = new Set(eventos.filter(e => e.tipo === 'decision' && e.participant_id === x.id).map(e => e.turn_number)).size;
      if (fin?.completo && hechas > llamadasEsperadas) falla(`${x.id} hizo ${hechas} llamadas y el calendario tiene ${llamadasEsperadas}`);
    }
  }
  if (fin) {
    const costo = eventos.filter(e => e.tipo === 'decision').reduce((s, e) => s + e.cost, 0);
    if (Math.abs(costo - fin.consumo.costo) > 1e-9) falla(`el costo registrado (${fin.consumo.costo}) no es la suma de las llamadas (${costo})`);
    if (canonico(puntuarEra(fin.snapshot, fin.infracciones)) !== canonico(fin.puntos)) falla('los puntos finales no se recalculan');
    const rank = clasificarEra(fin.snapshot, fin.infracciones);
    if (canonico(rank.map(r => [r.participant_id, r.puesto, r.puntos])) !== canonico(fin.ranking.map(r => [r.participant_id, r.puesto, r.puntos]))) falla('el ranking final no se recalcula');
    const vivas = fin.snapshot.filter(c => c.vivo).length;
    if (fin.razon === 'eliminacion' && vivas > 1) falla('razón eliminación con más de una civilización viva');
    if (fin.razon === 'limite_anios' && vivas < 1) falla('razón límite de años sin ninguna civilización viva');
  }
  let reporteEscrito = null;
  try { reporteEscrito = JSON.parse(await readFile(join(carpeta, 'reporte.json'), 'utf8')); } catch { /* sin reporte.json no se compara */ }
  if (reporteEscrito && canonico(JSON.parse(JSON.stringify(reconstruirReporteEra(eventos)))) !== canonico(reporteEscrito)) falla('reporte.json no es idéntico al reconstruido desde el log');
  return { ok: problemas.length === 0, problemas, eventos: eventos.length };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  auditarEra(resolve(process.argv[2] ?? '.')).then(r => { console.log(JSON.stringify(r, null, 2)); process.exitCode = r.ok ? 0 : 1; }).catch(e => { console.error(`auditar-era: ${e.codigo ?? e.message}`); process.exitCode = 1; });
}
