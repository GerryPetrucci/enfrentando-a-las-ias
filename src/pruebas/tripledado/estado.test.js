// El estado inicial de Triple dado: los dados de las 4 rondas salen del seed, mas sorteos de reemplazo, y los ayudantes que usan el turno y la vista.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearRng } from '../../rng.js';
import { crearEstado, disponibles, valorDe, blancosRestantes } from '../../juegos/tripledado/estado.js';
import { JUGADORES, RONDAS, IDS_DADOS, IDS_BLANCOS } from '../../juegos/tripledado/constantes.js';
import { nuevoEstado, fijarDados } from './ayudas.js';

test('el estado inicial: ronda 1, fase de prediccion, nadie ha gastado nada, ninguna tarjeta usada', () => {
  const E = nuevoEstado();
  assert.equal(E.ronda, 1);
  assert.equal(E.fase, 'prediccion');
  assert.equal(E.enfrentamiento, 0);
  assert.equal(E.fin, false);
  assert.equal(E.final, null);
  assert.deepEqual(E.puntos, [0, 0, 0, 0]);
  assert.deepEqual(E.tarjetasUsadas, [[], [], [], []]);
  assert.deepEqual(E.tarjetaActual, [null, null, null, null]);
  assert.equal(E.gastados.length, JUGADORES);
  assert.deepEqual(E.gastados[0], { blancos: [], rojo: false, azul: false });
});

test('hay 4 rondas x 4 jugadores x (9 blancos + rojo + azul), todos de 1 a 6, y el seed los fija', () => {
  const E = nuevoEstado(3);
  assert.equal(E.dados.length, RONDAS);
  for (const ronda of E.dados) {
    assert.equal(ronda.length, JUGADORES);
    for (const d of ronda) {
      assert.equal(d.blancos.length, 9);
      for (const v of [...d.blancos, d.rojo, d.azul]) assert.ok(Number.isInteger(v) && v >= 1 && v <= 6);
    }
  }
  assert.deepEqual(nuevoEstado(3).dados, E.dados);
  assert.notDeepEqual(nuevoEstado(4).dados, E.dados);
});

test('hay sorteos de reemplazo para cada ronda, jugador y enfrentamiento, con numeros en [0, 1)', () => {
  const E = nuevoEstado(5);
  assert.equal(E.azar.tarjeta.length, RONDAS);
  assert.equal(E.azar.dados.length, RONDAS);
  assert.equal(E.azar.dados[0].length, 3);
  assert.equal(E.azar.dados[0][0].length, JUGADORES);
  assert.equal(E.azar.dados[0][0][0].length, 3);
  for (const u of [E.azar.tarjeta[3][3], ...E.azar.dados[3][2][3]]) assert.ok(u >= 0 && u < 1);
  assert.equal(typeof E.semillaNarracion, 'number');
});

test('disponibles: los 11 dados al empezar y menos a medida que se gastan; valorDe lee el dado de la ronda en curso', () => {
  const E = nuevoEstado();
  assert.deepEqual(disponibles(E, 0), IDS_DADOS);
  fijarDados(E, 0, { blancos: [6, 5, 4, 3, 2, 1, 6, 5, 4], rojo: 2, azul: 3 });
  assert.equal(valorDe(E, 0, 'b1'), 6);
  assert.equal(valorDe(E, 0, 'b9'), 4);
  assert.equal(valorDe(E, 0, 'rojo'), 2);
  assert.equal(valorDe(E, 0, 'azul'), 3);
  E.gastados[0] = { blancos: ['b1', 'b2', 'b3'], rojo: true, azul: false };
  assert.deepEqual(disponibles(E, 0), ['b4', 'b5', 'b6', 'b7', 'b8', 'b9', 'azul']);
  assert.deepEqual(blancosRestantes(E, 0), ['b4', 'b5', 'b6', 'b7', 'b8', 'b9']);
  assert.deepEqual(disponibles(E, 1), IDS_DADOS, 'los demas no cambian');
  E.ronda = 2;
  E.gastados[0] = { blancos: [], rojo: false, azul: false };
  fijarDados(E, 0, { blancos: [1, 1, 1, 1, 1, 1, 1, 1, 1], rojo: 6, azul: 6 }, 2);
  assert.equal(valorDe(E, 0, 'rojo'), 6, 'lee la ronda 2');
  assert.equal(IDS_BLANCOS.length, 9);
});

test('crearEstado solo usa el rng recibido (mismo rng, mismo estado)', () => {
  assert.equal(JSON.stringify(crearEstado(crearRng(11))), JSON.stringify(crearEstado(crearRng(11))));
});
