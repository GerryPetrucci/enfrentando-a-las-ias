// Piezas del kit de casino para los juegos de cartas con numero (Mayor o menor y El numero solitario): la carta numerica, la tira de numeros y la placa con un solo
// grupo de fichas. Pruebas estaticas (sin navegador).
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { htmlFrenteNumero, htmlCartaNumero, htmlTira, htmlPlaca, htmlInfoFila, estiloJugador, htmlDado, htmlBandeja, htmlInfoPuntos } from '../../../web/casino/kit.js';
import { PALETA } from '../../../web/paleta.js';

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

test('la informacion de una fila de El numero solitario lleva avatar, nombre y "N pts · M ●", con el color de paleta.js y todo escapado', () => {
  const claude = htmlInfoFila({ id: 'claude', nombre: 'Claude', inicial: 'C' }, 8, 1);
  assert.ok(claude.includes(`--c:${PALETA.claude.color}`) && claude.includes(`--t:${PALETA.claude.texto}`), 'el color sale de paleta.js');
  assert.match(claude, /class="nom">Claude</);
  assert.match(claude, /<b>8<\/b> pts · 1 /);
  const malo = htmlInfoFila({ id: 'x', nombre: '<img src=x onerror=alert(1)>', color: '#123456', inicial: '<' }, 3, 0);
  assert.doesNotMatch(malo, /<img/, 'el nombre se escapa');
  assert.match(malo, /--c:#123456/, 'un bot usa el color guardado');
  for (const raro of [NaN, -3, 1.5, 'x', null, undefined]) assert.match(htmlInfoFila({ nombre: 'A' }, raro, raro), /<b>0<\/b> pts · 0 /, `puntos ilegibles: ${String(raro)}`);
  for (const sinJugador of [null, undefined, {}]) assert.match(htmlInfoFila(sinJugador, 1, 1), /class="nom">Jugador</);
});

test('estiloJugador da las tres variables de color de un jugador (para la fila, que pone el borde con --c)', () => {
  const e = estiloJugador({ id: 'claude', nombre: 'Claude' });
  assert.ok(e.includes(`--c:${PALETA.claude.color}`) && e.includes('--t:') && e.includes('--fondo:'));
  assert.doesNotThrow(() => estiloJugador(null));
});

test('mesa.css trae el aspecto de la fila de El numero solitario: nombre con elipsis, fila atenuada si ya no juega, borde punteado si hubo jugada del juego', () => {
  const texto = css();
  assert.match(texto, /\.info-fila \.nom \{[^}]*text-overflow:ellipsis/, 'un nombre largo termina en elipsis');
  assert.match(texto, /\.info-fila \.nom \{[^}]*white-space:nowrap/);
  assert.match(texto, /\.fila-sol \{[^}]*border:3px solid var\(--c\)/);
  assert.match(texto, /\.fila-sol\.fuera \{[^}]*opacity/);
  assert.match(texto, /\.fila-sol\.reemplazo \{[^}]*dashed/);
  assert.match(texto, /\.fila-sol\.ganadora \{/);
  assert.match(texto, /\.panel-sol \{/);
});

test('el sello "Igual" de Mayor o menor es neutro (no dorado como "Acierta") y la pastilla de una carta de Solitario no tapa su numero de la esquina', () => {
  const texto = css();
  assert.match(texto, /\.sello\.neutro \{/);
  assert.match(readFileSync(new URL('../../../web/casino/mesa-mayormenor.js', import.meta.url), 'utf8'), /igual: \{ texto: 'Igual', clase: 'neutro' \}/);
  const pill = /\.pill-carta \{[^}]*\}/.exec(texto)[0];
  assert.match(pill, /bottom:-/);
  assert.doesNotMatch(pill, /top:-/);
});

test('un dado visto desde arriba muestra solo su cara: 1 a 6 puntos, y un dado cerrado no lleva su cara ni en un atributo', () => {
  for (let cara = 1; cara <= 6; cara++) {
    const d = htmlDado(cara);
    assert.equal(cuenta(d, 'class="p"'), cara, `la cara ${cara} lleva ${cara} puntos`);
    assert.doesNotMatch(d, /cerrado|data-cara/);
  }
  const cerrado = htmlDado(null, 'rojo');
  assert.match(cerrado, /class="dado rojo cerrado"/);
  assert.doesNotMatch(cerrado, /class="p"|data-|cara|\b[1-6]\b/, 'el dado cerrado no filtra su valor');
  for (const raro of [0, 7, 1.5, 'x', NaN, undefined, {}]) assert.match(htmlDado(raro), /cerrado/, `cara ilegible ${String(raro)}`);
});

test('el dado blanco, el rojo y el azul tienen su clase; un color desconocido cae en blanco; nada sin escapar', () => {
  assert.match(htmlDado(3), /class="dado blanco"/);
  assert.match(htmlDado(3, 'rojo'), /class="dado rojo"/);
  assert.match(htmlDado(3, 'azul'), /class="dado azul"/);
  assert.match(htmlDado(3, '"><img src=x onerror=1>'), /class="dado blanco"/);
});

test('la bandeja pone cada dado con su id, atenua los usados y nunca muestra la cara de uno cerrado', () => {
  const b = htmlBandeja([{ id: 'b1', cara: 4, color: 'blanco', usado: false }, { id: 'rojo', cara: null, color: 'rojo', usado: false }, { id: 'b2', cara: 6, color: 'blanco', usado: true }]);
  assert.equal(cuenta(b, 'class="dado '), 3);
  assert.equal(cuenta(b, 'usado'), 1);
  assert.match(b, /data-id="rojo"/);
  assert.match(b, /class="dado rojo cerrado"/);
  assert.equal(htmlBandeja(null), '<div class="bandeja"></div>');
  assert.doesNotMatch(htmlBandeja([{ id: '<x>', cara: 2, color: 'blanco' }]), /<x>/);
});

test('mesa.css trae el aspecto del dado (blanco, rojo, azul, cerrado), la bandeja y los dados usados', () => {
  const texto = css();
  for (const sel of ['\\.dado \\{', '\\.dado\\.rojo \\{', '\\.dado\\.azul \\{', '\\.dado\\.cerrado \\{', '\\.bandeja \\{', '\\.usado \\{']) assert.match(texto, new RegExp(sel), sel);
});

test('la placa de Triple dado lleva avatar, nombre y "N pts" con el color de paleta.js y todo escapado', () => {
  const claude = htmlInfoPuntos({ id: 'claude', nombre: 'Claude', inicial: 'C' }, '28.5');
  assert.ok(claude.includes(`--c:${PALETA.claude.color}`));
  assert.match(claude, /class="nom">Claude</);
  assert.match(claude, /<b>28\.5<\/b> pts/);
  assert.doesNotMatch(htmlInfoPuntos({ nombre: '<img src=x onerror=1>' }, '<b>'), /<img|<b><b>/);
  for (const sinJugador of [null, undefined, {}]) assert.match(htmlInfoPuntos(sinJugador, '0'), /class="nom">Jugador</);
});

test('mesa.css apaga bajo un panel (corte, cierre o final) tambien las tarjetas, los dados, las etiquetas y las barras de Triple dado', () => {
  const texto = css();
  const regla = /\.con-panel [^{]*\{[^}]*opacity:\.15/.exec(texto)?.[0] ?? '';
  for (const sel of ['.tarjetas-td', '.ranura-dado', '.bandeja-td', '.etq-comb', '.pts-comb', '.barra-ronda']) assert.ok(regla.includes(sel), `.con-panel no apaga ${sel}`);
});
