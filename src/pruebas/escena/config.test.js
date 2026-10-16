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

import { listaDeArchivos, catalogarPartidas, primeraValida } from '../../../web/casino/escena-config.js';
import { PRUDENTES } from './ayudas.js';

test('listaDeArchivos separa por coma, recorta los espacios y quita vacios y repetidos', () => {
  assert.deepEqual(listaDeArchivos('a.json, b.json,,a.json '), ['a.json', 'b.json']);
  assert.deepEqual(listaDeArchivos('pruebas/x.json'), ['pruebas/x.json']);
  for (const nada of [null, undefined, '', '  ,  ', 7]) assert.deepEqual(listaDeArchivos(nada), []);
});

test('catalogarPartidas: una entrada por partida de cada archivo; solo valen las de Duda y apuesta que tienen rondas, y las demas dicen por que no', async () => {
  const p1 = await jugar(1), p2 = await jugar(2, PRUDENTES);
  const cargados = [
    { nombre: 'a.json', datos: { juego: p1.juego, partidas: [p1, p2] } },
    { nombre: 'fuga.json', datos: { juego: { id: 'fuga' }, partidas: [{ jugadores: [{ nombre: 'A' }, { nombre: 'B' }], rondas: [{ mano: 1 }] }] } },
    { nombre: 'roto.json', datos: null, error: 'JSON invalido' },
    { nombre: 'vacio.json', datos: { partidas: [] } },
    { nombre: 'sinrondas.json', datos: { juego: { id: 'dudaapuesta' }, partidas: [{ jugadores: [], rondas: [] }] } },
    { nombre: 'sinpartidas.json', datos: { algo: 1 } },
  ];
  const c = catalogarPartidas(cargados);
  assert.equal(c.length, 7);
  assert.equal(new Set(c.map((e) => e.clave)).size, 7, 'claves unicas');
  assert.deepEqual(c.slice(0, 2).map((e) => [e.clave, e.archivo, e.numero, e.valida]), [['a.json#1', 'a.json', 1, true], ['a.json#2', 'a.json', 2, true]]);
  assert.equal(c[0].partida, p1);
  const manos = Math.max(...p1.rondas.map((r) => r.mano));
  assert.equal(c[0].manos, manos);
  assert.equal(c[0].titulo, `a.json · Partida 1 — Calculador vs Farolero vs Retador vs Prudente · ${manos} manos`);
  assert.match(c[1].titulo, /Partida 2 — Prudente vs Prudente vs Prudente vs Prudente/);
  const [fuga, roto, vacio, sinRondas, sinPartidas] = c.slice(2);
  assert.deepEqual([fuga.valida, fuga.partida], [false, null]);
  assert.match(fuga.motivo, /fuga/);
  assert.match(roto.motivo, /JSON invalido/);
  assert.match(vacio.motivo, /no trae partidas/);
  assert.match(sinPartidas.motivo, /no trae partidas/);
  assert.match(sinRondas.motivo, /sin rondas/);
  for (const e of [fuga, roto, vacio, sinRondas, sinPartidas]) assert.equal(e.valida, false, e.clave);
  assert.deepEqual(catalogarPartidas(null), []);
  assert.deepEqual(catalogarPartidas([null, 7, {}]).map((e) => e.valida), [false, false, false], 'entradas basura no lanzan');
});

test('catalogarPartidas marca las partidas cortadas', async () => {
  const corta = await jugar(3, undefined, { maxRondas: 10 });
  const [e] = catalogarPartidas([{ nombre: 'c.json', datos: { juego: corta.juego, partidas: [corta] } }]);
  assert.equal(e.valida, true);
  assert.match(e.titulo, / · cortada$/);
});

test('primeraValida elige la partida pedida si sirve y, si no, la primera que sirva', async () => {
  const p = await jugar(1);
  const c = catalogarPartidas([
    { nombre: 'otro.json', datos: { juego: { id: 'fuga' }, partidas: [{ rondas: [{}] }] } },
    { nombre: 'a.json', datos: { juego: p.juego, partidas: [p, p] } },
    { nombre: 'b.json', datos: { juego: p.juego, partidas: [p] } },
  ]);
  assert.equal(primeraValida(c).clave, 'a.json#1');
  assert.equal(primeraValida(c, { archivo: 'a.json', numero: 2 }).clave, 'a.json#2');
  assert.equal(primeraValida(c, { archivo: 'b.json', numero: 1 }).clave, 'b.json#1');
  assert.equal(primeraValida(c, { archivo: 'otro.json', numero: 1 }).clave, 'a.json#1', 'la pedida no sirve: la primera valida');
  assert.equal(primeraValida(c, { archivo: 'a.json', numero: 9 }).clave, 'a.json#1');
  assert.equal(primeraValida([]), null);
  assert.equal(primeraValida(null), null);
  assert.equal(primeraValida(c.slice(0, 1)), null);
});
