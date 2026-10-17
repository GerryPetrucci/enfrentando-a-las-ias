// Diseno de la pantalla de El numero solitario: donde va cada cosa en 9:16 (cinco filas) y en 16:9 (cinco columnas). Lo que se lee cabe en la zona segura y nada se pisa.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colocarSolitario } from '../../../web/casino/layout-solitario.js';
import { ZONA_SEGURA } from '../../../herramientas/formatos.mjs';

const dentro = (a, b) => a.x >= b.x && a.y >= b.y && a.x + a.ancho <= b.x + b.ancho && a.y + a.alto <= b.y + b.alto;
const sinChoque = (a, b) => a.x + a.ancho <= b.x || b.x + b.ancho <= a.x || a.y + a.alto <= b.y || b.y + b.alto <= a.y;
// Lo que se lee y no se superpone a nada: el panel del corte y del final se dibuja ENCIMA de las filas a proposito, asi que va aparte.
const bandas = (L) => ({ etiqueta: L.etiqueta, cabecera: L.cabecera, banner: L.banner, subtitulos: L.subtitulos, ...Object.fromEntries(L.filas.map((f, s) => [`fila${s}`, f.fila])) });
const piezasDeFila = (f) => ({ placa: f.placa, carta0: f.cartas[0], carta1: f.cartas[1], estado: f.estado });

test('en 9:16 todo lo que se lee cabe en la zona segura', () => {
  const L = colocarSolitario('9x16');
  assert.deepEqual([L.ancho, L.alto], [1080, 1920]);
  assert.deepEqual(L.zona, ZONA_SEGURA);
  for (const [nombre, r] of Object.entries({ ...bandas(L), panel: L.panel })) assert.ok(dentro(r, ZONA_SEGURA), `${nombre} se sale de la zona segura: ${JSON.stringify(r)}`);
  for (const [s, f] of L.filas.entries()) for (const [nombre, r] of Object.entries(piezasDeFila(f))) assert.ok(dentro(r, ZONA_SEGURA), `fila ${s}: ${nombre} se sale de la zona segura`);
});

test('en 16:9 todo lo que se lee cabe en el lienzo, dentro del margen de seguridad', () => {
  const L = colocarSolitario('16x9');
  assert.deepEqual([L.ancho, L.alto], [1920, 1080]);
  assert.ok(dentro(L.zona, { x: 0, y: 0, ancho: 1920, alto: 1080 }));
  for (const [nombre, r] of Object.entries({ ...bandas(L), panel: L.panel })) assert.ok(dentro(r, L.zona), `${nombre} se sale de la zona: ${JSON.stringify(r)}`);
  for (const [s, f] of L.filas.entries()) for (const [nombre, r] of Object.entries(piezasDeFila(f))) assert.ok(dentro(r, L.zona), `columna ${s}: ${nombre} se sale de la zona`);
});

test('cinco jugadores caben: las filas (o columnas) son iguales, van en orden y no se pisan; las piezas de cada una caen dentro y no se pisan', () => {
  for (const f of ['9x16', '16x9']) {
    const L = colocarSolitario(f);
    assert.equal(L.filas.length, 5, `${f}: cinco jugadores`);
    const primero = L.filas[0].fila;
    for (const x of L.filas) assert.deepEqual([x.fila.ancho, x.fila.alto], [primero.ancho, primero.alto], `${f}: todas del mismo tamano`);
    const eje = f === '9x16' ? 'y' : 'x', largo = f === '9x16' ? 'alto' : 'ancho';
    for (let s = 1; s < 5; s++) {
      const hueco = L.filas[s].fila[eje] - (L.filas[s - 1].fila[eje] + L.filas[s - 1].fila[largo]);
      assert.ok(hueco >= 4, `${f}: la fila ${s} queda a ${hueco} px de la anterior`);
    }
    const lista = Object.entries(bandas(L));
    for (let i = 0; i < lista.length; i++) for (let j = i + 1; j < lista.length; j++) assert.ok(sinChoque(lista[i][1], lista[j][1]), `${f}: ${lista[i][0]} pisa a ${lista[j][0]}`);
    for (const [s, x] of L.filas.entries()) {
      const piezas = Object.entries(piezasDeFila(x));
      for (const [nombre, r] of piezas) assert.ok(dentro(r, x.fila), `${f} ${s}: ${nombre} se sale de su fila`);
      for (let i = 0; i < piezas.length; i++) for (let j = i + 1; j < piezas.length; j++) assert.ok(sinChoque(piezas[i][1], piezas[j][1]), `${f} ${s}: ${piezas[i][0]} pisa a ${piezas[j][0]}`);
    }
    // el panel del corte y del final no tapa lo fijo: el titulo, el banner ni los subtitulos
    for (const nombre of ['etiqueta', 'cabecera', 'banner', 'subtitulos']) assert.ok(sinChoque(L.panel, L[nombre]), `${f}: el panel tapa ${nombre}`);
  }
});

test('las dos cartas de cada jugador caben una junto a la otra, miden 5:7, son iguales en todas las filas y estan separadas', () => {
  for (const f of ['9x16', '16x9']) {
    const L = colocarSolitario(f);
    assert.equal(L.carta.ancho / L.carta.alto, 5 / 7, `${f}: proporcion de la carta`);
    for (const [s, x] of L.filas.entries()) {
      const [a, b] = x.cartas;
      for (const c of x.cartas) assert.deepEqual([c.ancho, c.alto], [L.carta.ancho, L.carta.alto], `${f} ${s}`);
      assert.ok(b.x - (a.x + a.ancho) >= 6, `${f} ${s}: las cartas se tocan`);
      assert.equal(a.y, b.y, `${f} ${s}: a la misma altura`);
    }
  }
});

// Solo mide el rectangulo de la placa. Que un nombre largo ("Gemini Flash-Lite") se achique hasta caber se decide al medir el texto en el navegador (mesa-solitario.js, pintarFila):
// eso no se puede probar en Node y lo cubren las capturas de herramientas/capturar-escena.mjs.
test('la placa de cada jugador mide al menos 300 px en los dos formatos (el sitio para nombre y puntos)', () => {
  assert.ok(colocarSolitario('9x16').filas[0].placa.ancho >= 300);
  assert.ok(colocarSolitario('16x9').filas[0].placa.ancho >= 300);
});

test('un formato desconocido da un error claro que dice cuales hay', () => {
  for (const raro of [undefined, null, 'cuadrado', 7, '', '__proto__']) assert.throws(() => colocarSolitario(raro), /formato desconocido.*9x16 y 16x9/);
});
