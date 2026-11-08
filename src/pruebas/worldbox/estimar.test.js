import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { servirPuenteReal } from './ayudas.js';
import { estimarCosto, medirPrompts, tokensDeTexto, BYTES_POR_TOKEN } from '../../worldbox/estimar-costo.js';
import { correrCompetencia } from '../../worldbox/orquestador.js';
import { crearAdaptadorHttp } from '../../worldbox/adaptador-http.js';
import { crearBot } from '../../worldbox/bots.js';
import { crearTelemetria } from '../../worldbox/telemetria.js';

const CLI = fileURLToPath(new URL('../../worldbox/estimar-costo.js', import.meta.url));
const cerca = (a, b) => Math.abs(a - b) < 1e-12;

test('la estimacion es aritmetica exacta sobre tokens y precios por millon, con y sin cache de prefijo', () => {
  assert.equal(BYTES_POR_TOKEN, 3.5); assert.equal(tokensDeTexto('a'.repeat(35)), 10); assert.equal(tokensDeTexto('a'.repeat(36)), 11);
  const prompts = [{ sistema: 1000, usuario: 200 }, { sistema: 1000, usuario: 400 }];
  const r = estimarCosto(prompts, { modelos: [{ modelo: 'm', entrada: 1, salida: 2 }, { modelo: 'c', entrada: 2, salida: 10, cacheLectura: 0.1 }], salidas: [500, 2000], turnos: 24 });
  assert.deepEqual(r.tokens_entrada_por_llamada, { sistema: 1000, usuario: 300, total: 1300, max_usuario: 400 });
  assert.equal(r.supuestos.llamadas_por_modelo, 24);
  const m = r.modelos.find(x => x.modelo === 'm').escenarios;
  assert.ok(cerca(m[0].costo_modelo_sin_cache, 24 * (1300 * 1 + 500 * 2) / 1e6)); assert.ok(cerca(m[1].costo_modelo_sin_cache, 24 * (1300 * 1 + 2000 * 2) / 1e6));
  assert.equal(m[0].costo_modelo_con_cache, null);
  const c = r.modelos.find(x => x.modelo === 'c').escenarios[0];
  assert.ok(cerca(c.costo_modelo_sin_cache, 24 * (1300 * 2 + 500 * 10) / 1e6));
  assert.ok(cerca(c.costo_modelo_con_cache, (24 * (300 * 2 + 500 * 10) + 1000 * 2 + 23 * 1000 * 0.1) / 1e6));
  assert.ok(c.costo_modelo_con_cache < c.costo_modelo_sin_cache);
  assert.ok(cerca(r.total_competencia_sin_cache[0].total, m[0].costo_modelo_sin_cache + c.costo_modelo_sin_cache));
  // Dos asientos del mismo modelo duplican las llamadas.
  assert.equal(estimarCosto(prompts, { modelos: [{ modelo: 'm', entrada: 1, salida: 2 }], participantesPorModelo: 2 }).supuestos.llamadas_por_modelo, 48);
});
test('la estimacion rechaza datos que no permiten controlar el gasto', () => {
  const p = [{ sistema: 1, usuario: 1 }];
  for (const mal of [{ modelos: [] }, { modelos: [{ modelo: 'm', entrada: NaN, salida: 1 }] }, { modelos: [{ modelo: 'm', entrada: 1, salida: -1 }] }, { modelos: [{ modelo: 'm', entrada: 1, salida: 1, cacheLectura: -1 }] },
    { modelos: [{ modelo: 'm', entrada: 1, salida: 1 }], salidas: [1.5] }, { modelos: [{ modelo: 'm', entrada: 1, salida: 1 }], turnos: 0 }]) assert.throws(() => estimarCosto(p, mal), /estimacion_invalida/, JSON.stringify(mal));
  assert.throws(() => estimarCosto([], { modelos: [{ modelo: 'm', entrada: 1, salida: 1 }] }), /estimacion_invalida/);
});
test('desde el log de una corrida con bots se mide el prompt real de cada decision, sin llamar a ninguna API', async t => {
  const c = await mkdtemp(join(tmpdir(), 'worldbox-est-'));
  try {
    const puente = await servirPuenteReal(t), telemetria = await crearTelemetria(join(c, 'eventos.jsonl'));
    const { eventos, reporte } = await correrCompetencia({ adaptador: crearAdaptadorHttp({ url: puente.url, token: puente.token }), telemetria, turnos: 6,
      participantes: ['bot-expansionista', 'bot-voraz'].map((n, i) => ({ id: `f${i + 1}`, modelo: n, decidir: crearBot(n, 1 + i) })) });
    assert.equal(reporte.consumo.costo, 0); assert.equal(reporte.consumo.input_tokens, 0); assert.equal(reporte.consumo.output_tokens, 0);
    const prompts = medirPrompts(eventos);
    assert.equal(prompts.length, 12);
    assert.ok(prompts.every(p => p.sistema > 3000 && p.usuario > 150), JSON.stringify(prompts[0]));
    assert.equal(new Set(prompts.map(p => p.sistema)).size, 1, 'mismo texto de sistema para todos');
    const r = estimarCosto(prompts, { modelos: [{ modelo: 'barato', entrada: 0.1, salida: 0.5 }, { modelo: 'caro', entrada: 2, salida: 10 }], salidas: [1000], turnos: 24 });
    assert.ok(r.total_competencia_sin_cache[0].total > 0);
    const salida = spawnSync(process.execPath, [CLI, c, '--modelo=barato,0.1,0.5', '--modelo=caro,2,10,0.1', '--salidas=500,2000', '--turnos=24'], { encoding: 'utf8' });
    assert.equal(salida.status, 0, salida.stderr);
    const cli = JSON.parse(salida.stdout); assert.equal(cli.modelos.length, 2); assert.equal(cli.supuestos.llamadas_por_modelo, 24); assert.ok(cli.modelos[1].escenarios[0].costo_modelo_con_cache > 0);
    assert.equal(spawnSync(process.execPath, [CLI], { encoding: 'utf8' }).status, 1);
    // Un log de otra version de prompt no se puede medir con este codigo.
    const viejo = eventos.map(e => e.config ? { ...e, config: { ...e.config, prompt_version: '0.0.1' } } : e);
    assert.throws(() => medirPrompts(viejo), /version_distinta/);
    assert.throws(() => medirPrompts([]), /log_sin_inicio/);
  } finally { await rm(c, { recursive: true, force: true }); }
});
