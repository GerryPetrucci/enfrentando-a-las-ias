// Duda y apuesta: las probabilidades exactas del mazo que usan los bots.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pAlMenos, pTotalAlMenos, cuentoYo } from '../../juegos/dudaapuesta/probabilidad.js';
import { crearRng } from '../../rng.js';
import { crearEstado } from '../../juegos/dudaapuesta/estado.js';

const nuevoEstado = (seed = 7) => crearEstado(crearRng(seed));
const fijarCartas = (E, s, cartas) => { E.manos[E.mano - 1][s] = [...cartas]; };

const cerca = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} no es ${b}`);

test('pAlMenos: casos que se calculan a mano', () => {
  assert.equal(pAlMenos(0, 60, 20, 5), 1);
  assert.equal(pAlMenos(-3, 60, 20, 5), 1);
  assert.equal(pAlMenos(6, 60, 20, 5), 0, 'no se pueden sacar 6 de 5 cartas');
  assert.equal(pAlMenos(21, 60, 20, 30), 0, 'no hay 21 exitos');
  cerca(pAlMenos(1, 60, 20, 5), 1 - 658008 / 5461512); // 1 - C(40,5) / C(60,5)
  cerca(pAlMenos(5, 60, 60, 5), 1, 1e-12);
});

test('pAlMenos baja cuando se pide mas y sube cuando hay mas cartas por repartir', () => {
  let anterior = 1;
  for (let x = 0; x <= 12; x++) {
    const p = pAlMenos(x, 55, 18, 15);
    assert.ok(p <= anterior + 1e-12, `x=${x}`);
    anterior = p;
  }
  assert.ok(pAlMenos(5, 55, 18, 20) > pAlMenos(5, 55, 18, 10));
});

test('pTotalAlMenos solo usa lo que el jugador ve: sus cartas cuentan seguro y el resto es azar', () => {
  const E = nuevoEstado();
  fijarCartas(E, 0, ['rojo', 'arcoiris', 'rojo', 'azul', 'verde']);
  assert.equal(cuentoYo(E, 0, 'rojo'), 3);
  assert.equal(cuentoYo(E, 0, 'azul'), 2, 'la arcoiris cuenta');
  assert.equal(pTotalAlMenos(E, 0, 'rojo', 3), 1, 'ya tengo 3');
  assert.equal(pTotalAlMenos(E, 0, 'rojo', 21), 0, 'no caben 21 en 20 cartas');
  const p4 = pTotalAlMenos(E, 0, 'rojo', 4), p9 = pTotalAlMenos(E, 0, 'rojo', 9);
  assert.ok(p4 > 0.8 && p4 < 1, String(p4));
  assert.ok(p9 > 0 && p9 < p4);
  // lo que hay en las manos ajenas no cambia lo que J1 puede calcular
  const antes = pTotalAlMenos(E, 0, 'rojo', 7);
  fijarCartas(E, 1, ['rojo', 'rojo', 'rojo', 'rojo', 'rojo']);
  assert.equal(pTotalAlMenos(E, 0, 'rojo', 7), antes);
});
