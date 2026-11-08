import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { eficiencia, puntuar, ranking, robustez, PESOS } from './puntuacion.js';
import { ERRORES_TECNICOS, exigir, hash } from './util.js';
import { sanear } from './telemetria.js';

// Decisiones que no produjeron una jugada propia del participante (se ejecuto `esperar` en su lugar).
const SIN_RESPUESTA = new Set([...ERRORES_TECNICOS, 'json_invalido', 'respuesta_invalida', 'respuesta_incompleta', 'tarifa_requerida', 'presupuesto', 'presupuesto_excedido', 'limite_tokens', 'limite_tiempo']);
// El reporte se calcula SOLO desde el log de eventos: sin volver a simular ni llamar a ningun modelo.
export function reconstruirReporte(eventos) {
  const inicio = eventos.find(e => e.tipo === 'inicio');
  exigir(inicio, 'log_sin_inicio');
  const fin = eventos.findLast(e => e.tipo === 'fin');
  const ultimo = [...eventos].reverse().find(e => e.snapshot);
  const snapshot = fin?.snapshot ?? ultimo?.snapshot ?? inicio.snapshot;
  const decisiones = eventos.filter(e => e.tipo === 'decision');
  // La tabla de pesos viaja en el log: el reporte no depende de la que tenga el codigo vigente.
  const pesos = inicio.config.pesos ?? PESOS;
  const resultados = inicio.participantes.map(p => {
    const f = snapshot.find(f => f.id === p.id), d = decisiones.filter(e => e.participant_id === p.id);
    const sumar = k => d.reduce((s, e) => s + (e[k] ?? 0), 0);
    const penalizaciones = sumar('penalizaciones'), puntos = puntuar(f, penalizaciones, pesos), costo = sumar('cost');
    return { participant_id: p.id, model_id: p.modelo, ...f, puntos, penalizaciones, decisiones: d.length, fallos: d.filter(e => e.error_type).length,
      turnos_sin_respuesta: d.filter(e => SIN_RESPUESTA.has(e.error_type)).length, acciones_invalidas: sumar('acciones_invalidas'), acciones_rechazadas: sumar('acciones_rechazadas'),
      reintentos: sumar('retry_count'), input_tokens: sumar('input_tokens'), output_tokens: sumar('output_tokens'), costo,
      costo_estimado: d.some(e => e.cost_source === 'estimado'), puntos_por_dolar: eficiencia(puntos, costo) };
  });
  const modelos = [...new Set(resultados.map(r => r.model_id))].map(model_id => {
    const filas = resultados.filter(r => r.model_id === model_id);
    const suma = k => filas.reduce((s, f) => s + f[k], 0);
    return { model_id, participantes: filas.length, puntos: suma('puntos'), costo: suma('costo'), input_tokens: suma('input_tokens'), output_tokens: suma('output_tokens'), fallos: suma('fallos'), turnos_sin_respuesta: suma('turnos_sin_respuesta'),
      acciones_rechazadas: suma('acciones_rechazadas'), reintentos: suma('reintentos'), puntos_por_dolar: eficiencia(suma('puntos'), suma('costo')),
      robustez: robustez(filas.map(f => ({ semilla: inicio.config.semilla, puntos: f.puntos }))) };
  });
  const porTurno = eventos.filter(e => e.tipo === 'turno').flatMap(e => e.resultados.map(r => ({ turno: e.turn_number, completo: true, ...r })));
  const ultimoTurno = decisiones.at(-1)?.turn_number;
  if (ultimoTurno && !eventos.some(e => e.tipo === 'turno' && e.turn_number === ultimoTurno)) {
    porTurno.push(...resultados.map(r => ({ turno: ultimoTurno, completo: false, ...r })));
  }
  const sistemas = new Set(decisiones.map(e => e.sistema_hash).filter(Boolean));
  return sanear({ version: 1, competition_id: inicio.competition_id, run_id: inicio.run_id, origen: inicio.origen, config: inicio.config,
    // Reproducibilidad: lo pedido, lo que el adaptador dijo usar, el hash del mundo y del estado inicial observado.
    reglas: inicio.config.reglas ?? null, versiones: { rules_version: inicio.config.rules_version, prompt_version: inicio.config.prompt_version }, victoria_supervivencia: inicio.config.victoria_supervivencia === true, determinista: inicio.determinista ?? 'desconocido', escenario: inicio.escenario ?? null,
    // Equidad: un solo texto de sistema (y version) para todos los participantes y turnos.
    equidad: { prompts_sistema_distintos: sistemas.size, prompt_version: inicio.config.prompt_version, rules_version: inicio.config.rules_version },
    completo: fin?.completo ?? false, razon: fin?.razon ?? 'registro_interrumpido', turnos: fin?.turnos ?? eventos.filter(e => e.tipo === 'turno').length,
    consumo: { costo: resultados.reduce((s, r) => s + r.costo, 0), input_tokens: resultados.reduce((s, r) => s + r.input_tokens, 0), output_tokens: resultados.reduce((s, r) => s + r.output_tokens, 0) },
    hash_final: hash(snapshot), ranking: ranking(resultados, { supervivencia: inicio.config.victoria_supervivencia === true }), modelos,
    por_turno: porTurno,
    decisiones: decisiones.map(e => ({ turno: e.turn_number, participant_id: e.participant_id, error_type: e.error_type, retry_count: e.retry_count, cost: e.cost, cost_source: e.cost_source, score_delta: e.score_delta })) });
}
// Se puede aplicar a reportes reconstruidos, sin volver a simular ni llamar modelos.
export function resumirCompetencia(reportes) {
  return [...new Set(reportes.flatMap(r => r.modelos.map(m => m.model_id)))].sort().map(model_id => {
    // "Semilla" = mundo distinto: en el simulador la semilla; en el juego real (sin semilla) el hash del mundo generado.
    const muestras = reportes.flatMap(r => r.ranking.filter(f => f.model_id === model_id).map(f => ({ ...f, semilla: r.determinista === true ? r.config.semilla : r.escenario?.hash_mundo ?? r.config.semilla, completo: r.completo })));
    const suma = k => muestras.reduce((s, f) => s + f[k], 0);
    return { model_id, participaciones: muestras.length, incompletas: muestras.filter(f => !f.completo).length, puntos: suma('puntos'), costo: suma('costo'), puntos_por_dolar: eficiencia(suma('puntos'), suma('costo')),
      robustez: robustez(muestras) };
  });
}
export function csv(filas, columnas) {
  const celda = v => {
    let texto = v === null || v === undefined ? '' : String(v);
    // Inyeccion de formulas en hojas de calculo: se neutraliza con una comilla inicial.
    if (/^[=+@\t\r]/.test(texto) || /^-[^\d]/.test(texto)) texto = `'${texto}`;
    return /[",\r\n]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
  };
  return [columnas.join(','), ...filas.map(f => columnas.map(k => celda(f[k])).join(','))].join('\n') + '\n';
}
export const COLUMNAS = {
  turnos: ['turno', 'completo', 'participant_id', 'model_id', 'puntos', 'penalizaciones', 'poblacion', 'territorio', 'recursos', 'objetivos', 'ciudades', 'edificios', 'ejercito', 'comida', 'salud_media_pct'],
  modelos: ['model_id', 'participantes', 'puntos', 'costo', 'input_tokens', 'output_tokens', 'fallos', 'turnos_sin_respuesta', 'acciones_rechazadas', 'reintentos', 'puntos_por_dolar'],
  ranking: ['puesto', 'participant_id', 'model_id', 'puntos', 'penalizaciones', 'costo', 'puntos_por_dolar', 'fallos', 'turnos_sin_respuesta', 'acciones_invalidas', 'acciones_rechazadas', 'reintentos', 'input_tokens', 'output_tokens'],
  decisiones: ['turno', 'participant_id', 'error_type', 'retry_count', 'cost', 'cost_source', 'score_delta'],
};
export async function escribirReporte(reporte, carpeta) {
  await mkdir(carpeta, { recursive: true });
  await writeFile(join(carpeta, 'reporte.json'), JSON.stringify(sanear(reporte), null, 2) + '\n');
  await writeFile(join(carpeta, 'turnos.csv'), csv(reporte.por_turno, COLUMNAS.turnos));
  await writeFile(join(carpeta, 'modelos.csv'), csv(reporte.modelos, COLUMNAS.modelos));
  await writeFile(join(carpeta, 'ranking.csv'), csv(reporte.ranking, COLUMNAS.ranking));
  await writeFile(join(carpeta, 'decisiones.csv'), csv(reporte.decisiones, COLUMNAS.decisiones));
}
