// Los nombres de los videos que se suben y la carpeta de cada serie: que digan el numero de juego, la pieza, el formato y a que redes sirve, sin lanzar nunca ante un dato raro.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORMATOS } from '../../herramientas/formatos.mjs';
import { REDES, SUBCARPETAS, abreviarPieza, fechaDe, nombreDePieza, nombreDeVideo, slugDe, carpetaDeSerie, juegoDeCarpeta, elegirJuego } from '../../herramientas/nombres.mjs';

test('abreviarPieza: parte-N es ptN y clip-N es clpN; un id raro nunca lanza y nunca queda vacio', () => {
  assert.equal(abreviarPieza('parte-1'), 'pt1');
  assert.equal(abreviarPieza('parte-2'), 'pt2');
  assert.equal(abreviarPieza('clip-1'), 'clp1');
  assert.equal(abreviarPieza('clip-3'), 'clp3');
  assert.equal(abreviarPieza('gancho-1'), 'hk1', 'el gancho «Proximamente» es hk (hook)');
  assert.equal(abreviarPieza('gancho-2'), 'hk2');
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

test('nombreDePieza: el numero de juego (jN) y la pieza, separados por guion bajo; sin fecha', () => {
  assert.equal(nombreDePieza({ juego: 1, pieza: 'parte-1' }), 'j1_pt1');
  assert.equal(nombreDePieza({ juego: 12, pieza: 'clip-3' }), 'j12_clp3');
  assert.equal(nombreDePieza({ juego: 3, pieza: 'gancho-2' }), 'j3_hk2');
});

test('juegoDeCarpeta lee el numero de una carpeta paquete-jN y nada mas', () => {
  assert.equal(juegoDeCarpeta('paquete-j1'), 1);
  assert.equal(juegoDeCarpeta('paquete-j12'), 12);
  for (const no of ['paquete-p1', 'paquete-j', 'paquete-j1x', 'xpaquete-j1', 'textos', '', null, undefined, 7]) assert.equal(juegoDeCarpeta(no), null, String(no));
});

test('elegirJuego: el numero de juego sube de uno en uno en cada juego nuevo del juego (carpeta), y una partida que ya tiene paquete conserva el suyo', () => {
  const ya = [{ serie: 'a', juego: 1, partida: 1 }, { serie: 'a', juego: 2, partida: 2 }];
  assert.equal(elegirJuego({ existentes: [], serie: 'a', partida: 1 }), 1);
  assert.equal(elegirJuego({ existentes: ya, serie: 'a', partida: 1 }), 1, 'regenerar el paquete no cambia el numero');
  assert.equal(elegirJuego({ existentes: ya, serie: 'a', partida: 2 }), 2);
  assert.equal(elegirJuego({ existentes: ya, serie: 'b', partida: 1 }), 3, 'otra serie del mismo juego sigue la cuenta');
  assert.equal(elegirJuego({ existentes: [{ serie: 'a', juego: 1, partida: 1 }, { serie: 'a', juego: 5, partida: 2 }], serie: 'b', partida: 1 }), 6, 'con huecos, el maximo mas uno');
  assert.equal(elegirJuego({ existentes: [null, {}, { serie: 'a', juego: 'x', partida: 1 }, { serie: 'a', juego: 0, partida: 1 }], serie: 'a', partida: 1 }), 1, 'datos raros se ignoran');
  for (const raro of [undefined, {}, { existentes: null }]) assert.equal(elegirJuego(raro), 1, String(raro));
});

test('nombreDeVideo agrega el formato y las redes a las que sirve, en orden alfabetico y con guiones', () => {
  assert.equal(nombreDeVideo('j1_pt1', '9x16'), 'j1_pt1_9x16_fb-ig-tk-yt');
  assert.equal(nombreDeVideo('j1_pt1', '16x9'), 'j1_pt1_16x9_fb-x-yt');
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
