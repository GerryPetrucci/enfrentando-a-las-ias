// El catalogo de situaciones de La Fuga: 24 situaciones, 8 por fase. Lo que ven las IAs va sin acentos (es parte del prompt).
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGO, porId } from '../../juegos/fuga/catalogo.js';
import { FASES, METODOS_DE_SITUACION, K } from '../../juegos/fuga/constantes.js';

const ASCII = /^[\x00-\x7F]*$/;

test('el catalogo tiene 24 situaciones, 8 por fase, con ids unicos', () => {
  assert.equal(CATALOGO.length, 24);
  for (const f of FASES) assert.equal(CATALOGO.filter((s) => s.fase === f.id).length, 8, f.id);
  assert.equal(new Set(CATALOGO.map((s) => s.id)).size, 24);
  assert.equal(porId.get('celda').titulo, 'La cerradura de la celda');
});

test('cada situacion tiene un metodo mejor y uno malo distintos, y una pista para cada metodo', () => {
  for (const s of CATALOGO) {
    assert.ok(METODOS_DE_SITUACION.includes(s.mejor), s.id);
    assert.ok(METODOS_DE_SITUACION.includes(s.malo), s.id);
    assert.notEqual(s.mejor, s.malo, s.id);
    for (const m of METODOS_DE_SITUACION) assert.ok(typeof s.pistas[m] === 'string' && s.pistas[m].length > 10, `${s.id}.${m}`);
  }
});

test('los textos que ven las IAs no tienen acentos ni caracteres no ASCII', () => {
  for (const s of CATALOGO) {
    const textos = [s.corto, s.descripcion, ...Object.values(s.pistas), s.tentacion?.objeto, s.tentacion?.texto].filter((t) => t !== undefined);
    for (const t of textos) assert.match(t, ASCII, `${s.id}: ${t}`);
  }
});

test('cada situacion tiene 3 aperturas, y 18 de las 24 pueden traer tentacion', () => {
  for (const s of CATALOGO) {
    assert.equal(s.aperturas.length, 3, s.id);
    for (const a of s.aperturas) assert.ok(a.length > 15, `${s.id}: ${a}`);
    assert.ok(s.titulo.length > 3, s.id);
  }
  const con = CATALOGO.filter((s) => s.tentacion);
  assert.equal(con.length, 18);
  for (const s of con) {
    if (s.tentacion.tipo === 'botin') assert.ok(s.tentacion.objeto, s.id);
    else {
      assert.equal(s.tentacion.tipo, 'oferta', s.id);
      assert.ok(s.tentacion.texto, s.id);
    }
  }
});

test('en cada fase el metodo mejor varia: ningun metodo es siempre el bueno', () => {
  for (const f of FASES) {
    const mejores = new Set(CATALOGO.filter((s) => s.fase === f.id).map((s) => s.mejor));
    assert.equal(mejores.size, 3, f.id);
  }
});

test('los multiplicadores de metodo van de mejor a malo, y las fases suben de peligro', () => {
  assert.ok(K.ajusteMejor < K.esperar && K.esperar < K.ajusteNormal && K.ajusteNormal < K.ajusteMalo);
  for (let i = 1; i < FASES.length; i++) {
    assert.ok(FASES[i].peligro[0] >= FASES[i - 1].peligro[0]);
    assert.ok(FASES[i].peligro[1] >= FASES[i - 1].peligro[1]);
  }
});
