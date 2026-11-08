import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { servirPuenteReal } from './ayudas.js';
import { auditarEventos, auditarCarpeta, textoReplay } from '../../worldbox/auditar.js';
import { correrCompetencia } from '../../worldbox/orquestador.js';
import { crearAdaptadorHttp } from '../../worldbox/adaptador-http.js';
import { crearAdaptadorSimulado } from '../../worldbox/adaptador-simulado.js';
import { crearBot } from '../../worldbox/bots.js';
import { crearTelemetria, leerTelemetria } from '../../worldbox/telemetria.js';
import { escribirReporte } from '../../worldbox/reporte.js';

const AUDITAR = fileURLToPath(new URL('../../worldbox/auditar.js', import.meta.url));
async function conCarpeta(fn) { const c = await mkdtemp(join(tmpdir(), 'worldbox-aud-')); try { await fn(c); } finally { await rm(c, { recursive: true, force: true }); } }
async function corridaReal(t, carpeta, bots = ['bot-voraz', 'bot-expansionista'], turnos = 8) {
  const puente = await servirPuenteReal(t), telemetria = await crearTelemetria(join(carpeta, 'eventos.jsonl'));
  const { reporte } = await correrCompetencia({ adaptador: crearAdaptadorHttp({ url: puente.url, token: puente.token }), turnos, telemetria,
    participantes: bots.map((n, i) => ({ id: `f${i + 1}`, modelo: n, decidir: crearBot(n, 3 + i) })) });
  await escribirReporte(reporte, carpeta);
  return reporte;
}
const reescribir = async (archivo, f) => { const ev = (await readFile(archivo, 'utf8')).split('\n').filter(Boolean).map(l => JSON.parse(l)); f(ev); await writeFile(archivo, ev.map(e => JSON.stringify(e)).join('\n') + '\n'); };

test('una corrida intacta pasa la auditoria: hashes, puntos, costos, reporte guardado y prompts reconstruidos', async t => {
  await conCarpeta(async c => {
    const reporte = await corridaReal(t, c);
    const a = await auditarCarpeta(c);
    assert.deepEqual(a.problemas, []); assert.equal(a.ok, true);
    assert.equal(a.resumen.hash_final, reporte.hash_final); assert.equal(a.resumen.reglas, 'real'); assert.equal(a.resumen.rules_version, 'auge-real-1.1.0');
    const decisiones = (await leerTelemetria(join(c, 'eventos.jsonl'))).filter(e => e.tipo === 'decision').length;
    assert.equal(a.resumen.decisiones, decisiones); assert.equal(a.resumen.prompts_verificados, decisiones, 'cada prompt enviado se reconstruye identico desde el log');
    assert.equal(a.replay.length, reporte.turnos);
    const texto = textoReplay(a);
    assert.ok(texto.startsWith('Turno 1  puntos f1=') && texto.includes('bot-voraz') && texto.includes('crear_unidades'), texto.slice(0, 200));
  });
});
test('la auditoria detecta cada manipulacion del log o del reporte', async t => {
  await conCarpeta(async c => {
    await corridaReal(t, c);
    const log = join(c, 'eventos.jsonl'), original = await readFile(log, 'utf8'), reporteOriginal = await readFile(join(c, 'reporte.json'), 'utf8');
    const casos = [
      ['observacion alterada', ev => { ev.find(e => e.tipo === 'decision').observation.faccion.poblacion += 1; }, /observation_hash/],
      ['snapshot alterado', ev => { ev.find(e => e.tipo === 'decision').snapshot[0].poblacion += 1; }, /world_snapshot_ref/],
      ['puntos de turno alterados', ev => { ev.find(e => e.tipo === 'turno').resultados[0].puntos += 1; }, /puntos registrados/],
      ['costo del cierre alterado', ev => { ev.find(e => e.tipo === 'fin').consumo.costo = 5; }, /suma de las decisiones/],
      ['version de prompt cambiada', ev => { ev.find(e => e.tipo === 'decision').prompt_version = 'otra'; }, /version distinta/],
      ['sistema_hash alterado', ev => { ev.find(e => e.tipo === 'decision').sistema_hash = 'x'; }, /texto de sistema/],
      ['prompt_hash alterado', ev => { ev.find(e => e.tipo === 'decision').prompt_hash = 'x'; }, /prompt reconstruido/],
      ['resultado de accion eliminado', ev => { ev.find(e => e.tipo === 'decision' && e.execution_result.length).execution_result.pop(); }, /no cuadran/],
      ['campo obligatorio eliminado', ev => { delete ev.find(e => e.tipo === 'decision').timestamp; }, /telemetria_incompleta/],
      ['estado inicial alterado', ev => { ev[0].snapshot[0].poblacion += 1; }, /hash_estado_inicial/],
      ['catalogo alterado', ev => { ev[0].config.acciones_habilitadas.pop(); }, /catalogo/],
      ['participante inventado', ev => { ev.find(e => e.tipo === 'decision').participant_id = 'zz'; }, /participante desconocido/],
      // Hallazgo R1-2: la respuesta original se revalida y se contrasta con lo registrado; el modelo se vincula al participante.
      ['action_raw alterado (otra jugada valida)', ev => { ev.find(e => e.tipo === 'decision' && e.action_validated[0].action !== 'esperar').action_raw = JSON.stringify({ actions: [{ action: 'esperar', parameters: {} }], reasoning_summary: '' }); }, /action_validated no corresponde a revalidar action_raw/],
      ['action_raw convertido en JSON roto', ev => { ev.find(e => e.tipo === 'decision' && e.action_validated[0].action !== 'esperar').action_raw = '{roto'; }, /action_validated no corresponde a revalidar action_raw/],
      ['accion validada inventada', ev => { ev.find(e => e.tipo === 'decision' && e.action_validated[0].action !== 'esperar').action_validated[0] = { action: 'inventada', parameters: {} }; }, /action_validated no corresponde a revalidar action_raw/],
      ['parametro validado cambiado', ev => { const a = ev.find(e => e.tipo === 'decision' && e.action_validated[0].action === 'crear_unidades').action_validated[0]; a.parameters.cantidad = a.parameters.cantidad === 5 ? 4 : 5; }, /action_validated no corresponde a revalidar action_raw/],
      ['model_id alterado', ev => { ev.find(e => e.tipo === 'decision').model_id = 'bot-trucado'; }, /model_id bot-trucado distinto del participante registrado/],
      ['penalizaciones alteradas', ev => { ev.find(e => e.tipo === 'decision').penalizaciones += 2; }, /penalizaciones registradas/],
      ['usos alterados', ev => { ev.findLast(e => e.tipo === 'decision').usos.crear_unidades = { veces: 9, acumulado: 9 }; }, /usos registrados no coinciden/],
      ['restricciones mostradas alteradas', ev => { const d = ev.findLast(e => e.tipo === 'decision' && e.estado_orquestador); d.estado_orquestador.restricciones.crear_unidades = { acumulado: 0, maximo_acumulado: 10 }; }, /restricciones mostradas/],
      ['cooldowns mostrados alterados', ev => { ev.find(e => e.tipo === 'decision' && e.turn_number === 3).estado_orquestador.cooldowns = { fantasma: 99 }; }, /cooldowns mostrados/],
    ];
    for (const [nombre, cambio, esperado] of casos) {
      await writeFile(log, original); await reescribir(log, cambio);
      const a = await auditarCarpeta(c);
      assert.equal(a.ok, false, nombre); assert.ok(a.problemas.some(p => esperado.test(p)), `${nombre}: ${JSON.stringify(a.problemas)}`);
    }
    await writeFile(log, original);
    const guardado = JSON.parse(reporteOriginal); guardado.ranking[0].puntos += 1;
    await writeFile(join(c, 'reporte.json'), JSON.stringify(guardado));
    assert.ok((await auditarCarpeta(c)).problemas.some(p => /reporte\.json no es el reconstruido/.test(p)));
    await writeFile(join(c, 'reporte.json'), reporteOriginal);
    // Un registro cortado: se audita lo que hay y se avisa; el JSONL corrupto falla explicitamente.
    await reescribir(log, ev => ev.pop());
    const cortado = await auditarCarpeta(c); assert.equal(cortado.resumen.completo, false); assert.ok(cortado.avisos.some(x => /sin_evento_fin/.test(x)));
    await writeFile(log, original + '{"tipo":"fin"');
    await assert.rejects(() => auditarCarpeta(c), /registro_corrupto/);
    assert.deepEqual((await auditarEventos([])).problemas, ['sin_evento_inicio']);
  });
});
test('una corrida de prompts de otra version se audita sin afirmar nada de los prompts', async t => {
  await conCarpeta(async c => {
    await corridaReal(t, c, ['bot-pasivo', 'bot-pasivo'], 2);
    const ev = await leerTelemetria(join(c, 'eventos.jsonl'));
    for (const e of ev) { if (e.prompt_version) e.prompt_version = '0.0.1'; if (e.config) e.config.prompt_version = '0.0.1'; }
    const a = await auditarEventos(ev);
    assert.deepEqual(a.problemas, []); assert.equal(a.resumen.prompts_verificados, 0); assert.ok(a.avisos.some(x => /no se pueden reconstruir/.test(x)));
  });
});
test('el simulador tambien se audita (hash, reglas, prompts) y el CLI sale con codigo 0 o 1', async t => {
  await conCarpeta(async c => {
    const telemetria = await crearTelemetria(join(c, 'eventos.jsonl'));
    const { reporte, eventos } = await correrCompetencia({ adaptador: crearAdaptadorSimulado(), telemetria, semilla: 7, turnos: 5, participantes: ['bot-voraz', 'bot-aleatorio'].map((n, i) => ({ id: `f${i + 1}`, modelo: n, decidir: crearBot(n, 7 + i) })) });
    await escribirReporte(reporte, c);
    const a = await auditarEventos(eventos); assert.deepEqual(a.problemas, []); assert.equal(a.resumen.prompts_verificados, 10); assert.equal(a.resumen.determinista, true);
    const ok = spawnSync(process.execPath, [AUDITAR, c], { encoding: 'utf8' });
    assert.equal(ok.status, 0, ok.stderr); assert.equal(JSON.parse(ok.stdout).ok, true);
    const replay = spawnSync(process.execPath, [AUDITAR, join(c, 'eventos.jsonl'), '--replay'], { encoding: 'utf8' });
    assert.equal(replay.status, 0); assert.ok(replay.stdout.includes('Turno 5'));
    await reescribir(join(c, 'eventos.jsonl'), ev => { ev.find(e => e.tipo === 'turno').resultados[0].puntos = 1; });
    const mal = spawnSync(process.execPath, [AUDITAR, c], { encoding: 'utf8' });
    assert.equal(mal.status, 1); assert.equal(JSON.parse(mal.stdout).ok, false);
    assert.equal(spawnSync(process.execPath, [AUDITAR], { encoding: 'utf8' }).status, 2);
  });
});
