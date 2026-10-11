// La evaluacion al final de una serie de Subasta de tiempo: cinco caracteristicas por IA (obediencia, ritmo de gasto, prudencia, eficiencia y
// constancia) y un comentario del resultado, todo calculado desde los datos guardados (sin llamadas extra). Aprobado por el usuario el 11 de octubre de 2026.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correrPartida } from '../../arena.js';
import { ejecutarSerie } from '../../ejecutar-serie.js';
import { planDeSerie } from '../../serie.js';
import { resolverAgente } from '../../agentes.js';
import subasta from '../../juegos/subasta.js';
import {
  evaluarSerie, fraseRitmo, frasePrudencia, fraseEficiencia, fraseConstancia,
} from '../../juegos/subasta/evaluacion.js';

const CLAVES = ['retirado', 'parejo', 'azar', 'gastador', 'cuentagotas'];
async function serie(partidas = 5) {
  const plan = planDeSerie({ claves: CLAVES, partidas, seedBase: 7, mismoSeed: true });
  const agentesPorClave = new Map(CLAVES.map((c) => [c, resolverAgente(c, subasta)]));
  return ejecutarSerie({ juego: subasta, plan, agentesPorClave });
}

test('ritmo de gasto: 75 % o mas del banco gastado a la mitad es gastar rapido; 30 % o menos es guardar el tiempo', () => {
  assert.deepEqual(fraseRitmo(0.75), { valor: 0.75, frase: 'gasta rápido: 75 % de su banco ya estaba gastado al llegar a la subasta 10', notable: true });
  assert.deepEqual(fraseRitmo(0.3), { valor: 0.3, frase: 'guarda su tiempo: solo 30 % de su banco gastado al llegar a la subasta 10', notable: true });
  assert.deepEqual(fraseRitmo(0.52), { valor: 0.52, frase: 'administra el banco (52 % gastado a la mitad)', notable: false });
  assert.deepEqual(fraseRitmo(null), { valor: null, frase: 'no hubo subastas que medir', notable: false });
});

test('prudencia: retirarse en la mitad o mas de las subastas es notable; casi nunca retirarse es lo normal', () => {
  assert.deepEqual(frasePrudencia(10, 19), { valor: 0.526, frase: 'se retira mucho (10 de 19 subastas)', notable: true });
  assert.deepEqual(frasePrudencia(1, 10), { valor: 0.1, frase: 'casi nunca se retira (1 de 10 subastas)', notable: false });
  assert.deepEqual(frasePrudencia(3, 10), { valor: 0.3, frase: 'se retira de vez en cuando (3 de 10 subastas)', notable: false });
  assert.deepEqual(frasePrudencia(0, 0), { valor: null, frase: 'no hubo apuestas propias que medir', notable: false });
});

test('eficiencia: 80 segundos por ficha o menos es ganar barato; 180 o mas es pagar caro; sin fichas es notable', () => {
  assert.deepEqual(fraseEficiencia(4, 320), { valor: 80, victorias: 4, frase: 'gana barato: 80.0 segundos por ficha (4 fichas)', notable: true });
  assert.deepEqual(fraseEficiencia(2, 360), { valor: 180, victorias: 2, frase: 'paga caro: 180.0 segundos por ficha (2 fichas)', notable: true });
  assert.deepEqual(fraseEficiencia(3, 360), { valor: 120, victorias: 3, frase: 'paga lo normal: 120.0 segundos por ficha (3 fichas)', notable: false });
  assert.deepEqual(fraseEficiencia(0, 45.5), { valor: null, victorias: 0, frase: 'no ganó ninguna subasta (apostó 45.5 segundos en total)', notable: true });
  assert.equal(fraseEficiencia(1, 30).frase, 'gana barato: 30.0 segundos por ficha (1 ficha)');
});

test('constancia: 3.0 puntos por partida o mas termina arriba; 1.0 o menos, abajo; el resto, a media tabla', () => {
  const base = { partidas: 5, piezas: 2, medios: 2, eliminados: 1 };
  assert.deepEqual(fraseConstancia({ ...base, puntosPorPartida: 2 }), { valor: 2, frase: 'termina a media tabla: 2 piezas, 2 en medio y 1 eliminado en 5 partidas', notable: false });
  assert.equal(fraseConstancia({ ...base, puntosPorPartida: 3 }).frase.startsWith('termina arriba: '), true);
  assert.equal(fraseConstancia({ ...base, puntosPorPartida: 1 }).frase.startsWith('termina abajo: '), true);
  assert.equal(fraseConstancia({ partidas: 1, piezas: 1, medios: 0, eliminados: 0, puntosPorPartida: 4 }).frase, 'termina arriba: 1 pieza, 0 en medio y 0 eliminados en 1 partida');
});

test('una serie real: cinco caracteristicas por IA, ordenadas por puntos por partida, y cada bot se reconoce', async () => {
  const ev = evaluarSerie(await serie());
  assert.equal(ev.partidas, 5);
  assert.equal(ev.jugadores.length, 5);
  const pts = ev.jugadores.map((j) => j.puntosPorPartida);
  assert.deepEqual(pts, [...pts].sort((a, b) => b - a));
  for (const j of ev.jugadores) {
    assert.deepEqual(Object.keys(j.caracteristicas), ['obediencia', 'ritmo', 'prudencia', 'eficiencia', 'constancia']);
    assert.ok(j.destacadas.length >= 1 && j.destacadas.length <= 3);
  }
  const por = (id) => ev.jugadores.find((j) => j.id === id);
  assert.equal(ev.jugadores[0].id, 'gastador', 'apostar fuerte desde el principio gana contra estos bots');
  assert.equal(por('gastador').caracteristicas.ritmo.valor, 1);
  assert.match(por('gastador').caracteristicas.ritmo.frase, /^gasta rápido/);
  assert.equal(por('retirado').caracteristicas.prudencia.valor, 1);
  assert.match(por('retirado').caracteristicas.prudencia.frase, /^se retira mucho/);
  assert.match(por('retirado').caracteristicas.eficiencia.frase, /^no ganó ninguna subasta/);
  assert.match(por('cuentagotas').caracteristicas.ritmo.frase, /^guarda su tiempo/);
  assert.equal(por('cuentagotas').conteos.eliminados, 5);
  assert.equal(por('retirado').caracteristicas.obediencia.valor, 1);
});

test('las cuentas de puestos cuadran con las partidas', async () => {
  const ps = await serie();
  const ev = evaluarSerie(ps);
  const suma = (k) => ev.jugadores.reduce((n, j) => n + j.conteos[k], 0);
  assert.equal(suma('piezas'), ps.filter((p) => p.ganador !== null).length);
  assert.equal(suma('piezas') + suma('medios') + suma('eliminados'), 25);
});

test('el comentario habla de estas partidas, no de "la mejor IA", y no trae texto roto ni palabras duras', async () => {
  const ev = evaluarSerie(await serie());
  const textos = ev.comentario.map((l) => l.texto);
  assert.equal(ev.comentario[0].tipo, 'resumen');
  assert.match(textos[0], /^En estas 5 partidas de Subasta de tiempo, con estas reglas, .+ (sumó|suman) más puntos por partida \(\d+(\.\d+)?\)\.$/);
  assert.ok(textos[0].includes(ev.jugadores[0].nombre));
  assert.equal(ev.comentario.filter((l) => l.tipo === 'jugador').length, 5);
  for (const t of textos) {
    assert.doesNotMatch(t, /undefined|NaN|null/, t);
    assert.doesNotMatch(t, /la mejor IA|mejor IA|delat|abandon|traici/i, t);
  }
  assert.ok(!textos.some((t) => t.includes('solo una muestra')));
});

test('con menos partidas que jugadores avisa que es solo una muestra', async () => {
  const ev = evaluarSerie(await serie(2));
  assert.equal(ev.partidas, 2);
  assert.ok(ev.comentario.some((l) => l.tipo === 'aviso' && l.texto.includes('2 partidas') && l.texto.includes('solo una muestra')));
});

test('un modelo caido no inventa prudencia: sus retiradas por respuesta ilegible no cuentan como decision', async () => {
  const caido = { id: 'caido', nombre: 'Caído', color: '#888888', inicial: 'C', tipo: 'modelo', modelo: 'x/y', async jugar() { throw new Error('HTTP 500'); } };
  const agentes = [caido, ...['parejo', 'azar', 'gastador', 'cuentagotas'].map((c) => resolverAgente(c, subasta))];
  const ev = evaluarSerie([await correrPartida({ juego: subasta, agentes, seed: 3 })]);
  const c = ev.jugadores.find((j) => j.id === 'caido');
  assert.equal(c.caracteristicas.obediencia.valor, 0);
  assert.match(c.caracteristicas.obediencia.frase, /respuestas se tuvieron que reemplazar$/);
  assert.equal(c.caracteristicas.prudencia.valor, null);
  assert.equal(c.caracteristicas.eficiencia.victorias, 0);
  assert.ok(c.destacadas.some((f) => f.includes('respuestas se tuvieron que reemplazar')));
});

test('las partidas cortadas no entran y la basura no tumba la evaluacion', () => {
  const vacia = { partidas: 0, jugadores: [], comentario: [] };
  assert.deepEqual(evaluarSerie([{ truncada: true, jugadores: [], rondas: [], metricas: [] }]), vacia);
  for (const x of [null, undefined, [], [null, {}, 5, 'x'], {}]) assert.deepEqual(evaluarSerie(x), vacia);
});

test('el juego ofrece la evaluacion', () => {
  assert.equal(subasta.evaluar, evaluarSerie);
});
