// Kit visual de la escena de Duda y apuesta: cartas, fichas y placas como texto HTML/SVG, y la hoja de estilos de la mesa.
// Pruebas estaticas (sin navegador): lo que se juzga mirando se verifica en la tarea 7 con capturas.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PALETA } from '../../../web/paleta.js';
import { LOGO, CARTAS, esc, htmlDefs, htmlDorso, htmlFrente, htmlCarta, htmlFicha, htmlPila, htmlPlaca, htmlLogo } from '../../../web/casino/kit.js';
import { COLORES } from '../../juegos/dudaapuesta/constantes.js';

const leer = (ruta) => readFileSync(new URL(`../../../web/casino/${ruta}`, import.meta.url), 'utf8');
const hexes = (texto) => new Set((texto.match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((h) => h.toLowerCase()));

test('el logo conserva sus tres colores de marca y el dorso lo usa sobre fondo Noche, sin recolorear', () => {
  assert.deepEqual(LOGO, { verde: '#5fa877', rojo: '#d8584e', oro: '#e0b25c', noche: '#101014' });
  const defs = htmlDefs();
  for (const c of [LOGO.verde, LOGO.rojo, LOGO.oro]) assert.ok(defs.includes(`fill="${c}"`), `falta ${c} en el logo`);
  const dorso = htmlDorso();
  assert.match(dorso, /<use href="#logo"/);
  assert.ok(dorso.includes('url(#rombos)') && defs.includes('id="rombos"') && defs.includes(`fill="${LOGO.noche}"`), 'la trama del dorso es Noche');
  assert.doesNotMatch(dorso, /filter|hue-rotate/, 'el logo no se recolorea');
  assert.match(htmlLogo('logo'), /<use href="#logo"/);
});

test('hay una carta para cada color del juego, cada una con forma y letra propias (se leen sin depender del color)', () => {
  assert.deepEqual(Object.keys(CARTAS).sort(), [...COLORES, 'arcoiris'].sort());
  const letras = Object.values(CARTAS).map((c) => c.letra);
  const formas = Object.values(CARTAS).map((c) => c.forma);
  const dibujos = Object.values(CARTAS).map((c) => c.gema);
  for (const lista of [letras, formas, dibujos]) assert.equal(new Set(lista).size, 6, `se repite algo en ${lista}`);
  for (const [color, c] of Object.entries(CARTAS)) {
    const frente = htmlFrente(color);
    assert.ok(frente.includes(`>${c.letra}<svg`), `${color}: lleva su letra en la esquina`);
    assert.ok(frente.includes(c.nombre), `${color}: lleva su nombre`);
    assert.equal(frente.split(c.gema).length - 1, 3, `${color}: la forma va en las dos esquinas y en el centro`);
  }
  assert.match(CARTAS.arcoiris.gema, /url\(#arcoiris\)/);
});

test('un color desconocido no lanza: cara en blanco', () => {
  for (const x of ['', 'negro', null, undefined, 7]) assert.doesNotThrow(() => htmlFrente(x));
  assert.doesNotMatch(htmlFrente('negro'), /gema/);
});

test('una carta que el publico no debe ver todavia NO lleva su frente ni en el HTML; una visible si', () => {
  const oculta = htmlCarta(null);
  assert.doesNotMatch(oculta, /data-color|gema|esq|nombre/, 'no se filtra el color en el DOM');
  assert.match(oculta, /class="dorso"/);
  const visible = htmlCarta('rojo');
  assert.match(visible, /data-color="rojo"/);
  assert.ok(visible.includes(CARTAS.rojo.gema));
  assert.match(visible, /class="dorso"/, 'tambien lleva el dorso: se reparte boca abajo y se voltea');
});

test('las fichas y sus pilas: dos tipos, y la pila nunca pasa de su maximo ni lanza con entrada ilegible', () => {
  assert.match(htmlFicha('juego'), /ficha juego/);
  assert.match(htmlFicha('espacio'), /ficha espacio/);
  assert.match(htmlFicha('raro'), /ficha juego/);
  const cuenta = (h) => h.split('class="ficha ').length - 1;
  assert.equal(cuenta(htmlPila(3, 'juego')), 3);
  assert.equal(cuenta(htmlPila(0, 'juego')), 0);
  assert.equal(cuenta(htmlPila(40, 'espacio')), 8);
  assert.equal(cuenta(htmlPila(40, 'espacio', 5)), 5);
  for (const n of [-1, NaN, undefined, 'x', 2.5]) assert.equal(cuenta(htmlPila(n, 'juego')), 0, String(n));
});

test('la placa toma el color de la IA de paleta.js por su id; los bots usan el color guardado; nada de logos', () => {
  const claude = htmlPlaca({ id: 'claude', nombre: 'Claude', inicial: 'C', color: '#000000' }, 'Jugador 1', 3, 4);
  assert.ok(claude.includes(`--c:${PALETA.claude.color}`) && claude.includes(`--t:${PALETA.claude.texto}`), 'el color sale de paleta.js, no del resultado');
  assert.ok(claude.includes('>Claude<') && claude.includes('>C<'));
  const gemini = htmlPlaca({ id: 'gemini', nombre: 'Gemini', inicial: 'G' }, '', 1, 1);
  assert.match(gemini, /--fondo:linear-gradient/, 'Gemini es multicolor: franjas');
  const bot = htmlPlaca({ id: 'calculador', nombre: 'Calculador', inicial: 'C', color: '#B8A86F' }, '', 3, 4);
  assert.ok(bot.includes('--c:#B8A86F'), 'un bot usa el color que trae su resultado');
  assert.doesNotMatch(claude + gemini + bot, /<img|logo/i);
});

test('la placa muestra las fichas de juego y de espacio con su cuenta, y marca la jugada de reemplazo', () => {
  const p = htmlPlaca({ id: 'claude', nombre: 'Claude', inicial: 'C' }, 'x', 5, 2, true);
  assert.match(p, /class="placa reemplazo"/);
  assert.equal(p.split('class="ficha juego"').length - 1, 5);
  assert.equal(p.split('class="ficha espacio"').length - 1, 2);
  assert.match(p, /<span class="cuenta">5<\/span>/);
  assert.match(p, /<span class="cuenta">2<\/span>/);
  assert.doesNotMatch(htmlPlaca({ id: 'claude', nombre: 'Claude' }, '', 1, 1), /reemplazo/);
});

test('lo que viene de los datos se escapa: un nombre de modelo malicioso no mete HTML', () => {
  assert.equal(esc('<img src=x onerror="a()"> & \'hola\''), '&lt;img src=x onerror=&quot;a()&quot;&gt; &amp; &#39;hola&#39;');
  assert.equal(esc(null), '');
  const p = htmlPlaca({ id: 'x', nombre: '<script>alert(1)</script>', inicial: '<', color: '"><b>' }, '<i>rol</i>', 1, 1);
  assert.doesNotMatch(p, /<script|<i>|<b>/);
  assert.match(p, /&lt;script&gt;/);
});

test('mesa.css: el texto largo no se sale (nombres con elipsis, subtitulos con tope), el fieltro es muy oscuro y ningun color de IA vive aqui', () => {
  const css = leer('mesa.css');
  assert.match(css, /\.placa \.nom \{[^}]*white-space:nowrap[^}]*text-overflow:ellipsis/, 'nombre largo: elipsis');
  assert.match(css, /\.subtitulos \{[^}]*overflow:hidden/, 'subtitulo largo: no se sale de su caja');
  assert.match(css, /\.anuncio \.quien \{[^}]*text-overflow:ellipsis/);
  // el fieltro: luminosidad baja, para no confundirse con el verde de "cooperar" ni con el color de ninguna IA
  for (const h of ['#127450', '#0a3d2b', '#052418']) assert.ok(hexes(css).has(h), h);
  const luz = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  assert.ok(luz('#127450') < 100, 'el fieltro claro sigue siendo oscuro');
  // ningun color de IA fuera de paleta.js
  const deIA = new Set(Object.values(PALETA).flatMap((p) => [p.color, p.texto, ...(p.multi ?? [])]).map((h) => h.toLowerCase()));
  for (const [archivo, texto] of [['mesa.css', css], ['kit.js', leer('kit.js')]]) {
    for (const h of hexes(texto)) assert.ok(!deIA.has(h), `${archivo} define el color de una IA (${h}): pidelo a paleta.js`);
  }
  assert.match(leer('kit.js'), /from '\.\.\/paleta\.js'/, 'el kit pide los colores a paleta.js');
});

test('mesa.css y kit.js no usan nada externo: ni fuentes descargadas ni imagenes remotas (la grabacion puede hacerse sin red)', () => {
  for (const texto of [leer('mesa.css'), leer('kit.js')]) {
    assert.doesNotMatch(texto, /@import|https?:\/\/(?!www\.w3\.org)|<link /i);
  }
});
