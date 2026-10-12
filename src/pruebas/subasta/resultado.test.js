// El resultado de una partida: puntos por puesto, ganador de la pieza y las metricas que lee el marcador.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resultadoDe } from '../../juegos/subasta/resultado.js';
import { jugarConBots, nuevoEstado, subasta } from './ayudas.js';

const escalonados = [0, 1, 2, 3, 4].map((k) => () => ({ apuesta: 10 + 7 * k, razon: 'x' })); // apuestas fijas de 10, 17, 24, 31 y 38 segundos

test('una partida terminada reparte 4, 2, 2, 2 y 0 segun el puesto, y la pieza es el ganador', () => {
  const { E } = jugarConBots(3, escalonados);
  const r = resultadoDe(E);
  assert.deepEqual(r.puntos, [2, 2, 0, 2, 4]);
  assert.equal(r.ganador, 4);
  assert.equal(r.empate, false);
  assert.deepEqual(r.orden.slice(0, 1), [4]);
  assert.equal(r.orden.at(-1), 2);
  assert.deepEqual(new Set(r.orden), new Set([0, 1, 2, 3, 4]));
  assert.ok(r.epilogo.length >= 3);
});

test('si nadie gana la pieza no hay ganador y la partida cuenta como empate', () => {
  const E = nuevoEstado();
  E.fin = true;
  E.final = { pieza: null, eliminado: null, criterioPieza: 'sin pieza', criterioEliminado: 'sin eliminado', ranking: [] };
  E.puesto = ['medio', 'medio', 'medio', 'medio', 'medio'];
  const r = resultadoDe(E);
  assert.deepEqual(r.puntos, [2, 2, 2, 2, 2]);
  assert.equal(r.ganador, null);
  assert.equal(r.empate, true);
});

test('las metricas traen las claves del marcador y las propias del juego', () => {
  const { E } = jugarConBots(3, escalonados);
  const r = resultadoDe(E);
  assert.equal(r.metricas.length, 5);
  for (const m of r.metricas) {
    for (const k of ['puntos', 'puesto', 'fichas', 'bancoFinal', 'apostado', 'retiradas', 'subastasGanadas', 'empates', 'todoElBanco', 'traiciones', 'promesasHechas', 'promesasRotas', 'jugadasInvalidas', 'ordenesValidas', 'ordenesTotal']) {
      assert.ok(k in m, k);
    }
    assert.equal(m.traiciones, 0);
    assert.equal(m.promesasHechas, 0);
    assert.equal(m.ordenesValidas + m.jugadasInvalidas, m.ordenesTotal);
    assert.equal(m.apostado + m.bancoFinal, 600, 'lo apostado mas lo que queda es el banco inicial');
  }
  assert.deepEqual(r.metricas.map((m) => m.puesto), ['medio', 'medio', 'eliminado', 'medio', 'pieza']);
  assert.equal(r.metricas[4].subastasGanadas, r.metricas[4].fichas);
});

test('una partida cortada no se cae: sin ganador, sin epilogo, sin orden', () => {
  const E = nuevoEstado();
  subasta(E, [15, 32, 47, 51, 0]);
  const r = resultadoDe(E);
  assert.equal(r.ganador, null);
  assert.equal(r.empate, true);
  assert.deepEqual(r.epilogo, []);
  assert.deepEqual(r.orden, []);
  assert.equal(r.puntos.length, 5);
  assert.ok(r.metricas.every((m) => m.puesto === null));
});
