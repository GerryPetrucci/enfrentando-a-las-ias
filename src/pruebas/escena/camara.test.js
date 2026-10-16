// Camara oculta de la escena de Duda y apuesta: en cada mano el publico ve las cartas reales de DOS jugadores elegidos al azar.
// El azar sale de un seed (reproducible: el mismo archivo da siempre el mismo video). Sin DOM, sin red.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearRng, seedDesdeTexto } from '../../rng.js';
import { crearAzar, azarDesdeTexto } from '../../../web/casino/azar.js';
import { elegirCamara } from '../../../web/casino/camara.js';

test('el azar de la web da exactamente la misma secuencia que src/rng.js (la web no puede importar de src/)', () => {
  for (const seed of [0, 1, 42, 123456789, 2 ** 32 - 1]) {
    const a = crearRng(seed);
    const b = crearAzar(seed);
    for (let i = 0; i < 20; i++) assert.equal(b(), a(), `seed ${seed}, valor ${i}`);
  }
  for (const texto of ['', 'a', 'duda:1:3', 'ñandú']) assert.equal(azarDesdeTexto(texto)(), crearRng(seedDesdeTexto(texto))(), texto);
});

test('elige dos asientos distintos del 0 al 3, en orden', () => {
  for (let mano = 1; mano <= 40; mano++) {
    const c = elegirCamara(7, mano);
    assert.equal(c.length, 2);
    assert.ok(c[0] < c[1], `mano ${mano}: ${c} no esta en orden o se repite`);
    assert.ok(c.every((s) => Number.isInteger(s) && s >= 0 && s <= 3), `mano ${mano}: ${c}`);
  }
});

test('es determinista: mismo seed y mano, misma camara; otro seed, otras elecciones', () => {
  const rango = Array.from({ length: 60 }, (_, i) => i + 1);
  assert.deepEqual(rango.map((m) => elegirCamara(3, m)), rango.map((m) => elegirCamara(3, m)));
  assert.notDeepEqual(rango.map((m) => elegirCamara(3, m)), rango.map((m) => elegirCamara(4, m)));
});

test('cambia de mano a mano: en 200 manos aparecen los 6 pares posibles y ningun asiento domina', () => {
  const pares = new Set();
  const veces = [0, 0, 0, 0];
  const MANOS = 6000;
  for (let mano = 1; mano <= MANOS; mano++) {
    const c = elegirCamara(11, mano);
    if (mano <= 200) pares.add(c.join('-'));
    for (const s of c) veces[s]++;
  }
  assert.equal(pares.size, 6, `solo aparecieron ${[...pares].join(', ')}`);
  for (const [s, n] of veces.entries()) assert.ok(n / MANOS > 0.45 && n / MANOS < 0.55, `asiento ${s} sale en ${(100 * n / MANOS).toFixed(1)} % de las manos`);
});

test('camara 0 no muestra a nadie y camara 4 (o mas) muestra a todos', () => {
  assert.deepEqual(elegirCamara(1, 1, 0), []);
  assert.deepEqual(elegirCamara(1, 1, 4), [0, 1, 2, 3]);
  assert.deepEqual(elegirCamara(1, 1, 9), [0, 1, 2, 3]);
  assert.deepEqual(elegirCamara(1, 1, -2), []);
  assert.equal(elegirCamara(1, 1, 1).length, 1);
  assert.equal(elegirCamara(1, 1, 3).length, 3);
});

test('entrada basura no lanza y siempre devuelve asientos validos', () => {
  for (const [seed, mano, n] of [[undefined, undefined, undefined], [null, 'x', NaN], ['texto', -5, 'dos'], [{}, [], Infinity], [1.5, 2.7, 2.5]]) {
    const c = elegirCamara(seed, mano, n);
    assert.ok(Array.isArray(c) && c.every((s) => Number.isInteger(s) && s >= 0 && s <= 3), `${String(seed)} ${String(mano)} ${String(n)} -> ${c}`);
    assert.equal(new Set(c).size, c.length);
  }
  assert.equal(elegirCamara(null, 'x', NaN).length, 2, 'un n ilegible vale el valor por defecto (2)');
});
