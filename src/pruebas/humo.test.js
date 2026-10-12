// La prueba de humo gratuita (src/humo.js) llama a modelos gratis de verdad, asi que NO corre en npm test.
// Lo que si se prueba aqui es el resumen que imprime, con agentes falsos sobre la Guerra de territorios real.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { correrPartida } from '../arena.js';
import { planDeSerie } from '../serie.js';
import { NOMBRES_REINOS } from '../juegos/conquista/constantes.js';
import conquista from '../juegos/conquista.js';
import { resumirHumo } from '../humo.js';

const RAIZ = fileURLToPath(new URL('../..', import.meta.url));
const USO = { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 };

// Un agente que contesta bien: una orden valida y una invalida, con tokens de mentira. La valida es una oferta de comercio
// porque no cuesta nada al ofrecerla: sirve igual en todos los turnos (reclutar gasta Comida y el hambre la agota).
const bueno = (id) => ({
  id, nombre: id, color: '#000000', inicial: id[0].toUpperCase(), tipo: 'modelo', modelo: `x/${id}`, necesitaEstado: true,
  async jugar({ i }) {
    return { respuesta: { ordenes: [`ofrecer ${NOMBRES_REINOS[1 - i]} Oro 1 Roca 1`, 'dormir'], razon: 'prueba' }, crudo: 'ok', uso: USO };
  },
});
// Un agente cuya respuesta nunca trae JSON, como un modelo que contesta puro texto.
const malo = (id) => ({
  id, nombre: id, color: '#000000', inicial: id[0].toUpperCase(), tipo: 'modelo', modelo: `x/${id}`,
  async jugar() { throw new Error('La respuesta no traía un JSON válido.'); },
});

async function serie(agentesPorClave, claves, partidas, turnos) {
  const plan = planDeSerie({ claves, partidas, seedBase: 3, mismoSeed: true });
  const resultados = [];
  for (const p of plan) {
    resultados.push(await correrPartida({ juego: conquista, agentes: p.claves.map((c) => agentesPorClave[c]), seed: p.seed, maxRondas: turnos }));
  }
  return resultados;
}

test('resumirHumo mide por modelo cuantas respuestas traen JSON, cuantas ordenes valen y cuantos tokens gasta', async () => {
  const resultados = await serie({ bueno: bueno('bueno'), malo: malo('malo') }, ['bueno', 'malo'], 2, 3);
  assert.equal(resultados.length, 2);
  assert.ok(resultados.every((r) => r.truncada && r.rondas.length === 3));
  const [b, m] = ['bueno', 'malo'].map((id) => resumirHumo(resultados).find((x) => x.id === id));

  assert.equal(b.llamadas, 6);              // 3 turnos x 2 partidas
  assert.equal(b.conError, 0);
  assert.equal(b.jsonValido, 1);
  assert.equal(b.ordenesTotal, 12);          // 2 ordenes por turno
  assert.equal(b.ordenesValidas, 6);
  assert.equal(b.obediencia, 0.5);
  assert.equal(b.tokensEntrada, 600);
  assert.equal(b.tokensSalida, 300);

  assert.equal(m.llamadas, 6);
  assert.equal(m.conError, 6);
  assert.equal(m.jsonValido, 0);
  assert.equal(m.obediencia, 0);
  assert.deepEqual(m.ejemplosDeError, ['La respuesta no traía un JSON válido.']);
});

test('resumirHumo junta las partidas de un modelo aunque cambie de asiento', async () => {
  const resultados = await serie({ bueno: bueno('bueno'), malo: malo('malo') }, ['bueno', 'malo'], 2, 1);
  assert.deepEqual(resultados.map((r) => r.jugadores[0].id), ['bueno', 'malo']);
  assert.deepEqual(resumirHumo(resultados).map((x) => x.id).sort(), ['bueno', 'malo']);
  assert.equal(resumirHumo(resultados).find((x) => x.id === 'bueno').llamadas, 2);
});

test('la prueba de humo se niega a correr con un modelo de pago, antes de tocar la red', () => {
  const r = spawnSync(process.execPath, ['src/humo.js', '--modelos=claude,laguna'], { cwd: RAIZ, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /claude gasta credito/);
});

test('la prueba de humo valida sus argumentos', () => {
  for (const args of [['--modelos=laguna'], ['--modelos=laguna,ling', '--turnos=0'], ['--modelos=laguna,ling', '--turnos=31'], ['--modelos=agresivo,laguna']]) {
    const r = spawnSync(process.execPath, ['src/humo.js', ...args], { cwd: RAIZ, encoding: 'utf8' });
    assert.equal(r.status, 1, args.join(' '));
  }
});
