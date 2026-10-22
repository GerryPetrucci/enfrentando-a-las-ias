import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearRng } from '../../rng.js';
import { limpiar, parsearOrden, normalizarRespuesta } from '../../juegos/conquista/ordenes.js';

test('limpiar quita acentos, mayusculas y espacios de mas', () => {
  assert.equal(limpiar('  ÁMBAR   rosa '), 'ambar rosa');
});

const CASOS = [
  ['reclutar R03 4', { tipo: 'reclutar', region: 2, pila: [4, 0, 0, 0], n: 4 }], // la forma de 1.x: solo un numero = Lanceros
  ['reclutar R03 L4', { tipo: 'reclutar', region: 2, pila: [4, 0, 0, 0], n: 4 }],
  ['reclutar R03 a3', { tipo: 'reclutar', region: 2, pila: [0, 3, 0, 0], n: 3 }],
  ['Reclutar R03 4 jinetes', { tipo: 'reclutar', region: 2, pila: [0, 0, 4, 0], n: 4 }],
  ['reclutar R03 L 2, A 3', { tipo: 'reclutar', region: 2, pila: [2, 3, 0, 0], n: 5 }],
  ['reclutar R03 2L 3A', { tipo: 'reclutar', region: 2, pila: [2, 3, 0, 0], n: 5 }],
  ['reclutar R03 L4A2', { tipo: 'reclutar', region: 2, pila: [4, 2, 0, 0], n: 6 }],
  ['reclutar R03 ingenio 1', { tipo: 'reclutar', region: 2, pila: [0, 0, 0, 1], n: 1 }],
  ['  Mover r7   R12 5 ', { tipo: 'mover', de: 6, a: 11, pila: [5, 0, 0, 0], n: 5 }],
  ['mover R07 R12 L4 A2', { tipo: 'mover', de: 6, a: 11, pila: [4, 2, 0, 0], n: 6 }],
  ['mover R07 R12 J3', { tipo: 'mover', de: 6, a: 11, pila: [0, 0, 3, 0], n: 3 }],
  ['mover R07 R12 4 lanceros, 2 arqueros', { tipo: 'mover', de: 6, a: 11, pila: [4, 2, 0, 0], n: 6 }],
  ['mover R07 R12 l2 l3', { tipo: 'mover', de: 6, a: 11, pila: [5, 0, 0, 0], n: 5 }], // el mismo tipo dos veces se suma
  ['mover R07 R12 todo', { tipo: 'mover', de: 6, a: 11, todo: true }],
  ['  MOVER r7 r12 Todo ', { tipo: 'mover', de: 6, a: 11, todo: true }],
  ['fortificar R01', { tipo: 'fortificar', region: 0 }],
  ['mejorar L', { tipo: 'mejorar', unidad: 0 }],
  ['Mejorar Jinetes', { tipo: 'mejorar', unidad: 2 }],
  ['mercenarios R10 3', { tipo: 'mercenarios', region: 9, n: 3 }],
  ['regalar oro 5 Violeta', { tipo: 'regalar', recurso: 'Oro', n: 5, reino: 2 }],
  ['ofrecer Ámbar Hierro 4 Madera 4', { tipo: 'ofrecer', reino: 1, doy: 'Hierro', dc: 4, pido: 'Madera', pc: 4 }],
  ['aceptar azur', { tipo: 'aceptar', reino: 0 }],
  ['construir R05 granja', { tipo: 'construir', region: 4, edificio: 'granja' }],
  ['construir R05 Maravilla', { tipo: 'construir', region: 4, edificio: 'maravilla' }],
  ['romper Rosa', { tipo: 'romper', reino: 3 }],
];
for (const [texto, esperado] of CASOS) {
  test(`parsea "${texto}"`, () => {
    const r = parsearOrden(texto);
    assert.equal(r.ok, true, r.motivo);
    assert.deepEqual(r.orden, esperado);
  });
}

const MALAS = ['', 'dormir', 'reclutar', 'reclutar R03', 'reclutar R03 -4', 'reclutar R03 2.5', 'reclutar R00 3', 'mover R01 R02', 'mover R01 R02 todos', 'mover R01 R02 todo 3', 'regalar plata 5 Azur', 'ofrecer Narnia Oro 1 Roca 1', 'construir R05 castillo', 'armar', 'armar 3', 'mejorar', 'mejorar X', 'mejorar L A', 'reclutar R03 L', 'reclutar R03 L0', 'reclutar R03 X4', 'reclutar R03 4 5', 'mover R01 R02 L', 'aceptar'];
for (const texto of MALAS) {
  test(`descarta "${texto}" con un motivo`, () => {
    const r = parsearOrden(texto);
    assert.equal(r.ok, false);
    assert.ok(r.motivo.length > 0);
  });
}

test('normaliza una respuesta completa', () => {
  const n = normalizarRespuesta({
    ordenes: ['reclutar R03 4', 'dormir', 'mover R07 R12 5'], pacto_con: 'Ámbar', mensaje: 'Paz', privados: [{ a: 'Violeta', texto: 'Ataca a Azur' }],
    nota: 'Plan: tomar R12', razon: 'porque si',
  });
  assert.equal(n.invalida, false);
  assert.deepEqual(n.ordenes.map((o) => o.tipo), ['reclutar', 'mover']);
  assert.equal(n.descartadas.length, 1);
  assert.equal(n.descartadas[0].texto, 'dormir');
  assert.equal(n.pactoCon, 1);
  assert.equal(n.mensaje, 'Paz');
  assert.deepEqual(n.privados, [{ a: 2, texto: 'Ataca a Azur' }]);
  assert.equal(n.nota, 'Plan: tomar R12');
});

test('mas de 14 ordenes: se ignoran las sobrantes y quedan anotadas', () => {
  const n = normalizarRespuesta({ ordenes: Array.from({ length: 17 }, () => 'fortificar R01') });
  assert.equal(n.ordenes.length, 14);
  assert.equal(n.descartadas.length, 3);
  assert.match(n.descartadas[0].motivo, /14/);
});

test('ordenes como un solo texto, o con elementos que no son texto', () => {
  assert.equal(normalizarRespuesta({ ordenes: 'fortificar R01' }).ordenes.length, 1);
  const n = normalizarRespuesta({ ordenes: ['fortificar R01', 7, null, { a: 1 }, ['x']] });
  assert.equal(n.ordenes.length, 1);
  assert.equal(n.descartadas.length, 4);
});

test('mensaje, privados y nota se recortan y los privados son maximo 2 a reinos distintos', () => {
  const n = normalizarRespuesta({
    mensaje: 'm'.repeat(500), nota: 'n'.repeat(900), razon: 'r'.repeat(900),
    privados: [{ a: 'azur', texto: 'a'.repeat(300) }, { a: 'AZUR', texto: 'otra vez' }, { a: 'rosa', texto: 'hola' }, { a: 'marfil', texto: 'tercero' }],
  });
  assert.equal(n.mensaje.length, 140);
  assert.equal(n.nota.length, 250);
  assert.equal(n.razon.length, 300);
  assert.equal(n.privados.length, 2);
  assert.deepEqual(n.privados.map((p) => p.a), [0, 3]);
  assert.equal(n.privados[0].texto.length, 140);
  assert.ok(n.descartadas.length >= 2);
});

test('la nota faltante, vacia o presente se distinguen', () => {
  assert.equal(normalizarRespuesta({}).nota, undefined);
  assert.equal(normalizarRespuesta({ nota: 5 }).nota, undefined);
  assert.equal(normalizarRespuesta({ nota: '' }).nota, '');
  assert.equal(normalizarRespuesta({ nota: 'plan' }).nota, 'plan');
});

test('pacto_con: nombre sin acentos, null o desconocido', () => {
  assert.equal(normalizarRespuesta({ pacto_con: 'ROSA' }).pactoCon, 3);
  assert.equal(normalizarRespuesta({ pacto_con: null }).pactoCon, null);
  assert.equal(normalizarRespuesta({ pacto_con: 'null' }).pactoCon, null);
  const n = normalizarRespuesta({ pacto_con: 'Narnia' });
  assert.equal(n.pactoCon, null);
  assert.equal(n.descartadas.length, 1);
});

test('una respuesta que no es un objeto es invalida, con motivo, y no lanza', () => {
  for (const x of [null, undefined, 'hola', 42, true, [1, 2]]) {
    const n = normalizarRespuesta(x);
    assert.equal(n.invalida, true);
    assert.ok(n.motivo);
    assert.deepEqual(n.ordenes, []);
  }
});

function basura(rng, prof = 0) {
  const tipo = (rng() * 10) | 0;
  if (tipo === 0) return null;
  if (tipo === 1) return Math.floor(rng() * 1e6) - 5e5;
  if (tipo === 2) return 'x'.repeat((rng() * 4000) | 0);
  if (tipo === 3) return ['mover R01 R02 3', 'reclutar R99 1', '???', 'Ámbar', 'ofrecer Rosa Oro 99 Roca 1'][(rng() * 5) | 0];
  if (tipo === 4) return rng() < 0.5;
  if (tipo === 5 && prof < 3) return Array.from({ length: (rng() * 30) | 0 }, () => basura(rng, prof + 1));
  if (tipo === 6 && prof < 3) return Object.fromEntries(['ordenes', 'pacto_con', 'mensaje', 'privados', 'nota', 'razon', 'x'].map((c) => [c, basura(rng, prof + 1)]));
  if (tipo === 7) return undefined;
  if (tipo === 8) return { toString() { throw new Error('boom'); } };
  return 'Reclutar R01 1';
}

test('basura aleatoria nunca lanza error y siempre devuelve la misma forma', () => {
  const rng = crearRng(2026);
  for (let i = 0; i < 1500; i++) {
    const n = normalizarRespuesta(basura(rng));
    assert.ok(Array.isArray(n.ordenes) && n.ordenes.length <= 12);
    assert.ok(Array.isArray(n.descartadas));
    assert.ok(n.pactoCon === null || Number.isInteger(n.pactoCon));
    assert.ok(typeof n.mensaje === 'string' && n.mensaje.length <= 140);
    assert.ok(Array.isArray(n.privados) && n.privados.length <= 2);
    assert.ok(n.nota === undefined || (typeof n.nota === 'string' && n.nota.length <= 250));
    assert.ok(typeof n.razon === 'string' && n.razon.length <= 300);
    assert.equal(typeof n.invalida, 'boolean');
    for (const o of n.ordenes) assert.equal(typeof o.texto, 'string');
  }
});
