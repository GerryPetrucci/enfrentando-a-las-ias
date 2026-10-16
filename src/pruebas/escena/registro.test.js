// El registro de escenas (web/casino/lineas.js): que juegos tienen escena de casino y que sabe la pagina de cada uno.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { juegosConEscena, escenaDe, lineaDe } from '../../../web/casino/lineas.js';
import { catalogarPartidas } from '../../../web/casino/escena-config.js';

test('el registro dice de cada juego con escena su nombre, cuantos jugadores, la camara por defecto y la unidad de un clip', () => {
  assert.ok(juegosConEscena().includes('dudaapuesta'));
  const e = escenaDe('dudaapuesta');
  assert.equal(e.nombre, 'Duda y apuesta');
  assert.equal(e.jugadores, 4);
  assert.equal(e.camaraPorDefecto, 2);
  assert.equal(e.unidad, 'mano');
  assert.equal(typeof e.linea, 'function');
  assert.equal(typeof e.mesa, 'function');
});

test('todos los juegos registrados traen sus datos completos y una camara por defecto que no pasa de sus jugadores', () => {
  for (const id of juegosConEscena()) {
    const e = escenaDe(id);
    assert.ok(typeof e.nombre === 'string' && e.nombre.length > 0, id);
    assert.ok(Number.isInteger(e.jugadores) && e.jugadores >= 2 && e.jugadores <= 5, `${id}: jugadores`);
    assert.ok(Number.isInteger(e.camaraPorDefecto) && e.camaraPorDefecto >= 0 && e.camaraPorDefecto <= e.jugadores, `${id}: camara por defecto`);
    assert.ok(['mano', 'ronda'].includes(e.unidad), `${id}: unidad`);
  }
});

test('un juego sin escena da un error que dice cuales hay', async () => {
  assert.throws(() => escenaDe('fuga'), /no hay escena.*"fuga".*dudaapuesta/);
  for (const raro of [undefined, null, '', 7, 'toString', '__proto__']) assert.throws(() => escenaDe(raro), /no hay escena/, String(raro));
  await assert.rejects(() => lineaDe('fuga'), /no hay escena/);
});

test('el catalogo de partidas usa el registro: un juego registrado vale y uno sin escena no, diciendo por que', () => {
  const partida = (id) => ({ juego: { id }, jugadores: [{ nombre: 'A' }, { nombre: 'B' }], rondas: [{ mano: 1 }] });
  const c = catalogarPartidas([
    ...juegosConEscena().map((id) => ({ nombre: `${id}.json`, datos: { partidas: [partida(id)] } })),
    { nombre: 'fuga.json', datos: { partidas: [partida('fuga')] } },
  ]);
  for (const e of c.filter((x) => x.archivo !== 'fuga.json')) assert.equal(e.valida, true, e.archivo);
  const fuga = c.find((x) => x.archivo === 'fuga.json');
  assert.equal(fuga.valida, false);
  assert.match(fuga.motivo, /fuga/);
  assert.equal(fuga.juego, 'fuga');
});
