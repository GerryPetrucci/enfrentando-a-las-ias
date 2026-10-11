// herramientas/ver-lote.mjs: consulta un lote ya enviado (solo lectura, no gasta). Sirve cuando una corrida se interrumpe a media
// espera: el lote sigue en OpenRouter y se cobra, y con su id (la consola lo imprime al enviarlo) se ve en que quedo.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resumirLote } from '../../herramientas/ver-lote.mjs';

const RAIZ = fileURLToPath(new URL('../..', import.meta.url));

const enCurso = { id: 'batch-1', model: 'anthropic/claude-haiku-5.5-20261007', status: 'in_progress', request_counts: { total: 2, completed: 0, failed: 0 }, usage: null };
const terminado = {
  id: 'batch-2', model: 'openai/gpt-6-luna', status: 'completed', request_counts: { total: 2, completed: 1, failed: 1 },
  usage: { prompt_tokens: 1200, completion_tokens: 300, total_tokens: 1500, cost: 0.000345 },
  results: [
    { custom_id: 'p1', error: null, response: { status_code: 200, body: { choices: [{ message: { content: '{"ordenes": []}' }, finish_reason: 'stop' }] } } },
    { custom_id: 'p2', response: null, error: { message: 'proveedor caido' } },
  ],
};

test('resumirLote de un lote en curso: estado y conteo, y avisa que el costo aun no se informa', () => {
  const t = resumirLote(enCurso);
  assert.match(t, /batch-1/);
  assert.match(t, /claude-haiku-5\.5/);
  assert.match(t, /in_progress/);
  assert.match(t, /2 en total, 0 listas, 0 fallidas/);
  assert.match(t, /Costo: aun no informado/);
  assert.doesNotMatch(t, /p1/);
});

test('resumirLote de un lote terminado: tokens, costo, y con resultados:true el destino de cada peticion', () => {
  const t = resumirLote(terminado);
  assert.match(t, /completed/);
  assert.match(t, /1,500 tokens/);
  assert.match(t, /Costo: \$0\.000345/);
  assert.doesNotMatch(t, /proveedor caido/, 'sin resultados:true no se listan las peticiones');
  const con = resumirLote(terminado, { resultados: true });
  assert.match(con, /p1 {2}ok {2}\{"ordenes": \[\]\}/);
  assert.match(con, /p2 {2}ERROR {2}proveedor caido/);
});

test('resumirLote no se cae con una respuesta incompleta', () => {
  assert.match(resumirLote({}), /Lote \?/);
  assert.match(resumirLote(null), /Lote \?/);
});

test('la consola pide el id del lote y no toca la red sin el', () => {
  const r = spawnSync(process.execPath, ['herramientas/ver-lote.mjs'], { cwd: RAIZ, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /id del lote/);
});
