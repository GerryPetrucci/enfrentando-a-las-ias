import test from 'node:test';
import assert from 'node:assert/strict';
import { correrCompetencia } from '../../worldbox/orquestador.js';
import { crearAdaptadorSimulado } from '../../worldbox/adaptador-simulado.js';
import { crearBot } from '../../worldbox/bots.js';
import { crearPasarela } from '../../worldbox/pasarela.js';
import { reconstruirReporte, csv, escribirReporte, resumirCompetencia } from '../../worldbox/reporte.js';
import { crearTelemetria, leerTelemetria, CAMPOS_DECISION } from '../../worldbox/telemetria.js';
import { hash } from '../../worldbox/util.js';
import { opcionesCli } from '../../worldbox/correr.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { spawnSync } from 'node:child_process';

const config = (nombres = ['bot-voraz', 'bot-aleatorio'], extra = {}) => ({ adaptador: crearAdaptadorSimulado(), participantes: nombres.map((modelo, i) => ({ id: `f${i + 1}`, modelo, decidir: crearBot(modelo, 7 + i) })), semilla: 7, turnos: 5, ...extra });
test('partida completa determinista: mismos bots y seed dan hash y ranking exactos', async () => {
  const a = await correrCompetencia(config()), b = await correrCompetencia(config());
  assert.equal(a.reporte.completo, true); assert.equal(a.reporte.hash_final, b.reporte.hash_final); assert.deepEqual(a.reporte.ranking, b.reporte.ranking);
  assert.equal(a.reporte.hash_final, '5a00c540c6826dde93adce4007f1750b9dd6c5efc0a2c2afc5f4934c4c8fe1d6');
  assert.equal(a.reporte.ranking[0].puntos, 192); assert.equal(a.reporte.ranking[1].puntos, 161.9);
  assert.equal(a.eventos.filter(e => e.tipo === 'decision').length, 10);
  for (const e of a.eventos.filter(e => e.tipo === 'decision')) {
    for (const k of CAMPOS_DECISION) assert.ok(Object.hasOwn(e, k), k);
    assert.equal(hash(e.observation), e.observation_hash); assert.equal(hash(e.snapshot), e.world_snapshot_ref);
  }
});
test('orden rotado entre turnos y partidas; vistas congeladas antes de actuar', async () => {
  const a = await correrCompetencia(config(['bot-voraz', 'bot-pasivo'], { turnos: 2 }));
  const d = a.eventos.filter(e => e.tipo === 'decision');
  assert.deepEqual(d.map(e => e.participant_id), ['f1', 'f2', 'f2', 'f1']);
  assert.equal(d[1].observation.rivales[0].ciudades, 1); assert.equal(d[0].snapshot[0].ciudades, 2);
  const b = await correrCompetencia(config(['bot-voraz', 'bot-pasivo'], { indicePartida: 1, turnos: 1 }));
  assert.deepEqual(b.eventos.filter(e => e.tipo === 'decision').map(e => e.participant_id), ['f2', 'f1']);
});
test('JSON roto y acciones inventadas pierden decision, penalizan y no rompen partida', async () => {
  const { reporte, eventos } = await correrCompetencia(config(['bot-roto', 'bot-pasivo']));
  assert.equal(reporte.completo, true); assert.equal(reporte.ranking.find(r => r.model_id === 'bot-roto').penalizaciones, 5);
  assert.ok(eventos.filter(e => e.tipo === 'decision' && e.model_id === 'bot-roto').every(e => e.action_validated[0].action === 'esperar'));
});
test('presupuesto y tokens paran sin omitir el intento ni excluir partida incompleta', async () => {
  for (const [presupuesto, maxTokens, razon] of [[0, 100000, 'presupuesto'], [1, 1, 'limite_tokens']]) {
    let llamadas = 0;
    const pasarela = crearPasarela({ presupuesto, tarifas: { falso: { entrada: 1, salida: 1 } }, llamar: async () => { llamadas++; }, limitador: { esperar: async () => {} } });
    const { reporte, eventos } = await correrCompetencia(config(['bot-pasivo', 'bot-pasivo'], { presupuesto, maxTokens, participantes: [{ id: 'f1', modelo: 'falso' }, { id: 'f2', modelo: 'falso' }], pasarela }));
    assert.equal(reporte.completo, false); assert.equal(reporte.razon, razon); assert.equal(llamadas, 0);
    assert.equal(eventos.filter(e => e.tipo === 'decision').length, 1); assert.equal(reporte.ranking.length, 2);
  }
});
test('tiempo global y fallo del puente dejan estado confirmado y reporte', async () => {
  let reloj = 0;
  const c = config(['bot-pasivo', 'bot-pasivo'], { ahora: () => reloj, maxTiempoMs: 20 });
  c.participantes[0].decidir = async () => { reloj += 21; return JSON.stringify({ actions: [{ action: 'recolectar', parameters: {} }], reasoning_summary: '' }); };
  const tiempo = await correrCompetencia(c); assert.equal(tiempo.reporte.razon, 'limite_tiempo'); assert.equal(tiempo.reporte.completo, false);
  const a = crearAdaptadorSimulado(); a.avanzar = async () => { throw new Error('TOKEN-SECRETO'); };
  const fallo = await correrCompetencia(config(undefined, { adaptador: a }));
  assert.equal(fallo.reporte.completo, false); assert.equal(fallo.reporte.razon, 'puente_error_interno'); assert.ok(!JSON.stringify(fallo).includes('TOKEN-SECRETO'));
});
test('reporte se reconstruye exactamente desde JSONL, CSV estables y no sobreescribe log', async () => {
  const carpeta = await mkdtemp(join(tmpdir(), 'worldbox-w3-'));
  try {
    const archivo = join(carpeta, 'eventos.jsonl'), telemetria = await crearTelemetria(archivo);
    const { reporte } = await correrCompetencia(config(undefined, { telemetria, competitionId: 'competencia', runId: 'corrida' }));
    const leidos = await leerTelemetria(archivo);
    assert.deepEqual(reconstruirReporte(leidos), reporte);
    assert.equal(reconstruirReporte(leidos.filter(e => e.tipo !== 'fin')).completo, false);
    await escribirReporte(reporte, carpeta);
    assert.equal(await readFile(join(carpeta, 'reporte.json'), 'utf8'), JSON.stringify(reporte, null, 2) + '\n');
    assert.equal(await readFile(join(carpeta, 'ranking.csv'), 'utf8'), 'puesto,participant_id,model_id,puntos,penalizaciones,costo,puntos_por_dolar,fallos,turnos_sin_respuesta,acciones_invalidas,acciones_rechazadas,reintentos,input_tokens,output_tokens\n1,f1,bot-voraz,192,0,0,,0,0,0,0,0,0,0\n2,f2,bot-aleatorio,161.9,0,0,,0,0,0,0,0,0,0\n');
    await assert.rejects(() => crearTelemetria(archivo), /EEXIST/);
  } finally { assert.equal(dirname(resolve(carpeta)), resolve(tmpdir())); assert.ok(basename(carpeta).startsWith('worldbox-w3-')); await rm(carpeta, { recursive: true, force: true }); }
});
test('CSV escapa comillas y formulas; telemetria elimina secretos conocidos', async () => {
  assert.equal(csv([{ a: 'a,"b', b: '=cmd' }], ['a', 'b']), 'a,b\n"a,""b",\'=cmd\n');
  const t = await crearTelemetria(); await t.registrar({ tipo: 'prueba', token: 'secreto', texto: 'sk-or-v1-secreto Bearer secreto' });
  assert.ok(!JSON.stringify(t.eventos).includes('secreto'));
});
test('CLI sin pago rechaza modelos antes de cualquier import de cliente; bots nunca leen .env ni hacen fetch', () => {
  assert.throws(() => opcionesCli(['--modelos=a,b']), /pago_no_autorizado/);
  assert.equal(opcionesCli([]).partidas, 1);
  assert.throws(() => opcionesCli(['--partidas=0']), /partidas_invalidas/);
  const codigo = `import fs from 'node:fs'; import { syncBuiltinESMExports } from 'node:module';
    const leer = fs.readFileSync; fs.readFileSync = function(p,...args) { if (String(p).endsWith('.env')) throw Error('LECTURA_ENV'); return leer.call(this,p,...args); }; syncBuiltinESMExports();
    globalThis.fetch = () => { throw Error('RED_PROHIBIDA'); };
    const { correrCompetencia } = await import('./src/worldbox/orquestador.js');
    const { crearAdaptadorSimulado } = await import('./src/worldbox/adaptador-simulado.js');
    const { crearBot } = await import('./src/worldbox/bots.js');
    const r = await correrCompetencia({adaptador:crearAdaptadorSimulado(), participantes:['a','b'].map(id=>({id,modelo:'bot-pasivo',decidir:crearBot('bot-pasivo')})),turnos:1});
    if (!r.reporte.completo) throw Error('INCOMPLETA');`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', codigo], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});
test('cuatro facciones y dos modelos falsos completan sin API; resumen entre semillas incluye incompletas', async () => {
  const cuatro = await correrCompetencia(config(['bot-voraz', 'bot-aleatorio', 'bot-roto', 'bot-pasivo']));
  assert.equal(cuatro.reporte.ranking.length, 4); assert.equal(cuatro.reporte.completo, true);
  const texto = JSON.stringify({ actions: [{ action: 'esperar', parameters: {} }], reasoning_summary: '' });
  let llamadas = 0;
  const pasarela = crearPasarela({ presupuesto: 1, presupuestoModelo: 0.5, tarifas: { uno: { entrada: 1, salida: 1 }, dos: { entrada: 1, salida: 1 } }, maxTokens: 100, limitador: { esperar: async () => {} }, llamar: async () => { llamadas++; return { texto, uso: { cost: 0.01, prompt_tokens: 100, completion_tokens: 10 } }; } });
  const r = await correrCompetencia(config(undefined, { participantes: [{ id: 'f1', modelo: 'uno' }, { id: 'f2', modelo: 'dos' }], pasarela, presupuesto: 1, turnos: 2 }));
  assert.equal(llamadas, 4); assert.equal(r.reporte.completo, true); assert.ok(r.reporte.modelos.every(m => m.costo === 0.02));
  const resumen = resumirCompetencia([r.reporte, { ...r.reporte, completo: false, config: { ...r.reporte.config, semilla: 8 } }]);
  assert.equal(resumen[0].robustez.semillas, 2); assert.equal(resumen[0].incompletas, 1); assert.equal(resumen[0].costo, 0.04);
});
test('supervivencia termina al eliminar rival; no se resucita al avanzar', async () => {
  const c = config(['bot-pasivo', 'bot-pasivo'], { turnos: 80 });
  c.participantes[0].decidir = async ({ observation }) => {
    const atacar = (observation.faccion.cooldowns.atacar ?? 0) <= observation.turno_juego + 1;
    return JSON.stringify({ actions: [{ action: atacar ? 'atacar' : 'esperar', parameters: atacar ? { objetivo: 'f2' } : {} }], reasoning_summary: '' });
  };
  const { reporte } = await correrCompetencia(c);
  assert.equal(reporte.razon, 'supervivencia'); assert.equal(reporte.turnos, 49);
  const muerto = reporte.ranking.find(r => r.id === 'f2'); assert.equal(muerto.vivo, false); assert.equal(muerto.poblacion, 0); assert.equal(muerto.ciudades, 0); assert.equal(muerto.territorio, 0);
});
test('tope de acciones y revalidacion de cooldown dentro de una decision', async () => {
  const c = config(['bot-pasivo', 'bot-pasivo'], { turnos: 1 });
  c.participantes[0].decidir = async () => JSON.stringify({ actions: [1, 2, 3].map(() => ({ action: 'expandir', parameters: { cantidad: 1 } })), reasoning_summary: '' });
  const r = await correrCompetencia(c);
  assert.equal(r.reporte.ranking.find(f => f.id === 'f1').penalizaciones, 2);
  assert.deepEqual(r.eventos.find(e => e.tipo === 'decision').action_validated.map(a => a.action), ['expandir', 'esperar', 'esperar']);
  c.adaptador = crearAdaptadorSimulado(); c.participantes[0].decidir = async () => JSON.stringify({ actions: Array(4).fill({ action: 'recolectar', parameters: {} }), reasoning_summary: '' });
  const exceso = await correrCompetencia(c);
  assert.equal(exceso.reporte.ranking.find(f => f.id === 'f1').penalizaciones, 1);
});
const JSON_RECOLECTAR = JSON.stringify({ actions: [{ action: 'recolectar', parameters: {} }], reasoning_summary: 'ok' });
test('fallos tecnicos del proveedor pierden la decision SIN infraccion; el contenido invalido si penaliza', async () => {
  const llamar = async ({ modelo }) => {
    if (modelo === 'caido') throw new Error('proveedor caido');
    return { texto: modelo === 'torpe' ? '{roto' : JSON_RECOLECTAR, uso: { cost: 0, prompt_tokens: 10, completion_tokens: 5 } };
  };
  const tarifas = Object.fromEntries(['caido', 'torpe', 'bueno'].map(m => [m, { entrada: 1, salida: 1 }]));
  const pasarela = crearPasarela({ presupuesto: 10, tarifas, maxTokens: 100, llamar, limitador: { esperar: async () => {} }, reintentos: 0 });
  const { reporte, eventos } = await correrCompetencia(config(undefined, { participantes: ['caido', 'torpe', 'bueno'].map((modelo, i) => ({ id: `f${i + 1}`, modelo })), pasarela, presupuesto: 10, turnos: 3 }));
  assert.equal(reporte.completo, true, 'un proveedor caido no detiene la partida');
  const fila = id => reporte.ranking.find(r => r.participant_id === id);
  assert.equal(fila('f1').penalizaciones, 0); assert.equal(fila('f1').turnos_sin_respuesta, 3); assert.equal(fila('f1').fallos, 3);
  assert.equal(fila('f2').penalizaciones, 3); assert.equal(fila('f2').turnos_sin_respuesta, 3);
  assert.equal(fila('f3').penalizaciones, 0); assert.equal(fila('f3').fallos, 0);
  for (const e of eventos.filter(e => e.tipo === 'decision' && e.participant_id === 'f1')) assert.deepEqual(e.action_validated, [{ action: 'esperar', parameters: {} }]);
});
test('esperar nunca viaja al adaptador y solo se envia lo que se ejecuta', async () => {
  const enviadas = [], adaptador = crearAdaptadorSimulado(), ejecutar = adaptador.ejecutar;
  adaptador.ejecutar = async datos => { enviadas.push(datos.accion); return ejecutar(datos); };
  await correrCompetencia(config(['bot-pasivo', 'bot-roto'], { adaptador, turnos: 4 }));
  assert.deepEqual(enviadas, []);
  const voraz = [], a2 = crearAdaptadorSimulado(), e2 = a2.ejecutar;
  a2.ejecutar = async datos => { voraz.push(datos.accion); return e2(datos); };
  await correrCompetencia(config(['bot-voraz', 'bot-pasivo'], { adaptador: a2, turnos: 4 }));
  assert.ok(voraz.length > 0 && voraz.every(a => a !== 'esperar'));
});
test('el inicio registra la auditoria de reproducibilidad: semilla pedida/usada, hash del mundo y del estado inicial', async () => {
  const { eventos, reporte } = await correrCompetencia(config(undefined, { semilla: 11, turnos: 1 }));
  const inicio = eventos.find(e => e.tipo === 'inicio');
  assert.equal(inicio.determinista, true); assert.equal(reporte.determinista, true);
  assert.deepEqual(Object.keys(inicio.escenario).sort(), ['escenario_id', 'hash_estado_inicial', 'hash_mundo', 'semilla_pedida', 'semilla_usada']);
  assert.equal(inicio.escenario.semilla_pedida, 11); assert.equal(inicio.escenario.semilla_usada, 11);
  assert.equal(inicio.escenario.hash_estado_inicial, hash(inicio.snapshot)); assert.deepEqual(reporte.escenario, inicio.escenario);
  const otra = await correrCompetencia(config(undefined, { semilla: 12, turnos: 1 }));
  const misma = await correrCompetencia(config(undefined, { semilla: 11, turnos: 1 }));
  assert.equal(misma.reporte.escenario.hash_mundo, reporte.escenario.hash_mundo); assert.notEqual(otra.reporte.escenario.hash_mundo, reporte.escenario.hash_mundo);
  assert.equal(inicio.config.adaptador.determinista, true); assert.deepEqual(inicio.config.acciones_habilitadas, ['esperar', 'recolectar', 'expandir', 'fundar', 'reclutar', 'atacar']);
  // Todas las facciones empiezan idénticas: el estado inicial no depende del asiento.
  const [a, b] = inicio.snapshot.map(({ id, ...resto }) => resto); assert.deepEqual(a, b);
});
test('si el adaptador usa otra semilla que la pedida, la partida queda marcada como NO reproducible', async () => {
  const adaptador = crearAdaptadorSimulado(), reiniciar = adaptador.reiniciarEscenario;
  adaptador.reiniciarEscenario = async datos => ({ ...await reiniciar(datos), semilla_usada: datos.semilla + 1 });
  const { reporte } = await correrCompetencia(config(undefined, { adaptador, turnos: 1 }));
  assert.equal(reporte.determinista, false); assert.equal(reporte.escenario.semilla_pedida, 7); assert.equal(reporte.escenario.semilla_usada, 8);
});
test('configuracion invalida o adaptador sin capacidades se rechaza antes de registrar nada', async () => {
  for (const extra of [{ semilla: -1 }, { semilla: 1.5 }, { semilla: 2 ** 32 }, { turnos: 0 }, { maxAcciones: 0 }, { maxAcciones: 11 }, { tamanoMapa: 11 }, { presupuesto: -1 }, { presupuesto: NaN }, { maxTokens: 0 }, { indicePartida: -1 },
    { participantes: [{ id: 'f1', modelo: 'x', decidir: async () => '' }] }, { participantes: Array(5).fill(0).map((_, i) => ({ id: `f${i}`, modelo: 'x', decidir: async () => '' })) },
    { participantes: [{ id: 'f1', modelo: 'x', decidir: async () => '' }, { id: 'f1', modelo: 'y', decidir: async () => '' }] }, { participantes: [{ id: 'f 1', modelo: 'x', decidir: async () => '' }, { id: 'f2', modelo: 'y', decidir: async () => '' }] },
    { participantes: [{ id: 'f1', modelo: 'x' }, { id: 'f2', modelo: 'y' }] }]) {
    await assert.rejects(() => correrCompetencia(config(undefined, extra)), /solicitud_invalida/, JSON.stringify(Object.keys(extra)));
  }
  const log = await crearTelemetria(), a = crearAdaptadorSimulado(), info = a.info;
  a.info = async () => ({ ...await info(), limites: { max_segundos_avance: 1, max_acciones_por_turno: 2 } });
  await assert.rejects(() => correrCompetencia(config(undefined, { adaptador: a, telemetria: log })), /no_soportado/);
  const b = crearAdaptadorSimulado(), infoB = b.info;
  b.info = async () => { const i = await infoB(); return { ...i, capacidades: { ...i.capacidades, avanzar: false } }; };
  await assert.rejects(() => correrCompetencia(config(undefined, { adaptador: b, telemetria: log })), /no_soportado/);
  assert.equal(log.eventos.length, 0, 'un fallo de arranque no deja un log a medias');
});
test('un unico texto de sistema para todos; el hash de la peticion distingue la vista', async () => {
  const { reporte, eventos } = await correrCompetencia(config(['bot-voraz', 'bot-aleatorio', 'bot-pasivo'], { turnos: 3 }));
  const d = eventos.filter(e => e.tipo === 'decision');
  assert.equal(new Set(d.map(e => e.sistema_hash)).size, 1); assert.equal(reporte.equidad.prompts_sistema_distintos, 1);
  assert.equal(new Set(d.filter(e => e.turn_number === 1).map(e => e.prompt_hash)).size, 3);
  assert.equal(reporte.equidad.prompt_version, 'worldbox-1.2.0'); assert.equal(reporte.equidad.rules_version, 'auge-simulado-1.0.0');
  // Mismas vistas congeladas: el hash de observacion es el del contenido que se registro.
  for (const e of d) assert.equal(hash(e.observation), e.observation_hash);
});
test('si el estado confirmado pierde una faccion, la partida queda incompleta con su ultimo estado', async () => {
  const adaptador = crearAdaptadorSimulado(), terminal = adaptador.estadoTerminal;
  let llamadas = 0;
  adaptador.estadoTerminal = async () => { const r = await terminal(); return ++llamadas > 6 ? { ...r, resumen_por_faccion: r.resumen_por_faccion.slice(1) } : r; };
  const { reporte } = await correrCompetencia(config(undefined, { adaptador, turnos: 10 }));
  assert.equal(reporte.completo, false); assert.equal(reporte.razon, 'puente_respuesta_invalida'); assert.equal(reporte.ranking.length, 2);
});
test('una accion rechazada por el adaptador cuesta una infraccion y se cuenta aparte', async () => {
  const c = config(['bot-pasivo', 'bot-pasivo'], { turnos: 1 });
  // fundar (15 de 20 recursos) y luego expandir 3 (18): el esquema y el reglamento lo permiten, el adaptador rechaza por recursos;
  // la accion siguiente del array se sigue evaluando.
  c.participantes[0].decidir = async () => JSON.stringify({ actions: [{ action: 'fundar', parameters: {} }, { action: 'expandir', parameters: { cantidad: 3 } }, { action: 'recolectar', parameters: {} }], reasoning_summary: '' });
  const { reporte, eventos } = await correrCompetencia(c);
  const f1 = reporte.ranking.find(r => r.participant_id === 'f1');
  assert.equal(f1.penalizaciones, 1); assert.equal(f1.acciones_rechazadas, 1); assert.equal(f1.acciones_invalidas, 0);
  assert.deepEqual(eventos.find(e => e.tipo === 'decision').execution_result.map(x => x.resultado + '/' + x.codigo), ['ejecutada/ok', 'rechazada/recursos_insuficientes', 'ejecutada/ok']);
});
test('un objetivo que no es un rival vivo (inexistente, uno mismo, eliminado) es CONTENIDO invalido: infraccion, nunca llega al adaptador y la partida sigue', async () => {
  const enviadas = [], adaptador = crearAdaptadorSimulado(), ejecutar = adaptador.ejecutar;
  adaptador.ejecutar = async datos => { enviadas.push(datos); return ejecutar(datos); };
  const c = config(['bot-pasivo', 'bot-pasivo'], { adaptador, turnos: 3 });
  c.participantes[0].decidir = async ({ turno }) => JSON.stringify({ actions: [{ action: 'atacar', parameters: { objetivo: ['fantasma', 'f1', 'F2'][turno - 1] } }], reasoning_summary: '' });
  const { reporte, eventos } = await correrCompetencia(c);
  assert.equal(reporte.completo, true); assert.equal(reporte.turnos, 3); assert.equal(reporte.ranking.find(r => r.participant_id === 'f1').penalizaciones, 3);
  assert.deepEqual(enviadas, [], 'ninguna orden con objetivo invalido llega al puente');
  assert.deepEqual(eventos.filter(e => e.tipo === 'decision' && e.participant_id === 'f1').map(e => e.error_type), ['objetivo_invalido', 'objetivo_invalido', 'objetivo_invalido']);
  assert.deepEqual(eventos.find(e => e.tipo === 'decision').action_validated, [{ action: 'esperar', parameters: {} }]);
  // Con tres facciones, un id que no existe sigue siendo invalido.
  const d = config(['bot-pasivo', 'bot-pasivo', 'bot-pasivo'], { turnos: 2 });
  d.participantes[0].decidir = async () => JSON.stringify({ actions: [{ action: 'atacar', parameters: { objetivo: 'f9' } }], reasoning_summary: '' });
  assert.equal((await correrCompetencia(d)).reporte.ranking.find(r => r.participant_id === 'f1').penalizaciones, 2);
});
