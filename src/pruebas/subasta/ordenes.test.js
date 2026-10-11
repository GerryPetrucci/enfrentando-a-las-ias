// Lo que contesta una IA -> una respuesta tipada. Nunca lanza error. Cuanto puede apostar de verdad lo decide el turno, que conoce el banco.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarRespuesta } from '../../juegos/subasta/ordenes.js';

test('una apuesta valida se lee en segundos, sin marcar como invalida', () => {
  assert.deepEqual(normalizarRespuesta({ apuesta: 12.5, razon: 'x' }), { apuesta: 12.5, razon: 'x', invalida: false, motivo: null });
  assert.equal(normalizarRespuesta({ apuesta: 0 }).apuesta, 0);
  assert.equal(normalizarRespuesta({ apuesta: 0 }).invalida, false);
  assert.equal(normalizarRespuesta({ apuesta: 1e9 }).invalida, false, 'pedir de mas no es un error: el turno lo limita al banco');
});

test('numeros en texto valen, con punto o con coma decimal', () => {
  assert.equal(normalizarRespuesta({ apuesta: '30' }).apuesta, 30);
  assert.equal(normalizarRespuesta({ apuesta: ' 12.5 ' }).apuesta, 12.5);
  assert.equal(normalizarRespuesta({ apuesta: '12,5' }).apuesta, 12.5);
});

test('una apuesta mal formada queda en null y se marca invalida con su motivo', () => {
  for (const apuesta of [-1, -0.1, NaN, Infinity, -Infinity, 'mucho', '', '12 segundos', '1e3', [5], {}, true, false]) {
    const r = normalizarRespuesta({ apuesta });
    assert.equal(r.apuesta, null, JSON.stringify(apuesta));
    assert.equal(r.invalida, true, JSON.stringify(apuesta));
    assert.equal(r.motivo, 'apuesta mal formada', JSON.stringify(apuesta));
  }
});

test('sin el campo apuesta es una respuesta incompleta', () => {
  for (const r of [{}, { apuesta: null }, { razon: 'solo razon' }]) {
    const n = normalizarRespuesta(r);
    assert.equal(n.apuesta, null);
    assert.equal(n.invalida, true);
    assert.equal(n.motivo, 'sin apuesta');
  }
});

test('lo que no es un objeto es una respuesta ilegible, nunca lanza', () => {
  const basura = [null, undefined, 5, 'hola', true, [], [1, 2], () => 1, Symbol('x')];
  for (const b of basura) {
    const r = normalizarRespuesta(b);
    assert.equal(r.apuesta, null);
    assert.equal(r.invalida, true);
    assert.equal(r.motivo, 'sin respuesta legible');
  }
});

test('objetos hostiles no tumban la normalizacion', () => {
  assert.equal(normalizarRespuesta(Object.create(null)).motivo, 'sin apuesta');
  const hostil = { get apuesta() { throw new Error('boom'); } };
  assert.equal(normalizarRespuesta(hostil).motivo, 'sin respuesta legible');
  const raro = { apuesta: { valueOf() { throw new Error('x'); } } };
  assert.equal(normalizarRespuesta(raro).invalida, true);
});

test('la razon es una sola linea de texto, de hasta 300 caracteres', () => {
  assert.equal(normalizarRespuesta({ apuesta: 1, razon: 'a\nb\r\n  c\t d' }).razon, 'a b c d');
  assert.equal(normalizarRespuesta({ apuesta: 1, razon: 'x'.repeat(500) }).razon.length, 300);
  assert.equal(normalizarRespuesta({ apuesta: 1, razon: 42 }).razon, '');
});
