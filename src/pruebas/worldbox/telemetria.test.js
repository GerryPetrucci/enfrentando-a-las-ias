import test from 'node:test';
import assert from 'node:assert/strict';
import { crearTelemetria, leerTelemetria, sanear, validarDecision, CAMPOS_DECISION } from '../../worldbox/telemetria.js';
import { mkdtemp, readFile, writeFile, appendFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const decision = (extra = {}) => ({ tipo: 'decision', competition_id: 'c', run_id: 'r', turn_number: 1, participant_id: 'f1', model_id: 'm', prompt_version: 'p', rules_version: 'v', observation_hash: 'h', observation: { x: 1 },
  request_id: 'q', latency_ms: 12, action_raw: '{}', action_validated: [], execution_result: [], input_tokens: 10, output_tokens: 5, cost: 0, cost_source: 'reportado', score_delta: -5, world_snapshot_ref: 's', error_type: null, retry_count: 0, timestamp: '2026-11-07T10:00:00.000Z', ...extra });
async function conCarpeta(fn) { const c = await mkdtemp(join(tmpdir(), 'worldbox-tel-')); try { await fn(c); } finally { await rm(c, { recursive: true, force: true }); } }

test('el evento de decision exige los 23 campos de la seccion 8 del plan', async () => {
  assert.equal(CAMPOS_DECISION.length, 23);
  assert.deepEqual([...CAMPOS_DECISION].sort(), ['action_raw', 'action_validated', 'competition_id', 'cost', 'cost_source', 'error_type', 'execution_result', 'input_tokens', 'latency_ms', 'model_id', 'observation', 'observation_hash', 'output_tokens', 'participant_id', 'prompt_version', 'request_id', 'retry_count', 'rules_version', 'run_id', 'score_delta', 'timestamp', 'turn_number', 'world_snapshot_ref'].sort());
  const t = await crearTelemetria();
  await t.registrar(decision()); assert.equal(t.eventos.length, 1);
  for (const campo of CAMPOS_DECISION) {
    const e = decision(); delete e[campo];
    await assert.rejects(() => t.registrar(e), /telemetria_incompleta/, campo);
  }
  assert.equal(t.eventos.length, 1, 'un registro incompleto no se guarda');
});
test('tipos imposibles en una decision se rechazan', async () => {
  const t = await crearTelemetria();
  for (const mal of [{ turn_number: 0 }, { turn_number: 1.5 }, { participant_id: 1 }, { latency_ms: -1 }, { latency_ms: NaN }, { input_tokens: 1.5 }, { output_tokens: -1 }, { cost: -0.1 }, { cost: '0' }, { cost_source: 'inventado' },
    { retry_count: -1 }, { action_validated: 'x' }, { execution_result: {} }, { action_raw: { a: 1 } }, { score_delta: 'x' }, { score_delta: Infinity }, { timestamp: 'ayer' }, { timestamp: 5 }]) {
    await assert.rejects(() => t.registrar(decision(mal)), /telemetria_(invalida|incompleta)/, JSON.stringify(mal));
  }
  assert.doesNotThrow(() => validarDecision(decision({ error_type: 'json_invalido', cost_source: 'estimado', score_delta: 0 })));
  await t.registrar({ tipo: 'inicio', cualquier: 'cosa' }); assert.equal(t.eventos.length, 1, 'los demas tipos de evento no se validan como decision');
});
test('JSONL: una linea por evento, relectura exacta, sin sobreescribir y corrupcion explicita', async () => {
  await conCarpeta(async c => {
    const archivo = join(c, 'anidado', 'eventos.jsonl'), t = await crearTelemetria(archivo);
    await t.registrar({ tipo: 'inicio', n: 1 }); await t.registrar(decision()); await t.registrar({ tipo: 'fin', texto: 'con\nsalto y "comillas"' });
    const texto = await readFile(archivo, 'utf8');
    assert.equal(texto.split('\n').length, 4); assert.ok(texto.endsWith('\n'));
    assert.deepEqual(await leerTelemetria(archivo), t.eventos);
    await assert.rejects(() => crearTelemetria(archivo), /EEXIST/);
    assert.equal(await readFile(archivo, 'utf8'), texto, 'el log existente queda intacto');
    await appendFile(archivo, '{"tipo":"fin"');
    await assert.rejects(() => leerTelemetria(archivo), /registro_corrupto/);
    const vacio = join(c, 'vacio.jsonl'); await writeFile(vacio, ''); assert.deepEqual(await leerTelemetria(vacio), []);
  });
});
test('el registro guarda una copia: cambiar el objeto despues no altera el log', async () => {
  const t = await crearTelemetria(), e = decision(); await t.registrar(e);
  e.observation.x = 99; e.cost = 5;
  assert.equal(t.eventos[0].observation.x, 1); assert.equal(t.eventos[0].cost, 0);
});
test('ningun secreto llega al log: claves, cabeceras y textos de proveedor se redactan', async () => {
  assert.equal(sanear('sk-or-v1-abc123 y Bearer xyz789'), '[REDACTADO] y Bearer [REDACTADO]');
  const limpio = sanear({ token: 't', Token: 't', 'X-Puente-Token': 't', Authorization: 'Bearer a', api_key: 'k', 'api-key': 'k', apiKey: 'k', input_tokens: 5, anidado: [{ token: 'x', ok: 'sk-abc' }] });
  assert.deepEqual(limpio, { input_tokens: 5, anidado: [{ ok: '[REDACTADO]' }] });
  await conCarpeta(async c => {
    const archivo = join(c, 'e.jsonl'), t = await crearTelemetria(archivo);
    await t.registrar(decision({ action_raw: 'mi llave es sk-or-v1-SECRETO', observation: { token: 'SECRETO', nota: 'Bearer SECRETO' } }));
    assert.ok(!(await readFile(archivo, 'utf8')).includes('SECRETO'));
  });
});
