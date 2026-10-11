// El resultado de una partida: puntos por puesto, ganador de la pieza y las metricas que lee el marcador.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resultadoDe } from '../../juegos/solitario/resultado.js';
import { jugarConBots, nuevoEstado, rondaBasica } from './ayudas.js';
import { BOTS } from '../../juegos/solitario-bots.js';

const mesa = [BOTS.lector, BOTS.medio, BOTS.bajo, BOTS.azar, BOTS.escalera];

test('una partida terminada reparte 4, 3, 3, 2 y 0 puntos segun el puesto y la pieza es el ganador', () => {
  const { E } = jugarConBots(3, mesa);
  const r = resultadoDe(E);
  assert.deepEqual([...r.puntos].sort(), [0, 2, 3, 3, 4]);
  assert.equal(r.puntos[r.ganador], 4);
  assert.equal(r.ganador, E.final.pieza);
  assert.equal(r.empate, false);
  assert.equal(r.orden.length, 5);
  assert.equal(r.orden[0], E.final.pieza);
  assert.equal(r.orden.at(-1), E.final.eliminado);
  assert.deepEqual(new Set(r.orden), new Set([0, 1, 2, 3, 4]));
  assert.ok(r.epilogo.length >= 5);
  assert.equal(r.puntos.reduce((a, b) => a + b, 0), 12);
});

test('las metricas traen las claves del marcador y las propias del juego', () => {
  const { E } = jugarConBots(3, mesa);
  const r = resultadoDe(E);
  assert.equal(r.metricas.length, 5);
  for (const m of r.metricas) {
    for (const k of ['puntos', 'puesto', 'puntosDeCartas', 'fichas', 'rondasGanadas', 'anuladas', 'senuelos', 'traiciones', 'promesasHechas', 'promesasRotas', 'jugadasInvalidas', 'ordenesValidas', 'ordenesTotal']) {
      assert.ok(k in m, k);
    }
    assert.equal(m.traiciones, 0);
    assert.equal(m.promesasHechas, 0);
    assert.equal(m.ordenesValidas + m.jugadasInvalidas, m.ordenesTotal);
  }
  assert.deepEqual(r.metricas.map((m) => m.puesto).sort(), ['eliminado', 'medio', 'pieza', 'salvo', 'salvo']);
});

test('los bots no mandan respuestas invalidas: todas las respuestas cuentan como validas', () => {
  const { E } = jugarConBots(4, mesa);
  const r = resultadoDe(E);
  for (const m of r.metricas) assert.equal(m.jugadasInvalidas, 0);
});

test('una partida cortada no se cae: sin ganador, sin epilogo, sin orden', () => {
  const E = nuevoEstado();
  rondaBasica(E);
  const r = resultadoDe(E);
  assert.equal(r.ganador, null);
  assert.equal(r.empate, true);
  assert.deepEqual(r.epilogo, []);
  assert.deepEqual(r.orden, []);
  assert.equal(r.puntos.length, 5);
  assert.ok(r.metricas.every((m) => m.puesto === null));
});
