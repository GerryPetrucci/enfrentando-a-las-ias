// El registro de escenas (web/casino/lineas.js): que juegos tienen escena de casino y que sabe la pagina de cada uno.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { juegosConEscena, escenaDe, lineaDe } from '../../../web/casino/lineas.js';
import { catalogarPartidas } from '../../../web/casino/escena-config.js';
import { jugarMM } from './ayudas-mm.js';
import { jugarSol } from './ayudas-sol.js';

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

test('la linea de tiempo de cada juego registrado exporta lo que la herramienta de capturas necesita: construirla y comprobar el estado de su escena', async () => {
  for (const id of juegosConEscena()) {
    const linea = await escenaDe(id).linea();
    for (const f of ['construirLineaDeTiempo', 'beatsDeEstado', 'erroresDeEstado']) assert.equal(typeof linea[f], 'function', `${id}: falta ${f}`);
    assert.deepEqual(linea.beatsDeEstado(null, 3), [], `${id}: beatsDeEstado con basura no lanza`);
    assert.ok(linea.erroresDeEstado(null, { id: 'x' }).length > 0, `${id}: una escena que no informa su estado es un error`);
  }
});

test('la lista cuenta las rondas de una partida real de Mayor o menor (sus registros traen ronda, no mano) y usa la palabra de su unidad', async () => {
  const p = await jugarMM(1);
  const [e] = catalogarPartidas([{ nombre: 'mm.json', datos: { partidas: [p] } }]);
  assert.equal(e.valida, true);
  assert.equal(e.manos, p.rondas.at(-1).ronda);
  assert.ok(e.manos > 1);
  assert.match(e.titulo, new RegExp(` · ${e.manos} rondas`));
  const una = structuredClone(p); una.rondas = una.rondas.slice(0, 1);
  assert.match(catalogarPartidas([{ nombre: 'mm.json', datos: { partidas: [una] } }])[0].titulo, / · 1 ronda$/);
});

test('El numero solitario esta registrado: cinco jugadores, camara 2, unidad ronda; la lista cuenta sus 12 rondas (dos registros por ronda)', async () => {
  const e = escenaDe('solitario');
  assert.deepEqual([e.nombre, e.jugadores, e.camaraPorDefecto, e.unidad], ['El número solitario', 5, 2, 'ronda']);
  const p = await jugarSol(1);
  const [entrada] = catalogarPartidas([{ nombre: 'sol.json', datos: { partidas: [p] } }]);
  assert.equal(entrada.valida, true);
  assert.equal(entrada.manos, 12);
  assert.match(entrada.titulo, / · 12 rondas$/);
  assert.equal(typeof (await lineaDe('solitario')), 'function');
});
