import { jugarLobo } from './ayudas-lobo.js';
// La tarjeta de arranque como beat (web/casino/intro.js + armarLinea de lineas.js): se antepone en UN solo lugar y la usan la pagina, las capturas, las partes y la voz.
// Partidas REALES jugadas por bots, sin DOM, sin red y sin API.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { conIntro, MIN_MS_INTRO, MAX_MS_INTRO } from '../../../web/casino/intro.js';
import { armarLinea, lineaDe, escenaDe } from '../../../web/casino/lineas.js';
import { introDe, textoDeJuego } from '../../../web/casino/textos-juego.js';
import { recortarClip, dividirEnDos } from '../../../web/casino/escena-config.js';
import { planDeNarracion } from '../../../herramientas/narrar.mjs';

const PARTIDAS = { lobo: jugarLobo(3) };
const moduloDe = (id) => escenaDe(id).linea();

test('armarLinea antepone el intro a los beats de cada uno de los 7 juegos y deja el resto igual que antes', async () => {
  for (const [id, partida] of Object.entries(PARTIDAS)) {
    const sin = (await moduloDe(id)).construirLineaDeTiempo(partida), con = await armarLinea(id, partida);
    assert.equal(con.length, sin.length + 1, id);
    const [intro, ...resto] = con;
    assert.deepEqual(resto, sin, `${id}: lo demas no cambia`);
    assert.equal(intro.id, 'intro');
    assert.equal(intro.tipo, 'intro');
    assert.equal(intro.mano, sin[0].mano, `${id}: el intro es de la primera unidad`);
    assert.equal(intro.texto, introDe(id));
    assert.deepEqual(intro.lineas, [{ tipo: 'hecho', texto: introDe(id), clave: 'intro' }]);
    assert.ok(intro.minMs >= MIN_MS_INTRO && intro.minMs <= MAX_MS_INTRO, `${id}: dura de 5 a 8 s (${intro.minMs})`);
    assert.deepEqual(intro.camara, []);
    assert.equal(intro.reemplazo, false);
    const t = textoDeJuego(id);
    assert.deepEqual(intro.pasos, [{ tipo: 'intro', juego: id, nombre: t.nombre, categoria: t.categoria, regla: t.regla, gana: t.gana }]);
    assert.equal(new Set(con.map((b) => b.id)).size, con.length, `${id}: ids unicos`);
  }
});

test('conIntro no lanza con basura, no agrega nada a un juego sin textos y no se duplica', async () => {
  assert.deepEqual(conIntro([], 'lobo'), []);
  for (const raro of [null, undefined, 'x', 7, {}]) assert.deepEqual(conIntro(raro, 'lobo'), []);
  const beats = (await moduloDe('lobo')).construirLineaDeTiempo(PARTIDAS.lobo);
  assert.deepEqual(conIntro(beats, 'no-existe'), beats);
  assert.deepEqual(conIntro(beats, undefined), beats);
  assert.deepEqual(conIntro(beats, '__proto__'), beats);
  const una = conIntro(beats, 'lobo');
  assert.deepEqual(conIntro(una, 'lobo'), una, 'idempotente');
  assert.equal(beats.length + 1, una.length);
});

test('recortarClip deja el intro solo en la parte que empieza en la primera unidad; dividirEnDos parte con el intro y sigue cubriendo todo', async () => {
  for (const [id, partida] of Object.entries(PARTIDAS)) {
    const beats = await armarLinea(id, partida), d = dividirEnDos(beats);
    assert.ok(d, id);
    const p1 = recortarClip(beats, d.parte1.mano, d.parte1.hasta), p2 = recortarClip(beats, d.parte2.mano, d.parte2.hasta);
    assert.equal(p1[0].id, 'intro', `${id}: la parte 1 abre con el intro`);
    assert.ok(!p2.some((b) => b.tipo === 'intro'), `${id}: la parte 2 no lo lleva`);
    assert.equal(p1.length + p2.length, beats.length, `${id}: las dos partes cubren todo`);
    const sinIntro = recortarClip(beats, beats[1].mano, beats.at(-1).mano);
    assert.ok(!sinIntro.some((b) => b.tipo === 'intro') || beats[0].mano === beats[1].mano, 'un clip que empieza en la unidad 1 si lo lleva');
  }
});

test('lineaDe devuelve la funcion con el intro (el mismo contrato que antes) y la voz narra el intro primero', async () => {
  const construir = await lineaDe('lobo');
  const beats = construir(PARTIDAS.lobo);
  assert.equal(beats[0].id, 'intro');
  const plan = planDeNarracion(beats);
  assert.equal(plan[0].id, 'intro');
  assert.equal(plan[0].texto, introDe('lobo'));
  assert.ok(plan.length >= 2);
});

test('la pagina y la herramienta de capturas construyen sus beats con armarLinea (si no, el indice de un beat no coincide entre las dos)', () => {
  const leer = (ruta) => readFileSync(new URL(`../../../${ruta}`, import.meta.url), 'utf8');
  assert.match(leer('web/casino/escena.js'), /armarLinea\(/);
  assert.doesNotMatch(leer('web/casino/escena.js'), /linea\.construirLineaDeTiempo\(/);
  assert.match(leer('herramientas/capturar-escena.mjs'), /armarLinea\(/);
  assert.doesNotMatch(leer('herramientas/capturar-escena.mjs'), /linea\.construirLineaDeTiempo\(/);
});
