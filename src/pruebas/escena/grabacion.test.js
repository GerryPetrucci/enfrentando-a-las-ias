// Los margenes y fundidos de la grabacion con OBS (modo grabar=1): el parametro de la URL y el plan de tiempos. Sin DOM ni navegador.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerParametros, FUNDIDOS, planDeGrabacion } from '../../../web/casino/escena-config.js';

test('grabar=1 solo vale junto con auto=1: sin auto la pagina no arranca sola, asi que no hay nada que enmarcar', () => {
  assert.equal(leerParametros('').grabar, false);
  assert.equal(leerParametros('auto=1&grabar=1').grabar, true);
  assert.equal(leerParametros('grabar=1').grabar, false, 'sin auto no hay fundidos');
  assert.equal(leerParametros('auto=1&grabar=0').grabar, false);
  assert.equal(leerParametros('auto=1&grabar=false').grabar, false);
  assert.equal(leerParametros('auto=1&grabar=').grabar, false);
  assert.equal(leerParametros('auto=1').grabar, false, 'una direccion sin grabar=1 queda como antes');
});

test('los tiempos de los margenes y fundidos viven en un solo lugar: 2 s de negro, fundido de 0.5 s y 2 s de cola', () => {
  assert.deepEqual(FUNDIDOS, { margenMs: 2000, fundidoMs: 500, colaMs: 2000 });
});

test('el plan de grabacion suma margen + fundido + contenido + fundido + cola (a velocidad 1) y escala margenes y fundidos con la velocidad', () => {
  assert.deepEqual(planDeGrabacion(60000), { margenMs: 2000, fundidoMs: 500, contenidoMs: 60000, colaMs: 2000, totalMs: 65000 });
  assert.deepEqual(planDeGrabacion(60000, 2), { margenMs: 1000, fundidoMs: 250, contenidoMs: 60000, colaMs: 1000, totalMs: 62500 }, 'el contenido ya viene a la velocidad de reproduccion');
  assert.equal(planDeGrabacion(0).totalMs, 5000, 'sin contenido quedan los margenes y los fundidos');
});

test('el plan de grabacion no lanza con basura: el contenido ilegible cuenta como cero y la velocidad ilegible como 1', () => {
  for (const basura of [null, undefined, 'x', NaN, -5, Infinity, {}]) assert.equal(planDeGrabacion(basura).contenidoMs, 0, String(basura));
  for (const vel of [0, -1, NaN, 'x', null, undefined]) assert.equal(planDeGrabacion(1000, vel).margenMs, 2000, String(vel));
});
