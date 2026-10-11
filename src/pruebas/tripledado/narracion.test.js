// La historia publica de Triple dado: se cuenta desde lo que registro el motor, con {0}..{3} en lugar de nombres, sin palabras duras y sin NaN.
// Aqui se prueba con registros armados a mano; la Tarea 5 la prueba tambien a traves de aplicarTurno.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { narrarLanzamiento, narrarEnfrentamiento, narrarCierreRonda, narrarEpilogo, resolverNombres } from '../../juegos/tripledado/narracion.js';
import { nuevoEstado } from './ayudas.js';

const DURAS = /delat|abandon|traici|traidor|culpa|rompi/i;
const texto = (lineas) => lineas.map((l) => l.texto).join('\n');
const combo = (valores, categoria, ocultos = []) => ({ valores, dados: valores.map((_, i) => `b${i + 1}`), categoria, ocultos });
const enfr = (extra = {}) => ({
  E: nuevoEstado(), ronda: 1, k: 1,
  combos: [combo([5, 5, 2], 'doble'), combo([3, 4, 5], 'escalera'), combo([6, 4, 1], 'sencillo'), combo([2, 1, 1], 'doble')],
  puntosD: [36, 72, 12, 0], puesto: [2, 1, 3, 4], porDesempate: [false, false, false, false], reemplazadas: [false, false, false, false], ...extra,
});

test('el lanzamiento cuenta la apertura y los dados blancos de cada jugador', () => {
  const t = texto(narrarLanzamiento({ E: nuevoEstado(), ronda: 2, forzada: false, blancos: [[6, 5, 5, 4, 3, 3, 2, 1, 1], [1, 1, 1, 1, 1, 1, 1, 1, 1], [2, 2, 2, 2, 2, 2, 2, 2, 2], [6, 6, 6, 6, 6, 6, 6, 6, 6]] }));
  assert.match(t, /Ronda 2 de 4/);
  assert.match(t, /\{0\} lanza 6 5 5 4 3 3 2 1 1/);
  assert.match(t, /\{3\} lanza 6 6 6 6 6 6 6 6 6/);
  assert.doesNotMatch(t, /undefined|NaN/);
});

test('la ronda 4 dice que la tarjeta se pone sola', () => {
  const t = texto(narrarLanzamiento({ E: nuevoEstado(), ronda: 4, forzada: true, blancos: Array(4).fill(Array(9).fill(3)) }));
  assert.match(t, /una sola tarjeta y se pone sola/);
});

test('un enfrentamiento cuenta cada combinacion, quien gana y los puntos, con {0}..{3}', () => {
  const lineas = narrarEnfrentamiento(enfr());
  const t = texto(lineas);
  for (const tipo of ['apertura', 'jugada', 'resultado']) assert.ok(lineas.some((l) => l.tipo === tipo), tipo);
  assert.match(t, /Enfrentamiento 1 de 3/);
  assert.match(t, /\{0\} muestra 5-5-2: doble/);
  assert.match(t, /\{1\} muestra 5-4-3: escalera/);
  assert.match(t, /\{1\} gana el enfrentamiento y se lleva 6 puntos/);
  assert.match(t, /Puntos: \{0\} 3, \{1\} 6, \{2\} 1, \{3\} 0/);
  assert.doesNotMatch(t, /undefined|NaN|null/);
  assert.doesNotMatch(t, DURAS);
});

test('un dado oculto usado se nombra y gana-con-oculto es comentario', () => {
  const c = enfr({ combos: [combo([5, 5, 2], 'doble'), combo([3, 4, 5], 'escalera', ['rojo']), combo([6, 4, 1], 'sencillo'), combo([2, 1, 1], 'doble')] });
  const lineas = narrarEnfrentamiento(c);
  assert.match(texto(lineas), /\{1\} muestra 5-4-3: escalera, con el dado rojo/);
  assert.ok(lineas.some((l) => l.tipo === 'comentario' && /\{1\} usa un dado oculto para ganar/.test(l.texto)));
});

test('empate en el primer lugar: se reparten los puntos y hay comentario; un triple tambien', () => {
  const lineas = narrarEnfrentamiento(enfr({
    combos: [combo([4, 4, 4], 'triple'), combo([4, 4, 4], 'triple'), combo([6, 4, 1], 'sencillo'), combo([2, 1, 1], 'doble')],
    puntosD: [54, 54, 12, 0], puesto: [1, 1, 3, 4],
  }));
  const t = texto(lineas);
  assert.match(t, /\{0\} y \{1\} empatan en el primer lugar y se reparten los puntos: 4\.5 cada uno/);
  assert.ok(lineas.some((l) => l.tipo === 'comentario' && /empate y se reparten los puntos/.test(l.texto)));
  assert.ok(lineas.some((l) => l.tipo === 'comentario' && /\{0\} saca un triple/.test(l.texto)));
});

test('el desempate por el dado que sobraba se comenta', () => {
  const lineas = narrarEnfrentamiento(enfr({
    combos: [combo([5, 5, 2], 'doble'), combo([5, 5, 2], 'doble'), combo([6, 4, 1], 'sencillo'), combo([2, 1, 1], 'doble')],
    puntosD: [72, 36, 12, 0], puesto: [1, 2, 3, 4], porDesempate: [true, true, false, false],
  }));
  assert.ok(lineas.some((l) => l.tipo === 'comentario' && /\{0\} gana por el dado que le sobraba/.test(l.texto)));
});

test('una respuesta reemplazada no se cuenta como decision de la IA', () => {
  const t = texto(narrarEnfrentamiento(enfr({ reemplazadas: [true, false, false, false] })));
  assert.match(t, /\{0\} no responde bien: se juegan tres dados al azar/);
  assert.doesNotMatch(t, /\{0\} muestra/);
});

test('el cierre de ronda dice la tarjeta, el total y el premio; el ZERO logrado y el que falla por poco se comentan', () => {
  const lineas = narrarCierreRonda({
    E: nuevoEstado(), ronda: 1, tarjetas: ['MORE', 'ZERO', 'MIN', 'MAX'], totalesD: [108, 0, 90, 120], aciertos: [true, true, false, false],
    puntosD: [216, 480, 90, 120], distancias: [0, 0, 6, 12],
  });
  const t = texto(lineas);
  assert.match(t, /\{0\} predijo MORE y suma 9: acierta y duplica: 18/);
  assert.match(t, /\{1\} predijo ZERO y suma 0: logra el ZERO y cobra 40/);
  assert.match(t, /\{2\} predijo MIN y suma 7\.5: falla y se queda con 7\.5/);
  assert.ok(lineas.some((l) => l.tipo === 'comentario' && /\{1\} logra el ZERO: 40 puntos/.test(l.texto)));
  assert.ok(lineas.some((l) => l.tipo === 'comentario' && /\{2\} se queda a 0\.5 de acertar MIN/.test(l.texto)));
  assert.ok(lineas.some((l) => l.tipo === 'comentario' && /\{3\} se queda a 1 de acertar MAX/.test(l.texto)));
  assert.doesNotMatch(t, /undefined|NaN/);
});

test('la narracion es determinista por seed', () => {
  assert.deepEqual(narrarEnfrentamiento(enfr()), narrarEnfrentamiento(enfr()));
});

test('el epilogo: pieza y eliminado, sin pieza por empate, y la tabla final', () => {
  const E = nuevoEstado();
  assert.deepEqual(narrarEpilogo(E), [], 'sin final no hay epilogo');
  E.fin = true;
  E.puntos = [60 * 12, 20 * 12, 35 * 12, 10 * 12];
  E.final = { pieza: 0, eliminado: 3, criterioPieza: 'puntos', criterioEliminado: 'puntos', ranking: [0, 2, 1, 3] };
  let t = texto(narrarEpilogo(E));
  assert.match(t, /\{0\} gana la pieza con 60 puntos/);
  assert.match(t, /\{3\} queda eliminado con 10 puntos/);
  assert.match(t, /Puntos finales: \{0\} 60, \{1\} 20, \{2\} 35, \{3\} 10/);
  E.final = { pieza: null, eliminado: null, criterioPieza: 'sin pieza', criterioEliminado: 'sin eliminado', ranking: [0, 1, 2, 3] };
  t = texto(narrarEpilogo(E));
  assert.match(t, /Nadie gana la pieza: los de arriba empatan/);
  assert.match(t, /Nadie queda eliminado: los de abajo empatan/);
});

test('resolverNombres reemplaza {0} a {3} y tiene respaldo', () => {
  const jugadores = [{ nombre: 'Claude' }, { nombre: 'GPT' }, { nombre: 'Gemini' }, { nombre: 'Llama' }];
  assert.equal(resolverNombres('{0} le gana a {3}.', jugadores), 'Claude le gana a Llama.');
  assert.equal(resolverNombres('{2} y {0}', []), 'Jugador 3 y Jugador 1');
});
