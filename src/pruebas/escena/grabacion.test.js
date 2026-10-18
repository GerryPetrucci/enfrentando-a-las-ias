// Los margenes y fundidos de la grabacion con OBS (modo grabar=1): el parametro de la URL y el plan de tiempos. Sin DOM ni navegador.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
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

test('detener= se lee como un numero de beat (o nada) y la regla «se graba con margenes» tiene un solo dueno: grabar, auto y que no se detenga en un beat', () => {
  assert.equal(leerParametros('').detener, null);
  assert.equal(leerParametros('detener=6').detener, 6);
  assert.equal(leerParametros('detener=0').detener, 0);
  assert.equal(leerParametros('detener=x').detener, null);
  assert.equal(leerParametros('detener=').detener, null);
  assert.equal(leerParametros('auto=1&grabar=1').grabando, true);
  assert.equal(leerParametros('auto=1&grabar=1&detener=6').grabando, false, 'una captura que se detiene en un beat no espera margenes ni se funde');
  assert.equal(leerParametros('auto=1&grabar=1&detener=0').grabando, false, 'detener=0 tambien es detenerse');
  assert.equal(leerParametros('grabar=1').grabando, false);
  assert.equal(leerParametros('auto=1').grabando, false);
});

test('el script de escena.html que deja la pagina en negro desde el primer instante aplica la misma regla que leerParametros (si una cambia y la otra no, quedaria una cortina que nadie retira)', () => {
  const html = readFileSync(new URL('../../../web/escena.html', import.meta.url), 'utf8');
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
  assert.ok(script && script.includes('grabar'), 'escena.html trae el script que pone la clase grabar');
  for (const q of ['', '?auto=1&grabar=1', '?grabar=1', '?auto=1', '?auto=0&grabar=1', '?auto=1&grabar=0', '?auto=1&grabar=false', '?auto=1&grabar=', '?auto=true&grabar=true', '?auto=1&grabar=1&detener=6']) {
    const clases = [];
    runInNewContext(script, { URLSearchParams, location: { search: q }, document: { documentElement: { classList: { add: (c) => clases.push(c) } } } });
    const params = leerParametros(q);
    // la clase se pone mientras grabar y auto valgan, incluso con detener= (en ese caso es escena.js quien retira la cortina: grabando es falso)
    assert.equal(clases.includes('grabar'), params.grabar, `la clase grabar para «${q}»`);
  }
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
