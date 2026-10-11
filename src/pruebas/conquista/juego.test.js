import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearRng } from '../../rng.js';
import conquista from '../../juegos/conquista.js';
import { mapaDe } from './ayudas.js';

test('el objeto de juego cumple la interfaz de la arena', () => {
  for (const f of ['crear', 'terminado', 'vista', 'normalizar', 'aplicar', 'resultado', 'activos']) assert.equal(typeof conquista[f], 'function', f);
  for (const c of ['id', 'nombre', 'categoria', 'reglas', 'formatoRespuesta', 'versionReglas']) assert.equal(typeof conquista[c], 'string', c);
  assert.equal(conquista.id, 'conquista');
  assert.equal(conquista.rondas, 30);
});

test('crear acepta de 2 a 5 jugadores, vista es texto, activos marca a los vivos y aplicar tolera null', () => {
  const E = conquista.crear(crearRng(3), { jugadores: 3 });
  assert.equal(E.k, 3);
  assert.equal(typeof conquista.vista(E, 1), 'string');
  assert.deepEqual(conquista.activos(E), [true, true, true]);
  assert.equal(conquista.terminado(E), false);
  const registro = conquista.aplicar(E, [conquista.normalizar({ ordenes: ['armar'] }), null, conquista.normalizar(null)], crearRng(4));
  assert.equal(registro.turno, 1);
  E.reinos[2].vivo = false;
  assert.deepEqual(conquista.activos(E), [true, true, false]);
});

test('normalizar nunca lanza y resultado entrega puntos, ganador y metricas', () => {
  assert.doesNotThrow(() => conquista.normalizar(undefined));
  const E = conquista.crear(crearRng(5), { jugadores: 2 });
  E.ganador = 1;
  const r = conquista.resultado(E);
  assert.deepEqual(r.puntos, [3, 5]);
  assert.equal(r.ganador, 1);
  assert.equal(r.empate, false);
  assert.equal(r.metricas.length, 2);
});
