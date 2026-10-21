// Los margenes y fundidos de la grabacion con OBS (modo grabar=1): el parametro de la URL, el plan de tiempos y la direccion de grabacion. Sin DOM ni navegador.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { leerParametros, FUNDIDOS, planDeGrabacion, segundos, direccionDeGrabacion, direccionDeGancho } from '../../../web/casino/escena-config.js';
import { urlDeParte } from '../../../herramientas/partes.mjs';

test('grabar=1 solo vale junto con auto=1: sin auto la pagina no arranca sola, asi que no hay nada que enmarcar', () => {
  assert.equal(leerParametros('').grabar, false);
  assert.equal(leerParametros('auto=1&grabar=1').grabar, true);
  assert.equal(leerParametros('grabar=1').grabar, false, 'sin auto no hay fundidos');
  assert.equal(leerParametros('auto=1&grabar=0').grabar, false);
  assert.equal(leerParametros('auto=1&grabar=false').grabar, false);
  assert.equal(leerParametros('auto=1&grabar=').grabar, false);
  assert.equal(leerParametros('auto=1').grabar, false, 'una direccion sin grabar=1 queda como antes');
});

test('una captura que se detiene en un beat (detener=) no es una grabacion: no espera margenes ni se funde; detener se lee como un numero de beat o nada', () => {
  for (const q of ['auto=1&grabar=1&detener=6', 'auto=1&grabar=1&detener=0', 'auto=1&grabar=1&detener=x', 'auto=1&grabar=1&detener=']) assert.equal(leerParametros(q).grabar, false, q);
  assert.equal(leerParametros('').detener, null);
  assert.equal(leerParametros('detener=6').detener, 6);
  assert.equal(leerParametros('detener=0').detener, 0);
  assert.equal(leerParametros('detener=x').detener, null);
  assert.equal(leerParametros('detener=').detener, null);
  assert.equal('grabando' in leerParametros(''), false, 'una sola bandera: grabar ya dice todo');
});

test('el script de escena.html que deja la pagina en negro desde el primer instante aplica EXACTAMENTE la regla de leerParametros (si una cambia y la otra no, quedaria una cortina que nadie retira)', () => {
  const html = readFileSync(new URL('../../../web/escena.html', import.meta.url), 'utf8');
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
  assert.ok(script && script.includes('grabar'), 'escena.html trae el script que pone la clase grabar');
  for (const q of ['', '?auto=1&grabar=1', '?grabar=1', '?auto=1', '?auto=0&grabar=1', '?auto=1&grabar=0', '?auto=1&grabar=false', '?auto=1&grabar=', '?auto=true&grabar=true', '?auto=1&grabar=1&detener=6', '?auto=1&grabar=1&detener=0', '?auto=1&grabar=1&detener=x', '?auto=1&grabar=1&detener=']) {
    const clases = [];
    runInNewContext(script, { URLSearchParams, location: { search: q }, document: { documentElement: { classList: { add: (c) => clases.push(c) } } } });
    assert.equal(clases.includes('grabar'), leerParametros(q).grabar, `la clase grabar para «${q}»`);
  }
});

test('los tiempos de los margenes y fundidos viven en un solo lugar: 2 s de negro, fundido de 0.5 s y 2 s de cola', () => {
  assert.deepEqual(FUNDIDOS, { margenMs: 2000, fundidoMs: 500, colaMs: 2000 });
});

test('el plan de grabacion suma margen + fundido + contenido + fundido + cola; los margenes son del grabador y no dependen de la velocidad de la partida', () => {
  assert.deepEqual(planDeGrabacion(60000), { margenMs: 2000, fundidoMs: 500, contenidoMs: 60000, colaMs: 2000, totalMs: 65000 });
  assert.equal(planDeGrabacion.length, 1, 'el plan no tiene parametro de velocidad: los margenes no se escalan (el recortador los busca por su duracion); el contenido ya viene a la velocidad de reproduccion');
  assert.equal(planDeGrabacion(0).totalMs, 5000, 'sin contenido quedan los margenes y los fundidos');
});

test('el plan de grabacion no lanza con basura: el contenido ilegible cuenta como cero', () => {
  for (const basura of [null, undefined, 'x', NaN, -5, Infinity, {}]) assert.equal(planDeGrabacion(basura).contenidoMs, 0, String(basura));
});

test('segundos pasa ms a segundos con un decimal como mucho (los textos de los margenes salen de FUNDIDOS)', () => {
  assert.deepEqual([2000, 500, 3000, 1500, 0].map(segundos), [2, 0.5, 3, 1.5, 0]);
});

test('direccionDeGrabacion: la direccion de la escena para grabar una pieza (sin barra, arranca sola, con margenes), la misma para el paquete y para partes.mjs', () => {
  const d = new URL(`http://x/${direccionDeGrabacion({ archivo: 'pruebas/a b.json', partida: 2, desde: 3, hasta: 9, voz: 'data/voz/a-p2/voz.json' })}`);
  assert.equal(d.pathname, '/escena.html');
  assert.deepEqual(Object.fromEntries(d.searchParams), { archivo: 'pruebas/a b.json', partida: '2', ronda: '3', hasta: '9', formato: 'hoja', auto: '1', limpio: '1', grabar: '1', voz: 'data/voz/a-p2/voz.json' });
  const sinVoz = new URL(`http://x/${direccionDeGrabacion({ archivo: 'a.json', desde: 1, hasta: 4, formato: '9x16' })}`);
  assert.equal(sinVoz.searchParams.get('formato'), '9x16');
  assert.equal(sinVoz.searchParams.get('partida'), '1');
  assert.equal(sinVoz.searchParams.has('voz'), false);
  // lo que construye la direccion lo entiende leerParametros tal cual
  const p = leerParametros(sinVoz.search);
  assert.deepEqual([p.mano, p.hasta, p.formato, p.auto, p.limpio, p.grabar], [1, 4, '9x16', true, true, true]);
  // partes.mjs imprime la misma direccion que el paquete: antes no llevaba limpio ni grabar y grababa sin margenes
  assert.equal(urlDeParte({ archivo: 'a.json', partida: 1, formato: 'hoja', parte: { mano: 1, hasta: 4 } }), direccionDeGrabacion({ archivo: 'a.json', partida: 1, desde: 1, hasta: 4, formato: 'hoja' }));
});

test('direccionDeGancho: la direccion para grabar el gancho de una parte (cortes, parte y de cuantas), sin voz, con margenes de negro; leerParametros la entiende tal cual', () => {
  const d = new URL(`http://x/${direccionDeGancho({ archivo: 'pruebas/a b.json', partida: 2, cortes: [10, 6, 14], parte: 2, de: 2 })}`);
  assert.equal(d.pathname, '/escena.html');
  assert.deepEqual(Object.fromEntries(d.searchParams), { archivo: 'pruebas/a b.json', partida: '2', gancho: '1', cortes: '10,6,14', parte: '2', de: '2', formato: 'hoja', auto: '1', limpio: '1', grabar: '1' });
  const p = leerParametros(d.search);
  assert.deepEqual(p.gancho, { cortes: [10, 6, 14], parte: 2, de: 2 });
  assert.deepEqual([p.formato, p.auto, p.limpio, p.grabar, p.voz], ['hoja', true, true, true, null]);
  assert.equal(new URL(`http://x/${direccionDeGancho({ archivo: 'a.json', cortes: [3], parte: 1, de: 2, formato: '9x16' })}`).searchParams.get('formato'), '9x16');
});
