// Los nombres de los videos que se suben y la carpeta de cada serie: que digan fecha, partida, pieza, formato y a que redes sirve, sin lanzar nunca ante un dato raro.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORMATOS } from '../../herramientas/formatos.mjs';
import { REDES, SUBCARPETAS, abreviarPieza, fechaDe, nombreDePieza, nombreDeVideo, slugDe, carpetaDeSerie } from '../../herramientas/nombres.mjs';

test('abreviarPieza: parte-N es ptN y clip-N es clpN; un id raro nunca lanza y nunca queda vacio', () => {
  assert.equal(abreviarPieza('parte-1'), 'pt1');
  assert.equal(abreviarPieza('parte-2'), 'pt2');
  assert.equal(abreviarPieza('clip-1'), 'clp1');
  assert.equal(abreviarPieza('clip-3'), 'clp3');
  for (const raro of [null, undefined, '', 7, {}, 'Raro Nombre!']) {
    const r = abreviarPieza(raro);
    assert.match(r, /^[a-z0-9]+$/, String(raro));
  }
});

test('fechaDe saca AAAA-MM-DD del nombre de la serie (con carpeta o sin ella) o de una fecha ISO, y sin ninguna usa hoy', () => {
  assert.deepEqual(fechaDe('2026-10-19-conquista-claude-vs-gpt.json'), { largo: '2026-10-19', corto: '26-10-19' });
  assert.deepEqual(fechaDe('pruebas/2026-10-19-conquista.json'), { largo: '2026-10-19', corto: '26-10-19' });
  assert.deepEqual(fechaDe('sin-fecha.json', '2026-10-18T02:17:21.386Z'), { largo: '2026-10-18', corto: '26-10-18' }, 'el primero que trae fecha manda');
  assert.deepEqual(fechaDe('sin-fecha.json', undefined, new Date(2027, 0, 5)), { largo: '2027-01-05', corto: '27-01-05' });
  assert.deepEqual(fechaDe(null, 7, new Date(2026, 11, 31)), { largo: '2026-12-31', corto: '26-12-31' });
});

test('nombreDePieza: fecha corta, partida y pieza, separados por guion bajo', () => {
  const fecha = fechaDe('2026-10-19-x.json');
  assert.equal(nombreDePieza({ fecha, partida: 1, pieza: 'parte-1' }), '26-10-19_p1_pt1');
  assert.equal(nombreDePieza({ fecha, partida: 2, pieza: 'clip-3' }), '26-10-19_p2_clp3');
});

test('nombreDeVideo agrega el formato y las redes a las que sirve, en orden alfabetico y con guiones', () => {
  assert.equal(nombreDeVideo('26-10-19_p1_pt1', '9x16'), '26-10-19_p1_pt1_9x16_fb-ig-tk-yt');
  assert.equal(nombreDeVideo('26-10-19_p1_pt1', '16x9'), '26-10-19_p1_pt1_16x9_fb-x-yt');
  assert.equal(nombreDeVideo('ep', 'raro'), 'ep_raro', 'un formato desconocido no inventa redes');
  assert.equal(nombreDeVideo('ep', '4x5'), 'ep_4x5', 'el 4x5 ya no existe: no hereda redes');
});

test('cada formato declara sus redes con las siglas de REDES, sin repetir y en orden alfabetico (el nombre del archivo las copia tal cual)', () => {
  assert.deepEqual(Object.keys(REDES), ['fb', 'ig', 'tk', 'x', 'yt']);
  for (const [k, f] of Object.entries(FORMATOS)) {
    assert.ok(Array.isArray(f.redes) && f.redes.length > 0, `${k}: sin redes`);
    for (const r of f.redes) assert.ok(Object.hasOwn(REDES, r), `${k}: ${r} no es una sigla de REDES`);
    assert.deepEqual(f.redes, [...new Set(f.redes)].sort(), `${k}: redes repetidas o fuera de orden`);
  }
  const todas = new Set(Object.values(FORMATOS).flatMap((f) => f.redes));
  assert.deepEqual([...todas].sort(), Object.keys(REDES), 'todas las redes tienen un formato donde subir');
});

test('slugDe quita acentos y signos: el nombre publico del juego sirve de nombre de carpeta', () => {
  assert.equal(slugDe('Guerra de territorios'), 'guerra-de-territorios');
  assert.equal(slugDe('El número solitario'), 'el-numero-solitario');
  assert.equal(slugDe('Duda y apuesta'), 'duda-y-apuesta');
  assert.equal(slugDe('  ¿Mayor o menor?  '), 'mayor-o-menor');
  for (const raro of [null, undefined, '', 7, '???']) assert.equal(slugDe(raro), 'juego', String(raro));
});

test('carpetaDeSerie: grabaciones/listos/<juego>/<fecha>_seed-<seed>, y las subcarpetas de estado son las acordadas', () => {
  assert.equal(carpetaDeSerie({ juego: 'Guerra de territorios', fecha: fechaDe('2026-10-19-x.json'), seed: 552912962 }), 'grabaciones/listos/guerra-de-territorios/2026-10-19_seed-552912962');
  assert.deepEqual(SUBCARPETAS, ['originales', 'por-subir', 'subidos', 'revision']);
});
