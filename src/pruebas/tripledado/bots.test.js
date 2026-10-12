// Los bots de control: juegan legal, no modifican el estado y solo usan el rng de su asiento.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOTS, INFO_BOTS } from '../../juegos/tripledado-bots.js';
import { evaluarCombinacion, compararClaves } from '../../juegos/tripledado/combinaciones.js';
import { valorDe } from '../../juegos/tripledado/estado.js';
import { crearRng } from '../../rng.js';
import { nuevoEstado, escenarioBasico, prediccion, jugarConBots } from './ayudas.js';

const IDS = ['azar', 'calculador', 'goloso', 'reservado', 'tanque'];
const clave = (E, s, ids) => evaluarCombinacion(ids.map((id) => valorDe(E, s, id))).clave;

test('hay cinco bots, cada uno con nombre publico y color', () => {
  assert.deepEqual(Object.keys(BOTS).sort(), IDS);
  for (const id of IDS) assert.ok(INFO_BOTS[id].nombre && /^#[0-9A-Fa-f]{6}$/.test(INFO_BOTS[id].color), id);
});

test('cada bot elige su tarjeta preferida en la prediccion, y solo entre las que le quedan', () => {
  const E = nuevoEstado();
  assert.equal(BOTS.goloso(E, 0).tarjeta, 'MORE');
  // el calculador elige por puntos esperados (medidos con 4,000 partidas de golosos: MAX 10.9 > MORE 10.0 > MIN 9.1 > ZERO 8.5), no por el orden del goloso
  assert.equal(BOTS.calculador(E, 0).tarjeta, 'MAX');
  E.tarjetasUsadas[0] = ['MAX'];
  assert.equal(BOTS.calculador(E, 0).tarjeta, 'MORE', 'sin MAX, la siguiente mejor');
  E.tarjetasUsadas[0] = ['MAX', 'MORE'];
  assert.equal(BOTS.calculador(E, 0).tarjeta, 'MIN');
  E.tarjetasUsadas[0] = [];
  assert.equal(BOTS.reservado(E, 0).tarjeta, 'MIN');
  assert.equal(BOTS.tanque(E, 0).tarjeta, 'ZERO');
  assert.equal(BOTS.azar(E, 0, () => 0).tarjeta, 'ZERO');
  assert.equal(BOTS.azar(E, 0, () => 0.99).tarjeta, 'MAX');
  E.tarjetasUsadas[0] = ['MORE', 'ZERO'];
  assert.equal(BOTS.goloso(E, 0).tarjeta, 'MAX', 'MORE ya la uso: la siguiente preferida');
  assert.equal(BOTS.tanque(E, 0).tarjeta, 'MIN');
});

test('en un enfrentamiento: el goloso juega la mejor combinacion; el tanque en su ronda de ZERO juega la peor; el reservado guarda lo mejor', () => {
  const E = nuevoEstado();
  prediccion(E, ['MORE', 'MIN', 'MAX', 'ZERO']);
  escenarioBasico(E);
  const goloso = BOTS.goloso(E, 0).dados;
  assert.equal(goloso.length, 3);
  assert.equal(evaluarCombinacion(goloso.map((id) => valorDe(E, 0, id))).categoria, 'triple', 'J1 tiene seis unos: un triple de unos supera a un doble de cincos');
  const tanque = BOTS.tanque(E, 3).dados; // el jugador 4 predijo ZERO
  assert.equal(evaluarCombinacion(tanque.map((id) => valorDe(E, 3, id))).categoria, 'sencillo');
  assert.ok(compararClaves(clave(E, 3, tanque), clave(E, 3, BOTS.goloso(E, 3).dados)) < 0, 'el tanque juega peor que el goloso');
  const reservado = BOTS.reservado(E, 0).dados;
  assert.ok(compararClaves(clave(E, 0, reservado), clave(E, 0, goloso)) < 0, 'el reservado guarda lo mejor para el ultimo enfrentamiento');
  assert.ok(reservado.every((id) => id.startsWith('b')), 'y no gasta ocultos al principio');
});

test('nunca contestan algo ilegal: 20 partidas de cada mesa de cuatro, sin una sola respuesta invalida', () => {
  const MESAS = [['azar', 'goloso', 'reservado', 'tanque'], ['goloso', 'reservado', 'tanque', 'calculador'], ['calculador', 'azar', 'goloso', 'reservado'],
    ['tanque', 'calculador', 'azar', 'goloso'], ['reservado', 'tanque', 'calculador', 'azar']];
  for (const mesa of MESAS) {
    for (let seed = 1; seed <= 20; seed++) {
      const { E, registros, llamadas } = jugarConBots(seed, mesa.map((id) => BOTS[id]));
      assert.equal(E.fin, true, `${mesa} seed ${seed}`);
      assert.equal(registros.length, 16);
      assert.equal(llamadas, 60);
      for (const reg of registros) {
        if (reg.forzada) assert.deepEqual(reg.invalidas, [null, null, null, null]);
        else assert.deepEqual(reg.invalidas, [false, false, false, false], `${mesa} seed ${seed} ronda ${reg.ronda} ${reg.fase}`);
      }
    }
  }
});

test('el tanque logra el ZERO con cierta frecuencia cuando juega contra bots que buscan puntos', () => {
  let ceros = 0;
  const partidas = 40;
  for (let seed = 1; seed <= partidas; seed++) {
    const { E } = jugarConBots(seed, [BOTS.tanque, BOTS.goloso, BOTS.goloso, BOTS.calculador]);
    ceros += E.stats[0].ceros;
  }
  // piso modesto (un cuarto de las partidas): la tasa real la mide la herramienta de la Tarea 9; aqui solo se comprueba que la estrategia funciona
  assert.ok(ceros >= partidas / 4, `solo ${ceros} ZERO en ${partidas} partidas`);
});

test('no modifican el estado y con el mismo rng responden lo mismo', () => {
  for (const [id, fn] of Object.entries(BOTS)) {
    const E = nuevoEstado(5);
    prediccion(E, ['MORE', 'MIN', 'MAX', 'ZERO']);
    const copia = JSON.stringify(E);
    assert.deepEqual(fn(E, 1, crearRng(9)), fn(E, 1, crearRng(9)), id);
    assert.equal(JSON.stringify(E), copia, id);
  }
});
