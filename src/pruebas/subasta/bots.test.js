// Los bots de control: juegan legal, no modifican el estado y solo usan el rng de su asiento.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOTS, INFO_BOTS } from '../../juegos/subasta-bots.js';
import { crearRng } from '../../rng.js';
import { nuevoEstado, jugarConBots, subasta } from './ayudas.js';

test('hay cinco bots, cada uno con nombre publico y color', () => {
  assert.deepEqual(Object.keys(BOTS).sort(), ['azar', 'cuentagotas', 'gastador', 'parejo', 'retirado']);
  for (const id of Object.keys(BOTS)) assert.ok(INFO_BOTS[id].nombre && /^#[0-9A-Fa-f]{6}$/.test(INFO_BOTS[id].color), id);
});

test('cada bot hace lo que dice en la primera subasta', () => {
  const E = nuevoEstado();
  const rng = () => 0.5;
  assert.equal(BOTS.retirado(E, 0, rng).apuesta, 0);
  assert.equal(BOTS.parejo(E, 0, rng).apuesta, 31.5, 'reparte 600 segundos entre 19 subastas, sin pasarse');
  assert.equal(BOTS.gastador(E, 0, rng).apuesta, 60);
  assert.equal(BOTS.cuentagotas(E, 0, rng).apuesta, 5);
  assert.equal(BOTS.azar(E, 0, rng).apuesta, 31.5, 'con rng 0.5 apuesta justo el promedio');
});

test('nunca piden mas de lo que tienen ni numeros raros', () => {
  const E = nuevoEstado();
  E.bancos[0] = 123; // 12.3 segundos
  for (const [id, fn] of Object.entries(BOTS)) {
    const a = fn(E, 0, crearRng(1)).apuesta;
    assert.ok(a >= 0, `${id}: ${a}`);
    assert.ok(Math.abs(a * 10 - Math.round(a * 10)) < 1e-9, `${id} apuesta con mas de una decima: ${a}`);
    assert.ok(a <= 12.3, `${id} pide mas que su banco`);
  }
});

test('no modifican el estado y con el mismo rng responden lo mismo', () => {
  for (const [id, fn] of Object.entries(BOTS)) {
    const E = nuevoEstado(5);
    subasta(E, [15, 32, 47, 51, 0]);
    const copia = JSON.stringify(E);
    const a = fn(E, 1, crearRng(9));
    const b = fn(E, 1, crearRng(9));
    assert.equal(JSON.stringify(E), copia, id);
    assert.deepEqual(a, b, id);
  }
});

test('una partida entera entre los cinco bots termina en 19 subastas sin una sola respuesta invalida', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const { E, registros } = jugarConBots(seed, Object.values(BOTS));
    assert.equal(E.fin, true, `seed ${seed}`);
    assert.equal(registros.length, 19, `seed ${seed}`);
    for (const reg of registros) assert.ok(reg.invalidas.every((x) => x !== true), `seed ${seed}`);
    for (const b of E.bancos) assert.ok(b >= 0);
  }
});

test('el gastador se queda sin tiempo a media partida y deja de apostar', () => {
  const { E, registros } = jugarConBots(2, Object.values(BOTS));
  const s = Object.keys(BOTS).indexOf('gastador');
  assert.equal(E.bancos[s], 0);
  const ultima = registros.findLast((r) => r.oculto.apuestas[s] !== null);
  assert.ok(ultima.subasta < 19, 'dejo de apostar antes del final');
});
