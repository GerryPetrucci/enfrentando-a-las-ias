// La prueba de humo gratuita (src/humo.js) llama a modelos gratis de verdad, asi que NO corre en npm test.
// Lo que si se prueba aqui es el resumen que imprime, con agentes falsos sobre Lobo en la aldea real, y que se niega a gastar credito antes de tocar la red.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { correrPartida } from '../arena.js';
import lobo from '../juegos/lobo.js';
import { resumirHumo, MODELOS_DE_HUMO } from '../humo.js';
import { CONTENDIENTES, esGratis } from '../modelos.js';

const RAIZ = fileURLToPath(new URL('../..', import.meta.url));
const USO = { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 };

// Un agente que contesta bien: juega lo que jugaria el bot de control de Lobo, con tokens de mentira.
const bueno = (id) => ({
  id, nombre: id, color: '#000000', inicial: id[0].toUpperCase(), tipo: 'modelo', modelo: `x/${id}`, necesitaEstado: true,
  async jugar({ estado, i, rng }) { return { respuesta: lobo.bots.revela.fn(estado, i, rng), crudo: 'ok', uso: USO }; },
});
// Un agente cuya respuesta nunca trae JSON, como un modelo que contesta puro texto.
const malo = (id) => ({
  id, nombre: id, color: '#000000', inicial: id[0].toUpperCase(), tipo: 'modelo', modelo: `x/${id}`,
  async jugar() { throw new Error('La respuesta no traía un JSON válido.'); },
});
const B = bueno('bueno'), M = malo('malo');
const ocho = (primero, segundo) => [...Array(4).fill(primero), ...Array(4).fill(segundo)];
const jugar = (agentes, seed, fases) => correrPartida({ juego: lobo, agentes, seed, maxRondas: fases });

test('resumirHumo mide por modelo cuantas respuestas traen JSON, cuantas fallan y cuantos tokens gasta (Lobo real, 3 fases)', async () => {
  const r = await jugar(ocho(B, M), 3, 3);
  assert.ok(r.truncada && r.rondas.length === 3);
  const resumen = resumirHumo([r]);
  assert.deepEqual(resumen.map((x) => x.id).sort(), ['bueno', 'malo'], 'una fila por modelo aunque ocupe cuatro asientos');
  const [b, m] = ['bueno', 'malo'].map((id) => resumen.find((x) => x.id === id));
  assert.equal(b.llamadas + m.llamadas, r.llamadas, 'cada llamada de la partida cuenta para su modelo');
  assert.ok(b.llamadas > 0 && m.llamadas > 0);
  assert.equal(b.conError, 0);
  assert.equal(b.respuestasInvalidas, 0, 'el bot de control siempre responde bien');
  assert.equal(b.jsonValido, 1);
  assert.deepEqual([b.tokensEntrada, b.tokensSalida], [b.llamadas * 100, b.llamadas * 50]);
  assert.equal(b.obediencia, null, 'Lobo no mide ordenes');
  assert.equal(m.conError, m.llamadas, 'cada llamada fallida cuenta como error');
  assert.equal(m.jsonValido, 0);
  assert.deepEqual([m.tokensEntrada, m.tokensSalida], [0, 0]);
  assert.deepEqual(m.ejemplosDeError, ['La respuesta no traía un JSON válido.']);
});

test('resumirHumo junta las partidas de un modelo aunque cambie de asiento, y cuenta las invalidas sin error aparte', async () => {
  const a = await jugar(ocho(B, M), 3, 2), b = await jugar(ocho(M, B), 3, 2);
  assert.deepEqual([a.jugadores[0].id, b.jugadores[0].id], ['bueno', 'malo']);
  const juntos = resumirHumo([a, b]), solo = (p, id) => resumirHumo([p]).find((x) => x.id === id).llamadas;
  assert.equal(juntos.find((x) => x.id === 'bueno').llamadas, solo(a, 'bueno') + solo(b, 'bueno'));
  const sintetica = { jugadores: [{ id: 'a', nombre: 'A' }], usoPorJugador: [{ llamadas: 3, tokensEntrada: 10, tokensSalida: 4 }], metricas: [{}],
    rondas: [{ invalidas: [false] }, { invalidas: [true] }, { errores: ['HTTP 500'], invalidas: [true] }] };
  const [s] = resumirHumo([sintetica]);
  assert.deepEqual([s.llamadas, s.conError, s.respuestasInvalidas, s.jsonValido], [3, 1, 1, 1 / 3], 'un error no se cuenta ademas como invalida');
  assert.deepEqual(resumirHumo([]), []);
});

const humo = (...args) => spawnSync(process.execPath, ['src/humo.js', ...args], { cwd: RAIZ, encoding: 'utf8', timeout: 30000 });
const conOcho = (...claves) => `--modelos=${[...claves, ...MODELOS_DE_HUMO].slice(0, 8).join(',')}`;

test('la prueba de humo se niega a correr con un modelo de pago (o con Ling, que ya cobra), antes de tocar la red; sus modelos por defecto son ocho asientos gratis', () => {
  // 1 fase y 1 partida: si el seguro fallara algun dia, esta prueba haria a lo mas unas pocas llamadas y no una partida entera
  const pago = humo(conOcho('claude'), '--turnos=1', '--partidas=1');
  assert.equal(pago.status, 1);
  assert.match(pago.stderr, /claude gasta credito/);
  const ling = humo(conOcho('ling'), '--turnos=1', '--partidas=1');
  assert.equal(ling.status, 1);
  assert.match(ling.stderr, /ling gasta credito/);
  assert.equal(MODELOS_DE_HUMO.length, 8, 'Lobo se juega con 8 asientos');
  assert.ok(MODELOS_DE_HUMO.every((id) => esGratis(CONTENDIENTES[id].modelo)), MODELOS_DE_HUMO.join(','));
});

test('la prueba de humo valida sus argumentos: cantidad de asientos de Lobo, fases y bots de control', () => {
  for (const args of [['--modelos=nemotron-super'], [conOcho(), '--turnos=0'], [conOcho(), `--turnos=${lobo.rondas + 1}`], [conOcho(), '--partidas=0'], [conOcho('revela')]]) {
    const r = humo(...args);
    assert.equal(r.status, 1, args.join(' '));
    assert.ok(r.stderr.trim().length > 0, `${args.join(' ')}: dice por que`);
  }
});
