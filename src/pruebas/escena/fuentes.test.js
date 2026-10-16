// Las fuentes de la marca (Barlow Condensed e Inter, licencia OFL) viajan con el repo: la escena se ve igual en cualquier equipo y en el sitio publicado,
// sin depender de que esten instaladas ni de descargar nada de internet.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';

const ruta = (r) => new URL(`../../../web/${r}`, import.meta.url);
const leer = (r) => readFileSync(ruta(r), 'utf8');
const ARCHIVOS = ['barlow-condensed-600.woff2', 'barlow-condensed-700.woff2', 'barlow-condensed-800.woff2', 'inter-variable.woff2'];

test('los archivos de fuente existen, son WOFF2 de verdad y pesan poco', () => {
  for (const a of ARCHIVOS) {
    assert.ok(existsSync(ruta(`fonts/${a}`)), `falta web/fonts/${a}`);
    const bytes = readFileSync(ruta(`fonts/${a}`));
    assert.equal(bytes.subarray(0, 4).toString('latin1'), 'wOF2', `${a} no es un WOFF2`);
    assert.ok(statSync(ruta(`fonts/${a}`)).size < 60 * 1024, `${a} pesa ${statSync(ruta(`fonts/${a}`)).size} bytes`);
  }
});

test('las dos licencias OFL y el LEEME acompanan a las fuentes', () => {
  for (const [archivo, autor] of [['OFL-barlow-condensed.txt', 'Barlow Project'], ['OFL-inter.txt', 'Inter Project']]) {
    assert.ok(existsSync(ruta(`fonts/${archivo}`)), `falta ${archivo}`);
    const t = leer(`fonts/${archivo}`);
    assert.match(t, /SIL Open Font License, Version 1\.1/);
    assert.ok(t.includes(autor), `${archivo} no nombra a ${autor}`);
  }
  const leeme = leer('fonts/LEEME.md');
  for (const palabra of [/OFL/, /Google Fonts/, /Barlow Condensed/, /Inter/, /instal/i]) assert.match(leeme, palabra);
});

test('mesa.css declara cada fuente con sus pesos y apunta a archivos que existen; la pila de fuentes las usa primero', () => {
  const css = leer('casino/mesa.css');
  const bloques = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];
  assert.equal(bloques.length, 4, 'cuatro @font-face: Barlow Condensed 600, 700 y 800 e Inter variable');
  const usados = new Set();
  for (const b of bloques) {
    const url = /url\('\.\.\/fonts\/([a-z0-9-]+\.woff2)'\)\s*format\('woff2'\)/.exec(b);
    assert.ok(url, `un @font-face no apunta a ../fonts/*.woff2: ${b}`);
    assert.ok(existsSync(ruta(`fonts/${url[1]}`)), `${url[1]} no existe`);
    usados.add(url[1]);
  }
  assert.deepEqual([...usados].sort(), [...ARCHIVOS].sort());
  for (const peso of ['600', '700', '800']) assert.match(css, new RegExp(`font-family:\\s*'Barlow Condensed';[^}]*font-weight:\\s*${peso}`), `Barlow Condensed ${peso}`);
  assert.match(css, /font-family:\s*'Inter';[^}]*font-weight:\s*100 900/, 'Inter variable cubre todos los pesos');
  assert.match(css, /--titulos:\s*'Barlow Condensed'/);
  assert.match(css, /--texto:\s*'Inter'/);
});

test('la escena espera a que carguen las fuentes antes de medir los textos', () => {
  assert.match(leer('casino/escena-duda.js'), /document\.fonts\.load\(/);
});
