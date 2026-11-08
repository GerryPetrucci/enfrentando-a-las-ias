import test from 'node:test';
import assert from 'node:assert/strict';
import { reconstruirReporte, resumirCompetencia, escribirReporte, csv, COLUMNAS } from '../../worldbox/reporte.js';
import { hash } from '../../worldbox/util.js';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Registro escrito a mano con numeros exactos (potencias de dos en los costos para que la suma sea exacta).
const f = (id, extra = {}) => ({ id, vivo: true, poblacion: 20, ciudades: 1, territorio: 3, recursos: 20, objetivos: 0, cooldowns: {}, ...extra });
const FINAL = [f('f1', { poblacion: 25, territorio: 4, recursos: 30, objetivos: 1 }), f('f2'), f('f3', { vivo: false, poblacion: 0, ciudades: 0, territorio: 0, recursos: 5, objetivos: 1 })];
const dec = (id, turn_number, extra) => ({ tipo: 'decision', turn_number, participant_id: id, error_type: null, retry_count: 0, cost: 0, cost_source: 'reportado', input_tokens: 0, output_tokens: 0, score_delta: 0, penalizaciones: 0, acciones_invalidas: 0, acciones_rechazadas: 0, sistema_hash: 'S', ...extra });
const registro = (extra = {}) => [
  { tipo: 'inicio', competition_id: 'C', run_id: 'R', origen: 'simulado', determinista: true, escenario: { hash_mundo: 'H' }, participantes: [{ id: 'f1', modelo: 'm1' }, { id: 'f2', modelo: 'm2' }, { id: 'f3', modelo: 'm1' }],
    snapshot: [f('f1'), f('f2'), f('f3')], config: { semilla: 5, prompt_version: 'P', rules_version: 'V' } },
  dec('f1', 1, { error_type: 'json_invalido', penalizaciones: 1, cost: 0.5, cost_source: 'estimado', input_tokens: 100, output_tokens: 50, retry_count: 1, score_delta: -5 }),
  dec('f2', 1, { cost: 0.25, input_tokens: 200, output_tokens: 10, score_delta: 3 }),
  dec('f3', 1, { error_type: 'cooldown', penalizaciones: 2, acciones_invalidas: 1, acciones_rechazadas: 1, cost: 0.125, input_tokens: 50, output_tokens: 5, score_delta: -10 }),
  { tipo: 'turno', turn_number: 1, snapshot: FINAL, resultados: [
    { participant_id: 'f1', model_id: 'm1', ...FINAL[0], penalizaciones: 1, puntos: 163 }, { participant_id: 'f2', model_id: 'm2', ...FINAL[1], penalizaciones: 0, puntos: 137 }, { participant_id: 'f3', model_id: 'm1', ...FINAL[2], penalizaciones: 2, puntos: 10.5 }] },
  { tipo: 'fin', completo: true, razon: 'turnos', turnos: 1, snapshot: FINAL },
  ...[].concat(extra.cola ?? [])];

test('el reporte sale SOLO del log: puntos, ranking, costos y resumen por modelo exactos', () => {
  const r = reconstruirReporte(registro());
  assert.deepEqual(r.ranking.map(x => [x.puesto, x.participant_id, x.puntos, x.penalizaciones]), [[1, 'f1', 163, 1], [2, 'f2', 137, 0], [3, 'f3', 10.5, 2]]);
  assert.deepEqual(r.ranking.map(x => x.costo), [0.5, 0.25, 0.125]);
  assert.deepEqual(r.ranking.map(x => x.puntos_por_dolar), [326, 548, 84]);
  assert.deepEqual(r.ranking.map(x => [x.fallos, x.turnos_sin_respuesta, x.acciones_invalidas, x.acciones_rechazadas, x.reintentos]), [[1, 1, 0, 0, 1], [0, 0, 0, 0, 0], [1, 0, 1, 1, 0]]);
  assert.deepEqual(r.ranking.map(x => x.costo_estimado), [true, false, false]);
  const m1 = r.modelos.find(m => m.model_id === 'm1'), m2 = r.modelos.find(m => m.model_id === 'm2');
  assert.deepEqual([m1.participantes, m1.puntos, m1.costo, m1.input_tokens, m1.output_tokens, m1.fallos, m1.turnos_sin_respuesta, m1.acciones_rechazadas, m1.reintentos, m1.puntos_por_dolar], [2, 173.5, 0.625, 150, 55, 2, 1, 1, 1, 277.6]);
  assert.deepEqual([m2.puntos, m2.costo, m2.puntos_por_dolar], [137, 0.25, 548]);
  assert.deepEqual(m1.robustez, { semillas: 1, media: 173.5 / 2, desviacion: null });
  assert.deepEqual(r.consumo, { costo: 0.875, input_tokens: 350, output_tokens: 65 });
  assert.deepEqual([r.completo, r.razon, r.turnos, r.origen, r.determinista, r.escenario], [true, 'turnos', 1, 'simulado', true, { hash_mundo: 'H' }]);
  assert.equal(r.hash_final, hash(FINAL)); assert.deepEqual(r.equidad, { prompts_sistema_distintos: 1, prompt_version: 'P', rules_version: 'V' });
  assert.deepEqual(r.por_turno.map(x => [x.turno, x.completo, x.participant_id, x.puntos]), [[1, true, 'f1', 163], [1, true, 'f2', 137], [1, true, 'f3', 10.5]]);
  assert.deepEqual(r.decisiones.map(x => [x.turno, x.participant_id, x.error_type, x.score_delta]), [[1, 'f1', 'json_invalido', -5], [1, 'f2', null, 3], [1, 'f3', 'cooldown', -10]]);
});
test('el puntaje se recalcula del snapshot y las infracciones del log, no de numeros guardados', () => {
  const log = registro(); log[4].resultados[0].puntos = 99999;
  assert.equal(reconstruirReporte(log).ranking[0].puntos, 163, 'un puntaje adulterado en el log de turno no cambia el reporte');
  const mas = registro(); mas[1].penalizaciones = 3;
  assert.equal(reconstruirReporte(mas).ranking.find(x => x.participant_id === 'f1').puntos, 153);
});
test('CSV exactos: los cuatro archivos, columnas fijas y sin secretos', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worldbox-rep-'));
  try {
    const r = reconstruirReporte(registro()); await escribirReporte(r, dir);
    assert.deepEqual((await readdir(dir)).sort(), ['decisiones.csv', 'modelos.csv', 'ranking.csv', 'reporte.json', 'turnos.csv']);
    assert.equal(await readFile(join(dir, 'ranking.csv'), 'utf8'), [
      'puesto,participant_id,model_id,puntos,penalizaciones,costo,puntos_por_dolar,fallos,turnos_sin_respuesta,acciones_invalidas,acciones_rechazadas,reintentos,input_tokens,output_tokens',
      '1,f1,m1,163,1,0.5,326,1,1,0,0,1,100,50', '2,f2,m2,137,0,0.25,548,0,0,0,0,0,200,10', '3,f3,m1,10.5,2,0.125,84,1,0,1,1,0,50,5', ''].join('\n'));
    assert.equal(await readFile(join(dir, 'modelos.csv'), 'utf8'), [
      'model_id,participantes,puntos,costo,input_tokens,output_tokens,fallos,turnos_sin_respuesta,acciones_rechazadas,reintentos,puntos_por_dolar', 'm1,2,173.5,0.625,150,55,2,1,1,1,277.6', 'm2,1,137,0.25,200,10,0,0,0,0,548', ''].join('\n'));
    assert.equal(await readFile(join(dir, 'turnos.csv'), 'utf8'), [
      'turno,completo,participant_id,model_id,puntos,penalizaciones,poblacion,territorio,recursos,objetivos,ciudades,edificios,ejercito,comida,salud_media_pct', '1,true,f1,m1,163,1,25,4,30,1,1,,,,', '1,true,f2,m2,137,0,20,3,20,0,1,,,,', '1,true,f3,m1,10.5,2,0,0,5,1,0,,,,', ''].join('\n'));
    assert.equal(await readFile(join(dir, 'decisiones.csv'), 'utf8'), [
      'turno,participant_id,error_type,retry_count,cost,cost_source,score_delta', '1,f1,json_invalido,1,0.5,estimado,-5', '1,f2,,0,0.25,reportado,3', '1,f3,cooldown,0,0.125,reportado,-10', ''].join('\n'));
    assert.equal(await readFile(join(dir, 'reporte.json'), 'utf8'), JSON.stringify(r, null, 2) + '\n');
    assert.deepEqual(COLUMNAS.ranking.length, 14);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('un registro interrumpido o incompleto se reporta como tal, sin inventar datos', () => {
  const sinFin = registro().filter(e => e.tipo !== 'fin');
  const r = reconstruirReporte(sinFin);
  assert.deepEqual([r.completo, r.razon, r.turnos], [false, 'registro_interrumpido', 1]);
  assert.equal(r.hash_final, hash(FINAL), 'usa el ultimo estado confirmado');
  // Una decision de un turno sin cierre aparece con completo:false (turno parcial).
  const parcial = [registro()[0], dec('f1', 1, { cost: 0.5 })];
  const p = reconstruirReporte(parcial);
  assert.deepEqual(p.por_turno.map(x => [x.turno, x.completo, x.participant_id]), [[1, false, 'f1'], [1, false, 'f2'], [1, false, 'f3']]);
  assert.equal(p.ranking.find(x => x.participant_id === 'f1').puntos, 137);
  const cortada = reconstruirReporte([...registro().slice(0, 1), dec('f1', 1), { tipo: 'fin', completo: false, razon: 'presupuesto', turnos: 0, snapshot: registro()[0].snapshot }]);
  assert.deepEqual([cortada.completo, cortada.razon, cortada.ranking.length], [false, 'presupuesto', 3]);
  assert.throws(() => reconstruirReporte([]), /log_sin_inicio/); assert.throws(() => reconstruirReporte([{ tipo: 'turno' }]), /log_sin_inicio/);
});
test('el reporte no contiene secretos aunque el log los traiga', () => {
  const log = registro(); log[0].config.nota = 'sk-or-v1-SECRETO'; log[0].config.token = 'SECRETO'; log[1].error_type = 'Bearer SECRETO';
  assert.ok(!JSON.stringify(reconstruirReporte(log)).includes('SECRETO'));
});
test('resumirCompetencia une reportes por modelo, cuenta incompletas y robustez por semilla distinta', () => {
  const a = reconstruirReporte(registro()), b = { ...reconstruirReporte(registro()), completo: false, config: { ...a.config, semilla: 6 } };
  const mismaSemilla = { ...reconstruirReporte(registro()) };
  const r = resumirCompetencia([a, b]);
  assert.deepEqual(r.map(x => x.model_id), ['m1', 'm2']);
  const m1 = r.find(x => x.model_id === 'm1');
  assert.deepEqual([m1.participaciones, m1.incompletas, m1.puntos, m1.costo], [4, 2, 347, 1.25]);
  assert.equal(m1.robustez.semillas, 2); assert.equal(m1.robustez.desviacion, 0);
  assert.equal(resumirCompetencia([a, mismaSemilla]).find(x => x.model_id === 'm1').robustez.desviacion, null, 'misma semilla repetida no es robustez');
  assert.deepEqual(resumirCompetencia([]), []);
});
test('en el juego real cada partida es otro mundo: la robustez agrupa por hash_mundo, no por una semilla que no controla nada', () => {
  const base = reconstruirReporte(registro());
  const real = (hash_mundo, puntos) => ({ ...base, determinista: false, escenario: { hash_mundo }, ranking: base.ranking.map(r => ({ ...r, puntos })) });
  const m1 = reportes => resumirCompetencia(reportes).find(x => x.model_id === 'm1').robustez;
  // Misma semilla pedida (5) pero tres mundos distintos => tres muestras; un mismo mundo repetido => una.
  assert.equal(m1([real('A', 100), real('B', 120), real('C', 140)]).semillas, 3);
  assert.equal(m1([real('A', 100), real('A', 120)]).semillas, 1);
  assert.equal(m1([{ ...base, determinista: true }, { ...base, determinista: true }]).semillas, 1, 'en el simulador manda la semilla');
});
test('el reporte puntua con la tabla de pesos guardada en el log, no con la del codigo vigente', () => {
  const log = registro(); log[0].config.pesos = { supervivencia: 0, poblacion: 1, penalizacion: 0 };
  assert.deepEqual(reconstruirReporte(log).ranking.map(x => [x.participant_id, x.puntos]), [['f1', 25], ['f2', 20], ['f3', 0]]);
  delete log[0].config.pesos;
  assert.equal(reconstruirReporte(log).ranking[0].puntos, 163, 'sin tabla en el log se usa la del simulador');
});
test('csv: escapes, formulas y vacios', () => {
  assert.equal(csv([], ['a', 'b']), 'a,b\n');
  assert.equal(csv([{ a: null, b: undefined }], ['a', 'b']), 'a,b\n,\n');
  assert.equal(csv([{ a: 'x,y', b: 'l1\nl2' }], ['a', 'b']), 'a,b\n"x,y","l1\nl2"\n');
  assert.equal(csv([{ a: 'dice "hola"' }], ['a']), 'a\n"dice ""hola"""\n');
  for (const peligro of ['=1+1', '+1', '@SUM(A1)', '-cmd', '\tx']) assert.ok(csv([{ a: peligro }], ['a']).split('\n')[1].startsWith("'") || csv([{ a: peligro }], ['a']).split('\n')[1].startsWith('"\''), peligro);
  assert.equal(csv([{ a: -5 }], ['a']), 'a\n-5\n', 'un numero negativo no es una formula');
  assert.equal(csv([{ a: 0.5 }, { a: true }], ['a']), 'a\n0.5\ntrue\n');
});
