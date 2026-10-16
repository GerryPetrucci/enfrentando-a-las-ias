// Sonido de la escena: que cada paso de la animacion tenga su efecto, que cada efecto tenga muestras grabadas Y un respaldo sintetizado,
// y que el motor de audio no rompa nada donde no hay audio (Node, un navegador sin AudioContext, sonido apagado).
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { EVENTOS, VOLUMEN, eventosDePaso, crearSonido } from '../../../web/casino/sonido.js';
import { construirLineaDeTiempo } from '../../../web/casino/linea-de-tiempo-duda.js';
import { muchas } from './ayudas.js';

test('cada paso de la animacion tiene su efecto: nada suena de mas ni se queda mudo', () => {
  assert.deepEqual(eventosDePaso({ tipo: 'repartir' }), ['carta']);
  assert.deepEqual(eventosDePaso({ tipo: 'revelar' }), ['voltear']);
  assert.deepEqual(eventosDePaso({ tipo: 'anuncio' }), ['anuncio']);
  assert.deepEqual(eventosDePaso({ tipo: 'duda' }), ['duda']);
  assert.deepEqual(eventosDePaso({ tipo: 'apuesta' }), ['ficha']);
  assert.deepEqual(eventosDePaso({ tipo: 'fichas' }), ['ficha']);
  assert.deepEqual(eventosDePaso({ tipo: 'pago' }), ['ficha']);
  assert.deepEqual(eventosDePaso({ tipo: 'compra' }), ['ficha']);
  assert.deepEqual(eventosDePaso({ tipo: 'contar' }), ['tic']);
  assert.deepEqual(eventosDePaso({ tipo: 'sello', sello: 'justo' }), ['gana']);
  assert.deepEqual(eventosDePaso({ tipo: 'sello', sello: 'cumplido' }), ['gana']);
  assert.deepEqual(eventosDePaso({ tipo: 'sello', sello: 'farol' }), ['pierde']);
  assert.deepEqual(eventosDePaso({ tipo: 'sello', sello: 'retirada' }), ['pierde']);
  assert.deepEqual(eventosDePaso({ tipo: 'sello', sello: 'incumplido' }), ['pierde']);
  for (const mudo of [{ tipo: 'iguala' }, { tipo: 'pliega' }, { tipo: 'estado' }, { tipo: 'compraFallida' }, { tipo: 'final' }, { tipo: 'raro' }, {}, null, undefined, 7]) {
    assert.deepEqual(eventosDePaso(mudo), [], JSON.stringify(mudo));
  }
});

test('todos los pasos de partidas reales dan efectos que existen', async () => {
  const vistos = new Set();
  for (const p of await muchas()) {
    for (const b of construirLineaDeTiempo(p)) {
      for (const paso of b.pasos) {
        for (const ev of eventosDePaso(paso)) { assert.ok(EVENTOS[ev], `${paso.tipo} pide el efecto ${ev}, que no existe`); vistos.add(ev); }
      }
    }
  }
  assert.deepEqual([...vistos].sort(), ['anuncio', 'carta', 'duda', 'ficha', 'gana', 'pierde', 'tic', 'voltear'], 'cada efecto se usa en alguna partida');
});

test('cada efecto trae muestras grabadas (para la web) y un respaldo sintetizado bien formado', () => {
  for (const [nombre, ev] of Object.entries(EVENTOS)) {
    assert.ok(Array.isArray(ev.muestras) && ev.muestras.length >= 1, `${nombre}: sin muestras`);
    for (const m of ev.muestras) assert.match(m, /^audio\/[a-z0-9-]+\.ogg$/, `${nombre}: ${m}`);
    assert.equal(new Set(ev.muestras).size, ev.muestras.length);
    const { ruidos = [], tonos = [] } = ev.sintetico;
    assert.ok(ruidos.length + tonos.length >= 1, `${nombre}: el respaldo sintetizado esta vacio`);
    for (const r of ruidos) for (const k of ['dur', 'f0', 'f1', 'vol']) assert.ok(Number.isFinite(r[k]) && r[k] > 0, `${nombre} ruido ${k}`);
    for (const t of tonos) for (const k of ['freq', 'dur', 'vol']) assert.ok(Number.isFinite(t[k]) && t[k] > 0, `${nombre} tono ${k}`);
    for (const x of [...ruidos, ...tonos]) assert.ok(x.retraso === undefined || (Number.isFinite(x.retraso) && x.retraso >= 0));
  }
});

test('el volumen de los efectos queda unos 12 dB bajo la voz', () => {
  const dB = 20 * Math.log10(VOLUMEN);
  assert.ok(dB < -10 && dB > -14, `${dB.toFixed(1)} dB`);
});

test('el motor de sonido no rompe donde no hay audio: sonido apagado, Node sin AudioContext, entrada ilegible', async () => {
  for (const opciones of [{ activo: false }, { activo: true }, {}, undefined]) {
    const sfx = crearSonido(opciones);
    for (const nombre of Object.keys(EVENTOS)) assert.equal(typeof sfx[nombre], 'function', nombre);
    for (const nombre of Object.keys(EVENTOS)) assert.doesNotThrow(() => sfx[nombre]());
    await assert.doesNotReject(async () => sfx.preparar());
    assert.equal(sfx.disponible, false, 'en Node no hay AudioContext');
  }
});

import { MAPA, gananciaPara } from '../../../herramientas/preparar-sonidos.mjs';

const audio = (r) => new URL(`../../../web/audio/${r}`, import.meta.url);

test('cada muestra de cada efecto existe de verdad en web/audio: es un OGG chico', () => {
  for (const [nombre, ev] of Object.entries(EVENTOS)) {
    for (const m of ev.muestras) {
      const ruta = audio(m.replace('audio/', ''));
      assert.ok(existsSync(ruta), `${nombre}: falta web/${m}`);
      const bytes = readFileSync(ruta);
      assert.equal(bytes.subarray(0, 4).toString('latin1'), 'OggS', `${m} no es un OGG`);
      assert.ok(bytes.length > 1000 && bytes.length < 60 * 1024, `${m} pesa ${bytes.length} bytes`);
    }
  }
});

test('el mapa de preparacion cubre exactamente las muestras de los efectos, cada una de un paquete CC0 conocido', () => {
  const destinos = Object.keys(MAPA).sort();
  const esperadas = Object.values(EVENTOS).flatMap((ev) => ev.muestras.map((m) => m.replace('audio/', ''))).sort();
  assert.deepEqual(destinos, esperadas);
  for (const [destino, { paquete, origen }] of Object.entries(MAPA)) {
    assert.ok(['casino', 'interface', 'jingles'].includes(paquete), `${destino}: paquete ${paquete}`);
    assert.match(origen, /\.ogg$/, destino);
  }
});

test('la ganancia lleva cada muestra al nivel comun sin pasarse del pico permitido', () => {
  assert.equal(gananciaPara(-27, -1.5), 0.5, 'una muestra baja sube solo hasta que su pico llega a -1 dB');
  assert.equal(gananciaPara(-11, -0.9), -9, 'una muestra fuerte baja hasta el nivel comun');
  assert.equal(gananciaPara(-20, -6), 0, 'ya esta en el nivel comun');
  assert.equal(gananciaPara(-30, -12), 10, 'baja y con pico lejano: sube hasta el nivel comun');
  for (const mala of [[NaN, -1], [-20, undefined], [null, null]]) assert.equal(gananciaPara(...mala), 0, 'medida ilegible: sin cambios');
});

test('web/audio/LICENCIAS.txt trae el texto de licencia de cada paquete de Kenney usado y el LEEME dice que se verifico', () => {
  const lic = readFileSync(audio('LICENCIAS.txt'), 'utf8');
  for (const paquete of ['Casino Audio', 'Interface Sounds', 'Music Jingles']) assert.ok(lic.includes(paquete), `LICENCIAS.txt no menciona ${paquete}`);
  assert.equal((lic.match(/Creative Commons Zero, CC0/g) ?? []).length, 3, 'un texto de licencia CC0 por paquete');
  const leeme = readFileSync(audio('LEEME.md'), 'utf8');
  assert.match(leeme, /CC0/);
  assert.match(leeme, /Revision de la licencia: 16 de octubre de 2026/);
  assert.doesNotMatch(leeme, /pendiente/i, 'la licencia ya se reviso');
  for (const ev of Object.values(EVENTOS)) for (const m of ev.muestras) assert.ok(leeme.includes(m.replace('audio/', '')), `LEEME.md no menciona ${m}`);
});

test('sfx.probar y sfx.cuantas existen y no rompen donde no hay audio (la pagina de prueba de sonidos las usa)', async () => {
  const sfx = crearSonido({ activo: true });
  await sfx.preparar();
  for (const nombre of Object.keys(EVENTOS)) { assert.doesNotThrow(() => sfx.probar(nombre, 0)); assert.doesNotThrow(() => sfx.probar(nombre, -1)); }
  assert.doesNotThrow(() => sfx.probar('no-existe', 0));
  assert.deepEqual(Object.keys(sfx.cuantas()).sort(), Object.keys(EVENTOS).sort());
  assert.ok(existsSync(new URL('../../../web/sonidos.html', import.meta.url)), 'falta la pagina web/sonidos.html');
});
