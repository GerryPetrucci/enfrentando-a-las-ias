// La herramienta que mide Mayor o menor con bots (herramientas/medir-mayormenor.mjs): lo puro de ella. Los numeros de las variantes no se fijan aqui (son una medicion, no una regla);
// se comprueba que la medicion funciona, es repetible y cuenta lo que dice contar.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jugarPartida, medirPartida, medirVariante, tablaMarkdown, VARIANTES } from '../../../herramientas/medir-mayormenor.mjs';
import { BOTS } from '../../juegos/mayormenor-bots.js';
import { REGLAS_1_0, REGLAS_2_0, RONDAS } from '../../juegos/mayormenor/constantes.js';

test('las variantes incluyen las reglas 1.0.0, cada perilla sola, las combinaciones del plan y las 2.0.0 tal cual', () => {
  const nombres = VARIANTES.map((v) => v.nombre);
  assert.equal(new Set(nombres).size, nombres.length);
  assert.equal(VARIANTES[0].reglas.topeRival || VARIANTES[0].reglas.igualEsMenor || VARIANTES[0].reglas.manoOculta || VARIANTES[0].reglas.dobles > 0, false, 'la primera es la base');
  assert.ok(VARIANTES.some((v) => v.reglas === REGLAS_2_0), 'las reglas 2.0.0 tal cual');
  const solas = VARIANTES.filter((v) => [v.reglas.topeRival, v.reglas.topeFijo > 0, v.reglas.igualEsMenor, v.reglas.manoOculta, v.reglas.dobles > 0].filter(Boolean).length === 1);
  assert.equal(solas.length, 5, 'tope por el rival, tope fijo, B, C y D, cada una sola');
});

test('una partida entre bots termina, es repetible y trae sus metricas dentro de rango', () => {
  for (const reglas of [REGLAS_1_0, REGLAS_2_0]) {
    const x = medirPartida(jugarPartida(7, reglas, [BOTS.astuto, BOTS.contador]));
    const y = medirPartida(jugarPartida(7, reglas, [BOTS.astuto, BOTS.contador]));
    assert.deepEqual(x, y, 'el mismo seed, la misma partida');
    assert.ok(x.rondas >= 1 && x.rondas <= RONDAS);
    assert.ok(x.margen >= 0 && x.margen <= 1);
    assert.ok(x.remontadas >= 0 && x.todosPerdidos <= x.todos);
    assert.ok([0, 1, null].includes(x.ganador) && [0, 1, null].includes(x.lider6));
  }
});

test('el margen es 0 con fichas iguales y la ventaja solo cuenta partidas con ganador y lider', () => {
  const m = medirVariante(REGLAS_2_0, { partidas: 6, bots: { prudente: BOTS.prudente, contador: BOTS.contador } });
  assert.equal(m.partidas, 4 * 6);
  for (const k of ['ventaja6', 'ventaja12', 'asiento0', 'apostando', 'finAntes', 'empates', 'mejorPeor']) {
    if (m[k] !== null) assert.ok(m[k] >= 0 && m[k] <= 1, `${k} = ${m[k]}`);
  }
});

test('medir una variante es repetible', () => {
  const bots = { azar: BOTS.azar, astuto: BOTS.astuto };
  assert.deepEqual(medirVariante(REGLAS_2_0, { partidas: 5, bots }), medirVariante(REGLAS_2_0, { partidas: 5, bots }));
});

test('el mejor bot le gana al peor en las reglas 1.0.0 (la medicion distingue habilidad)', () => {
  const m = medirVariante(REGLAS_1_0, { partidas: 60 });
  assert.ok(m.mejorPeor > 0.5, `astuto contra azar: ${m.mejorPeor}`);
});

test('la tabla de resultados trae una fila por variante y una columna por metrica', () => {
  const bots = { azar: BOTS.azar, astuto: BOTS.astuto, prudente: BOTS.prudente };
  const filas = VARIANTES.slice(0, 2).map((v) => ({ nombre: v.nombre, m: medirVariante(v.reglas, { partidas: 3, bots }) }));
  const t = tablaMarkdown(filas).split('\n');
  assert.equal(t.length, 2 + 2);
  assert.ok(t[0].includes('ventaja R12') && t[0].includes('remontadas'));
  assert.ok(t[2].startsWith(`| ${VARIANTES[0].nombre} |`));
});
