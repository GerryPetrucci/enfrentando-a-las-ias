// La historia publica de Triple dado: se cuenta desde lo que registro el motor, con {0}..{3} en lugar de nombres, sin palabras duras y sin NaN.
// Aqui se prueba con registros armados a mano; la Tarea 5 la prueba tambien a traves de aplicarTurno.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { narrarLanzamiento, narrarEnfrentamiento, narrarCierreRonda, narrarEpilogo, resolverNombres } from '../../juegos/tripledado/narracion.js';
import { aciertaTarjeta, premioRonda } from '../../juegos/tripledado/combinaciones.js';
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

test('una respuesta reemplazada no se cuenta como decision de la IA, pero la narracion dice con que dados quedo (no oculta la jugada)', () => {
  const t = texto(narrarEnfrentamiento(enfr({ reemplazadas: [true, false, false, false] })));
  assert.match(t, /\{0\} no responde bien: el juego le pone 5-5-2: doble/);
  assert.doesNotMatch(t, /\{0\} muestra/);
  const oculto = texto(narrarEnfrentamiento(enfr({
    combos: [combo([6, 5, 3], 'sencillo', ['rojo', 'azul']), combo([3, 4, 5], 'escalera'), combo([6, 4, 1], 'sencillo'), combo([2, 1, 1], 'doble')],
    reemplazadas: [true, false, false, false],
  })));
  assert.match(oculto, /\{0\} no responde bien: el juego le pone 6-5-3: sencillo, con los dados rojo y azul/);
});

test('el cierre de ronda dice la tarjeta, el total y el premio; el ZERO logrado y el que falla por poco se comentan', () => {
  const lineas = narrarCierreRonda({
    E: nuevoEstado(), ronda: 1, tarjetas: ['MORE', 'ZERO', 'MIN', 'MAX'], totalesD: [108, 0, 90, 120], aciertos: [true, true, false, false],
    puntosD: [216, 480, 90, 120],
  });
  const t = texto(lineas);
  assert.match(t, /\{0\} predijo MORE y suma 9: acierta y duplica: 18/);
  assert.match(t, /\{1\} predijo ZERO y suma 0: logra el ZERO y cobra 40/);
  assert.match(t, /\{2\} predijo MIN y suma 7\.5: falla y se queda con 7\.5/);
  assert.ok(lineas.some((l) => l.tipo === 'comentario' && /\{1\} logra el ZERO: 40 puntos/.test(l.texto)));
  assert.ok(lineas.some((l) => l.tipo === 'comentario' && /\{2\} se pasa de MIN por 0\.5/.test(l.texto)));
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

test('la cercania de una tarjeta fallida se mide contra su limite REAL: nada de "a 0.08" cuando suma justo 7 u 11', () => {
  const cierre = (t, totalD) => narrarCierreRonda({
    tarjetas: [t, 'MORE', 'MORE', 'MORE'], totalesD: [totalD, 108, 108, 108], aciertos: [aciertaTarjeta(t, totalD), true, true, true],
    puntosD: [premioRonda(t, totalD).puntos, 216, 216, 216],
  }).filter((l) => l.tipo === 'comentario').map((l) => l.texto).join(' | ');
  assert.match(cierre('MIN', 84), /\{0\} suma justo 7: MIN no llegaba a tanto/, 'MIN es menos de 7: sumar 7 exacto no se escapa por poco');
  assert.match(cierre('MORE', 132), /\{0\} suma justo 11: MORE no llegaba a tanto/);
  assert.match(cierre('MIN', 90), /\{0\} se pasa de MIN por 0\.5/);
  assert.match(cierre('MORE', 78), /\{0\} se queda a 0\.5 de acertar MORE/);
  assert.match(cierre('MAX', 120), /\{0\} se queda a 1 de acertar MAX/);
  assert.match(cierre('ZERO', 6), /\{0\} se queda a 0\.5 de lograr el ZERO/);
  assert.doesNotMatch(cierre('MIN', 84), /0\.08/);
  assert.doesNotMatch(cierre('MIN', 0), /se queda|se pasa|suma justo/, 'MIN con 0 puntos: no hay una brecha medible');
  assert.doesNotMatch(cierre('MAX', 60), /se queda|se pasa|suma justo/, 'a 6 puntos del MAX no es por poco');
});

test('una tarjeta que puso el juego (reemplazo o la forzada de la ronda 4) no se narra como una prediccion de la IA', () => {
  const base = { tarjetas: ['ZERO', 'MIN', 'MORE', 'MAX'], totalesD: [180, 36, 108, 132], aciertos: [false, true, true, true], puntosD: [180, 72, 216, 264] };
  const t = texto(narrarCierreRonda({ ...base, reemplazadas: [true, false, false, false] }));
  assert.match(t, /\{0\} no responde bien y el juego le pone ZERO; suma 15: falla y se queda con 15/);
  assert.doesNotMatch(t, /\{0\} predijo/);
  assert.match(t, /\{1\} predijo MIN y suma 3: acierta y duplica: 6/, 'las demas siguen siendo predicciones');
  const f = texto(narrarCierreRonda({ ...base, forzada: true }));
  for (const [s, tarjeta] of [[0, 'ZERO'], [1, 'MIN'], [2, 'MORE'], [3, 'MAX']]) assert.match(f, new RegExp(`A \\{${s}\\} le queda ${tarjeta}; suma`));
  assert.doesNotMatch(f, /predijo/);
});

test('"gana por el dado que le sobraba" solo si hay UN ganador: si varios empatan en el primer lugar no se dice que "gana"', () => {
  const lineas = narrarEnfrentamiento(enfr({
    combos: [combo([4, 4, 4], 'triple'), combo([4, 4, 4], 'triple'), combo([4, 4, 4], 'triple'), combo([2, 1, 1], 'doble')],
    puntosD: [12, 54, 54, 0], puesto: [3, 1, 1, 4], porDesempate: [true, true, true, false],
  }));
  assert.ok(!lineas.some((l) => /gana por el dado que le sobraba/.test(l.texto)));
  assert.ok(lineas.some((l) => /\{1\} y \{2\} empatan en el primer lugar/.test(l.texto)));
});

test('el cierre de ronda comenta cuando alguien pasa al frente en los puntos acumulados (solo si habia un lider unico y cambia)', () => {
  const base = { tarjetas: ['MORE', 'MORE', 'MORE', 'MORE'], totalesD: [108, 108, 108, 108], aciertos: [true, true, true, true], puntosD: [216, 216, 216, 216] };
  const hay = (extra) => narrarCierreRonda({ ...base, ...extra }).some((l) => l.tipo === 'comentario' && /pasa al frente/.test(l.texto));
  const despues = [400, 300, 200, 100];
  assert.equal(hay({ puntosAntesD: [120, 240, 60, 60], puntosDespuesD: despues }), true, 'iba arriba el jugador 2 y ahora va el 1');
  assert.equal(hay({ puntosAntesD: [300, 240, 60, 60], puntosDespuesD: despues }), false, 'ya iba arriba');
  assert.equal(hay({ puntosAntesD: [0, 0, 0, 0], puntosDespuesD: despues }), false, 'salir de un empate no es una remontada');
  assert.equal(hay({ puntosAntesD: [120, 240, 60, 60], puntosDespuesD: [400, 400, 200, 100] }), false, 'empatar arriba no es pasar al frente');
  assert.equal(hay({}), false, 'sin puntos acumulados no se comenta nada');
  const t = texto(narrarCierreRonda({ ...base, puntosAntesD: [120, 240, 60, 60], puntosDespuesD: despues }));
  assert.match(t, /\{0\} pasa al frente/);
});

test('resolverNombres reemplaza {0} a {3} y tiene respaldo', () => {
  const jugadores = [{ nombre: 'Claude' }, { nombre: 'GPT' }, { nombre: 'Gemini' }, { nombre: 'Llama' }];
  assert.equal(resolverNombres('{0} le gana a {3}.', jugadores), 'Claude le gana a Llama.');
  assert.equal(resolverNombres('{2} y {0}', []), 'Jugador 3 y Jugador 1');
});
