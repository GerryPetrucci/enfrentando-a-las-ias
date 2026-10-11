// La Fuga de punta a punta: la arena, los bots de control, una serie con asientos rotados, el marcador y un modelo caido.
// Sin red y sin API: todo con bots.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correrPartida } from '../../arena.js';
import { ejecutarSerie } from '../../ejecutar-serie.js';
import { planDeSerie } from '../../serie.js';
import { resolverAgente } from '../../agentes.js';
import { armarMarcador } from '../../marcador.js';
import fuga from '../../juegos/fuga.js';
import { JUEGOS, obtenerJuego } from '../../juegos/index.js';
import { RONDAS, PUNTOS } from '../../juegos/fuga/constantes.js';
import { nuevoEstado } from './ayudas.js';

const agentes = (a, b) => [a, b].map((c) => resolverAgente(c, fuga));
const jugar = (a, b, seed, extra = {}) => correrPartida({ juego: fuga, agentes: agentes(a, b), seed, ...extra });

test('el juego esta registrado, cumple el contrato y la consola acepta sus bots por nombre', () => {
  assert.equal(JUEGOS.fuga, fuga);
  assert.equal(obtenerJuego('fuga').nombre, 'La Fuga');
  assert.equal(fuga.categoria, 'Lealtad bajo riesgo');
  assert.equal(fuga.jugadores, 2);
  assert.equal(fuga.rondas, RONDAS);
  assert.equal(fuga.mismoSeedEnSerie, true);
  for (const f of ['crear', 'terminado', 'vista', 'normalizar', 'aplicar', 'resultado', 'activos']) assert.equal(typeof fuga[f], 'function', f);
  assert.deepEqual(Object.keys(fuga.bots).sort(), ['azar', 'leal', 'tomaydaca', 'traidor']);
  for (const id of Object.keys(fuga.bots)) assert.equal(resolverAgente(id, fuga).tipo, 'bot');
  assert.throws(() => resolverAgente('siempre-c', fuga), /estrategia del Dilema/);
});

test('una partida completa entre bots termina y trae lo que la arena y el marcador esperan', async () => {
  let rotas = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const p = await jugar('leal', 'traidor', seed);
    assert.equal(p.truncada, false, `seed ${seed}`);
    assert.ok(p.rondas.length >= 1 && p.rondas.length <= RONDAS);
    assert.ok(p.llamadas <= 2 * RONDAS);
    assert.equal(p.juego.id, 'fuga');
    assert.deepEqual(p.jugadores.map((j) => j.id), ['leal', 'traidor']);
    assert.equal(p.metricas.length, 2);
    for (const m of p.metricas) for (const k of ['puntos', 'traiciones', 'promesasHechas', 'promesasRotas', 'jugadasInvalidas']) assert.equal(typeof m[k], 'number', k);
    assert.ok(p.metricas[1].traiciones >= 1, 'el traidor se separa desde la primera ronda');
    assert.ok(p.epilogo.length >= 2);
    rotas += p.metricas[1].promesasRotas;
  }
  assert.ok(rotas > 0, 'el traidor promete ayudar y se separa: sus promesas rotas se registran');
});

test('bots cooperativos escapan juntos a veces, y toda partida terminada cierra su ultima ronda', async () => {
  let conjunto = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const p = await jugar('leal', 'tomaydaca', seed);
    assert.notEqual(p.rondas.at(-1).final, null, `seed ${seed}: la ultima ronda no trae el final`);
    if (p.metricas[0].final === 'conjunto') {
      conjunto++;
      assert.equal(p.metricas[1].final, 'conjunto');
    }
  }
  assert.ok(conjunto > 0 && conjunto < 60, `escaparon juntos ${conjunto} de 60`);
});

test('100 partidas al azar cumplen los invariantes: limites, puntos enteros, finales coherentes y narracion sana', async () => {
  for (let seed = 1; seed <= 100; seed++) {
    const p = await jugar('azar', 'azar', seed);
    assert.equal(p.truncada, false, `seed ${seed}`);
    for (const r of p.rondas) {
      assert.ok(r.oculto.alarma >= 0 && r.oculto.alarma <= 5);
      assert.ok(Math.abs(r.oculto.cohesion) <= 3);
      assert.ok(r.narracion.length >= 3);
      for (const l of r.narracion) assert.doesNotMatch(l.texto, /undefined|NaN/);
    }
    for (const x of p.puntos) assert.ok(Number.isInteger(x) && x >= 0, `seed ${seed}: puntos ${x}`);
    assert.deepEqual(p.metricas.map((m) => m.final), p.rondas.at(-1).final.finales);
  }
});

test('con asientos rotados los dos modelos enfrentan las mismas situaciones y los mismos dados', async () => {
  const claves = ['leal', 'traidor'];
  const plan = planDeSerie({ claves, partidas: 2, seedBase: 7, mismoSeed: true });
  const agentesPorClave = new Map(claves.map((c) => [c, resolverAgente(c, fuga)]));
  const [a, b] = await ejecutarSerie({ juego: fuga, plan, agentesPorClave });
  assert.deepEqual(a.jugadores.map((j) => j.id), ['leal', 'traidor']);
  assert.deepEqual(b.jugadores.map((j) => j.id), ['traidor', 'leal']);
  assert.deepEqual(a.rondas[0].oculto.dados, b.rondas[0].oculto.dados);
  const n = Math.min(a.rondas.length, b.rondas.length);
  assert.deepEqual(a.rondas.slice(0, n).map((r) => r.situacion.id), b.rondas.slice(0, n).map((r) => r.situacion.id));
  assert.deepEqual(a.rondas.slice(0, n).map((r) => r.oculto.peligro), b.rondas.slice(0, n).map((r) => r.oculto.peligro));
});

test('una partida cortada con maxRondas no se cae: sin final, sin epilogo', async () => {
  const p = await jugar('leal', 'traidor', 7, { maxRondas: 1 });
  assert.equal(p.truncada, true);
  assert.equal(p.rondas.length, 1);
  assert.deepEqual(p.epilogo, []);
  assert.deepEqual(p.metricas.map((m) => m.final), [null, null]);
  assert.equal(p.rondas[0].final, null);
});

test('el marcador lee la categoria nueva, sus puntos y sus traiciones sin conocer el juego', async () => {
  const partidas = [await jugar('leal', 'traidor', 7), await jugar('traidor', 'leal', 7)];
  const ep = {
    etiqueta: 'prueba', fecha: '2026-10-10T00:00:00.000Z',
    juego: { id: fuga.id, nombre: fuga.nombre, categoria: fuga.categoria },
    seedBase: 7, modo: null, destino: 'pruebas', jugadores: ['leal', 'traidor'],
    serie: { partidas: 2, rotar: true, mismoSeed: true }, partidas,
  };
  const m = armarMarcador([{ archivo: 'prueba.json', ep }], '2026-10-10T00:00:00.000Z');
  const cat = m.categorias.find((c) => c.nombre === 'Lealtad bajo riesgo');
  assert.ok(cat);
  assert.deepEqual(cat.juegos, ['La Fuga']);
  assert.equal(cat.tabla.length, 2);
  const traidor = cat.tabla.find((f) => f.id === 'traidor');
  assert.equal(traidor.partidas, 2);
  assert.ok(traidor.traiciones >= 2);
  assert.equal(typeof traidor.puntosPorPartida, 'number');
  assert.equal(m.episodios[0].enfrentamiento, 'Leal vs Traidor');
});

test('un modelo caido no tumba la partida: juega la jugada neutra y el error queda registrado', async () => {
  const caido = { id: 'caido', nombre: 'Caido', color: '#888888', inicial: 'X', tipo: 'modelo', modelo: 'x/y', async jugar() { throw new Error('OpenRouter 500: caido'); } };
  const p = await correrPartida({ juego: fuga, agentes: [caido, resolverAgente('leal', fuga)], seed: 7 });
  assert.equal(p.truncada, false);
  assert.equal(p.rondas[0].errores[0], 'OpenRouter 500: caido');
  assert.equal(p.rondas[0].invalidas[0], true);
  assert.equal(p.rondas[0].errores[1], null);
  assert.ok(p.metricas[0].jugadasInvalidas >= 1);
});

// ---------- enmienda del 10 de octubre de 2026 ----------
test('el traidor a veces escapa primero por su cuenta, y el abandonado todavia puede salir despues cobrando mas', async () => {
  const finales = new Set();
  let abandonadoSale = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const p = await jugar('traidor', 'leal', seed);
    assert.ok(p.llamadas <= 2 * RONDAS);
    const f = p.metricas.map((m) => m.final);
    finales.add(f.join('/'));
    if (f.join('/') === 'anticipada/abandonado') {
      abandonadoSale++;
      assert.deepEqual(p.rondas.at(-1).final.bono, [PUNTOS.escapeSolo, PUNTOS.escapeAbandonado]);
      const salida = p.rondas.find((r) => r.salieron[0]);
      assert.ok(salida, 'alguna ronda registra la salida');
      if (salida.ronda < RONDAS) { // si salio en la ultima situacion, al abandonado no le queda nada por jugar
        assert.ok(p.rondas.length > salida.ronda, 'el abandonado siguio jugando despues de la salida');
        assert.equal(p.rondas[salida.ronda].jugadas[0], null, 'al que salio ya no se le pregunta');
      }
    }
  }
  assert.ok(abandonadoSale > 0, `finales vistos: ${[...finales].join(', ')}`);
  assert.ok(finales.has('anticipada/capturado'), 'a veces el que salio deja al otro capturado');
});

test('los bots cooperativos solo toman botin cuando van solos: acompanados, tomarlo seria competir con el companero', () => {
  const E = nuevoEstado();
  const rng = () => 0.5;
  for (const id of ['leal', 'tomaydaca']) {
    assert.equal(fuga.bots[id].fn(E, 0, rng).aprovechar, false, `${id} acompanado`);
    const solo = nuevoEstado();
    solo.libres = [true, false];
    assert.equal(fuga.bots[id].fn(solo, 0, rng).aprovechar, true, `${id} solo`);
  }
  assert.equal(fuga.bots.traidor.fn(E, 0, rng).aprovechar, true, 'el traidor aprovecha todo');
});
