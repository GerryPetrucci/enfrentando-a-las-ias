// Diseno de la pantalla de Triple dado: donde va cada cosa en 9:16 (cuatro filas) y en 16:9 (cuatro columnas). Lo que se lee cabe en la zona segura y nada se pisa.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colocarTripleDado } from '../../../web/casino/layout-tripledado.js';
import { ZONA_SEGURA } from '../../../herramientas/formatos.mjs';

const dentro = (a, b) => a.x >= b.x && a.y >= b.y && a.x + a.ancho <= b.x + b.ancho && a.y + a.alto <= b.y + b.alto;
const sinChoque = (a, b) => a.x + a.ancho <= b.x || b.x + b.ancho <= a.x || a.y + a.alto <= b.y || b.y + b.alto <= a.y;
const bandas = (L) => ({ etiqueta: L.etiqueta, cabecera: L.cabecera, banner: L.banner, subtitulos: L.subtitulos, ...Object.fromEntries(L.filas.map((f, s) => [`fila${s}`, f.fila])) });
const piezasDeFila = (f) => ({ placa: f.placa, tarjetas: f.tarjetas, bandeja: f.bandeja, dado0: f.dados[0], dado1: f.dados[1], dado2: f.dados[2], combinacion: f.combinacion, puntos: f.puntos, barra: f.barra });

test('en 9:16 todo lo que se lee cabe en la zona segura', () => {
  const L = colocarTripleDado('9x16');
  assert.deepEqual([L.ancho, L.alto], [1080, 1920]);
  assert.deepEqual(L.zona, ZONA_SEGURA);
  for (const [nombre, r] of Object.entries({ ...bandas(L), panel: L.panel })) assert.ok(dentro(r, ZONA_SEGURA), `${nombre} se sale de la zona segura: ${JSON.stringify(r)}`);
  for (const [s, f] of L.filas.entries()) for (const [nombre, r] of Object.entries(piezasDeFila(f))) assert.ok(dentro(r, ZONA_SEGURA), `fila ${s}: ${nombre} se sale de la zona segura`);
});

test('en 16:9 todo lo que se lee cabe en el lienzo, dentro del margen de seguridad', () => {
  const L = colocarTripleDado('16x9');
  assert.deepEqual([L.ancho, L.alto], [1920, 1080]);
  assert.ok(dentro(L.zona, { x: 0, y: 0, ancho: 1920, alto: 1080 }));
  for (const [nombre, r] of Object.entries({ ...bandas(L), panel: L.panel })) assert.ok(dentro(r, L.zona), `${nombre} se sale de la zona: ${JSON.stringify(r)}`);
  for (const [s, f] of L.filas.entries()) for (const [nombre, r] of Object.entries(piezasDeFila(f))) assert.ok(dentro(r, L.zona), `columna ${s}: ${nombre} se sale de la zona`);
});

test('cuatro jugadores caben: las filas (o columnas) son iguales, van en orden y no se pisan; las piezas de cada una caen dentro y no se pisan', () => {
  for (const f of ['9x16', '16x9']) {
    const L = colocarTripleDado(f);
    assert.equal(L.filas.length, 4, `${f}: cuatro jugadores`);
    const primero = L.filas[0].fila;
    for (const x of L.filas) assert.deepEqual([x.fila.ancho, x.fila.alto], [primero.ancho, primero.alto], `${f}: todas del mismo tamano`);
    const eje = f === '9x16' ? 'y' : 'x', largo = f === '9x16' ? 'alto' : 'ancho';
    for (let s = 1; s < 4; s++) {
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
    for (const nombre of ['etiqueta', 'cabecera', 'banner', 'subtitulos']) assert.ok(sinChoque(L.panel, L[nombre]), `${f}: el panel tapa ${nombre}`);
  }
});

test('los tres dados grandes son cuadrados del mismo lado, la bandeja cabe once dados chicos y las cuatro casillas de tarjetas caben', () => {
  for (const f of ['9x16', '16x9']) {
    const L = colocarTripleDado(f);
    assert.ok(L.dado.lado >= 80, `${f}: lado del dado grande`);
    for (const [s, x] of L.filas.entries()) {
      for (const d of x.dados) assert.deepEqual([d.ancho, d.alto], [L.dado.lado, L.dado.lado], `${f} ${s}: dado cuadrado`);
      const necesario = 11 * L.bandejaLado + 10 * 3; // once dados con 3 px entre ellos (el gap de .bandeja)
      assert.ok(x.bandeja.ancho >= necesario, `${f} ${s}: la bandeja mide ${x.bandeja.ancho} y los once dados piden ${necesario}`);
      assert.ok(x.bandeja.alto >= L.bandejaLado, `${f} ${s}: alto de la bandeja`);
      assert.ok(x.tarjetas.ancho >= 4 * 80, `${f} ${s}: cuatro casillas de tarjeta de 80 px`);
    }
  }
});

test('un formato desconocido da un error claro que dice cuales hay', () => {
  for (const raro of [undefined, null, 'cuadrado', 7, '', '__proto__']) assert.throws(() => colocarTripleDado(raro), /formato desconocido.*9x16 y 16x9/);
});
