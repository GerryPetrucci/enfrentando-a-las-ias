// El estado inicial de Mayor o menor: dos mazos del crupier barajados con el seed, sorteos de reemplazo y los ayudantes que usan la vista y los bots.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearRng } from '../../rng.js';
import { crearEstado, crupierDeRonda, crupierFaltan } from '../../juegos/mayormenor/estado.js';
import { CARTAS, CARTAS_CRUPIER, FICHAS, RONDAS, JUGADORES, activoDe } from '../../juegos/mayormenor/constantes.js';
import { nuevoEstado } from './ayudas.js';

test('las constantes son las del spec', () => {
  assert.equal(JUGADORES, 2);
  assert.equal(RONDAS, 18);
  assert.equal(FICHAS, 10);
  assert.deepEqual(CARTAS, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(CARTAS_CRUPIER, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('el activo alterna: asiento 0 en las rondas impares, asiento 1 en las pares', () => {
  assert.deepEqual([1, 2, 3, 4, 17, 18].map(activoDe), [0, 1, 0, 1, 0, 1]);
  const veces = [0, 0];
  for (let r = 1; r <= RONDAS; r++) veces[activoDe(r)]++;
  assert.deepEqual(veces, [9, 9]);
});

test('el estado inicial: ronda 1, 10 fichas, 11 cartas por jugador, nada jugado', () => {
  const E = nuevoEstado();
  assert.equal(E.ronda, 1);
  assert.equal(E.fin, false);
  assert.equal(E.final, null);
  assert.deepEqual(E.fichas, [10, 10]);
  assert.deepEqual(E.mano, [CARTAS, CARTAS]);
  assert.notEqual(E.mano[0], E.mano[1], 'cada mano es su propio arreglo');
  assert.deepEqual(E.jugadas, [[], []]);
  assert.deepEqual(E.crupierSalidas, [[], []]);
  assert.deepEqual(E.historial, []);
});

test('cada mazo del crupier es una permutacion de 1 a 9 y el seed la fija', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const E = nuevoEstado(seed);
    for (const mazo of E.crupier) assert.deepEqual([...mazo].sort((a, b) => a - b), CARTAS_CRUPIER, `seed ${seed}`);
  }
  assert.deepEqual(nuevoEstado(5).crupier, nuevoEstado(5).crupier);
  const base = JSON.stringify(nuevoEstado(1).crupier);
  assert.ok([2, 3, 4, 5, 6].some((s) => JSON.stringify(nuevoEstado(s).crupier) !== base), 'otro seed da otro orden');
});

test('hay un sorteo de reemplazo por ronda, con numeros en [0, 1)', () => {
  const E = nuevoEstado(3);
  assert.equal(E.azar.length, RONDAS);
  for (const a of E.azar) for (const u of [a.carta, a.lado]) assert.ok(u >= 0 && u < 1);
  assert.equal(typeof E.semillaNarracion, 'number');
});

test('crupierDeRonda es la carta del mazo del activo que toca; crupierFaltan no incluye la carta ya revelada', () => {
  const E = nuevoEstado(4);
  assert.equal(crupierDeRonda(E), E.crupier[0][0]);
  assert.equal(crupierFaltan(E, 0).length, 8, 'el mazo del activo: 9 menos la carta de esta ronda');
  assert.ok(!crupierFaltan(E, 0).includes(crupierDeRonda(E)));
  assert.equal(crupierFaltan(E, 1).length, 9, 'el otro mazo no ha sacado nada');
  E.ronda = 2;
  assert.equal(crupierDeRonda(E), E.crupier[1][0]);
  assert.equal(crupierFaltan(E, 0).length, 9);
  assert.equal(crupierFaltan(E, 1).length, 8);
});

test('crearEstado solo usa el rng recibido (mismo rng, mismo estado)', () => {
  assert.equal(JSON.stringify(crearEstado(crearRng(11))), JSON.stringify(crearEstado(crearRng(11))));
});
