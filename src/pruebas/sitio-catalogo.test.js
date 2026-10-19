// El buscador del sitio (web/catalogo.js): filtrar series por juego, seed, IA y estado, y llevar los filtros en la URL.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESTADOS, fechaLarga, normalizarSeed, seedsDe, filtrarSeries, leerFiltros, textoDeFiltros, juegosDe, iasDe, resumenDeSerie } from '../../web/catalogo.js';

const ia = (id, nombre = id.toUpperCase()) => ({ id, nombre });
const serie = (etiqueta, juego, seedBase, estado, ids, detalle = []) => ({ etiqueta, juego: { id: juego, nombre: `Juego ${juego}` }, seedBase, estado, jugadores: ids.map((i) => ia(i)), detalle });
const A = serie('a', 'conquista', 552912962, 'por-publicarse', ['claude', 'gpt'], [{ n: 1, seed: 552912962, estado: 'por-publicarse', hastaTurno: 8 }, { n: 2, seed: 552912962, estado: 'por-publicarse', hastaTurno: 0 }]);
const B = serie('b', 'mayormenor', 2991144164, 'publicada', ['claude', 'gemini'], [{ n: 1, seed: 2991144164, estado: 'publicada', ganador: 'GPT' }, { n: 2, seed: 77, estado: 'publicada', ganador: null }]);
const C = serie('c', 'conquista', 4058512413, 'publicada', ['deepseek', 'gpt']);
const todas = [A, B, C];

test('los seeds se comparan por sus digitos: con espacios, guiones o pegados es el mismo', () => {
  assert.equal(normalizarSeed('552 912 962'), '552912962');
  assert.equal(normalizarSeed('seed: 552-912-962'), '552912962');
  assert.equal(normalizarSeed(552912962), '552912962');
  for (const raro of [null, undefined, '', 'abc', {}, []]) assert.equal(normalizarSeed(raro), '');
  assert.deepEqual(seedsDe(B), ['2991144164', '77']);
  assert.deepEqual(seedsDe(A), ['552912962'], 'sin repetidos');
  assert.deepEqual(seedsDe(null), []);
});

test('filtrar por juego, por IA, por estado y por seed, solos o combinados', () => {
  assert.deepEqual(filtrarSeries(todas, {}).map((e) => e.etiqueta), ['a', 'b', 'c'], 'sin filtros salen todas');
  assert.deepEqual(filtrarSeries(todas, { juego: 'conquista' }).map((e) => e.etiqueta), ['a', 'c']);
  assert.deepEqual(filtrarSeries(todas, { ia: 'gpt' }).map((e) => e.etiqueta), ['a', 'c']);
  assert.deepEqual(filtrarSeries(todas, { estado: 'publicada' }).map((e) => e.etiqueta), ['b', 'c']);
  assert.deepEqual(filtrarSeries(todas, { juego: 'conquista', ia: 'gpt', estado: 'por-publicarse' }).map((e) => e.etiqueta), ['a']);
  assert.deepEqual(filtrarSeries(todas, { juego: 'fuga' }), []);
});

test('el seed encuentra la serie con el seed completo, con una parte (3 o mas digitos), con el de una partida, y sin formato', () => {
  assert.deepEqual(filtrarSeries(todas, { seed: '552912962' }).map((e) => e.etiqueta), ['a']);
  assert.deepEqual(filtrarSeries(todas, { seed: '552 912 962' }).map((e) => e.etiqueta), ['a']);
  assert.deepEqual(filtrarSeries(todas, { seed: '5529' }).map((e) => e.etiqueta), ['a']);
  assert.deepEqual(filtrarSeries(todas, { seed: '912' }).map((e) => e.etiqueta), ['a'], 'una parte en medio');
  assert.deepEqual(filtrarSeries(todas, { seed: '77' }).map((e) => e.etiqueta), ['b'], 'el seed de una partida, entero, aunque sea corto');
  assert.deepEqual(filtrarSeries(todas, { seed: '7' }), [], 'un digito suelto no es un seed (solo coincide si es el seed entero)');
  assert.deepEqual(filtrarSeries(todas, { seed: '99999' }), []);
  assert.deepEqual(filtrarSeries(todas, { seed: 'sin digitos' }).map((e) => e.etiqueta), ['a', 'b', 'c'], 'un texto sin digitos no filtra');
  assert.deepEqual(filtrarSeries(todas, { seed: '552912962', juego: 'mayormenor' }), [], 'combinado con otro filtro que no cuadra');
});

test('con datos raros el buscador no lanza y no inventa resultados', () => {
  for (const mala of [null, undefined, 'x', {}, [null, 5, 'a', {}]]) assert.doesNotThrow(() => filtrarSeries(mala, { seed: '123', ia: 'x', juego: 'y' }));
  assert.deepEqual(filtrarSeries([null, 5, 'a', {}], { juego: 'conquista' }), []);
  assert.deepEqual(filtrarSeries(todas, null).length, 3);
  assert.deepEqual(filtrarSeries(todas, undefined).length, 3);
});

test('los filtros viajan en la URL y se leen de ella, ignorando lo que no es valido', () => {
  assert.deepEqual(leerFiltros('?juego=conquista&seed=552912962&ia=gpt&estado=por-publicarse'), { juego: 'conquista', seed: '552912962', ia: 'gpt', estado: 'por-publicarse' });
  assert.deepEqual(leerFiltros(''), { juego: '', seed: '', ia: '', estado: '' });
  assert.deepEqual(leerFiltros(undefined), { juego: '', seed: '', ia: '', estado: '' });
  assert.equal(leerFiltros('?estado=inventado').estado, '', 'un estado que no existe se ignora');
  assert.equal(textoDeFiltros({ juego: 'conquista', seed: ' 552912962 ', ia: '', estado: '' }), '?juego=conquista&seed=552912962');
  assert.equal(textoDeFiltros({}), '');
  assert.equal(textoDeFiltros(null), '');
  const f = { juego: 'conquista', seed: '123', ia: 'gpt', estado: 'publicada' };
  assert.deepEqual(leerFiltros(textoDeFiltros(f)), f, 'ida y vuelta');
  assert.deepEqual(Object.keys(ESTADOS), ['por-publicarse', 'publicada']);
});

test('los selectores salen de las series: juegos y IAs, sin repetir y ordenados por nombre', () => {
  assert.deepEqual(juegosDe(todas), [{ id: 'conquista', nombre: 'Juego conquista' }, { id: 'mayormenor', nombre: 'Juego mayormenor' }]);
  assert.deepEqual(iasDe(todas).map((j) => j.id), ['claude', 'deepseek', 'gemini', 'gpt']);
  assert.deepEqual(juegosDe(null), []);
  assert.deepEqual(iasDe([{ jugadores: [null, { nombre: 'sin id' }] }]), []);
});

test('la fecha larga no se corre un dia por la zona horaria', () => {
  assert.equal(fechaLarga('2026-10-19'), '19 de octubre de 2026');
  assert.equal(fechaLarga('2026-10-19T23:30:00.000Z'), '19 de octubre de 2026');
  assert.equal(fechaLarga('nada'), '');
  assert.equal(fechaLarga(undefined), '');
});

test('la linea de resultado dice ganadores de lo publicado y hasta donde se ha subido de lo que no', () => {
  assert.equal(resumenDeSerie(A), 'Partida 1: por publicarse (se ha subido hasta el turno 8) · Partida 2: por publicarse');
  assert.equal(resumenDeSerie(B), 'Partida 1: ganó GPT · Partida 2: empate');
  assert.equal(resumenDeSerie(C), '');
  assert.equal(resumenDeSerie(null), '');
});
