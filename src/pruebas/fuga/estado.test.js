// El estado inicial de La Fuga sale del seed: situaciones, dados y semilla de la narracion. Mismo seed = misma partida.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearRng } from '../../rng.js';
import { crearEstado } from '../../juegos/fuga/estado.js';
import { porId } from '../../juegos/fuga/catalogo.js';
import { FASES, K, RONDAS, PISTA_FIABLE, PUNTOS, METODOS_DE_SITUACION } from '../../juegos/fuga/constantes.js';

const estado = (seed) => crearEstado(crearRng(seed));

test('crea 9 situaciones, 3 por fase y en orden de fase, sin repetir', () => {
  const E = estado(7);
  assert.equal(E.situaciones.length, RONDAS);
  assert.deepEqual(E.situaciones.map((s) => s.fase), ['interior', 'interior', 'interior', 'patio', 'patio', 'patio', 'perimetro', 'perimetro', 'perimetro']);
  assert.equal(new Set(E.situaciones.map((s) => s.id)).size, 9);
  for (const s of E.situaciones) assert.equal(porId.get(s.id).fase, s.fase);
});

test('el mismo seed da el mismo estado y otro seed da otro', () => {
  assert.deepEqual(estado(7), estado(7));
  assert.notDeepEqual(estado(7), estado(8));
});

test('cada situacion trae un peligro dentro del rango de su fase y los ajustes correctos', () => {
  for (let seed = 1; seed <= 50; seed++) {
    for (const s of estado(seed).situaciones) {
      const [min, max] = FASES.find((f) => f.id === s.fase).peligro;
      assert.ok(s.peligro >= min && s.peligro <= max, `${s.id}: ${s.peligro}`);
      const def = porId.get(s.id);
      const normal = METODOS_DE_SITUACION.find((m) => m !== def.mejor && m !== def.malo);
      assert.equal(s.ajuste[def.mejor], K.ajusteMejor);
      assert.equal(s.ajuste[def.malo], K.ajusteMalo);
      assert.equal(s.ajuste[normal], K.ajusteNormal);
      assert.equal(s.ajuste.esperar, K.esperar);
    }
  }
});

test('la pista apunta al metodo mejor el 70 % de las veces, y si no, a otro metodo de la situacion', () => {
  let fiables = 0, total = 0;
  for (let seed = 1; seed <= 300; seed++) {
    for (const s of estado(seed).situaciones) {
      const def = porId.get(s.id);
      total++;
      assert.ok(METODOS_DE_SITUACION.includes(s.apuntaA), s.id);
      if (s.pistaFiable) {
        fiables++;
        assert.equal(s.apuntaA, def.mejor, s.id);
      } else {
        assert.notEqual(s.apuntaA, def.mejor, s.id);
      }
    }
  }
  assert.ok(Math.abs(fiables / total - PISTA_FIABLE) < 0.04, `pistas fiables: ${fiables / total}`);
});

test('los dados estan sorteados de antemano: dos por situacion, entre 0 y 1, y hay una semilla de narracion', () => {
  const E = estado(7);
  assert.equal(E.dados.length, RONDAS);
  assert.equal(E.salidas.length, RONDAS, 'un dado de salida anticipada por asiento y situacion');
  assert.equal(E.botinSolo.length, RONDAS, 'dos numeros por situacion: si aparece el botin en solitario y cual objeto');
  for (const par of [...E.dados, ...E.salidas, ...E.botinSolo]) {
    assert.equal(par.length, 2);
    for (const d of par) assert.ok(d >= 0 && d < 1);
  }
  assert.ok(Number.isInteger(E.semillaNarracion) && E.semillaNarracion >= 0 && E.semillaNarracion < 2 ** 32);
});

test('la tentacion aparece en cerca del 40 % de las situaciones, con su tipo y su valor', () => {
  let con = 0, total = 0;
  for (let seed = 1; seed <= 300; seed++) {
    for (const s of estado(seed).situaciones) {
      total++;
      if (!s.tentacion) continue;
      con++;
      const def = porId.get(s.id);
      assert.equal(s.tentacion.tipo, def.tentacion.tipo, s.id);
      assert.equal(s.tentacion.valor, s.tentacion.tipo === 'botin' ? PUNTOS.botin : PUNTOS.delacion);
    }
  }
  assert.ok(con / total > 0.35 && con / total < 0.47, `con tentacion: ${con / total}`);
});

test('el estado inicial es neutro', () => {
  const E = estado(7);
  assert.equal(E.ronda, 0);
  assert.equal(E.fin, false);
  assert.deepEqual(E.finales, [null, null]);
  assert.deepEqual(E.perdidos, [0, 0]);
  assert.deepEqual(E.libres, [true, true]);
  assert.deepEqual(E.salio, [false, false], 'nadie ha escapado por su cuenta todavia');
  assert.deepEqual(E.heridas, [0, 0]);
  assert.deepEqual(E.puntos, [0, 0]);
  assert.deepEqual(E.objeto, [null, null]);
  assert.equal(E.alarma, 0);
  assert.equal(E.cohesion, 0);
  assert.deepEqual(E.promesas, [null, null]);
  assert.deepEqual(E.mensajes, [null, null]);
  assert.deepEqual(E.historial, []);
  const cero = { ayudas: 0, sacrificios: 0, separaciones: 0, botines: 0, delaciones: 0, promesasHechas: 0, promesasRotas: 0, invalidas: 0 };
  assert.deepEqual(E.stats, [cero, cero]);
});
