// Diseno de la pantalla de Subasta de tiempo: donde va cada cosa en 9:16 (consola arriba y cinco filas) y en 16:9 (consola a la izquierda y cinco filas a la derecha). Lo que se lee
// cabe en la zona segura y nada se pisa.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colocarSubasta } from '../../../web/casino/layout-subasta.js';
import { ZONA_SEGURA } from '../../../herramientas/formatos.mjs';

const dentro = (a, b) => a.x >= b.x && a.y >= b.y && a.x + a.ancho <= b.x + b.ancho && a.y + a.alto <= b.y + b.alto;
const sinChoque = (a, b) => a.x + a.ancho <= b.x || b.x + b.ancho <= a.x || a.y + a.alto <= b.y || b.y + b.alto <= a.y;
const bandas = (L) => ({ etiqueta: L.etiqueta, cabecera: L.cabecera, consola: L.consola.marco, tira: L.tira, subtitulos: L.subtitulos, ...Object.fromEntries(L.filas.map((f, s) => [`fila${s}`, f.fila])) });
const piezasDeFila = (f) => ({ avatar: f.avatar, nombre: f.nombre, estado: f.estado, boton: f.boton, banco: f.banco, barra: f.barra, fichas: f.fichas });
const piezasDeConsola = (c) => ({ contador: c.contador, luz: c.luz, rotulo: c.rotulo });

test('en 9:16 todo lo que se lee cabe en la zona segura', () => {
  const L = colocarSubasta('9x16');
  assert.deepEqual([L.ancho, L.alto], [1080, 1920]);
  assert.deepEqual(L.zona, ZONA_SEGURA);
  for (const [nombre, r] of Object.entries({ ...bandas(L), panel: L.panel })) assert.ok(dentro(r, ZONA_SEGURA), `${nombre} se sale de la zona segura: ${JSON.stringify(r)}`);
  for (const [s, f] of L.filas.entries()) for (const [nombre, r] of Object.entries(piezasDeFila(f))) assert.ok(dentro(r, ZONA_SEGURA), `fila ${s}: ${nombre} se sale de la zona segura`);
});

test('en 16:9 todo lo que se lee cabe en el lienzo, dentro del margen de seguridad', () => {
  const L = colocarSubasta('16x9');
  assert.deepEqual([L.ancho, L.alto], [1920, 1080]);
  assert.ok(dentro(L.zona, { x: 0, y: 0, ancho: 1920, alto: 1080 }));
  for (const [nombre, r] of Object.entries({ ...bandas(L), panel: L.panel })) assert.ok(dentro(r, L.zona), `${nombre} se sale de la zona: ${JSON.stringify(r)}`);
  for (const [s, f] of L.filas.entries()) for (const [nombre, r] of Object.entries(piezasDeFila(f))) assert.ok(dentro(r, L.zona), `fila ${s}: ${nombre} se sale de la zona`);
});

test('cinco jugadores caben: las filas son iguales, van de arriba a abajo y no se pisan; las piezas de cada fila y de la consola caen dentro y no se pisan', () => {
  for (const f of ['9x16', '16x9']) {
    const L = colocarSubasta(f);
    assert.equal(L.filas.length, 5, `${f}: cinco jugadores`);
    const primero = L.filas[0].fila;
    for (const x of L.filas) assert.deepEqual([x.fila.ancho, x.fila.alto], [primero.ancho, primero.alto], `${f}: todas del mismo tamano`);
    for (let s = 1; s < 5; s++) {
      const hueco = L.filas[s].fila.y - (L.filas[s - 1].fila.y + L.filas[s - 1].fila.alto);
      assert.ok(hueco >= 4, `${f}: la fila ${s} queda a ${hueco} px de la anterior`);
    }
    const lista = Object.entries(bandas(L));
    for (let i = 0; i < lista.length; i++) for (let j = i + 1; j < lista.length; j++) assert.ok(sinChoque(lista[i][1], lista[j][1]), `${f}: ${lista[i][0]} pisa a ${lista[j][0]}`);
    for (const [s, x] of L.filas.entries()) {
      const piezas = Object.entries(piezasDeFila(x));
      for (const [nombre, r] of piezas) assert.ok(dentro(r, x.fila), `${f} fila ${s}: ${nombre} se sale de su fila`);
      for (let i = 0; i < piezas.length; i++) for (let j = i + 1; j < piezas.length; j++) assert.ok(sinChoque(piezas[i][1], piezas[j][1]), `${f} fila ${s}: ${piezas[i][0]} pisa a ${piezas[j][0]}`);
    }
    const piezas = Object.entries(piezasDeConsola(L.consola));
    for (const [nombre, r] of piezas) assert.ok(dentro(r, L.consola.marco), `${f}: ${nombre} se sale de la consola`);
    for (let i = 0; i < piezas.length; i++) for (let j = i + 1; j < piezas.length; j++) assert.ok(sinChoque(piezas[i][1], piezas[j][1]), `${f}: ${piezas[i][0]} pisa a ${piezas[j][0]}`);
    for (const nombre of ['etiqueta', 'cabecera', 'subtitulos']) assert.ok(sinChoque(L.panel, L[nombre]), `${f}: el panel tapa ${nombre}`);
  }
});

test('el contador cabe "600.0" (cinco caracteres), la tira cabe las 19 casillas de las subastas y los botones son circulos', () => {
  for (const f of ['9x16', '16x9']) {
    const L = colocarSubasta(f);
    assert.ok(L.consola.contador.ancho >= 3.5 * L.consola.contador.alto, `${f}: el contador mide ${L.consola.contador.ancho} x ${L.consola.contador.alto}`);
    assert.ok(L.consola.contador.alto >= 100, `${f}: alto del contador`);
    assert.ok(L.tira.ancho >= 19 * L.casillaTira.lado + 18 * L.casillaTira.hueco, `${f}: la tira mide ${L.tira.ancho} y 19 casillas piden ${19 * L.casillaTira.lado + 18 * L.casillaTira.hueco}`);
    assert.ok(L.tira.alto >= L.casillaTira.lado);
    for (const x of L.filas) assert.equal(x.boton.ancho, x.boton.alto, `${f}: el boton es cuadrado (circulo)`);
  }
});

test('un formato desconocido da un error claro que dice cuales hay', () => {
  for (const raro of [undefined, null, 'cuadrado', 7, '', '__proto__']) assert.throws(() => colocarSubasta(raro), /formato desconocido.*9x16 y 16x9/);
});
