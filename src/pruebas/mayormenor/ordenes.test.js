// Lo que contesta una IA se convierte en una respuesta tipada y nunca lanza. Aqui solo se mira el formato; si la carta esta en la mano o si la apuesta
// cabe en las fichas lo decide el turno.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarRespuesta } from '../../juegos/mayormenor/ordenes.js';

test('una respuesta del activo bien formada', () => {
  assert.deepEqual(normalizarRespuesta({ carta: 7, razon: '  porque\nsi ' }), { carta: 7, lado: null, fichas: null, razon: 'porque si', invalida: false, motivo: null });
});

test('una respuesta del predictor bien formada', () => {
  assert.deepEqual(normalizarRespuesta({ lado: 'mayor', fichas: 3, razon: 'x' }), { carta: null, lado: 'mayor', fichas: 3, razon: 'x', invalida: false, motivo: null });
});

test('acepta numeros como texto y el lado con mayusculas o espacios', () => {
  const r = normalizarRespuesta({ carta: '10', lado: '  MENOR ', fichas: ' 4 ' });
  assert.equal(r.carta, 10);
  assert.equal(r.lado, 'menor');
  assert.equal(r.fichas, 4);
  assert.equal(r.invalida, false);
  assert.equal(normalizarRespuesta({ carta: 0 }).carta, 0, 'el 0 es una carta valida');
  assert.equal(normalizarRespuesta({ carta: 10.0 }).carta, 10);
});

test('la carta fuera de 0 a 10, decimal o rara queda mal formada', () => {
  for (const carta of [11, -1, 3.5, '3.5', 'tres', [3], {}, true]) {
    const r = normalizarRespuesta({ carta });
    assert.equal(r.carta, null, String(carta));
    assert.equal(r.invalida, true);
    assert.match(r.motivo, /carta mal formada/);
  }
});

test('el lado que no es mayor ni menor queda mal formado', () => {
  for (const lado of ['igual', 'mayor.', 'big', 3, true, [], '']) {
    const r = normalizarRespuesta({ lado, fichas: 1 });
    assert.equal(r.lado, null, String(lado));
    assert.match(r.motivo, /lado mal formado/);
  }
});

test('la apuesta: entera y de 1 en adelante; 0, decimal, negativa o texto raro es mal formada; lo enorme se acepta', () => {
  for (const fichas of [0, -2, 3.5, '3.0', '3,5', '-2', 'tres', Infinity, NaN, '9'.repeat(400), [3], {}]) {
    const r = normalizarRespuesta({ lado: 'mayor', fichas });
    assert.equal(r.fichas, null, String(fichas).slice(0, 20));
    assert.match(r.motivo, /fichas mal formadas/);
  }
  assert.equal(normalizarRespuesta({ lado: 'mayor', fichas: 1e9 }).fichas, 1e9, 'pedir de mas se limita despues, en el turno');
  assert.equal(normalizarRespuesta({ lado: 'mayor', fichas: '12' }).fichas, 12);
});

test('un campo mal formado no borra los demas y los motivos se juntan', () => {
  const r = normalizarRespuesta({ carta: 99, lado: 'mayor', fichas: 0 });
  assert.equal(r.lado, 'mayor');
  assert.equal(r.invalida, true);
  assert.equal(r.motivo, 'carta mal formada, fichas mal formadas');
});

test('nada, texto o basura = sin respuesta legible, y nunca lanza (ni con objetos hostiles)', () => {
  const hostil = { get carta() { throw new Error('boom'); } };
  for (const basura of [null, undefined, 42, 'texto', [], [1, 2], true, () => {}, hostil]) {
    const r = normalizarRespuesta(basura);
    assert.equal(r.invalida, true);
    assert.equal(r.motivo, 'sin respuesta legible');
    assert.deepEqual([r.carta, r.lado, r.fichas, r.razon], [null, null, null, '']);
  }
});

test('la razon se recorta a una linea de 300 caracteres y solo si es texto', () => {
  assert.equal(normalizarRespuesta({ carta: 1, razon: 'a'.repeat(500) }).razon.length, 300);
  assert.equal(normalizarRespuesta({ carta: 1, razon: 12 }).razon, '');
});
