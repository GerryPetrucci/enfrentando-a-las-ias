// Lo que contesta una IA se convierte en una respuesta tipada y nunca lanza. Aqui solo se mira el formato; si la tarjeta ya se uso o si el dado ya se
// gasto lo decide el turno.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarRespuesta } from '../../juegos/tripledado/ordenes.js';

test('una respuesta de prediccion bien formada', () => {
  assert.deepEqual(normalizarRespuesta({ tarjeta: 'MORE', razon: '  lo\nmas probable ' }), { tarjeta: 'MORE', dados: null, razon: 'lo mas probable', invalida: false, motivo: null });
});

test('una respuesta de enfrentamiento bien formada', () => {
  assert.deepEqual(normalizarRespuesta({ dados: ['b3', 'b7', 'rojo'], razon: 'x' }), { tarjeta: null, dados: ['b3', 'b7', 'rojo'], razon: 'x', invalida: false, motivo: null });
});

test('acepta la tarjeta y los dados con mayusculas o espacios', () => {
  const r = normalizarRespuesta({ tarjeta: ' more ', dados: [' B1 ', 'ROJO', 'Azul'] });
  assert.equal(r.tarjeta, 'MORE');
  assert.deepEqual(r.dados, ['b1', 'rojo', 'azul']);
  assert.equal(r.invalida, false);
});

test('una tarjeta que no existe queda mal formada', () => {
  for (const tarjeta of ['CERO', 'MEDIO', 'MORE.', 7, true, [], {}, '']) {
    const r = normalizarRespuesta({ tarjeta });
    assert.equal(r.tarjeta, null, String(tarjeta));
    assert.match(r.motivo, /tarjeta mal formada/);
  }
});

test('dados mal formados: ids que no existen, repetidos, no es un arreglo, huecos o tipos raros', () => {
  const malos = [['b0', 'b1', 'b2'], ['b10', 'b1', 'b2'], ['b1', 'b1', 'b2'], ['rojo', 'Rojo', 'b1'], 'b1,b2,b3', 'b1', { 0: 'b1' }, [1, 2, 3], [null, 'b1', 'b2'], [['b1'], 'b2', 'b3'],
    new Array(3), ['b1', , 'b2'], Array(12).fill('b1'), ['verde', 'b1', 'b2']];
  for (const dados of malos) {
    const r = normalizarRespuesta({ dados });
    assert.equal(r.dados, null, JSON.stringify(dados));
    assert.match(r.motivo, /dados mal formados/);
  }
});

test('el largo exacto NO se decide aqui: dos o cuatro dados validos pasan el formato (lo rechaza el turno)', () => {
  assert.deepEqual(normalizarRespuesta({ dados: ['b1', 'b2'] }).dados, ['b1', 'b2']);
  assert.deepEqual(normalizarRespuesta({ dados: ['b1', 'b2', 'b3', 'b4'] }).dados, ['b1', 'b2', 'b3', 'b4']);
  assert.deepEqual(normalizarRespuesta({ dados: [] }).dados, []);
});

test('los campos de las dos fases mezclados: cada campo se valida por separado y los motivos se juntan', () => {
  const r = normalizarRespuesta({ tarjeta: 'MAX', dados: ['b1', 'b1', 'b2'] });
  assert.equal(r.tarjeta, 'MAX');
  assert.equal(r.dados, null);
  assert.equal(r.invalida, true);
  assert.equal(r.motivo, 'dados mal formados');
  assert.equal(normalizarRespuesta({ tarjeta: 'nope', dados: ['b0'] }).motivo, 'tarjeta mal formada, dados mal formados');
});

test('nada, texto o basura = sin respuesta legible, y nunca lanza (ni con objetos hostiles)', () => {
  const hostil = { get tarjeta() { throw new Error('boom'); } };
  const hostilDados = { dados: { length: 3, get 0() { throw new Error('boom'); } } };
  for (const basura of [null, undefined, 42, 'texto', [], [1, 2], true, () => {}, hostil, hostilDados]) {
    const r = normalizarRespuesta(basura);
    assert.equal(r.invalida, true);
    assert.ok(r.motivo.length > 0);
    assert.equal(r.tarjeta, null);
  }
  assert.equal(normalizarRespuesta(null).motivo, 'sin respuesta legible');
  assert.equal(normalizarRespuesta(hostil).motivo, 'sin respuesta legible');
});

test('la razon se recorta a una linea de 300 caracteres y solo si es texto', () => {
  assert.equal(normalizarRespuesta({ tarjeta: 'MIN', razon: 'a'.repeat(500) }).razon.length, 300);
  assert.equal(normalizarRespuesta({ tarjeta: 'MIN', razon: 12 }).razon, '');
});
