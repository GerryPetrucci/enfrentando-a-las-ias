// Diseno de la pantalla de la escena de Duda y apuesta: donde va cada cosa en 9:16 y en 16:9.
// Lo que se lee tiene que caber en la zona segura (en 9:16, la de herramientas/formatos.mjs) y nada se pisa.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colocar, abanico, FORMATOS_ESCENA } from '../../../web/casino/layout.js';
import { FORMATOS, ZONA_SEGURA } from '../../../herramientas/formatos.mjs';

const dentro = (a, b) => a.x >= b.x && a.y >= b.y && a.x + a.ancho <= b.x + b.ancho && a.y + a.alto <= b.y + b.alto;
const sinChoque = (a, b) => a.x + a.ancho <= b.x || b.x + b.ancho <= a.x || a.y + a.alto <= b.y || b.y + b.alto <= a.y;
// Todo lo que el espectador tiene que poder leer, con su nombre (el fieltro y el riel son decorado y no cuentan).
const legibles = (L) => ({
  etiqueta: L.etiqueta, cabecera: L.cabecera, anuncio: L.anuncio, pozo: L.pozo, mazo: L.mazo, subtitulos: L.subtitulos,
  ...Object.fromEntries(L.asientos.flatMap((a, s) => [[`asiento${s}`, a.caja], [`placa${s}`, a.placa], [`cartas${s}`, a.cartas]])),
});
const piezasAparte = (L) => ({
  etiqueta: L.etiqueta, cabecera: L.cabecera, anuncio: L.anuncio, pozo: L.pozo, mazo: L.mazo, subtitulos: L.subtitulos,
  ...Object.fromEntries(L.asientos.map((a, s) => [`asiento${s}`, a.caja])),
});

test('las medidas del lienzo y la zona segura de la web coinciden con herramientas/formatos.mjs (la web no puede importarlo)', () => {
  for (const f of ['9x16', '16x9']) {
    assert.equal(FORMATOS_ESCENA[f].ancho, FORMATOS[f].ancho, f);
    assert.equal(FORMATOS_ESCENA[f].alto, FORMATOS[f].alto, f);
  }
  assert.deepEqual(FORMATOS_ESCENA['9x16'].zona, ZONA_SEGURA);
});

test('en 9:16 todo lo que se lee cabe en la zona segura, y esa zona cabe en el recorte 4:5 de Instagram', () => {
  const L = colocar('9x16');
  for (const [nombre, r] of Object.entries(legibles(L))) assert.ok(dentro(r, ZONA_SEGURA), `${nombre} se sale de la zona segura: ${JSON.stringify(r)}`);
  // El 4x5 empieza en y = 284 de la hoja y el 9x16 en y = 0: en coordenadas del 9x16 el recorte va de 284 a 284 + 1350.
  const recorte45 = { x: 0, y: FORMATOS['4x5'].y - FORMATOS['9x16'].y, ancho: FORMATOS['4x5'].ancho, alto: FORMATOS['4x5'].alto };
  assert.ok(dentro(ZONA_SEGURA, recorte45));
});

test('en 16:9 todo lo que se lee cabe en el lienzo, dentro del margen de seguridad de la zona', () => {
  const L = colocar('16x9');
  const lienzo = { x: 0, y: 0, ancho: 1920, alto: 1080 };
  assert.ok(dentro(L.zona, lienzo));
  for (const [nombre, r] of Object.entries(legibles(L))) assert.ok(dentro(r, L.zona), `${nombre} se sale de la zona: ${JSON.stringify(r)}`);
});

test('las piezas de la pantalla no se pisan entre si, en ningun formato', () => {
  for (const f of ['9x16', '16x9']) {
    const piezas = Object.entries(piezasAparte(colocar(f)));
    for (let i = 0; i < piezas.length; i++) for (let j = i + 1; j < piezas.length; j++) assert.ok(sinChoque(piezas[i][1], piezas[j][1]), `${f}: ${piezas[i][0]} pisa a ${piezas[j][0]}`);
  }
});

test('cuatro asientos iguales, en sentido de las manecillas del reloj: arriba izquierda, arriba derecha, abajo derecha, abajo izquierda', () => {
  for (const f of ['9x16', '16x9']) {
    const [a0, a1, a2, a3] = colocar(f).asientos.map((a) => a.caja);
    assert.equal(colocar(f).asientos.length, 4);
    for (const a of [a1, a2, a3]) assert.ok(a.ancho === a0.ancho && a.alto === a0.alto, `${f}: los asientos no miden lo mismo`);
    assert.ok(a0.x < a1.x && a0.y === a1.y, `${f}: el 1 va a la derecha del 0`);
    assert.ok(a2.x === a1.x && a2.y > a1.y, `${f}: el 2 va debajo del 1`);
    assert.ok(a3.x === a0.x && a3.y === a2.y, `${f}: el 3 va debajo del 0 y a la izquierda del 2`);
  }
});

test('en cada asiento la placa va arriba de las cartas y las cinco cartas caben en su area', () => {
  for (const f of ['9x16', '16x9']) {
    for (const a of colocar(f).asientos) {
      assert.ok(dentro(a.placa, a.caja) && dentro(a.cartas, a.caja), f);
      assert.ok(sinChoque(a.placa, a.cartas) && a.placa.y < a.cartas.y, `${f}: la placa pisa las cartas`);
      assert.ok(a.carta.alto <= a.cartas.alto && a.carta.ancho <= a.cartas.ancho, f);
      assert.equal(a.carta.ancho / a.carta.alto, 5 / 7, `${f}: proporcion de la carta`);
    }
  }
});

test('abanico: de 1 a 5 cartas quedan dentro del area, en orden, sin salirse aunque se encimen', () => {
  for (const f of ['9x16', '16x9']) {
    const { cartas, carta } = colocar(f).asientos[0];
    for (let n = 1; n <= 5; n++) {
      const rs = abanico(cartas, carta, n);
      assert.equal(rs.length, n, `${f}: n=${n}`);
      for (const r of rs) assert.ok(dentro(r, cartas), `${f}: con ${n} cartas una se sale: ${JSON.stringify(r)}`);
      for (let i = 1; i < n; i++) assert.ok(rs[i].x > rs[i - 1].x, `${f}: las cartas no van de izquierda a derecha`);
      const izq = rs[0].x - cartas.x;
      const der = cartas.x + cartas.ancho - (rs[n - 1].x + rs[n - 1].ancho);
      assert.ok(Math.abs(izq - der) <= 1, `${f}: con ${n} cartas el abanico no esta centrado (${izq} vs ${der})`);
    }
  }
});

test('abanico con entrada ilegible no lanza y no devuelve cartas', () => {
  const { cartas, carta } = colocar('9x16').asientos[0];
  for (const n of [0, -1, NaN, undefined, 'x', 2.5]) assert.deepEqual(abanico(cartas, carta, n), [], String(n));
});

test('un formato desconocido lanza un error claro que dice cuales existen', () => {
  assert.throws(() => colocar('1x1'), /formato.*1x1.*9x16.*16x9/i);
  assert.throws(() => colocar(undefined), /formato/i);
});
