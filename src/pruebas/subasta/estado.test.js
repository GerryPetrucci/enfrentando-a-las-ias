// El estado inicial de Subasta de tiempo: cada jugador con su banco de 10 minutos, en decimas enteras. No hay azar de partida.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JUGADORES, SUBASTAS, BANCO, PUESTO_PUNTOS, segundos } from '../../juegos/subasta/constantes.js';
import { nuevoEstado } from './ayudas.js';

test('las constantes son las del juego oficial: 19 subastas, banco de 10 minutos en decimas, 5 jugadores', () => {
  assert.equal(JUGADORES, 5);
  assert.equal(SUBASTAS, 19);
  assert.equal(BANCO, 6000);
  assert.deepEqual(PUESTO_PUNTOS, { pieza: 4, medio: 2, eliminado: 0 });
  assert.equal(segundos(6000), 600);
  assert.equal(segundos(123), 12.3);
  assert.equal(segundos(0), 0);
});

test('el estado inicial es neutro: todos con 600 segundos, sin fichas ni historial', () => {
  const E = nuevoEstado();
  assert.equal(E.subasta, 1);
  assert.equal(E.fin, false);
  assert.equal(E.final, null);
  assert.deepEqual(E.bancos, [6000, 6000, 6000, 6000, 6000]);
  assert.deepEqual(E.fichas, [0, 0, 0, 0, 0]);
  assert.deepEqual(E.apostado, [0, 0, 0, 0, 0]);
  assert.deepEqual(E.puesto, [null, null, null, null, null]);
  assert.deepEqual(E.historial, []);
  for (let i = 0; i < JUGADORES; i++) {
    assert.deepEqual(E.apuestas[i], []);
    assert.deepEqual(E.stats[i], { respuestas: 0, validas: 0, invalidas: 0, retiradas: 0, ganadas: 0, empates: 0, todoElBanco: 0 });
  }
  assert.ok(Number.isInteger(E.semillaNarracion) && E.semillaNarracion >= 0 && E.semillaNarracion < 2 ** 32);
});

test('el mismo seed da el mismo estado y otro seed solo cambia la semilla de la narracion', () => {
  assert.deepEqual(nuevoEstado(7), nuevoEstado(7));
  const a = nuevoEstado(7), b = nuevoEstado(8);
  assert.notEqual(a.semillaNarracion, b.semillaNarracion);
  assert.deepEqual({ ...a, semillaNarracion: 0 }, { ...b, semillaNarracion: 0 });
});

test('los arreglos de cada jugador son independientes', () => {
  const E = nuevoEstado();
  E.apuestas[0].push(5);
  E.bancos[0] -= 5;
  assert.deepEqual(E.apuestas[1], []);
  assert.equal(E.bancos[1], 6000);
});
