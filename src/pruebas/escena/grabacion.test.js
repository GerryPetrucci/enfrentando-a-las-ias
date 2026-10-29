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
  assert.deepEqual(Object.fromEntries(d.searchParams), { archivo: 'pruebas/a b.json', partida: '2', ronda: '3', hasta: '9', formato: 'hoja', auto: '1', limpio: '1', grabar: '1', cierre: '1', voz: 'data/voz/a-p2/voz.json' });
  const sinVoz = new URL(`http://x/${direccionDeGrabacion({ archivo: 'a.json', desde: 1, hasta: 4, formato: '9x16' })}`);
  assert.equal(sinVoz.searchParams.get('formato'), '9x16');
  assert.equal(sinVoz.searchParams.get('partida'), '1');
  assert.equal(sinVoz.searchParams.has('voz'), false);
  // lo que construye la direccion lo entiende leerParametros tal cual
  const p = leerParametros(sinVoz.search);
  assert.deepEqual([p.mano, p.hasta, p.formato, p.auto, p.limpio, p.grabar, p.cierre, p.tipoCierre], [1, 4, '9x16', true, true, true, true, null]);
  // con el tipo de la pieza, la direccion dice que frase final le toca (parte a medias, parte final o clip); un tipo que no existe se queda en cierre=1
  for (const tipo of ['parte', 'final', 'clip']) assert.equal(leerParametros(new URL('http://x/' + direccionDeGrabacion({ archivo: 'a.json', desde: 1, hasta: 4, cierre: tipo })).search).tipoCierre, tipo);
  assert.equal(new URL('http://x/' + direccionDeGrabacion({ archivo: 'a.json', desde: 1, hasta: 4, cierre: 'gancho-x' })).searchParams.get('cierre'), '1');
  // partes.mjs imprime la misma direccion que el paquete: antes no llevaba limpio ni grabar y grababa sin margenes
  assert.equal(urlDeParte({ archivo: 'a.json', partida: 1, formato: 'hoja', parte: { mano: 1, hasta: 4 } }), direccionDeGrabacion({ archivo: 'a.json', partida: 1, desde: 1, hasta: 4, formato: 'hoja' }));
});

test('direccionDeGancho: la direccion para grabar el gancho de una parte (cortes, parte y de cuantas), con margenes de negro y el cierre (la voz solo dice el cierre); leerParametros la entiende tal cual', () => {
  const d = new URL(`http://x/${direccionDeGancho({ archivo: 'pruebas/a b.json', partida: 2, cortes: [10, 6, 14], parte: 2, de: 2 })}`);
  assert.equal(d.pathname, '/escena.html');
  assert.deepEqual(Object.fromEntries(d.searchParams), { archivo: 'pruebas/a b.json', partida: '2', gancho: '1', cortes: '10,6,14', parte: '2', de: '2', formato: 'hoja', auto: '1', limpio: '1', grabar: '1', cierre: 'gancho' });
  const p = leerParametros(d.search);
  assert.deepEqual(p.gancho, { cortes: [10, 6, 14], parte: 2, de: 2 });
  assert.equal(p.numero, null, 'sin numero de juego en la direccion, la tarjeta no inventa uno');
  assert.deepEqual([p.formato, p.auto, p.limpio, p.grabar, p.voz, p.cierre], ['hoja', true, true, true, null, true]);
  assert.equal(p.tipoCierre, 'gancho', 'el gancho cierra con las frases del gancho');
  const conVoz = new URL(`http://x/${direccionDeGancho({ archivo: 'a.json', cortes: [3], parte: 1, de: 2, voz: 'data/voz/a-p1/voz.json' })}`);
  assert.equal(conVoz.searchParams.get('voz'), 'data/voz/a-p1/voz.json', 'la voz del cierre');
  assert.equal(new URL(`http://x/${direccionDeGancho({ archivo: 'a.json', cortes: [3], parte: 1, de: 2, formato: '9x16' })}`).searchParams.get('formato'), '9x16');
  // el numero de JUEGO (jN) viaja en la direccion: las tarjetas dicen «Juego N · Parte M de K», no la partida del archivo
  const conNumero = new URL(`http://x/${direccionDeGancho({ archivo: 'a.json', partida: 1, cortes: [3, 5], parte: 2, de: 2, juegoNumero: 3 })}`);
  assert.equal(conNumero.searchParams.get('numero'), '3');
  assert.deepEqual(leerParametros(conNumero.search).gancho, { cortes: [3, 5], parte: 2, de: 2 });
  assert.equal(leerParametros(conNumero.search).numero, 3);
  assert.equal(leerParametros('?gancho=1&cortes=3&numero=0&parte=1').numero, null, 'un numero de juego invalido se ignora');
});

test('direccionDeGrabacion: una parte o un clip llevan el jN (numero), la parte a la que pertenecen (parte y de) y, un clip, su numero (clip); sin ellos la direccion queda como siempre', () => {
  const base = { archivo: 'a.json', partida: 1, desde: 3, hasta: 9, formato: 'hoja' };
  const vieja = Object.fromEntries(new URL(`http://x/${direccionDeGrabacion(base)}`).searchParams);
  assert.deepEqual(Object.keys(vieja), ['archivo', 'partida', 'ronda', 'hasta', 'formato', 'auto', 'limpio', 'grabar', 'cierre'], 'sin jN, la direccion de siempre');
  const parte = new URL(`http://x/${direccionDeGrabacion({ ...base, juegoNumero: 3, parte: 1, de: 2 })}`);
  assert.deepEqual([parte.searchParams.get('numero'), parte.searchParams.get('parte'), parte.searchParams.get('de'), parte.searchParams.get('clip')], ['3', '1', '2', null]);
  const clip = leerParametros(new URL(`http://x/${direccionDeGrabacion({ ...base, juegoNumero: 3, parte: 2, de: 2, clip: 4, cierre: 'clip' })}`).search);
  assert.deepEqual([clip.numero, clip.pieza], [3, { parte: 2, de: 2, clip: 4 }]);
  assert.equal(new URL(`http://x/${direccionDeGrabacion({ ...base, juegoNumero: 0, parte: 1, de: 2 })}`).searchParams.get('numero'), null, 'un jN invalido no se escribe');
});
