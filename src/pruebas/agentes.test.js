// Como se resuelve cada nombre de la linea de comandos a un agente, y que las estrategias no usen azar sin semilla.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolverAgente } from '../agentes.js';
import { correrPartida } from '../arena.js';
import lobo from '../juegos/lobo.js';
import { agenteBase } from './ayudas-juego.js';
import prueba from './ayudas-juego.js';

test('un bot de control de la Lobo se resuelve con el juego y pide el estado completo', () => {
  const a = resolverAgente('agresivo', lobo);
  assert.equal(a.tipo, 'bot');
  assert.equal(a.necesitaEstado, true);
  assert.equal(a.id, 'agresivo');
  assert.equal(a.nombre, 'Control agresivo');
  assert.equal(a.modelo, null);
  assert.match(a.color, /^#[0-9A-Fa-f]{6}$/);
});



test('un modelo se resuelve igual en cualquier juego y un nombre desconocido lista las opciones', () => {
  assert.equal(resolverAgente('claude', lobo).tipo, 'modelo');
  assert.equal(resolverAgente('laguna', prueba).gratis, true);
  assert.throws(() => resolverAgente('narnia', lobo), (e) => /narnia/.test(e.message) && /claude/.test(e.message) && /agresivo/.test(e.message));
});

test('el azar de las estrategias base pasa por el rng con seed: mismo seed, misma partida', async () => {
  const jugar = (seed) => correrPartida({ juego: prueba, agentes: [agenteBase('azar'), agenteBase('azar')], seed });
  const a = await jugar(3), b = await jugar(3), c = await jugar(4);
  assert.deepEqual(a.rondas.map((x) => x.jugadas), b.rondas.map((x) => x.jugadas));
  assert.notDeepEqual(a.rondas.map((x) => x.jugadas), c.rondas.map((x) => x.jugadas));
  assert.ok(!/Math\.random/.test(readFileSync('src/agentes.js', 'utf8')), 'src/agentes.js usa Math.random');
});

test('los controles de pruebas no están disponibles como agentes de producción', () => {
  assert.throws(() => resolverAgente('tomaydaca', lobo), /desconocido/);
  assert.throws(() => resolverAgente('siempre-t'), /desconocido/);
});
