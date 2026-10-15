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

test('web/audio/LEEME.md dice de donde salen las muestras, su licencia y el nombre exacto de cada archivo que se espera', () => {
  const ruta = new URL('../../../web/audio/LEEME.md', import.meta.url);
  assert.ok(existsSync(ruta), 'falta web/audio/LEEME.md');
  const texto = readFileSync(ruta, 'utf8');
  assert.match(texto, /CC0/);
  assert.match(texto, /kenney/i);
  assert.match(texto, /licencia/i);
  for (const ev of Object.values(EVENTOS)) for (const m of ev.muestras) assert.ok(texto.includes(m.replace('audio/', '')), `LEEME.md no menciona ${m}`);
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
