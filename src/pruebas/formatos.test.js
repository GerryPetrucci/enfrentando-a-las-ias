// La geometria de los formatos tiene que cuadrar: si no, un recorte sale mal y nadie lo nota hasta publicar.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOJA, FORMATOS, ZONA_SEGURA } from '../../herramientas/formatos.mjs';

const dentro = (a, b) => a.x >= b.x && a.y >= b.y && a.x + a.ancho <= b.x + b.ancho && a.y + a.alto <= b.y + b.alto;
const sinChoque = (a, b) => a.x + a.ancho <= b.x || b.x + b.ancho <= a.x || a.y + a.alto <= b.y || b.y + b.alto <= a.y;
const hoja = { x: 0, y: 0, ancho: HOJA.ancho, alto: HOJA.alto };

test('la hoja maestra es 4K a 30 fps', () => {
  assert.deepEqual(HOJA, { ancho: 3840, alto: 2160, fps: 30 });
});

test('cada formato tiene su proporcion exacta y medidas pares (H.264 lo exige)', () => {
  const proporcion = { '9x16': 9 / 16, '4x5': 4 / 5, '16x9': 16 / 9 };
  for (const [k, f] of Object.entries(FORMATOS)) {
    assert.equal(f.ancho / f.alto, proporcion[k], k);
    for (const v of [f.ancho, f.alto, f.x, f.y]) assert.equal(v % 2, 0, `${k}: ${v} no es par`);
  }
});

test('todo cabe en la hoja y el 9x16 y el 16x9 no se pisan', () => {
  for (const [k, f] of Object.entries(FORMATOS)) assert.ok(dentro(f, hoja), `${k} se sale de la hoja`);
  assert.ok(sinChoque(FORMATOS['9x16'], FORMATOS['16x9']));
});

test('el 4x5 es un recorte centrado del 9x16 (no una region aparte)', () => {
  const v = FORMATOS['9x16'], i = FORMATOS['4x5'];
  assert.ok(dentro(i, v));
  assert.equal(i.x, v.x);
  const arriba = i.y - v.y, abajo = v.y + v.alto - (i.y + i.alto);
  assert.ok(Math.abs(arriba - abajo) <= 2, `arriba sobran ${arriba} y abajo ${abajo}`);
});

test('la zona segura cabe en el recorte 4x5 y en el 9x16', () => {
  assert.ok(dentro(ZONA_SEGURA, FORMATOS['4x5']));
  assert.ok(dentro(ZONA_SEGURA, FORMATOS['9x16']));
  const v = FORMATOS['9x16'];
  assert.ok(ZONA_SEGURA.y >= v.y + 250, 'margen superior');
  assert.ok(v.y + v.alto - (ZONA_SEGURA.y + ZONA_SEGURA.alto) >= 420, 'margen inferior');
  assert.ok(ZONA_SEGURA.x >= v.x + 60, 'margen izquierdo');
  assert.ok(v.x + v.ancho - (ZONA_SEGURA.x + ZONA_SEGURA.ancho) >= 130, 'margen derecho');
});
