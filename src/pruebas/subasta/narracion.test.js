// La historia publica de Subasta de tiempo: se cuenta desde lo que registro el motor, con frases de plantilla. REVELA lo que las IAs nunca ven
// (cuanto aposto cada una). Los nombres se ponen despues ({0} a {4}).
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { narrarSubasta, narrarEpilogo, resolverNombres } from '../../juegos/subasta/narracion.js';
import { nuevoEstado } from './ayudas.js';

const textos = (lineas) => lineas.map((l) => l.texto);
const DURA = /delat|abandon|traici|traidor|rompi/i;

// apuestas y bancos en SEGUNDOS (lo que guarda el registro)
function ctx(extra = {}) {
  return {
    E: nuevoEstado(), subasta: 1, apuestas: [15, 32, 47, 51, 0], bancos: [585, 568, 553, 549, 600],
    ganador: 3, sinGanador: null, empatados: [], todoElBanco: [false, false, false, false, false], ...extra,
  };
}

test('cuenta la subasta del ejemplo: todos pagan, gana el que aguanto mas y se revela lo que apostaron', () => {
  const t = textos(narrarSubasta(ctx()));
  assert.match(t[0], /^Subasta 1 de 19\./);
  assert.ok(t.includes('{0} aguanta 15.0 segundos.'));
  assert.ok(t.includes('{3} aguanta 51.0 segundos.'));
  assert.ok(t.includes('{4} se retira sin gastar nada.'));
  assert.ok(t.includes('{3} gana la subasta con 51.0 segundos y se lleva la ficha.'));
});

test('un empate en lo mas alto anula la subasta y los dos pierden el tiempo', () => {
  const t = textos(narrarSubasta(ctx({ apuestas: [31.4, 31.4, 10, 0, 0], ganador: null, sinGanador: 'empate', empatados: [0, 1] })));
  assert.ok(t.includes('Empate a 31.4 segundos entre {0} y {1}: la subasta se anula y los dos pierden ese tiempo.'));
  assert.ok(!t.some((x) => /gana la subasta/.test(x)), 'con un empate arriba nadie gana la subasta');
  const tres = textos(narrarSubasta(ctx({ apuestas: [20, 20, 20, 0, 0], ganador: null, sinGanador: 'empate', empatados: [0, 1, 2] })));
  assert.ok(tres.includes('Empate a 20.0 segundos entre {0}, {1} y {2}: la subasta se anula y los tres pierden ese tiempo.'));
});

test('si nadie aguanta, la subasta se queda sin ganador', () => {
  const t = textos(narrarSubasta(ctx({ apuestas: [0, 0, 0, 0, 0], ganador: null, sinGanador: 'nadie aposto', bancos: [600, 600, 600, 600, 600] })));
  assert.ok(t.includes('Nadie aguanta: la subasta se queda sin ganador.'));
  assert.ok(t.includes('Todos se retiran sin gastar nada.'));
});

test('los jugadores sin banco no aparecen (no pudieron apostar)', () => {
  const t = textos(narrarSubasta(ctx({ apuestas: [10, null, 5, null, 0], ganador: 0, bancos: [100, 0, 50, 0, 600] })));
  assert.ok(!t.some((x) => x.includes('{1}') || x.includes('{3}')));
});

test('comentarios para la voz: apuesta enorme, quedarse sin tiempo y ganar por casi nada', () => {
  const grande = textos(narrarSubasta(ctx({ apuestas: [320, 0, 0, 0, 0], ganador: 0, bancos: [280, 600, 600, 600, 600] })));
  assert.ok(grande.includes('{0} apuesta más de la mitad de su banco inicial en una sola subasta.'));
  const sinTiempo = textos(narrarSubasta(ctx({ apuestas: [40, 0, 0, 0, 0], ganador: 0, bancos: [0, 600, 600, 600, 600], todoElBanco: [true, false, false, false, false] })));
  assert.ok(sinTiempo.includes('{0} se queda sin tiempo: ya no podrá apostar.'));
  const barato = textos(narrarSubasta(ctx({ apuestas: [0.5, 0, 0, 0, 0], ganador: 0, bancos: [599.5, 600, 600, 600, 600] })));
  assert.ok(barato.includes('{0} se lleva la ficha por casi nada.'));
  assert.ok(!textos(narrarSubasta(ctx())).some((x) => x.includes('por casi nada') || x.includes('más de la mitad')));
});

test('el epilogo cuenta la pieza, la eliminacion y los criterios de desempate', () => {
  const E = nuevoEstado();
  assert.deepEqual(narrarEpilogo(E), [], 'sin final no hay epilogo');
  E.fin = true;
  E.fichas = [4, 5, 3, 2, 5];
  E.bancos = [100, 250, 0, 40, 90];
  E.final = { pieza: 1, eliminado: 3, criterioPieza: 'tiempo', criterioEliminado: 'fichas', ranking: [] };
  const t = textos(narrarEpilogo(E));
  assert.ok(t.includes('{1} gana la pieza: 5 fichas y 25.0 segundos de banco.'));
  assert.ok(t.includes('{3} queda eliminado con 2 fichas.'));
  assert.ok(t.includes('Empataron en fichas arriba y desempató el tiempo que conservaban.'));
  assert.equal(t.at(-1), 'Fichas: {0} 4, {1} 5, {2} 3, {3} 2, {4} 5. Tiempo que sobró: {0} 10.0 s, {1} 25.0 s, {2} 0.0 s, {3} 4.0 s, {4} 9.0 s.');
  E.final = { pieza: null, eliminado: null, criterioPieza: 'sin pieza', criterioEliminado: 'sin eliminado', ranking: [] };
  const sin = textos(narrarEpilogo(E));
  assert.ok(sin.includes('Nadie gana la pieza: los de arriba empatan en fichas y en tiempo.'));
  assert.ok(sin.includes('Nadie queda eliminado: los de abajo empatan en fichas y en tiempo.'));
});

test('una respuesta ilegible o una caida no se narra como una decision de retirarse', () => {
  const t = textos(narrarSubasta(ctx({ apuestas: [0, 32, 47, 51, 0], reemplazadas: [true, false, false, false, false] })));
  assert.ok(t.includes('{0} no responde bien: se cuenta como retirada.'));
  assert.ok(!t.includes('{0} se retira sin gastar nada.'));
  assert.ok(t.includes('{4} se retira sin gastar nada.'), 'quien si decidio retirarse sigue igual');
  // si todos apostaron 0 pero alguno no respondio, no se dice que "todos se retiran"
  const casi = textos(narrarSubasta(ctx({ apuestas: [0, 0, 0, 0, 0], ganador: null, sinGanador: 'nadie aposto', reemplazadas: [false, true, false, false, false] })));
  assert.ok(!casi.includes('Todos se retiran sin gastar nada.'));
  assert.ok(casi.includes('{1} no responde bien: se cuenta como retirada.'));
  assert.ok(casi.includes('{0} se retira sin gastar nada.'));
});

test('con un solo jugador con tiempo no se dice "todos"', () => {
  const t = textos(narrarSubasta(ctx({ apuestas: [0, null, null, null, null], ganador: null, sinGanador: 'nadie aposto', bancos: [10, 0, 0, 0, 0] })));
  assert.ok(t.includes('{0} se retira sin gastar nada.'));
  assert.ok(!t.some((x) => x.includes('Todos')));
});

test('comentarios para la voz: empate, todos se retiran y adelantarse en fichas', () => {
  const empate = textos(narrarSubasta(ctx({ apuestas: [31.4, 31.4, 10, 0, 0], ganador: null, sinGanador: 'empate', empatados: [0, 1] })));
  assert.ok(empate.includes('Empate en lo más alto: nadie se lleva la ficha, y todo ese tiempo se pierde.'));
  const blanco = textos(narrarSubasta(ctx({ apuestas: [0, 0, 0, 0, 0], ganador: null, sinGanador: 'nadie aposto', reemplazadas: [false, false, false, false, false] })));
  assert.ok(blanco.includes('Nadie quiere pagar: la subasta pasa en blanco.'));
  const adelanta = textos(narrarSubasta(ctx({ ganador: 1, apuestas: [0, 40, 0, 0, 0], fichasAntes: [2, 2, 0, 0, 0], fichas: [2, 3, 0, 0, 0] })));
  assert.ok(adelanta.includes('{1} se adelanta en fichas.'));
  const primera = textos(narrarSubasta(ctx({ ganador: 1, apuestas: [0, 40, 0, 0, 0], fichasAntes: [0, 0, 0, 0, 0], fichas: [0, 1, 0, 0, 0] })));
  assert.ok(!primera.some((x) => x.includes('se adelanta')), 'la primera ficha de la partida no es adelantarse');
  const yaLider = textos(narrarSubasta(ctx({ ganador: 1, apuestas: [0, 40, 0, 0, 0], fichasAntes: [1, 2, 0, 0, 0], fichas: [1, 3, 0, 0, 0] })));
  assert.ok(!yaLider.some((x) => x.includes('se adelanta')), 'quien ya iba solo arriba no se adelanta');
});

test('todas las lineas son texto sano: sin undefined, NaN, marcadores raros ni palabras duras', () => {
  const E = nuevoEstado();
  const todas = [
    ...narrarSubasta(ctx()),
    ...narrarSubasta(ctx({ apuestas: [31.4, 31.4, 10, 0, 0], ganador: null, sinGanador: 'empate', empatados: [0, 1] })),
    ...narrarSubasta(ctx({ apuestas: [0, 0, 0, 0, 0], ganador: null, sinGanador: 'nadie aposto' })),
    ...narrarSubasta(ctx({ apuestas: [320, 0, 0, 0, 0], ganador: 0, bancos: [0, 600, 600, 600, 600], todoElBanco: [true, false, false, false, false] })),
  ];
  E.fin = true; E.fichas = [4, 5, 3, 2, 5]; E.bancos = [100, 250, 0, 40, 90];
  E.final = { pieza: 1, eliminado: 3, criterioPieza: 'fichas', criterioEliminado: 'tiempo', ranking: [] };
  todas.push(...narrarEpilogo(E));
  assert.ok(todas.length > 20);
  for (const l of todas) {
    assert.ok(l.tipo && l.texto && l.texto.trim().length > 3, JSON.stringify(l));
    assert.doesNotMatch(l.texto, /undefined|NaN|null/, l.texto);
    assert.doesNotMatch(l.texto, DURA, l.texto);
    assert.doesNotMatch(l.texto.replace(/\{[0-4]\}/g, ''), /[{}]/, l.texto);
  }
});

test('el mismo contexto da las mismas lineas, y el estado no se toca', () => {
  const E = nuevoEstado();
  const copia = JSON.stringify(E);
  assert.deepEqual(narrarSubasta(ctx({ E })), narrarSubasta(ctx({ E })));
  assert.equal(JSON.stringify(E), copia);
  const variantes = new Set();
  for (let seed = 1; seed <= 30; seed++) variantes.add(narrarSubasta(ctx({ E: nuevoEstado(seed) }))[0].texto);
  assert.ok(variantes.size >= 2, 'la apertura varia con la semilla');
});

test('resolverNombres pone el nombre de cada IA o "Jugador N" si falta', () => {
  const jugadores = [{ nombre: 'Claude' }, { nombre: 'GPT' }, { nombre: 'Gemini' }, { nombre: 'DeepSeek' }, { nombre: 'Llama' }];
  assert.equal(resolverNombres('{0} gana a {4}; {2} queda fuera.', jugadores), 'Claude gana a Llama; Gemini queda fuera.');
  assert.equal(resolverNombres('{3} y {1}', []), 'Jugador 4 y Jugador 2');
});
