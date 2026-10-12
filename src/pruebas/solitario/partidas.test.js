// El numero solitario de punta a punta: la arena, los bots de control, una serie con asientos rotados, el marcador y un modelo caido.
// Sin red y sin API: todo con bots.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correrPartida } from '../../arena.js';
import { ejecutarSerie } from '../../ejecutar-serie.js';
import { planDeSerie, errorDeCantidad } from '../../serie.js';
import { resolverAgente } from '../../agentes.js';
import { armarMarcador } from '../../marcador.js';
import solitario from '../../juegos/solitario.js';
import { JUEGOS, obtenerJuego } from '../../juegos/index.js';

const CLAVES = ['bajo', 'azar', 'medio', 'lector', 'escalera'];
const agentes = (claves = CLAVES) => claves.map((c) => resolverAgente(c, solitario));
const jugar = (seed, extra = {}, claves = CLAVES) => correrPartida({ juego: solitario, agentes: agentes(claves), seed, ...extra });

test('el juego esta registrado, cumple el contrato y la consola acepta sus bots por nombre', () => {
  assert.equal(JUEGOS.solitario, solitario);
  assert.equal(obtenerJuego('solitario').nombre, 'El numero solitario');
  assert.equal(solitario.categoria, 'Estrategia de eliminación');
  assert.equal(solitario.jugadores, 5);
  assert.equal(solitario.minJugadores, 5);
  assert.equal(solitario.maxJugadores, 5);
  assert.equal(solitario.rondas, 24);
  assert.equal(solitario.mismoSeedEnSerie, true);
  for (const f of ['crear', 'terminado', 'vista', 'normalizar', 'aplicar', 'resultado', 'activos']) assert.equal(typeof solitario[f], 'function', f);
  assert.deepEqual(Object.keys(solitario.bots).sort(), ['azar', 'bajo', 'escalera', 'lector', 'medio']);
  for (const id of Object.keys(solitario.bots)) assert.equal(resolverAgente(id, solitario).tipo, 'bot');
  assert.throws(() => resolverAgente('siempre-c', solitario), /estrategia del Dilema/);
  assert.ok(errorDeCantidad(solitario, 4));
  assert.ok(errorDeCantidad(solitario, 6));
  assert.equal(errorDeCantidad(solitario, 5), null);
});

test('una partida completa entre bots termina en 24 turnos y 90 llamadas, y trae lo que la arena y el marcador esperan', async () => {
  for (let seed = 1; seed <= 10; seed++) {
    const p = await jugar(seed);
    assert.equal(p.truncada, false, `seed ${seed}`);
    assert.equal(p.rondas.length, 24);
    assert.equal(p.llamadas, 90, 'presupuesto: 2 llamadas por jugador activo y ronda');
    assert.deepEqual(p.avisos, []);
    assert.equal(p.juego.id, 'solitario');
    assert.deepEqual(p.jugadores.map((j) => j.id), CLAVES);
    assert.equal(p.metricas.length, 5);
    assert.deepEqual([...p.puntos].sort(), [0, 2, 3, 3, 4]);
    assert.equal(p.puntos[p.ganador], 4);
    assert.ok(p.epilogo.length >= 5);
    assert.deepEqual(p.rondas.map((r) => r.fase).slice(0, 4), [1, 2, 1, 2]);
    for (const r of p.rondas) {
      assert.equal(r.errores.length, 5);
      assert.ok(r.narracion.length >= 3);
      for (const l of r.narracion) assert.doesNotMatch(l.texto, /undefined|NaN/);
    }
    assert.notEqual(p.rondas.at(-1).final, null);
    // los que salen a salvo dejan de costar llamadas: bajo el total de 5 x 24 = 120
    assert.ok(p.llamadas < 120);
  }
});

test('con el mismo seed y los mismos bots la partida sale identica', async () => {
  const a = await jugar(7), b = await jugar(7);
  assert.deepEqual(a.rondas, b.rondas);
  assert.deepEqual(a.puntos, b.puntos);
});

test('con asientos rotados todos enfrentan el mismo mundo (el mismo seed)', async () => {
  const plan = planDeSerie({ claves: CLAVES, partidas: 5, seedBase: 7, mismoSeed: true });
  assert.equal(new Set(plan.map((x) => x.seed)).size, 1);
  const agentesPorClave = new Map(CLAVES.map((c) => [c, resolverAgente(c, solitario)]));
  const partidas = await ejecutarSerie({ juego: solitario, plan, agentesPorClave });
  assert.equal(partidas.length, 5);
  assert.deepEqual(partidas[1].jugadores.map((j) => j.id), ['azar', 'medio', 'lector', 'escalera', 'bajo']);
  for (const p of partidas) assert.equal(p.truncada, false);
});

test('una partida cortada con maxRondas no se cae: sin final, sin epilogo', async () => {
  const p = await jugar(7, { maxRondas: 4 }); // 4 turnos = 2 rondas: el ultimo registro es la fase 2 de la ronda 2
  assert.equal(p.truncada, true);
  assert.equal(p.rondas.length, 4);
  assert.deepEqual(p.epilogo, []);
  assert.equal(p.ganador, null);
  assert.equal(p.rondas.at(-1).final, null);
});

test('un modelo caido no tumba la partida: juega el reemplazo y el fallo queda anotado', async () => {
  const caido = { id: 'caido', nombre: 'Caido', color: '#888888', inicial: 'C', tipo: 'modelo', modelo: 'x/y', async jugar() { throw new Error('HTTP 500'); } };
  const todos = [caido, ...agentes(['azar', 'medio', 'lector', 'escalera'])];
  const p = await correrPartida({ juego: solitario, agentes: todos, seed: 3 });
  assert.equal(p.truncada, false);
  const conError = p.rondas.filter((r) => r.errores[0] === 'HTTP 500');
  assert.ok(conError.length >= 2);
  assert.ok(conError.every((r) => r.invalidas[0] === true));
  assert.equal(p.metricas[0].jugadasInvalidas, p.metricas[0].ordenesTotal);
});

test('el marcador lee la categoria nueva, sus puntos y la obediencia sin conocer el juego, y no muestra NaN', async () => {
  const partidas = [await jugar(7), await jugar(8)];
  const ep = {
    etiqueta: 'prueba', fecha: '2026-10-11T00:00:00.000Z',
    juego: { id: solitario.id, nombre: solitario.nombre, categoria: solitario.categoria },
    seedBase: 7, modo: null, destino: 'pruebas', jugadores: CLAVES,
    serie: { partidas: 2, rotar: false, mismoSeed: false }, partidas,
  };
  const m = armarMarcador([{ archivo: 'prueba.json', ep }], '2026-10-11T00:00:00.000Z');
  const cat = m.categorias.find((c) => c.nombre === 'Estrategia de eliminación');
  assert.ok(cat);
  assert.equal(cat.tabla.length, 5);
  for (const f of cat.tabla) {
    assert.equal(f.partidas, 2);
    assert.equal(f.fiabilidad, null, 'sin promesas, la fiabilidad no aplica');
    assert.equal(f.obediencia, 1, 'los bots responden siempre en formato');
    assert.ok(Number.isFinite(f.puntosPorPartida));
    assert.equal(f.victorias + f.derrotas, 2);
  }
  assert.equal(cat.tabla.reduce((a, f) => a + f.victorias, 0), 2, 'una pieza por partida');
  assert.doesNotMatch(JSON.stringify(m), /NaN/);
});
