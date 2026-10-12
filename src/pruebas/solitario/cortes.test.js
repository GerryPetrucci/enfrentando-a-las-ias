// Clasificacion de los que siguen jugando y sus desempates: puntos, fichas, ultima victoria y, al final, el sorteo.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clasificar, criterioEntre, lideres } from '../../juegos/solitario/cortes.js';
import { nuevoEstado } from './ayudas.js';

function estadoCon({ puntos, fichas = [0, 0, 0, 0, 0], ultima = [0, 0, 0, 0, 0], sorteo = [0.1, 0.2, 0.3, 0.4, 0.5], jugando = [true, true, true, true, true] }) {
  const E = nuevoEstado();
  E.puntos = puntos; E.fichas = fichas; E.ultimaVictoria = ultima; E.sorteo[0] = sorteo; E.jugando = jugando;
  return E;
}

test('ordena por puntos de mayor a menor', () => {
  const E = estadoCon({ puntos: [3, 9, 0, 5, 5] });
  assert.deepEqual(clasificar(E, 0).map((x) => x.s).slice(0, 2), [1, 3]);
  assert.equal(clasificar(E, 0)[0].puntos, 9);
});

test('con los mismos puntos decide el que tiene mas fichas de victoria', () => {
  const E = estadoCon({ puntos: [5, 5, 5, 0, 0], fichas: [1, 3, 2, 0, 0] });
  assert.deepEqual(clasificar(E, 0).map((x) => x.s).slice(0, 3), [1, 2, 0]);
});

test('con los mismos puntos y fichas decide quien gano una ronda mas tarde', () => {
  const E = estadoCon({ puntos: [5, 5, 5, 0, 0], fichas: [2, 2, 2, 0, 0], ultima: [4, 9, 6, 0, 0] });
  assert.deepEqual(clasificar(E, 0).map((x) => x.s).slice(0, 3), [1, 2, 0]);
});

test('si todo es igual decide el sorteo guardado en el estado (el menor numero gana)', () => {
  const E = estadoCon({ puntos: [0, 0, 0, 0, 0], sorteo: [0.9, 0.2, 0.5, 0.1, 0.7] });
  assert.deepEqual(clasificar(E, 0).map((x) => x.s), [3, 1, 2, 4, 0]);
});

test('el indice k elige cual de los tres sorteos se usa', () => {
  const E = estadoCon({ puntos: [0, 0, 0, 0, 0] });
  E.sorteo[1] = [0.5, 0.4, 0.3, 0.2, 0.1];
  assert.equal(clasificar(E, 0)[0].s, 0);
  assert.equal(clasificar(E, 1)[0].s, 4);
});

test('solo cuentan los que siguen jugando', () => {
  const E = estadoCon({ puntos: [9, 1, 2, 3, 4], jugando: [false, true, true, true, false] });
  assert.deepEqual(clasificar(E, 0).map((x) => x.s), [3, 2, 1]);
});

test('criterioEntre dice que separo al primero del segundo', () => {
  const base = { puntos: 5, fichas: 2, ultimaVictoria: 4, sorteo: 0.1 };
  assert.equal(criterioEntre(base, { ...base, puntos: 4 }), 'puntos');
  assert.equal(criterioEntre(base, { ...base, fichas: 1 }), 'fichas');
  assert.equal(criterioEntre(base, { ...base, ultimaVictoria: 3 }), 'ultima victoria');
  assert.equal(criterioEntre(base, { ...base, sorteo: 0.9 }), 'sorteo');
});

test('lideres: los de mas puntos entre los que siguen; vacio si nadie ha puntuado', () => {
  assert.deepEqual(lideres(estadoCon({ puntos: [0, 0, 0, 0, 0] })), []);
  assert.deepEqual(lideres(estadoCon({ puntos: [3, 7, 7, 1, 0] })), [1, 2]);
  assert.deepEqual(lideres(estadoCon({ puntos: [9, 7, 2, 1, 0], jugando: [false, true, true, true, true] })), [1]);
});
