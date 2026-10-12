// Protege la regla "gratis o pago se elige en cada ejecucion": sin modo pago, nada que gaste credito sale a la red.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CONTENDIENTES, llamarModelo, esGratis, fijarModo, obtenerModo } from '../modelos.js';

const RAIZ = fileURLToPath(new URL('../..', import.meta.url));
const cli = (...args) => spawnSync(process.execPath, ['src/correr.js', ...args], { cwd: RAIZ, encoding: 'utf8' });

test('los 5 modelos de pago gastan credito y los 4 gratis no', () => {
  for (const [id, c] of Object.entries(CONTENDIENTES)) assert.equal(esGratis(c.modelo), !!c.gratis, id);
  assert.equal(Object.values(CONTENDIENTES).filter((c) => c.gratis).length, 4);
  assert.equal(esGratis('anthropic/claude-sonnet-5.5'), false);
  assert.equal(esGratis('cualquier/modelo:free'), true);
});

test('llamarModelo se niega a gastar credito sin modo pago, antes de tocar la red', async () => {
  let llamadas = 0;
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async () => { llamadas++; throw new Error('sin red en las pruebas'); };
  try {
    assert.equal(obtenerModo(), null);
    await assert.rejects(llamarModelo({ modelo: CONTENDIENTES.claude.modelo, sistema: 's', usuario: 'u', reintentos: 0 }), /gasta credito/);
    fijarModo('gratis');
    await assert.rejects(llamarModelo({ modelo: CONTENDIENTES.gpt.modelo, sistema: 's', usuario: 'u', reintentos: 0 }), /gasta credito/);
    assert.equal(llamadas, 0, 'no debio salir ninguna llamada');
    // un modelo gratis si pasa el seguro (aqui falla despues, por la red simulada o por la llave)
    process.env.OPENROUTER_API_KEY ||= 'llave-de-prueba';
    await assert.rejects(llamarModelo({ modelo: CONTENDIENTES.laguna.modelo, sistema: 's', usuario: 'u', reintentos: 0 }), /sin red en las pruebas/);
    assert.equal(llamadas, 1);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test('la linea de comandos exige elegir el modo y no deja usar modelos de pago en modo gratis', () => {
  let r = cli('--a=claude', '--b=gpt', '--partidas=1');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--modo=gratis/);
  assert.match(r.stderr, /--modo=pago/);

  r = cli('--a=claude', '--b=laguna', '--partidas=1', '--modo=gratis');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /claude gasta credito/);

  r = cli('--a=laguna', '--b=ling', '--partidas=1', '--modo=barato');
  assert.equal(r.status, 1);
});
