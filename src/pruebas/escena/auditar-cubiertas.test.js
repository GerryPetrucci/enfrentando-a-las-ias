// La decision del auditor de tarjetas de cobertura (herramientas/auditar-cubiertas.mjs): que lo que tapa la mesa solo se vea durante su beat. Sin navegador: se prueba con muestras inventadas,
// entre ellas la del defecto real del 29 de octubre de 2026 (la tarjeta de cierre del video VACIA sobre la mesa durante el `cierre` de una mano).
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { problemasDePieza, direccionesDeLeeme } from '../../../herramientas/auditar-cubiertas.mjs';

const op = (intro = 0, gancho = 0, cierre = 0) => ({ 'intro-juego': intro, 'tarjeta-gancho': gancho, 'cierre-juego': cierre });
const ventanas = [[0, 2500, 'tarjeta-gancho', 'tarjeta-juego-1'], [2500, 11000, 'intro', 'intro'], [11000, 20000, 'apertura', 'm1-0-apertura'], [20000, 22000, 'cierre', 'm1-9-cierre'], [22000, 28500, 'cierre', 'cierre-3']];

test('una pieza sana: cada tarjeta se ve solo en su beat y la de cierre del video se ve al final', () => {
  const muestras = [[1000, { op: op(0, 1), c: null }], [5000, { op: op(1), c: null }], [15000, { op: op(), c: null }], [21000, { op: op(), c: null }], [25000, { op: op(0, 0, 1), c: null }], [28600, { op: op(0, 0, 1), c: '1' }]];
  assert.deepEqual(problemasDePieza({ ventanas, muestras }), []);
});

test('el defecto del 29-10: la tarjeta de cierre del video visible durante el `cierre` de la mano (id que no es cierre-N)', () => {
  const sinCierreFinal = ventanas.slice(0, 4);
  const muestras = [[15000, { op: op(), c: null }], [21000, { op: op(0, 0, 1), c: null }], [24000, { op: op(0, 0, 1), c: '1' }]];
  const problemas = problemasDePieza({ ventanas: sinCierreFinal, muestras });
  assert.ok(problemas.some((p) => /cubriendo la mesa: cierre-juego durante m1-9-cierre/.test(p)), problemas.join(' | '));
  assert.ok(problemas.some((p) => /no trae el beat de cierre del video/.test(p)), 'tampoco traia el cierre real: conCierre lo daba por puesto');
});

test('una tarjeta de arranque o de gancho que se queda a la vista tambien se detecta, y no llegar a cerrar o un error de pagina son problemas', () => {
  const muestras = [[15000, { op: op(1), c: null }], [16000, { op: op(0, 1), c: null }], [27000, { op: op(0, 0, 1), c: null, e: 'TypeError: x' }]];
  const problemas = problemasDePieza({ ventanas, muestras, consola: ['boom'] });
  assert.ok(problemas.some((p) => /intro-juego durante m1-0-apertura/.test(p)) && problemas.some((p) => /tarjeta-gancho durante m1-0-apertura/.test(p)));
  assert.ok(problemas.some((p) => /no llego a cerrar/.test(p)) && problemas.some((p) => /error de pagina/.test(p)) && problemas.some((p) => /errores de consola/.test(p)));
});

test('los fundidos de las tarjetas (menos de 0.7 s antes o despues de su beat) no cuentan como cubrir la mesa', () => {
  const muestras = [[2000, { op: op(0.5), c: null }], [11300, { op: op(0.4), c: null }], [21800, { op: op(0, 0, 0.3), c: null }], [28000, { op: op(0, 0, 1), c: '1' }]];
  assert.deepEqual(problemasDePieza({ ventanas, muestras }), []);
});

test('con el fundido a negro de la salida la tarjeta de cierre sigue a la vista debajo y no es un problema (falso positivo visto el 29-10 en dos juegos de cartas ya retirados)', () => {
  const muestras = [[25000, { op: op(0, 0, 1), c: null, f: 'contenido' }], [28900, { op: op(0, 0, 1), c: null, f: 'saliendo' }], [29500, { op: op(0, 0, 1), c: '1', f: 'negro' }]];
  assert.deepEqual(problemasDePieza({ ventanas, muestras }), []);
  // pero el mismo cierre fuera de su beat y SIN el fundido de salida sigue siendo un problema
  const mal = problemasDePieza({ ventanas, muestras: [[15000, { op: op(0, 0, 1), c: null, f: 'contenido' }], [29500, { op: op(0, 0, 1), c: '1', f: 'negro' }]] });
  assert.ok(mal.some((p) => /cierre-juego durante m1-0-apertura/.test(p)), mal.join(' | '));
});

test('saca las direcciones de grabacion de un LEEME y nada mas', () => {
  const leeme = ['# Paquete', 'Ve a http://localhost:4321/index.html para algo', '  http://localhost:4321/escena.html?archivo=a.json&partida=1&ronda=1&hasta=3&auto=1&grabar=1', '```text', '  http://localhost:4321/escena.html?archivo=a.json&partida=1&gancho=1&cortes=4%2C5', '```', 'http://localhost:4321/gancho-imagen.html?juego=lobo'].join('\n');
  assert.deepEqual(direccionesDeLeeme(leeme), ['escena.html?archivo=a.json&partida=1&ronda=1&hasta=3&auto=1&grabar=1', 'escena.html?archivo=a.json&partida=1&gancho=1&cortes=4%2C5']);
});

test('tambien las direcciones del formato antiguo del LEEME (dentro de una frase) y sin repetir las que salen dos veces', () => {
  const viejo = ['- Dirección para abrir y grabar: http://localhost:4321/escena.html?archivo=m.json&partida=2&ronda=1&hasta=9&cierre=1&voz=data%2Fx.json', '- Dirección para abrir y grabar: http://localhost:4321/escena.html?archivo=m.json&partida=2&ronda=10&hasta=18&cierre=1',
    'Resumen: http://localhost:4321/escena.html?archivo=m.json&partida=2&ronda=1&hasta=9&cierre=1&voz=data%2Fx.json'].join('\n');
  assert.deepEqual(direccionesDeLeeme(viejo), ['escena.html?archivo=m.json&partida=2&ronda=1&hasta=9&cierre=1&voz=data%2Fx.json', 'escena.html?archivo=m.json&partida=2&ronda=10&hasta=18&cierre=1']);
});
