import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JUEGOS, obtenerJuego } from '../../juegos/index.js';
import { juegosConEscena, escenaDe, lineaDe, motivoDeNoReproducible } from '../../../web/casino/lineas.js';
import { catalogarPartidas } from '../../../web/casino/escena-config.js';
import { jugarLobo } from './ayudas-lobo.js';

test('solo Lobo está registrado como juego y como escena', () => {
  assert.deepEqual(Object.keys(JUEGOS), ['lobo']);
  assert.deepEqual(juegosConEscena(), ['lobo']);
  assert.equal(obtenerJuego('lobo').id, 'lobo');
  assert.equal(escenaDe('lobo').unidad, 'ronda');
  for (const id of ['ausente', '__proto__', 'toString']) {
    assert.throws(() => obtenerJuego(id), /desconocido/);
    assert.throws(() => escenaDe(id), /no hay escena/);
  }
});
test('el catálogo acepta Lobo completo y rechaza datos incompletos o juegos desconocidos', () => {
  const p = jugarLobo();
  assert.equal(motivoDeNoReproducible('lobo', p), null);
  assert.match(motivoDeNoReproducible('lobo', { ...p, jugadores: [] }), /8 o 12/);
  assert.match(motivoDeNoReproducible('ausente', p), /no tiene escena/);
  const c = catalogarPartidas([{ nombre: 'lobo.json', datos: { juego: { id: 'lobo' }, partidas: [p] } }]);
  assert.equal(c.length, 1); assert.equal(c[0].valida, true);
});
test('la línea registrada genera la introducción y todos los beats de Lobo', async () => {
  const construir = await lineaDe('lobo');
  const beats = construir(jugarLobo());
  assert.equal(beats[0].tipo, 'intro');
  assert.ok(beats.length > 10);
  assert.equal(new Set(beats.map(b => b.id)).size, beats.length);
});
