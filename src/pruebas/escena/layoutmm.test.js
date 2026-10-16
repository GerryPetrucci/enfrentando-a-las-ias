// Diseno de la pantalla de Mayor o menor: donde va cada cosa en 9:16 y en 16:9. Lo que se lee cabe en la zona segura y nada se pisa.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { colocarMayorMenor } from '../../../web/casino/layout-mayormenor.js';
import { ZONA_SEGURA } from '../../../herramientas/formatos.mjs';

const dentro = (a, b) => a.x >= b.x && a.y >= b.y && a.x + a.ancho <= b.x + b.ancho && a.y + a.alto <= b.y + b.alto;
const sinChoque = (a, b) => a.x + a.ancho <= b.x || b.x + b.ancho <= a.x || a.y + a.alto <= b.y || b.y + b.alto <= a.y;
// Todo lo que se lee, con nombre. El escenario es el contenedor de las piezas del centro: esas van aparte y dentro de el.
const piezas = (L) => ({
  etiqueta: L.etiqueta, cabecera: L.cabecera, subtitulos: L.subtitulos,
  placa0: L.asientos[0].placa, tira0: L.asientos[0].tira, placa1: L.asientos[1].placa, tira1: L.asientos[1].tira,
  ...L.centro,
});
const CENTRO = ['rotuloCrupier', 'rotuloJugada', 'cartaCrupier', 'indicador', 'cartaJugada', 'pastilla', 'apuesta', 'sello', 'banca', 'mazo'];

test('en 9:16 todo lo que se lee cabe en la zona segura', () => {
  const L = colocarMayorMenor('9x16');
  assert.deepEqual([L.ancho, L.alto], [1080, 1920]);
  assert.deepEqual(L.zona, ZONA_SEGURA);
  for (const [nombre, r] of Object.entries(piezas(L))) assert.ok(dentro(r, ZONA_SEGURA), `${nombre} se sale de la zona segura: ${JSON.stringify(r)}`);
  assert.ok(dentro(L.escenario, ZONA_SEGURA));
});

test('en 16:9 todo lo que se lee cabe en el lienzo, dentro del margen de seguridad', () => {
  const L = colocarMayorMenor('16x9');
  assert.deepEqual([L.ancho, L.alto], [1920, 1080]);
  assert.ok(dentro(L.zona, { x: 0, y: 0, ancho: 1920, alto: 1080 }));
  for (const [nombre, r] of Object.entries(piezas(L))) assert.ok(dentro(r, L.zona), `${nombre} se sale de la zona: ${JSON.stringify(r)}`);
});

test('las piezas no se pisan entre si, en ningun formato, y las del centro caen dentro del escenario', () => {
  for (const f of ['9x16', '16x9']) {
    const L = colocarMayorMenor(f);
    assert.deepEqual(Object.keys(L.centro).sort(), [...CENTRO].sort(), 'las piezas del centro');
    for (const [nombre, r] of Object.entries(L.centro)) assert.ok(dentro(r, L.escenario), `${f}: ${nombre} se sale del escenario`);
    const lista = Object.entries(piezas(L));
    for (let i = 0; i < lista.length; i++) for (let j = i + 1; j < lista.length; j++) assert.ok(sinChoque(lista[i][1], lista[j][1]), `${f}: ${lista[i][0]} pisa a ${lista[j][0]}`);
    assert.ok(sinChoque(L.escenario, L.asientos[0].tira) && sinChoque(L.escenario, L.asientos[1].tira) && sinChoque(L.escenario, L.subtitulos), `${f}: el escenario no pisa asientos ni subtitulos`);
  }
});

test('la tira cabe los once numeros (0 a 10) en la forma que dice el diseno, y la carta del escenario mide 5:7', () => {
  for (const [f, filas] of [['9x16', 1], ['16x9', 2]]) {
    const L = colocarMayorMenor(f);
    for (const a of L.asientos) {
      const { columnas, filas: nf, ancho, alto } = a.tiraForma;
      assert.equal(nf, filas, f);
      assert.ok(columnas * nf >= 11, `${f}: ${columnas} x ${nf} no alcanza para 11 numeros`);
      assert.ok(columnas * ancho + (columnas - 1) * 6 <= a.tira.ancho, `${f}: una fila de ${columnas} fichas no cabe en ${a.tira.ancho} px`);
      assert.ok(nf * alto + (nf - 1) * 6 <= a.tira.alto, `${f}: ${nf} filas no caben en ${a.tira.alto} px`);
    }
    assert.equal(L.carta.ancho / L.carta.alto, 5 / 7, `${f}: proporcion de la carta`);
    assert.deepEqual([L.centro.cartaCrupier.ancho, L.centro.cartaCrupier.alto], [L.carta.ancho, L.carta.alto]);
    assert.deepEqual([L.centro.cartaJugada.ancho, L.centro.cartaJugada.alto], [L.carta.ancho, L.carta.alto]);
  }
});

test('el jugador 0 va arriba y el 1 abajo en 9:16; el 0 a la izquierda y el 1 a la derecha en 16:9, con el mismo tamano', () => {
  const v = colocarMayorMenor('9x16');
  assert.ok(v.asientos[0].placa.y < v.escenario.y && v.asientos[1].placa.y > v.escenario.y + v.escenario.alto);
  assert.ok(v.asientos[0].tira.y > v.asientos[0].placa.y && v.asientos[1].tira.y < v.asientos[1].placa.y, 'cada tira queda del lado del escenario');
  const h = colocarMayorMenor('16x9');
  assert.ok(h.asientos[0].placa.x + h.asientos[0].placa.ancho <= h.escenario.x && h.asientos[1].placa.x >= h.escenario.x + h.escenario.ancho);
  for (const L of [v, h]) assert.deepEqual([L.asientos[0].placa.ancho, L.asientos[0].placa.alto], [L.asientos[1].placa.ancho, L.asientos[1].placa.alto]);
});

test('un formato desconocido lanza un error claro que dice cuales existen', () => {
  assert.throws(() => colocarMayorMenor('1x1'), /formato.*1x1.*9x16.*16x9/i);
  assert.throws(() => colocarMayorMenor(undefined), /formato/i);
});

test('el CSS de la tira no redeclara el tamano de sus numeros: lo manda el diseno (estilo en linea de la mesa), si no el 16:9 sale con otra forma', () => {
  const css = readFileSync(new URL('../../../web/casino/mesa.css', import.meta.url), 'utf8').split('\r\n').join('\n');
  const reglas = [...css.matchAll(/(^|\n)([^{}\n]*\.tira-num[^{}\n]*)\{([^}]*)\}/g)];
  assert.ok(reglas.length >= 2, 'encontre las reglas de la tira');
  for (const [, , selector, cuerpo] of reglas) assert.ok(!/--t[wh]\s*:/.test(cuerpo), `la regla "${selector.trim()}" declara --tw/--th y le gana al diseno`);
  assert.ok(/var\(--tw,\s*\d+px\)/.test(css) && /var\(--th,\s*\d+px\)/.test(css), 'sin diseno, la tira tiene medidas por defecto');
});
