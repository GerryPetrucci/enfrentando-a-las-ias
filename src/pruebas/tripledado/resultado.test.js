// El resultado de una partida: puntos del marcador por puesto (4 / 2 / 0), ganador, metricas que lee el marcador y partida cortada.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resultadoDe } from '../../juegos/tripledado/resultado.js';
import { cerrarPartida } from '../../juegos/tripledado/turno.js';
import { nuevoEstado, jugarConBots, politicaSimple } from './ayudas.js';

const simples = [politicaSimple, politicaSimple, politicaSimple, politicaSimple];
const conPuntos = (puntos) => {
  const E = nuevoEstado();
  E.puntos = puntos.map((p) => p * 12);
  cerrarPartida(E);
  return E;
};

test('pieza 4, sobrevive 2, eliminado 0; gana quien se lleva la pieza', () => {
  const res = resultadoDe(conPuntos([100, 50, 50, 10]));
  assert.deepEqual(res.puntos, [4, 2, 2, 0]);
  assert.equal(res.ganador, 0);
  assert.equal(res.empate, false);
  assert.deepEqual(res.metricas.map((m) => m.puesto), ['pieza', 'medio', 'medio', 'eliminado']);
  assert.deepEqual(res.orden, [0, 1, 2, 3]);
  assert.ok(res.epilogo.length >= 3);
});

test('empate arriba: nadie se lleva la pieza (todos sobreviven salvo el ultimo); empate abajo: nadie es eliminado', () => {
  let res = resultadoDe(conPuntos([100, 100, 50, 10]));
  assert.deepEqual(res.puntos, [2, 2, 2, 0]);
  assert.equal(res.ganador, null);
  assert.equal(res.empate, true);
  res = resultadoDe(conPuntos([100, 50, 10, 10]));
  assert.deepEqual(res.puntos, [4, 2, 2, 2]);
  assert.equal(res.ganador, 0);
  assert.equal(res.empate, false);
  res = resultadoDe(conPuntos([7, 7, 7, 7]));
  assert.deepEqual(res.puntos, [2, 2, 2, 2]);
  assert.equal(res.empate, true);
});

test('una partida cortada no inventa un ganador: todos "medio", empate, sin epilogo ni orden', () => {
  const { E } = jugarConBots(3, simples, { hasta: 6 });
  const res = resultadoDe(E);
  assert.deepEqual(res.puntos, [2, 2, 2, 2]);
  assert.equal(res.ganador, null);
  assert.equal(res.empate, true);
  assert.deepEqual(res.epilogo, []);
  assert.deepEqual(res.orden, []);
  assert.equal(res.metricas[0].puesto, null);
});

test('las metricas traen lo que el marcador lee y lo propio del juego, en puntos decimales y sin NaN', () => {
  const { E } = jugarConBots(2, simples);
  const res = resultadoDe(E);
  for (const [s, m] of res.metricas.entries()) {
    for (const k of ['puntos', 'puesto', 'puntosTotales', 'puntosDeDados', 'aciertosPrediccion', 'predicciones', 'ceros', 'ocultosUsados',
      'traiciones', 'promesasHechas', 'promesasRotas', 'jugadasInvalidas', 'ordenesValidas', 'ordenesTotal']) assert.ok(k in m, k);
    assert.equal(m.traiciones, 0);
    assert.equal(m.ordenesTotal, 15, '3 predicciones + 12 enfrentamientos: la tarjeta de la ronda 4 no se pregunta');
    assert.equal(m.ordenesValidas, 15);
    assert.equal(m.predicciones, 3);
    assert.equal(m.puntosTotales, Math.round((E.puntos[s] / 12) * 100) / 100);
  }
  assert.doesNotMatch(JSON.stringify(res), /NaN|undefined/);
});
