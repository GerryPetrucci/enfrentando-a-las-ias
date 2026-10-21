// En los formatos verticales el cuadro de subtitulos no se queda tapando la escena: aparece con cada beat que dice algo, se queda lo que dura la voz (o lo que tarda en leerse) y se apaga,
// igual que el feed de Guerra de territorios. En 16:9 sigue fijo. Decidido el 20 de octubre de 2026. Un DOM falso minimo, sin navegador.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SUBTITULO, msVisibleDeSubtitulo } from '../../../web/casino/subtitulos-vertical.js';
import { MesaBase } from '../../../web/casino/mesa-base.js';

test('msVisibleDeSubtitulo: lo que se tarda en leer, con un minimo, y nunca mas de lo que dura el beat menos el fundido de salida', () => {
  const corto = msVisibleDeSubtitulo('Ana toma R07.', 20000);
  assert.equal(corto, SUBTITULO.MIN_MS, 'un texto corto se queda el minimo');
  const largo = msVisibleDeSubtitulo('x'.repeat(200), 60000);
  assert.equal(largo, SUBTITULO.BASE_MS + 200 * SUBTITULO.MS_POR_CARACTER, 'uno largo, lo que se tarda en decirlo');
  assert.ok(largo > corto);
  assert.equal(msVisibleDeSubtitulo('x'.repeat(200), 5000), 5000 - SUBTITULO.FUNDIDO_MS, 'no pasa del final del beat (menos el fundido)');
  assert.equal(msVisibleDeSubtitulo('hola', 1000), 1000 - SUBTITULO.FUNDIDO_MS);
});

test('msVisibleDeSubtitulo con datos raros no lanza ni da tiempos negativos', () => {
  for (const texto of [null, undefined, 7, {}, '']) assert.equal(msVisibleDeSubtitulo(texto, 9000), SUBTITULO.MIN_MS);
  for (const ms of [null, undefined, NaN, -5, 0, 'x', Infinity]) {
    const v = msVisibleDeSubtitulo('hola', ms);
    assert.ok(Number.isFinite(v) && v >= 0, `ms=${String(ms)} -> ${v}`);
  }
});

function nodoFalso() {
  const n = { style: {}, animaciones: [], innerHTML: '', textContent: '' };
  n.animate = (frames, opciones) => { const a = { frames, opciones, cancel() { a.cancelada = true; } }; n.animaciones.push(a); return a; };
  n.getAnimations = () => n.animaciones.filter((a) => !a.cancelada);
  return n;
}
function mesaDe(formato, { rapido = false } = {}) {
  const mesa = new MesaBase(formato, { jugadores: [{ nombre: 'Ana' }] }, { sfx: {}, vel: 1 }, { ancho: 1080, alto: 1920 });
  mesa.subtitulos = nodoFalso();
  mesa.ajustarSubtitulos = () => {};
  mesa.rapido = rapido;
  mesa.programadas = [];
  mesa.programar = (ms, fn) => { mesa.programadas.push({ ms, fn }); };
  return mesa;
}
const beatCon = (texto) => ({ lineas: [{ tipo: 'hecho', texto }] });

test('en vertical, un beat con texto hace aparecer el cuadro y programa su salida; la salida lo apaga con un fundido', () => {
  const mesa = mesaDe('9x16');
  mesa.mostrarSubtitulos(beatCon('Ana toma R07.'), 9000);
  assert.equal(mesa.subtitulos.innerHTML, 'Ana toma R07.');
  assert.equal(mesa.subtitulos.style.opacity, 1);
  assert.equal(mesa.subtitulos.animaciones.length, 1, 'entra con un fundido');
  assert.equal(mesa.programadas.length, 1);
  assert.equal(mesa.programadas[0].ms, msVisibleDeSubtitulo('Ana toma R07.', 9000));
  mesa.programadas[0].fn();
  const salida = mesa.subtitulos.animaciones.at(-1);
  assert.deepEqual(salida.frames.map((f) => f.opacity), [1, 0], 'sale con un fundido');
  salida.onfinish();
  assert.equal(mesa.subtitulos.style.opacity, 0, 'al terminar queda apagado');
});

test('en vertical, el beat siguiente cancela la salida del anterior (si no, apagaria el texto nuevo)', () => {
  const mesa = mesaDe('9x16');
  mesa.mostrarSubtitulos(beatCon('primero'), 9000);
  const vieja = mesa.programadas[0];
  mesa.mostrarSubtitulos(beatCon('segundo'), 9000);
  const animacionesAntes = mesa.subtitulos.animaciones.length;
  vieja.fn();
  assert.equal(mesa.subtitulos.animaciones.length, animacionesAntes, 'la salida vieja ya no hace nada');
  assert.equal(mesa.subtitulos.style.opacity, 1);
});

test('en vertical, un beat sin nada que decir deja el cuadro apagado', () => {
  const mesa = mesaDe('9x16');
  mesa.mostrarSubtitulos(beatCon('algo'), 9000);
  mesa.subtitulos.textContent = ''; mesa.subtitulos.innerHTML = '';
  mesa.mostrarSubtitulos({ lineas: [], dicho: [] }, 9000);
  assert.equal(mesa.subtitulos.style.opacity, 0);
});

test('en las capturas (rapido) el cuadro queda a la vista y no se apaga; en 16:9 el cuadro es fijo', () => {
  const rapida = mesaDe('9x16', { rapido: true });
  rapida.mostrarSubtitulos(beatCon('Ana toma R07.'), 9000);
  assert.equal(rapida.subtitulos.style.opacity, 1);
  assert.equal(rapida.programadas.length, 0, 'sin salida programada');
  const ancha = mesaDe('16x9');
  ancha.mostrarSubtitulos(beatCon('Ana toma R07.'), 9000);
  assert.equal(ancha.subtitulos.style.opacity, undefined, '16:9 no toca la opacidad');
  assert.equal(ancha.programadas.length, 0);
  assert.equal(ancha.subtitulos.animaciones.length, 0);
});
