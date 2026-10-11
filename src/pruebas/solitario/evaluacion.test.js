// La evaluacion al final de una serie de El numero solitario: cinco caracteristicas por IA y un comentario del resultado, todo calculado
// desde los datos guardados (sin llamadas extra). Aprobado por el usuario el 11 de octubre de 2026 (seccion 6 del spec).
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { correrPartida } from '../../arena.js';
import { ejecutarSerie } from '../../ejecutar-serie.js';
import { planDeSerie } from '../../serie.js';
import { resolverAgente } from '../../agentes.js';
import { correr } from '../../correr.js';
import solitario from '../../juegos/solitario.js';
import fuga from '../../juegos/fuga.js';
import {
  evaluarSerie, fraseObediencia, fraseLectura, fraseAudacia, frasePunteria, fraseConstancia,
} from '../../juegos/solitario/evaluacion.js';

const CLAVES = ['bajo', 'azar', 'medio', 'lector', 'escalera'];
async function serie(partidas = 5) {
  const plan = planDeSerie({ claves: CLAVES, partidas, seedBase: 7, mismoSeed: true });
  const agentesPorClave = new Map(CLAVES.map((c) => [c, resolverAgente(c, solitario)]));
  return ejecutarSerie({ juego: solitario, plan, agentesPorClave });
}

test('obediencia: sin fallos no es notable; con fallos cuenta cuantas respuestas se reemplazaron', () => {
  assert.deepEqual(fraseObediencia(20, 20), { valor: 1, frase: 'contestó en formato las 20 veces', notable: false });
  assert.deepEqual(fraseObediencia(17, 20), { valor: 0.85, frase: '3 de 20 respuestas se tuvieron que reemplazar', notable: true });
  assert.deepEqual(fraseObediencia(0, 0), { valor: null, frase: 'no hubo respuestas que medir', notable: false });
});

test('lectura de la mesa: menos del 20 % de cartas anuladas es evitar los choques; mas del 40 % es chocar de mas', () => {
  assert.deepEqual(fraseLectura(1, 10), { valor: 0.1, frase: 'evitó los choques (1 de 10 cartas anuladas)', notable: true });
  assert.deepEqual(fraseLectura(2, 10), { valor: 0.2, frase: 'chocó lo normal (2 de 10 cartas anuladas)', notable: false });
  assert.deepEqual(fraseLectura(4, 10), { valor: 0.4, frase: 'chocó lo normal (4 de 10 cartas anuladas)', notable: false });
  assert.deepEqual(fraseLectura(5, 10), { valor: 0.5, frase: 'chocó más de lo normal (5 de 10 cartas anuladas)', notable: true });
  assert.deepEqual(fraseLectura(0, 0), { valor: null, frase: 'no jugó rondas propias que medir', notable: false });
});

test('audacia: la carta mas alta de su pareja en 60 % o mas es senuelo; en 25 % o menos es apostar por la baja', () => {
  assert.deepEqual(fraseAudacia(6, 10), { valor: 0.6, frase: 'juega al señuelo: la carta más alta de su pareja en 6 de 10 rondas', notable: true });
  assert.deepEqual(fraseAudacia(1, 4), { valor: 0.25, frase: 'apuesta por la baja: la carta más alta de su pareja solo en 1 de 4 rondas', notable: true });
  assert.deepEqual(fraseAudacia(5, 10), { valor: 0.5, frase: 'mezcla altas y bajas (la más alta en 5 de 10 rondas)', notable: false });
  assert.deepEqual(fraseAudacia(0, 0), { valor: null, frase: 'no jugó rondas propias que medir', notable: false });
});

test('punteria: sin victorias es notable; el valor medio de sus victorias separa ganar alto, medio y barato', () => {
  assert.deepEqual(frasePunteria(0, 0), { valor: null, victorias: 0, frase: 'no ganó ninguna ronda', notable: true });
  assert.deepEqual(frasePunteria(4, 14), { valor: 3.5, victorias: 4, frase: 'gana alto: 4 rondas ganadas, valor medio 3.5', notable: true });
  assert.deepEqual(frasePunteria(4, 8), { valor: 2, victorias: 4, frase: 'gana barato: 4 rondas ganadas, valor medio 2.0', notable: true });
  assert.deepEqual(frasePunteria(4, 10), { valor: 2.5, victorias: 4, frase: 'gana con números medios: 4 rondas ganadas, valor medio 2.5', notable: false });
  assert.equal(frasePunteria(1, 6).frase, 'gana alto: 1 ronda ganada, valor medio 6.0');
});

test('constancia: puntos por partida de 3.0 o mas terminan arriba; 1.5 o menos, abajo; el resto, a media tabla', () => {
  const base = { partidas: 5, piezas: 2, salvos: 1, medios: 1, eliminados: 1 };
  assert.deepEqual(fraseConstancia({ ...base, puntosPorPartida: 2.4 }), { valor: 2.4, frase: 'termina a media tabla: 2 piezas, 1 a salvo, 1 en medio y 1 eliminado en 5 partidas', notable: false });
  assert.equal(fraseConstancia({ ...base, puntosPorPartida: 3 }).frase.startsWith('termina arriba: '), true);
  assert.equal(fraseConstancia({ ...base, puntosPorPartida: 3 }).notable, true);
  assert.equal(fraseConstancia({ ...base, puntosPorPartida: 1.5 }).frase.startsWith('termina abajo: '), true);
  assert.equal(fraseConstancia({ partidas: 1, piezas: 1, salvos: 0, medios: 0, eliminados: 0, puntosPorPartida: 4 }).frase, 'termina arriba: 1 pieza, 0 a salvo, 0 en medio y 0 eliminados en 1 partida');
});

test('una serie real: cinco caracteristicas por IA, ordenadas por puntos por partida, con cuentas consistentes', async () => {
  const ps = await serie();
  const ev = evaluarSerie(ps);
  assert.equal(ev.partidas, 5);
  assert.equal(ev.jugadores.length, 5);
  const pts = ev.jugadores.map((j) => j.puntosPorPartida);
  assert.deepEqual(pts, [...pts].sort((a, b) => b - a));
  for (const j of ev.jugadores) {
    assert.deepEqual(Object.keys(j.caracteristicas), ['obediencia', 'lectura', 'audacia', 'punteria', 'constancia']);
    assert.ok(j.destacadas.length >= 1 && j.destacadas.length <= 3);
    assert.equal(j.partidas, 5);
  }
  const suma = (k) => ev.jugadores.reduce((n, j) => n + j.conteos[k], 0);
  assert.deepEqual([suma('piezas'), suma('salvos'), suma('medios'), suma('eliminados')], [5, 10, 5, 5]);
  const bajo = ev.jugadores.find((j) => j.id === 'bajo');
  assert.equal(bajo.caracteristicas.audacia.valor, 0, 'el bajo siempre juega la mas baja de su pareja');
  assert.match(bajo.caracteristicas.audacia.frase, /^apuesta por la baja/);
  assert.equal(bajo.caracteristicas.obediencia.valor, 1);
});

test('el comentario habla de estas partidas, no de "la mejor IA", y no trae texto roto ni palabras duras', async () => {
  const ev = evaluarSerie(await serie());
  const textos = ev.comentario.map((l) => l.texto);
  assert.equal(ev.comentario[0].tipo, 'resumen');
  assert.match(textos[0], /^En estas 5 partidas de El número solitario, con estas reglas, .+ (sumó|suman) más puntos por partida \(\d+(\.\d+)?\)\.$/);
  assert.ok(textos[0].includes(ev.jugadores[0].nombre));
  assert.equal(ev.comentario.filter((l) => l.tipo === 'jugador').length, 5);
  for (const t of textos) {
    assert.doesNotMatch(t, /undefined|NaN|null/, t);
    assert.doesNotMatch(t, /la mejor IA|mejor IA|delat|abandon|traici/i, t);
  }
  assert.ok(!textos.some((t) => t.includes('solo una muestra')), 'con una vuelta completa de asientos no hace falta el aviso');
});

test('con menos partidas que jugadores avisa que es solo una muestra', async () => {
  const ev = evaluarSerie(await serie(2));
  assert.equal(ev.partidas, 2);
  assert.ok(ev.comentario.some((l) => l.tipo === 'aviso' && l.texto.includes('2 partidas') && l.texto.includes('solo una muestra')));
});

test('un modelo caido no inventa audacia ni lectura: sus jugadas de reemplazo no cuentan', async () => {
  const caido = { id: 'caido', nombre: 'Caído', color: '#888888', inicial: 'C', tipo: 'modelo', modelo: 'x/y', async jugar() { throw new Error('HTTP 500'); } };
  const agentes = [caido, ...['azar', 'medio', 'lector', 'escalera'].map((c) => resolverAgente(c, solitario))];
  const ev = evaluarSerie([await correrPartida({ juego: solitario, agentes, seed: 3 })]);
  const c = ev.jugadores.find((j) => j.id === 'caido');
  assert.equal(c.caracteristicas.obediencia.valor, 0);
  assert.match(c.caracteristicas.obediencia.frase, /respuestas se tuvieron que reemplazar$/);
  assert.equal(c.caracteristicas.lectura.valor, null);
  assert.equal(c.caracteristicas.audacia.valor, null);
  assert.equal(c.caracteristicas.punteria.victorias, 0);
  assert.ok(c.destacadas.some((f) => f.includes('respuestas se tuvieron que reemplazar')));
});

test('las partidas cortadas no entran y la basura no tumba la evaluacion', () => {
  const vacia = { partidas: 0, jugadores: [], comentario: [] };
  assert.deepEqual(evaluarSerie([{ truncada: true, jugadores: [], rondas: [], metricas: [] }]), vacia);
  for (const x of [null, undefined, [], [null, {}, 5, 'x'], {}]) assert.deepEqual(evaluarSerie(x), vacia);
});

test('el juego ofrece la evaluacion y la consola la imprime y la guarda en la serie', async () => {
  assert.equal(solitario.evaluar, evaluarSerie);
  const raiz = mkdtempSync(join(tmpdir(), 'enfrentando-eval-'));
  let texto = '';
  const consola = { log: (...a) => { texto += `${a.join(' ')}\n`; }, escribir: (t) => { texto += t; } };
  try {
    const { ruta, salida } = await correr(['--juego=solitario', `--jugadores=${CLAVES.join(',')}`, '--partidas=5', '--destino=pruebas'], { raiz, consola });
    const guardado = JSON.parse(readFileSync(ruta, 'utf8'));
    assert.equal(guardado.evaluacion.partidas, 5);
    assert.equal(guardado.evaluacion.jugadores.length, 5);
    assert.deepEqual(guardado.evaluacion, salida.evaluacion);
    assert.match(texto, /En estas 5 partidas de El número solitario/);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test('un juego sin evaluacion no cambia, y si la evaluacion falla la serie se guarda igual', async () => {
  const raiz = mkdtempSync(join(tmpdir(), 'enfrentando-eval-'));
  const consola = { log: () => {}, escribir: () => {} };
  try {
    const { ruta } = await correr(['--juego=fuga', '--a=leal', '--b=traidor', '--partidas=2', '--destino=pruebas'], { raiz, consola });
    assert.ok(!('evaluacion' in JSON.parse(readFileSync(ruta, 'utf8'))));
    assert.equal(fuga.evaluar, undefined);

    const original = solitario.evaluar;
    let texto = '';
    solitario.evaluar = () => { throw new Error('boom'); };
    try {
      const r = await correr(['--juego=solitario', `--jugadores=${CLAVES.join(',')}`, '--partidas=1', '--destino=pruebas'], { raiz, consola: { log: (...a) => { texto += `${a.join(' ')}\n`; }, escribir: () => {} } });
      assert.ok(!('evaluacion' in JSON.parse(readFileSync(r.ruta, 'utf8'))));
      assert.match(texto, /No se pudo armar la evaluación/);
    } finally {
      solitario.evaluar = original;
    }
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});
