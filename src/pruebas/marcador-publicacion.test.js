// El marcador con la politica de publicacion: una tabla POR JUEGO, solo con partidas publicadas; lo que esta por publicarse aparece en la lista con su seed y hasta donde se subio, sin resultados.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { armarMarcador } from '../marcador.js';

const jug = (id, nombre = id.toUpperCase()) => ({ id, nombre, color: '#111', inicial: nombre[0], tipo: 'modelo', modelo: `x/${id}` });
const completa = (seed, puntos, ganador, extra = {}) => ({ seed, jugadores: [jug('a'), jug('b')], puntos, ganador, empate: false, turnos: 12, rondas: [{ turno: 1 }], estadoPublicacion: 'publicada', metricas: [{}, {}], ...extra });
const parcial = (seed, hasta) => ({ seed, jugadores: [jug('a'), jug('b')], rondas: Array.from({ length: hasta }, (_, i) => ({ turno: i + 1 })), truncada: true, parcial: { hastaTurno: hasta }, estadoPublicacion: 'por-publicarse' });
const serie = (etiqueta, juegoId, partidas, extra = {}) => ({ etiqueta, fecha: '2026-10-19T10:00:00.000Z', seedBase: 5, juego: { id: juegoId, nombre: `Juego ${juegoId}`, categoria: 'Cat' }, modo: 'pago', prompt: { reglas: `${juegoId}-1.0.0`, sistema: 'TEXTO DEL SISTEMA' }, serie: { partidas: partidas.length }, partidas, ...extra });
const leido = (ep, archivo = `${ep.etiqueta}.json`) => ({ archivo, ep });

test('una serie a medias: solo cuentan las partidas publicadas y la otra aparece por publicarse con su seed y hasta donde se subio', () => {
  const ep = serie('s1', 'conquista', [completa(11, [5, 0], 0), parcial(22, 8)], { evaluacion: { partidas: 2 } });
  const m = armarMarcador([leido(ep)], 'ahora');
  const tabla = m.juegos[0].tabla;
  assert.equal(tabla.find((f) => f.id === 'a').partidas, 1, 'solo la publicada');
  assert.equal(tabla.find((f) => f.id === 'a').puntos, 5);
  const e = m.episodios[0];
  assert.equal(e.estado, 'por-publicarse');
  assert.equal(e.evaluacion, null, 'la evaluacion de la serie espera a que todo este publicado');
  assert.deepEqual(e.detalle[0], { n: 1, seed: 11, estado: 'publicada', hastaTurno: null, turnos: 12, asientos: ['a', 'b'], ganador: 'A', puntos: [5, 0], ganoPorMaravilla: false });
  assert.deepEqual(e.detalle[1], { n: 2, seed: 22, estado: 'por-publicarse', hastaTurno: 8, turnos: null, asientos: ['a', 'b'], ganador: null, puntos: null, ganoPorMaravilla: null });
  assert.deepEqual(e.jugadores.map((j) => j.id), ['a', 'b']);
  assert.equal(e.versionReglas, 'conquista-1.0.0');
  assert.equal(e.modo, 'pago');
});

test('una serie toda por publicarse no mete nada en las tablas, pero el juego y la serie salen en la lista', () => {
  const m = armarMarcador([leido(serie('s2', 'fuga', [parcial(7, 3), parcial(8, 0)]))]);
  assert.deepEqual(m.categorias, [], 'ninguna categoria con resultados');
  assert.equal(m.juegos.length, 1);
  assert.deepEqual(m.juegos[0].tabla, []);
  assert.equal(m.episodios[0].estado, 'por-publicarse');
  assert.deepEqual(m.episodios[0].detalle.map((d) => [d.seed, d.hastaTurno]), [[7, 3], [8, 0]]);
});

test('con todas las partidas publicadas la serie se publica y trae su evaluacion', () => {
  const ep = serie('s3', 'conquista', [completa(1, [5, 0], 0), completa(2, [0, 5], 1)], { evaluacion: { partidas: 2, comentario: [] } });
  const e = armarMarcador([leido(ep)]).episodios[0];
  assert.equal(e.estado, 'publicada');
  assert.deepEqual(e.evaluacion, { partidas: 2, comentario: [] });
});

test('cada juego es independiente: la misma IA tiene una fila en cada juego y no se suman entre juegos', () => {
  const m = armarMarcador([leido(serie('x', 'uno', [completa(1, [5, 0], 0)])), leido(serie('y', 'dos', [completa(2, [0, 5], 1), completa(3, [0, 5], 1)]))]);
  assert.deepEqual(m.juegos.map((j) => j.id).sort(), ['dos', 'uno']);
  const fila = (juego, id) => m.juegos.find((j) => j.id === juego).tabla.find((f) => f.id === id);
  assert.equal(fila('uno', 'a').puntos, 5);
  assert.equal(fila('dos', 'a').puntos, 0);
  assert.equal(fila('dos', 'b').partidas, 2);
  assert.equal(m.juegos.find((j) => j.id === 'dos').versionReglas, 'dos-1.0.0');
  assert.equal(m.juegos.find((j) => j.id === 'dos').sistema, 'TEXTO DEL SISTEMA');
});

test('un archivo viejo, sin estado de publicacion, cuenta como publicado; una partida sin puntos legibles no cuenta ni rompe', () => {
  const vieja = { jugadores: [jug('a'), jug('b')], puntos: [3, 1], ganador: 0, empate: false, metricas: [{}, {}] };
  const m = armarMarcador([leido({ ...serie('v', 'dilema', [vieja]), prompt: undefined })]);
  assert.equal(m.juegos[0].tabla.find((f) => f.id === 'a').puntos, 3);
  assert.equal(m.episodios[0].estado, 'publicada');
  assert.doesNotThrow(() => armarMarcador([leido(serie('r', 'dilema', [{ jugadores: [jug('a')], puntos: 'x' }, null, {}]))]));
  assert.deepEqual(armarMarcador([leido({ etiqueta: 'sin partidas' })]).episodios, []);
});
