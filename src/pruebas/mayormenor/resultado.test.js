// El resultado de una partida: puntos 4 / 0 / 2 y 2, ganador, metricas que lee el marcador y partida cortada.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resultadoDe } from '../../juegos/mayormenor/resultado.js';
import { nuevoEstado, ronda, jugarConBots, politicaMinima } from './ayudas.js';

test('gana quien tiene mas fichas: 4 y 0', () => {
  const E = nuevoEstado();
  E.fichas = [10, 2];
  ronda(E, { crupier: 5, carta: 2, lado: 'mayor', fichas: 2 }); // el predictor se queda en 0
  const res = resultadoDe(E);
  assert.deepEqual(res.puntos, [4, 0]);
  assert.equal(res.ganador, 0);
  assert.equal(res.empate, false);
  assert.deepEqual(res.orden, [0, 1]);
  assert.deepEqual(res.metricas.map((m) => m.puesto), ['gana', 'pierde']);
  assert.ok(res.epilogo.length >= 3);
});

test('empate de fichas: 2 y 2 y sin ganador', () => {
  const E = nuevoEstado();
  E.ronda = 18;
  ronda(E, { crupier: 5, carta: 5, lado: 'mayor', fichas: 1 });
  const res = resultadoDe(E);
  assert.deepEqual(res.puntos, [2, 2]);
  assert.equal(res.ganador, null);
  assert.equal(res.empate, true);
  assert.deepEqual(res.metricas.map((m) => m.puesto), ['empata', 'empata']);
});

test('una partida cortada no inventa un ganador: 2 y 2, empate, sin epilogo ni orden', () => {
  const E = nuevoEstado();
  ronda(E, { crupier: 5, carta: 8, lado: 'mayor', fichas: 3 });
  const res = resultadoDe(E);
  assert.deepEqual(res.puntos, [2, 2]);
  assert.equal(res.ganador, null);
  assert.equal(res.empate, true);
  assert.deepEqual(res.epilogo, []);
  assert.deepEqual(res.orden, []);
  assert.equal(res.metricas[0].puesto, null);
});

test('las metricas traen lo que el marcador lee y lo propio del juego, sin NaN', () => {
  const { E } = jugarConBots(2, [politicaMinima, politicaMinima]);
  const res = resultadoDe(E);
  for (const [s, m] of res.metricas.entries()) {
    for (const k of ['puntos', 'puesto', 'fichas', 'aciertos', 'apuestas', 'fichasApostadas', 'apostoTodo', 'fichasComoActivo', 'rondasComoActivo',
      'traiciones', 'promesasHechas', 'promesasRotas', 'jugadasInvalidas', 'ordenesValidas', 'ordenesTotal']) assert.ok(k in m, k);
    assert.equal(m.traiciones, 0);
    assert.equal(m.ordenesTotal, 18);
    assert.equal(m.ordenesValidas, 18);
    assert.equal(m.jugadasInvalidas, 0);
    assert.equal(m.rondasComoActivo, 9);
    assert.equal(m.fichas, E.fichas[s]);
  }
  assert.doesNotMatch(JSON.stringify(res), /NaN|undefined/);
});
