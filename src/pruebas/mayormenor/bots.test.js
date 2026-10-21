// Los bots de control: juegan legal, no modifican el estado y solo usan el rng de su asiento.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOTS, INFO_BOTS } from '../../juegos/mayormenor-bots.js';
import { crearRng } from '../../rng.js';
import { nuevoEstado, fijarCrupier, jugarConBots, ronda } from './ayudas.js';

const IDS = ['astuto', 'azar', 'contador', 'contrario', 'prudente', 'temerario'];

test('hay seis bots, cada uno con nombre publico y color', () => {
  assert.deepEqual(Object.keys(BOTS).sort(), IDS);
  for (const id of IDS) assert.ok(INFO_BOTS[id].nombre && /^#[0-9A-Fa-f]{6}$/.test(INFO_BOTS[id].color), id);
});

test('cada bot hace lo que dice en la primera ronda (crupier 5; asiento 0 es el activo)', () => {
  const E = nuevoEstado();
  fijarCrupier(E, 5);
  const rng = () => 0.5;
  // activo
  assert.equal(BOTS.prudente(E, 0, rng).carta, 6, 'la carta mas baja que supera al crupier');
  assert.equal(BOTS.contador(E, 0, rng).carta, 6);
  assert.equal(BOTS.temerario(E, 0, rng).carta, 10, 'la mas alta');
  assert.equal(BOTS.contrario(E, 0, rng).carta, 4, 'con el lado probable "mayor" juega la mas alta que no supera al crupier');
  assert.equal(BOTS.azar(E, 0, rng).carta, 5, 'con rng 0.5 toma la carta del medio de su mano');
  // predictor (asiento 1): su rival tiene 5 cartas por encima y 5 por debajo -> "mayor" sin ventaja
  assert.deepEqual(BOTS.prudente(E, 1, rng), { lado: 'mayor', fichas: 1, razon: 'bot de control' });
  assert.deepEqual(BOTS.contador(E, 1, rng), { lado: 'mayor', fichas: 1, razon: 'bot de control' });
  assert.deepEqual(BOTS.temerario(E, 1, rng), { lado: 'mayor', fichas: 10, razon: 'bot de control' });
  assert.deepEqual(BOTS.contrario(E, 1, rng), { lado: 'mayor', fichas: 1, razon: 'bot de control' });
  assert.deepEqual(BOTS.azar(E, 1, rng), { lado: 'menor', fichas: 3, razon: 'bot de control' });
});

test('el contador apuesta en proporcion a su ventaja', () => {
  const E = nuevoEstado();
  fijarCrupier(E, 5);
  E.mano[0] = [6, 7, 8, 9, 10]; // todas por encima: ventaja total
  assert.deepEqual(BOTS.contador(E, 1, () => 0.5), { lado: 'mayor', fichas: 10, razon: 'bot de control' });
  E.mano[0] = [0, 1, 2, 3, 6]; // 4 de 5 por debajo: ventaja 0.6
  assert.deepEqual(BOTS.contador(E, 1, () => 0.5), { lado: 'menor', fichas: 6, razon: 'bot de control' });
});

test('el predictor se adapta a quien es el activo en cada ronda', () => {
  const E = nuevoEstado();
  ronda(E, { crupier: 5, carta: 2, lado: 'mayor', fichas: 1 }); // ahora la ronda 2: el activo es el asiento 1
  fijarCrupier(E, 4);
  assert.ok('carta' in BOTS.prudente(E, 1, () => 0.5));
  assert.ok('lado' in BOTS.prudente(E, 0, () => 0.5));
});

test('nunca juegan una respuesta ilegal: 20 partidas de todos contra todos sin una sola respuesta invalida', () => {
  for (const x of IDS) {
    for (const y of IDS) {
      for (let seed = 1; seed <= 20; seed++) {
        const { E, registros } = jugarConBots(seed, [BOTS[x], BOTS[y]]);
        assert.equal(E.fin, true, `${x} vs ${y} seed ${seed}`);
        assert.ok(registros.length >= 1 && registros.length <= 18);
        for (const reg of registros) assert.deepEqual(reg.invalidas, [false, false], `${x} vs ${y} seed ${seed} ronda ${reg.ronda}`);
      }
    }
  }
});

test('no modifican el estado y con el mismo rng responden lo mismo', () => {
  for (const [id, fn] of Object.entries(BOTS)) {
    for (const s of [0, 1]) {
      const E = nuevoEstado(5);
      ronda(E, { crupier: 5, carta: 8, lado: 'mayor', fichas: 3 });
      const copia = JSON.stringify(E);
      assert.deepEqual(fn(E, s, crearRng(9)), fn(E, s, crearRng(9)), id);
      assert.equal(JSON.stringify(E), copia, id);
    }
  }
});
