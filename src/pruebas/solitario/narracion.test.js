// La historia publica de El numero solitario: se cuenta desde lo que registro el motor, con frases de plantilla. Los nombres de las
// IAs se ponen despues ({0} a {4}) porque cambian de asiento en cada partida de una serie.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { narrarPareja, narrarMarca, narrarEpilogo, resolverNombres } from '../../juegos/solitario/narracion.js';
import { nuevoEstado } from './ayudas.js';

const textos = (lineas) => lineas.map((l) => l.texto);
const DURA = /delat|abandon|traici|traidor|rompi/i;

const PAREJAS = [[1, 3], [1, 4], [2, 5], [4, 6], [5, 7]];
function ctxMarca(extra = {}) {
  const E = nuevoEstado();
  return {
    E, ronda: 1, parejas: PAREJAS, marcas: [1, 1, 2, 4, 5], anuladas: [true, true, false, false, false],
    ganador: 2, numero: 2, lideresAntes: [], lideresDespues: [2], corte: null, ...extra,
  };
}

test('narrarPareja abre la ronda, cuenta quien va arriba y muestra cada pareja', () => {
  const E = nuevoEstado();
  const t = textos(narrarPareja({ E, ronda: 1, parejas: PAREJAS }));
  assert.match(t[0], /^Ronda 1 de 12 · ciclo 1\./);
  assert.equal(t.length, 1 + 5, 'nadie tiene puntos: no hay linea de quien va arriba');
  assert.match(t[1], /^\{0\} (enseña|muestra) el 1 y el 3\.$/);
  assert.match(t[5], /^\{4\} (enseña|muestra) el 5 y el 7\.$/);
  E.puntos = [0, 0, 6, 0, 0];
  const conLider = textos(narrarPareja({ E, ronda: 4, parejas: PAREJAS }));
  assert.match(conLider[0], /^Ronda 4 de 12 · ciclo 1\./);
  assert.equal(conLider[1], '{2} va arriba con 6 puntos.');
  E.puntos = [1, 1, 0, 0, 0];
  assert.equal(textos(narrarPareja({ E, ronda: 7, parejas: PAREJAS }))[1], '{0} y {1} van arriba con 1 punto.');
  assert.match(textos(narrarPareja({ E, ronda: 7, parejas: PAREJAS }))[0], /ciclo 2\./);
});

test('narrarPareja salta a quien ya no juega', () => {
  const E = nuevoEstado();
  E.jugando = [true, false, true, true, false];
  const t = textos(narrarPareja({ E, ronda: 5, parejas: [[1, 2], null, [3, 4], [5, 6], null] }));
  assert.equal(t.filter((x) => /el \d y el \d/.test(x)).length, 3);
  assert.ok(!t.some((x) => x.includes('{1}') || x.includes('{4}')));
});

test('narrarMarca cuenta las marcas, la anulacion y al ganador del ejemplo de Ana, Luis, Marta y Pedro', () => {
  const t = textos(narrarMarca(ctxMarca()));
  assert.ok(t.includes('{0} juega el 1.'));
  assert.ok(t.includes('{2} juega el 2.'));
  assert.ok(t.includes('El 1 se anula: lo jugaron {0} y {1}.'));
  assert.ok(t.includes('{2} gana la ronda con el 2: suma 2 puntos y una ficha de victoria.'));
});

test('con un 1 de premio se dice "1 punto" en singular', () => {
  const t = textos(narrarMarca(ctxMarca({ marcas: [3, 3, 1, 4, 5], anuladas: [true, true, false, false, false], numero: 1, ganador: 2 })));
  assert.ok(t.includes('{2} gana la ronda con el 1: suma 1 punto y una ficha de victoria.'));
});

test('si nadie queda solo, nadie gana la ronda', () => {
  const t = textos(narrarMarca(ctxMarca({ marcas: [1, 1, 1, 2, 2], anuladas: [true, true, true, true, true], ganador: null, numero: null, lideresDespues: [] })));
  assert.ok(t.some((x) => /nadie gana la ronda\.$/.test(x)));
  assert.ok(t.includes('Ronda en blanco: los puntos siguen donde estaban.'));
  assert.ok(!t.some((x) => /gana la ronda con/.test(x)));
});

test('un choque de tres o mas se comenta; uno de dos no', () => {
  const tres = textos(narrarMarca(ctxMarca({ marcas: [1, 1, 1, 4, 5], anuladas: [true, true, true, false, false], ganador: 3, numero: 4 })));
  assert.ok(tres.includes('Choque de 3 en el 1: demasiados pensaron lo mismo.'));
  assert.ok(!textos(narrarMarca(ctxMarca())).some((x) => x.startsWith('Choque')));
});

test('comenta al que juega la carta mas alta de su pareja y gana, y al que toma la delantera', () => {
  const delantera = textos(narrarMarca(ctxMarca({ lideresAntes: [0], lideresDespues: [2] })));
  assert.ok(delantera.includes('{2} toma la delantera.'));
  const senuelo = textos(narrarMarca(ctxMarca({ parejas: [[1, 5], [2, 6], [3, 7], [4, 8], [3, 6]], marcas: [5, 6, 7, 8, 6], anuladas: [false, true, false, false, true], ganador: 0, numero: 5 })));
  assert.ok(senuelo.includes('{0} jugó la carta más alta de su pareja y le salió bien.'));
  const yaLider = textos(narrarMarca(ctxMarca({ lideresAntes: [2], lideresDespues: [2] })));
  assert.ok(!yaLider.some((x) => x.includes('toma la delantera')));
});

test('cuenta el corte, el criterio de desempate y el sorteo', () => {
  const corte = (criterio) => textos(narrarMarca(ctxMarca({ corte: { numero: 1, jugador: 3, puntos: 7, criterio } })));
  assert.ok(corte('puntos').includes('Fin del corte 1: {3} queda a salvo con 7 puntos y sale de la partida.'));
  assert.ok(corte('fichas').includes('Fin del corte 1: {3} queda a salvo con 7 puntos (desempate por fichas) y sale de la partida.'));
  assert.ok(corte('sorteo').includes('Empate total en el corte: lo decide el sorteo.'));
  assert.ok(!corte('puntos').some((x) => x.includes('sorteo')));
  assert.ok(corte('ultima victoria').includes('Fin del corte 1: {3} queda a salvo con 7 puntos (desempate por última victoria) y sale de la partida.'), 'el texto publico lleva acento');
});

test('una marca de reemplazo no se narra como audacia, pero si se cuenta que gano', () => {
  const base = { parejas: [[1, 5], [2, 6], [3, 7], [4, 8], [3, 6]], marcas: [5, 6, 7, 8, 6], anuladas: [false, true, false, false, true], ganador: 0, numero: 5 };
  const propia = textos(narrarMarca(ctxMarca({ ...base, reemplazadas: [false, false, false, false, false] })));
  assert.ok(propia.includes('{0} jugó la carta más alta de su pareja y le salió bien.'));
  const reemplazo = textos(narrarMarca(ctxMarca({ ...base, reemplazadas: [true, false, false, false, false] })));
  assert.ok(!reemplazo.some((x) => x.includes('carta más alta')));
  assert.ok(reemplazo.includes('{0} gana la ronda con el 5: suma 5 puntos y una ficha de victoria.'));
});

test('el epilogo cuenta quien gana la pieza, quien sobrevive y quien queda fuera', () => {
  const E = nuevoEstado();
  assert.deepEqual(narrarEpilogo(E), [], 'sin final no hay epilogo');
  E.fin = true;
  E.corteSalvo = [null, 1, null, 2, null];
  E.puntos = [4, 9, 12, 7, 4];
  E.fichas = [1, 2, 3, 2, 1];
  E.final = { pieza: 2, medio: 0, eliminado: 4, criterioPieza: 'puntos', criterioEliminado: 'sorteo', ranking: [] };
  const t = textos(narrarEpilogo(E));
  assert.ok(t.includes('{1} había quedado a salvo en el corte 1.'));
  assert.ok(t.includes('{3} había quedado a salvo en el corte 2.'));
  assert.ok(t.includes('{2} gana la pieza: termina con 12 puntos y 3 fichas.'));
  assert.ok(t.includes('{0} sobrevive en el medio de la tabla con 4 puntos.'));
  assert.ok(t.includes('{4} queda eliminado con 4 puntos.'));
  assert.ok(t.includes('El sorteo decidió un empate total en la final.'));
  assert.equal(t.at(-1), 'Puntos de cartas: {0} 4, {1} 9, {2} 12, {3} 7, {4} 4.');
  E.fichas = [1, 2, 1, 2, 1];
  assert.ok(textos(narrarEpilogo(E)).includes('{2} gana la pieza: termina con 12 puntos y 1 ficha.'));
});

test('todas las lineas son texto sano: sin undefined, NaN, marcadores raros ni palabras duras', () => {
  const E = nuevoEstado();
  const todas = [
    ...narrarPareja({ E, ronda: 1, parejas: PAREJAS }),
    ...narrarMarca(ctxMarca({ corte: { numero: 2, jugador: 1, puntos: 5, criterio: 'ultima victoria' } })),
    ...narrarMarca(ctxMarca({ marcas: [1, 1, 1, 2, 2], anuladas: [true, true, true, true, true], ganador: null, numero: null })),
  ];
  E.fin = true; E.corteSalvo = [1, null, 2, null, null]; E.puntos = [3, 5, 1, 2, 4]; E.fichas = [1, 2, 0, 1, 1];
  E.final = { pieza: 1, medio: 4, eliminado: 3, criterioPieza: 'fichas', criterioEliminado: 'ultima victoria', ranking: [] };
  todas.push(...narrarEpilogo(E));
  assert.ok(todas.length > 20);
  for (const l of todas) {
    assert.ok(l.tipo && l.texto && l.texto.trim().length > 3, JSON.stringify(l));
    assert.doesNotMatch(l.texto, /undefined|NaN|null/, l.texto);
    assert.doesNotMatch(l.texto, DURA, l.texto);
    assert.doesNotMatch(l.texto, /ultima victoria|ultimo corte/, `falta un acento: ${l.texto}`);
    assert.doesNotMatch(l.texto.replace(/\{[0-4]\}/g, ''), /[{}]/, l.texto);
  }
});

test('el mismo contexto da las mismas lineas, y el estado no se toca', () => {
  const E = nuevoEstado();
  const copia = JSON.stringify(E);
  assert.deepEqual(narrarPareja({ E, ronda: 3, parejas: PAREJAS }), narrarPareja({ E, ronda: 3, parejas: PAREJAS }));
  assert.equal(JSON.stringify(E), copia);
  const variantes = new Set();
  for (let seed = 1; seed <= 30; seed++) variantes.add(narrarPareja({ E: nuevoEstado(seed), ronda: 3, parejas: PAREJAS })[0].texto);
  assert.ok(variantes.size >= 2, 'la apertura varia con la semilla');
});

test('resolverNombres pone el nombre de cada IA o "Jugador N" si falta', () => {
  const jugadores = [{ nombre: 'Claude' }, { nombre: 'GPT' }, { nombre: 'Gemini' }, { nombre: 'DeepSeek' }, { nombre: 'Llama' }];
  assert.equal(resolverNombres('{0} gana a {4}; {2} queda fuera.', jugadores), 'Claude gana a Llama; Gemini queda fuera.');
  assert.equal(resolverNombres('{3} y {1}', []), 'Jugador 4 y Jugador 2');
  assert.equal(resolverNombres('sin marcadores', jugadores), 'sin marcadores');
});
