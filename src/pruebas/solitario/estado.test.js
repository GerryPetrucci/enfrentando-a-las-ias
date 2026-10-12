// El estado inicial de El numero solitario sale del seed: todo el azar se sortea de antemano. Mismo seed = mismo estado.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  JUGADORES, RONDAS, RONDAS_POR_CICLO, TURNOS, CARTAS, CORTES, FINALISTAS, PUESTO_PUNTOS, cicloDe,
} from '../../juegos/solitario/constantes.js';
import { disponibles } from '../../juegos/solitario/estado.js';
import { nuevoEstado } from './ayudas.js';

test('las constantes son las de la opcion A aprobada el 11 de octubre de 2026', () => {
  assert.equal(JUGADORES, 5);
  assert.equal(RONDAS, 12);
  assert.equal(RONDAS_POR_CICLO, 6);
  assert.equal(TURNOS, 24);
  assert.deepEqual(CARTAS, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(CORTES, [3, 6]);
  assert.equal(FINALISTAS, 3);
  assert.deepEqual(PUESTO_PUNTOS, { pieza: 4, salvo: 3, medio: 2, eliminado: 0 });
  assert.deepEqual([1, 6, 7, 12].map(cicloDe), [1, 1, 2, 2]);
});

test('el estado inicial es neutro: 5 jugando, 8 cartas cada uno, nada bloqueado ni descartado', () => {
  const E = nuevoEstado();
  assert.equal(E.ronda, 1);
  assert.equal(E.fase, 1);
  assert.equal(E.fin, false);
  assert.equal(E.final, null);
  assert.deepEqual(E.jugando, [true, true, true, true, true]);
  assert.deepEqual(E.puesto, [null, null, null, null, null]);
  assert.deepEqual(E.corteSalvo, [null, null, null, null, null]);
  assert.deepEqual(E.puntos, [0, 0, 0, 0, 0]);
  assert.deepEqual(E.fichas, [0, 0, 0, 0, 0]);
  assert.deepEqual(E.ultimaVictoria, [0, 0, 0, 0, 0]);
  assert.deepEqual(E.bloqueada, [null, null, null, null, null]);
  assert.deepEqual(E.parejas, [null, null, null, null, null]);
  assert.deepEqual(E.historial, []);
  for (let i = 0; i < JUGADORES; i++) {
    assert.deepEqual(E.mano[i], CARTAS);
    assert.deepEqual(E.descartadas[i], []);
    assert.deepEqual(E.stats[i], { respuestas: 0, validas: 0, invalidas: 0, rondasGanadas: 0, anuladas: 0, senuelos: 0 });
  }
});

test('las manos de cada jugador son copias independientes', () => {
  const E = nuevoEstado();
  E.mano[0].pop();
  assert.equal(E.mano[1].length, 8);
  assert.equal(CARTAS.length, 8);
});

test('el mismo seed da el mismo estado y otro seed da otro', () => {
  assert.deepEqual(nuevoEstado(7), nuevoEstado(7));
  assert.notDeepEqual(nuevoEstado(7).azar, nuevoEstado(8).azar);
});

test('todo el azar se sortea de antemano: 12 rondas con 5 pares y 5 marcas, 3 sorteos de 5 y la semilla de narracion', () => {
  const E = nuevoEstado();
  assert.equal(E.azar.length, RONDAS);
  for (const a of E.azar) {
    assert.equal(a.pareja.length, JUGADORES);
    assert.equal(a.marca.length, JUGADORES);
    for (const par of a.pareja) { assert.equal(par.length, 2); for (const u of par) assert.ok(u >= 0 && u < 1); }
    for (const u of a.marca) assert.ok(u >= 0 && u < 1);
  }
  assert.equal(E.sorteo.length, CORTES.length + 1);
  for (const s of E.sorteo) { assert.equal(s.length, JUGADORES); for (const u of s) assert.ok(u >= 0 && u < 1); }
  assert.ok(Number.isInteger(E.semillaNarracion) && E.semillaNarracion >= 0 && E.semillaNarracion < 2 ** 32);
});

test('disponibles quita la carta bloqueada y deja las demas en orden', () => {
  const E = nuevoEstado();
  assert.deepEqual(disponibles(E, 0), [1, 2, 3, 4, 5, 6, 7, 8]);
  E.bloqueada[0] = 3;
  E.mano[0] = E.mano[0].filter((c) => c !== 1);
  assert.deepEqual(disponibles(E, 0), [2, 4, 5, 6, 7, 8]);
  assert.deepEqual(disponibles(E, 1), CARTAS);
});
