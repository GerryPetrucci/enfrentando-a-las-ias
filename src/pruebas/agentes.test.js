// Como se resuelve cada nombre de la linea de comandos a un agente, y que las estrategias no usen azar sin semilla.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolverAgente } from '../agentes.js';
import { correrPartida } from '../arena.js';
import conquista from '../juegos/conquista.js';
import dilema from '../juegos/dilema.js';

test('un bot de control de la Guerra de territorios se resuelve con el juego y pide el estado completo', () => {
  const a = resolverAgente('agresivo', conquista);
  assert.equal(a.tipo, 'bot');
  assert.equal(a.necesitaEstado, true);
  assert.equal(a.id, 'agresivo');
  assert.equal(a.nombre, 'Agresivo');
  assert.equal(a.modelo, null);
  assert.match(a.color, /^#[0-9A-Fa-f]{6}$/);
});

test('el bot "azar" de un juego gana a la estrategia base del mismo nombre', () => {
  assert.equal(resolverAgente('azar', conquista).necesitaEstado, true);
  assert.notEqual(resolverAgente('azar', dilema).necesitaEstado, true);
  assert.equal(resolverAgente('azar').nombre, 'Al Azar');
});

test('una estrategia base del Dilema no se puede usar en otro juego: falla antes de jugar', () => {
  assert.throws(() => resolverAgente('tomaydaca', conquista), /del Dilema/);
  assert.equal(resolverAgente('tomaydaca', dilema).tipo, 'bot');
  assert.equal(resolverAgente('tomaydaca').tipo, 'bot');
});

test('un modelo se resuelve igual en cualquier juego y un nombre desconocido lista las opciones', () => {
  assert.equal(resolverAgente('claude', conquista).tipo, 'modelo');
  assert.equal(resolverAgente('laguna', dilema).gratis, true);
  assert.throws(() => resolverAgente('narnia', conquista), (e) => /narnia/.test(e.message) && /claude/.test(e.message) && /agresivo/.test(e.message));
});

test('el azar de las estrategias base pasa por el rng con seed: mismo seed, misma partida', async () => {
  const jugar = (seed) => correrPartida({ juego: dilema, agentes: [resolverAgente('azar'), resolverAgente('azar')], seed });
  const a = await jugar(3), b = await jugar(3), c = await jugar(4);
  assert.deepEqual(a.rondas.map((x) => x.jugadas), b.rondas.map((x) => x.jugadas));
  assert.notDeepEqual(a.rondas.map((x) => x.jugadas), c.rondas.map((x) => x.jugadas));
  assert.ok(!/Math\.random/.test(readFileSync('src/agentes.js', 'utf8')), 'src/agentes.js usa Math.random');
});
