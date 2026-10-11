// Lo que contesta una IA -> una respuesta tipada. Nunca lanza error. La legalidad la decide el turno, que conoce el estado.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarRespuesta } from '../../juegos/solitario/ordenes.js';

test('una pareja valida sale ordenada y sin marcar como invalida', () => {
  assert.deepEqual(normalizarRespuesta({ cartas: [5, 2], razon: 'x' }), { cartas: [2, 5], juega: null, razon: 'x', invalida: false, motivo: null });
});

test('una marca valida se lee sola; numeros en texto tambien valen', () => {
  assert.deepEqual(normalizarRespuesta({ juega: 4 }), { cartas: null, juega: 4, razon: '', invalida: false, motivo: null });
  assert.deepEqual(normalizarRespuesta({ cartas: ['3', ' 6 '], juega: '3' }).cartas, [3, 6]);
  assert.equal(normalizarRespuesta({ juega: '7' }).juega, 7);
});

test('una pareja mal formada queda en null y se marca invalida con su motivo', () => {
  const malas = [[1, 1], [1], [1, 2, 3], [0, 2], [1, 9], ['a', 2], [1.5, 2], 'uno y dos', '1,2', 5, true, {}];
  for (const cartas of malas) {
    const r = normalizarRespuesta({ cartas });
    assert.equal(r.cartas, null, JSON.stringify(cartas));
    assert.equal(r.invalida, true, JSON.stringify(cartas));
    assert.equal(r.motivo, 'cartas mal formadas');
  }
});

test('una marca mal formada queda en null y se marca invalida', () => {
  for (const juega of [0, 9, -1, 2.5, 'x', '', [3], {}, true]) {
    const r = normalizarRespuesta({ juega });
    assert.equal(r.juega, null, JSON.stringify(juega));
    assert.equal(r.invalida, true, JSON.stringify(juega));
    assert.equal(r.motivo, 'juega mal formada');
  }
});

test('un campo ausente o null no marca invalida: de eso se encarga el turno segun la fase', () => {
  for (const r of [{}, { cartas: null }, { juega: null }, { razon: 'solo razon' }]) {
    const n = normalizarRespuesta(r);
    assert.equal(n.invalida, false);
    assert.equal(n.cartas, null);
    assert.equal(n.juega, null);
  }
});

test('lo que no es un objeto es una respuesta ilegible, nunca lanza', () => {
  const basura = [null, undefined, 5, 'hola', true, [], [1, 2], () => 1, Symbol('x')];
  for (const b of basura) {
    const r = normalizarRespuesta(b);
    assert.equal(r.cartas, null);
    assert.equal(r.juega, null);
    assert.equal(r.invalida, true);
    assert.equal(r.motivo, 'sin respuesta legible');
  }
});

test('objetos hostiles no tumban la normalizacion', () => {
  assert.equal(normalizarRespuesta(Object.create(null)).invalida, false);
  const hostil = { get cartas() { throw new Error('boom'); } };
  const r = normalizarRespuesta(hostil);
  assert.equal(r.invalida, true);
  assert.equal(r.motivo, 'sin respuesta legible');
  const raro = { cartas: [{ valueOf() { throw new Error('x'); } }, 2] };
  assert.equal(normalizarRespuesta(raro).invalida, true);
});

test('la razon es una sola linea de texto, de hasta 300 caracteres', () => {
  assert.equal(normalizarRespuesta({ razon: 'a\nb\r\n  c\t d' }).razon, 'a b c d');
  assert.equal(normalizarRespuesta({ razon: 'x'.repeat(500) }).razon.length, 300);
  assert.equal(normalizarRespuesta({ razon: 42 }).razon, '');
  assert.equal(normalizarRespuesta({ razon: { a: 1 } }).razon, '');
});

test('si vienen mal las dos cosas, se anotan las dos', () => {
  const r = normalizarRespuesta({ cartas: [1, 1], juega: 99 });
  assert.equal(r.invalida, true);
  assert.equal(r.motivo, 'cartas mal formadas, juega mal formada');
});
