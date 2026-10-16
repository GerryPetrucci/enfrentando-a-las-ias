// Piezas del kit de casino para los juegos de cartas con numero (Mayor o menor y El numero solitario): la carta numerica, la tira de numeros y la placa con un solo
// grupo de fichas. Pruebas estaticas (sin navegador).
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { htmlFrenteNumero, htmlCartaNumero, htmlTira, htmlPlaca } from '../../../web/casino/kit.js';

const css = () => readFileSync(new URL('../../../web/casino/mesa.css', import.meta.url), 'utf8');
const cuenta = (texto, sub) => texto.split(sub).length - 1;

test('el frente de una carta numerica lleva su numero grande y chico, y un numero ilegible da una cara en blanco', () => {
  const f = htmlFrenteNumero(7);
  assert.match(f, /class="cara"/);
  assert.equal(cuenta(f, '>7<'), 2, 'el numero va una vez en la esquina y una vez grande');
  assert.match(htmlFrenteNumero(0), /class="gran">0</, 'el cero es un numero valido');
  assert.match(htmlFrenteNumero(10), /class="gran">10</);
  for (const raro of [null, undefined, -1, 1.5, 'x', NaN, 100, {}]) {
    const c = htmlFrenteNumero(raro);
    assert.doesNotMatch(c, /gran|esq/, `numero ilegible ${String(raro)}`);
  }
});

test('una carta numerica oculta no lleva su numero ni en el DOM; una visible si; las dos llevan el dorso con el logo', () => {
  const oculta = htmlCartaNumero(null);
  assert.doesNotMatch(oculta, /data-numero|gran|esq/);
  assert.match(oculta, /class="dorso"/);
  assert.match(oculta, /class="carta num"/);
  const visible = htmlCartaNumero(5);
  assert.match(visible, /data-numero="5"/);
  assert.match(visible, /class="gran">5</);
  assert.match(visible, /class="dorso"/);
  assert.match(visible, /<use href="#logo"/);
  assert.doesNotMatch(htmlCartaNumero(), /data-numero/, 'sin argumento es una carta oculta');
});

test('la tira de numeros marca cuales siguen disponibles, cuales ya se usaron (tachados) y cual se juega ahora', () => {
  const t = htmlTira([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [3, 4, 6], 7);
  assert.match(t, /^<div class="tira-num">/);
  assert.equal((t.match(/<div class="t[ "]/g) ?? []).length, 11);
  assert.equal(cuenta(t, ' usada'), 3);
  assert.equal(cuenta(t, ' ahora'), 1);
  assert.match(t, /<div class="t usada">3<\/div>/);
  assert.match(t, /<div class="t ahora">7<\/div>/);
  assert.match(t, /<div class="t">0<\/div>/);
  assert.ok(t.indexOf('>0<') < t.indexOf('>5<') && t.indexOf('>5<') < t.indexOf('>10<'), 'en orden');
  assert.equal(htmlTira([1, 2], [], null), '<div class="tira-num"><div class="t">1</div><div class="t">2</div></div>');
  for (const basura of [null, undefined, 'x', 7]) assert.equal(htmlTira(basura), '<div class="tira-num"></div>');
  assert.doesNotMatch(htmlTira([1, 'x', 3, NaN, null]), />x<|>NaN<|>null</, 'solo entran numeros');
});

test('la placa con espacios null muestra un solo grupo de fichas; con numeros muestra los dos como siempre', () => {
  const j = { id: 'claude', nombre: 'Claude', inicial: 'C' };
  const una = htmlPlaca(j, 'Predictor', 23, null);
  assert.equal(cuenta(una, 'class="grupo"'), 1);
  assert.equal(cuenta(una, 'class="ficha juego"'), 8, 'la pila dibuja como mucho 8 fichas');
  assert.equal(cuenta(una, 'class="ficha espacio"'), 0);
  assert.match(una, /<span class="cuenta">23<\/span>/);
  const dos = htmlPlaca(j, 'x', 5, 2);
  assert.equal(cuenta(dos, 'class="grupo"'), 2);
  assert.equal(cuenta(dos, 'class="ficha espacio"'), 2);
});

test('mesa.css trae el aspecto de la carta numerica y de la tira (usadas tachadas, la de ahora en dorado)', () => {
  const c = css();
  assert.match(c, /\.carta\.num \.cara \.gran \{[^}]*font:800/);
  assert.match(c, /\.carta\.num \.cara \.esq \{[^}]*color:#101014/);
  assert.match(c, /\.tira-num \{[^}]*display:flex/);
  assert.match(c, /\.tira-num \.t\.usada \{[^}]*text-decoration:line-through/);
  assert.match(c, /\.tira-num \.t\.ahora \{[^}]*background:var\(--oro\)/);
});
