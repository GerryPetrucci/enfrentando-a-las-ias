// Duda y apuesta: lo que contesta una IA -> una respuesta tipada. normalizar NUNCA lanza.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarRespuesta } from '../../juegos/dudaapuesta/ordenes.js';

test('una respuesta completa y bien formada', () => {
  const r = normalizarRespuesta({ accion: 'aceptar', color: 'azul', cantidad: 7, fichas: 2, espacios: 1, comprar_espacio: true, razon: 'subo' });
  assert.deepEqual({ ...r }, { accion: 'aceptar', color: 'azul', cantidad: 7, fichas: 2, espacios: 1, comprar: true, razon: 'subo', invalida: false, motivo: null, malos: [] });
});

test('acepta mayusculas, acentos, espacios y numeros como texto', () => {
  const r = normalizarRespuesta({ accion: '  Retírarse ', color: ' ROJO', cantidad: ' 12 ', fichas: '2', espacios: '0', comprar_espacio: 'true' });
  assert.equal(r.accion, 'retirarse');
  assert.equal(r.color, 'rojo');
  assert.equal(r.cantidad, 12);
  assert.equal(r.fichas, 2);
  assert.equal(r.espacios, 0);
  assert.equal(r.comprar, true);
  assert.equal(r.invalida, false);
});

test('los campos ausentes quedan en null (no son invalidos aqui: turno.js decide si hacen falta)', () => {
  const r = normalizarRespuesta({ accion: 'dudar' });
  assert.deepEqual([r.color, r.cantidad, r.fichas, r.espacios, r.comprar, r.invalida], [null, null, null, null, false, false]);
});

test('lo mal formado se marca campo por campo', () => {
  const casos = [
    [{ accion: 'gritar' }, 'accion', 'accion mal formada'],
    [{ accion: 7 }, 'accion', 'accion mal formada'],
    [{ color: 'arcoiris' }, 'color', 'color mal formado'],
    [{ color: 'violeta' }, 'color', 'color mal formado'],
    [{ cantidad: 0 }, 'cantidad', 'cantidad mal formada'],
    [{ cantidad: -3 }, 'cantidad', 'cantidad mal formada'],
    [{ cantidad: 2.5 }, 'cantidad', 'cantidad mal formada'],
    [{ cantidad: 'muchas' }, 'cantidad', 'cantidad mal formada'],
    [{ cantidad: Infinity }, 'cantidad', 'cantidad mal formada'],
    [{ cantidad: NaN }, 'cantidad', 'cantidad mal formada'],
    [{ fichas: -1 }, 'fichas', 'fichas mal formadas'],
    [{ fichas: 'dos' }, 'fichas', 'fichas mal formadas'],
    [{ espacios: 1.5 }, 'espacios', 'espacios mal formados'],
    [{ comprar_espacio: 'quizas' }, 'comprar_espacio', 'comprar_espacio mal formado'],
    [{ comprar_espacio: 1 }, 'comprar_espacio', 'comprar_espacio mal formado'],
  ];
  for (const [entrada, campo, motivo] of casos) {
    const r = normalizarRespuesta(entrada);
    assert.equal(r.invalida, true, JSON.stringify(entrada));
    assert.deepEqual(r.malos, [campo]);
    assert.equal(r.motivo, motivo);
  }
});

test('nunca lanza: null, texto, arreglos, numeros, objetos hostiles y proxies revocados', () => {
  for (const basura of [null, undefined, 'hola', 42, true, [], [1, 2], () => {}, Symbol('x')]) {
    const r = normalizarRespuesta(basura);
    assert.equal(r.invalida, true);
    assert.equal(r.motivo, 'sin respuesta legible');
    assert.deepEqual([r.accion, r.color, r.cantidad], [null, null, null]);
  }
  const hostil = { get accion() { throw new Error('boom'); } };
  assert.equal(normalizarRespuesta(hostil).motivo, 'sin respuesta legible');
  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  assert.equal(normalizarRespuesta(proxy).motivo, 'sin respuesta legible');
});

test('la razon es texto de una sola linea, recortada a 300 caracteres', () => {
  assert.equal(normalizarRespuesta({ razon: 'a\nb\r\n  c' }).razon, 'a b c');
  assert.equal(normalizarRespuesta({ razon: 'x'.repeat(1000) }).razon.length, 300);
  assert.equal(normalizarRespuesta({ razon: 5 }).razon, '');
});
