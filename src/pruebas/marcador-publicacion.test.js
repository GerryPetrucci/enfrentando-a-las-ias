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

test('el marcador trae una lista plana de partidas (sin series): cada una con su juego, fecha, seed, IAs y estado; el resultado solo si esta publicada', () => {
  const a = serie('s1', 'conquista', [completa(11, [5, 0], 0), parcial(22, 8)], { fecha: '2026-10-19' });
  const b = serie('s2', 'mayormenor', [completa(33, [2, 4], 1)], { fecha: '2026-10-21' });
  const m = armarMarcador([leido(a), leido(b)]);
  assert.deepEqual(m.partidas.map((p) => [p.juego.id, p.serie, p.n, p.seed, p.fecha, p.estado]), [
    ['mayormenor', 's2', 1, 33, '2026-10-21', 'publicada'],
    ['conquista', 's1', 1, 11, '2026-10-19', 'publicada'],
    ['conquista', 's1', 2, 22, '2026-10-19', 'por-publicarse'],
  ], 'la mas reciente primero; dentro de un mismo dia, en orden de partida');
  const [pub, , pend] = m.partidas;
  assert.deepEqual(pub.jugadores.map((j) => [j.id, j.nombre, j.color, j.inicial]), [['a', 'A', '#111', 'A'], ['b', 'B', '#111', 'B']]);
  assert.equal(pub.ganador, 'B');
  assert.deepEqual(pub.puntos, [2, 4]);
  assert.equal(pub.turnos, 12);
  assert.equal(pub.versionReglas, 'mayormenor-1.0.0');
  assert.equal(pend.ganador, null, 'nada de resultado antes de la parte final');
  assert.equal(pend.puntos, null);
  assert.equal(pend.hastaTurno, 8);
  assert.deepEqual(Object.keys(pend).sort(), Object.keys(pub).sort(), 'mismas claves, publicada o no');
});
