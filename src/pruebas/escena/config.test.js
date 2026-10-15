// Lo puro del reproductor de la escena: parametros de la URL, recorte del clip por manos, duracion de cada beat (con o sin voz) y marcas de tiempo
// para re-doblar. Sin DOM ni navegador.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerParametros, recortarClip, duracionDeBeat, marcarTiempos, hayVoz } from '../../../web/casino/escena-config.js';
import { POSICION_EN_HOJA } from '../../../web/casino/layout.js';
import { construirLineaDeTiempo } from '../../../web/casino/linea-de-tiempo-duda.js';
import { FORMATOS } from '../../../herramientas/formatos.mjs';
import { jugar, CASOS } from './ayudas.js';

test('los parametros de la URL traen valores por defecto sensatos', () => {
  assert.deepEqual(leerParametros(''), { archivo: null, partida: 1, mano: 1, hasta: Infinity, formato: '9x16', camara: 2, sonido: true, vel: 1, razon: false, auto: false, limpio: false, voz: null, escala: 'ajustar' });
  assert.deepEqual(leerParametros(undefined), leerParametros(''));
});

test('los parametros se leen y se validan: lo ilegible vuelve al valor por defecto, nada lanza', () => {
  const p = leerParametros('?archivo=duda-1.json&partida=3&mano=4&hasta=9&formato=16x9&camara=4&sonido=0&vel=2.5&razon=1&auto=1&limpio=1&voz=voz.json&escala=1');
  assert.deepEqual(p, { archivo: 'duda-1.json', partida: 3, mano: 4, hasta: 9, formato: '16x9', camara: 4, sonido: false, vel: 2.5, razon: true, auto: true, limpio: true, voz: 'voz.json', escala: 1 });
  assert.equal(leerParametros('formato=hoja').formato, 'hoja');
  for (const [q, esperado] of [
    ['formato=1x1', { formato: '9x16' }], ['formato=4x5', { formato: '9x16' }],
    ['camara=7', { camara: 2 }], ['camara=-1', { camara: 2 }], ['camara=x', { camara: 2 }], ['camara=0', { camara: 0 }],
    ['vel=0', { vel: 1 }], ['vel=abc', { vel: 1 }], ['vel=100', { vel: 8 }], ['vel=0.01', { vel: 0.25 }],
    ['partida=0', { partida: 1 }], ['partida=-3', { partida: 1 }], ['partida=x', { partida: 1 }],
    ['mano=0', { mano: 1 }], ['mano=x', { mano: 1 }],
    ['mano=5&hasta=3', { mano: 5, hasta: Infinity }], ['hasta=x', { hasta: Infinity }],
    ['sonido=1', { sonido: true }], ['razon=0', { razon: false }], ['razon=false', { razon: false }], ['auto=', { auto: false }],
    ['escala=x', { escala: 'ajustar' }], ['escala=0', { escala: 'ajustar' }], ['escala=ajustar', { escala: 'ajustar' }],
  ]) {
    const p2 = leerParametros(q);
    for (const [k, v] of Object.entries(esperado)) assert.equal(p2[k], v, `${q}: ${k}`);
  }
});

test('el clip por manos recorta los beats y no inventa final ni se cuelga con un rango fuera de la partida', async () => {
  const p = await jugar(...CASOS.retirada);
  const beats = construirLineaDeTiempo(p);
  const ultima = p.rondas.at(-1).mano;
  assert.deepEqual(recortarClip(beats, 1, Infinity), beats, 'todo el rango = todos los beats');
  const medio = recortarClip(beats, 2, 3);
  assert.ok(medio.length > 0 && medio.every((b) => b.mano >= 2 && b.mano <= 3));
  assert.equal(medio[0].tipo, 'apertura', 'un clip empieza al abrir la mano');
  assert.ok(medio.every((b) => b.tipo !== 'final'), 'un clip del medio no lleva el final');
  const hastaElFinal = recortarClip(beats, ultima, ultima);
  assert.equal(hastaElFinal.at(-1).tipo, 'final', 'el clip de la ultima mano si lleva el final');
  assert.deepEqual(recortarClip(beats, ultima + 1, ultima + 5), []);
  assert.deepEqual(recortarClip(beats, 5, 2), []);
  for (const basura of [null, undefined, 'x', 7]) assert.deepEqual(recortarClip(basura, 1, 3), []);
});

test('un beat dura lo que dura su voz si es mas larga que lo minimo, y lo minimo si no hay voz o es mas corta; la velocidad lo acorta', () => {
  const beat = { id: 'm1-3-anuncio', minMs: 2000 };
  assert.equal(duracionDeBeat(beat, null, 1), 2000);
  assert.equal(duracionDeBeat(beat, {}, 1), 2000);
  assert.equal(duracionDeBeat(beat, { 'm1-3-anuncio': { ms: 1500 } }, 1), 2000, 'voz mas corta: manda el minimo');
  assert.equal(duracionDeBeat(beat, { 'm1-3-anuncio': { ms: 3500 } }, 1), 3500, 'voz mas larga: el beat espera a la voz');
  assert.equal(duracionDeBeat(beat, { 'm1-3-anuncio': { ms: 3500 } }, 2), 1750);
  assert.equal(duracionDeBeat(beat, null, 4), 500);
  for (const mala of [{ 'm1-3-anuncio': { ms: -5 } }, { 'm1-3-anuncio': { ms: 'x' } }, { 'm1-3-anuncio': null }, { 'm1-3-anuncio': {} }, 'texto', 7]) {
    assert.equal(duracionDeBeat(beat, mala, 1), 2000, `voz ilegible: ${JSON.stringify(mala)}`);
  }
  assert.equal(duracionDeBeat(beat, null, 0), 2000, 'velocidad ilegible vale 1');
  assert.equal(duracionDeBeat(beat, null, NaN), 2000);
  assert.equal(hayVoz({ a: { ms: 100 } }), true);
  for (const nada of [null, undefined, {}, 'x', 7]) assert.equal(hayVoz(nada), false);
});

test('las marcas de tiempo (para re-doblar) son contiguas, parten de cero y suman lo que dura el clip', async () => {
  const p = await jugar(...CASOS.retirada);
  const beats = construirLineaDeTiempo(p);
  const voz = { [beats[3].id]: { ms: 9000 } };
  const marcas = marcarTiempos(beats, voz, 1);
  assert.equal(marcas.length, beats.length);
  assert.equal(marcas[0].inicioMs, 0);
  marcas.forEach((m, i) => {
    assert.equal(m.id, beats[i].id);
    assert.equal(m.finMs - m.inicioMs, duracionDeBeat(beats[i], voz, 1), m.id);
    if (i > 0) assert.equal(m.inicioMs, marcas[i - 1].finMs, 'sin huecos ni solapes');
    assert.deepEqual(Object.keys(m).sort(), ['finMs', 'id', 'inicioMs', 'mano', 'texto', 'tipo']);
  });
  assert.equal(marcas[3].finMs - marcas[3].inicioMs, 9000);
  const rapido = marcarTiempos(beats, null, 2);
  assert.ok(rapido.at(-1).finMs < marcarTiempos(beats, null, 1).at(-1).finMs);
  assert.deepEqual(marcarTiempos(null, null, 1), []);
});

test('la posicion de cada formato en la hoja maestra de la escena es la de herramientas/formatos.mjs', () => {
  for (const f of ['9x16', '16x9']) assert.deepEqual(POSICION_EN_HOJA[f], { x: FORMATOS[f].x, y: FORMATOS[f].y }, f);
});
