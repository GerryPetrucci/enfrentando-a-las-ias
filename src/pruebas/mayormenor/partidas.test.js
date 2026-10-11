// Mayor o menor de punta a punta: la arena, los bots de control, una serie con asientos invertidos, el marcador, la partida cortada, el fin anticipado
// y un modelo caido. Sin red y sin API: todo con bots.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correrPartida } from '../../arena.js';
import { ejecutarSerie } from '../../ejecutar-serie.js';
import { planDeSerie, errorDeCantidad } from '../../serie.js';
import { resolverAgente } from '../../agentes.js';
import { armarMarcador } from '../../marcador.js';
import mayormenor from '../../juegos/mayormenor.js';
import { JUEGOS, obtenerJuego } from '../../juegos/index.js';

const CLAVES = ['contador', 'azar'];
const agentes = (claves = CLAVES) => claves.map((c) => resolverAgente(c, mayormenor));
const jugar = (seed, extra = {}, claves = CLAVES) => correrPartida({ juego: mayormenor, agentes: agentes(claves), seed, ...extra });

test('el juego esta registrado, cumple el contrato y la consola acepta sus bots por nombre', () => {
  assert.equal(JUEGOS.mayormenor, mayormenor);
  assert.equal(obtenerJuego('mayormenor').nombre, 'Mayor o menor');
  assert.equal(mayormenor.categoria, 'Estrategia de eliminación');
  assert.equal(mayormenor.jugadores, 2);
  assert.equal(mayormenor.minJugadores, 2);
  assert.equal(mayormenor.maxJugadores, 2);
  assert.equal(mayormenor.rondas, 18);
  assert.equal(mayormenor.mismoSeedEnSerie, true);
  for (const f of ['crear', 'terminado', 'vista', 'normalizar', 'aplicar', 'resultado', 'activos']) assert.equal(typeof mayormenor[f], 'function', f);
  assert.deepEqual(Object.keys(mayormenor.bots).sort(), ['azar', 'contador', 'contrario', 'prudente', 'temerario']);
  for (const id of Object.keys(mayormenor.bots)) assert.equal(resolverAgente(id, mayormenor).tipo, 'bot');
  assert.throws(() => resolverAgente('siempre-c', mayormenor), /estrategia del Dilema/);
  assert.ok(errorDeCantidad(mayormenor, 1));
  assert.ok(errorDeCantidad(mayormenor, 3));
  assert.equal(errorDeCantidad(mayormenor, 2), null);
});

test('una partida completa entre bots: 18 rondas como maximo, exactamente 2 llamadas por ronda, y trae lo que la arena y el marcador esperan', async () => {
  for (let seed = 1; seed <= 10; seed++) {
    const p = await jugar(seed, {}, ['prudente', 'azar']);
    assert.equal(p.truncada, false, `seed ${seed}`);
    assert.ok(p.rondas.length >= 1 && p.rondas.length <= 18);
    assert.equal(p.llamadas, 2 * p.rondas.length, `seed ${seed}`);
    assert.ok(p.llamadas <= 36);
    assert.deepEqual(p.avisos, []);
    assert.equal(p.juego.id, 'mayormenor');
    assert.deepEqual(p.jugadores.map((j) => j.id), ['prudente', 'azar']);
    assert.equal(p.metricas.length, 2);
    assert.ok([4, 2, 0].includes(p.puntos[0]) && p.puntos[0] + p.puntos[1] === 4);
    assert.ok(p.epilogo.length >= 3);
    for (const r of p.rondas) {
      assert.equal(r.errores.length, 2);
      assert.ok(r.narracion.length >= 5);
      for (const l of r.narracion) assert.doesNotMatch(l.texto, /undefined|NaN/);
    }
    assert.notEqual(p.rondas.at(-1).final, null);
  }
});

test('con dos temerarios la partida casi siempre termina antes de la ronda 18 por fichas en 0, y no se pregunta de mas', async () => {
  const partidas = [];
  for (let seed = 1; seed <= 15; seed++) partidas.push(await jugar(seed, {}, ['temerario', 'temerario']));
  const tempranas = partidas.filter((p) => p.rondas.length < 18);
  assert.ok(tempranas.length >= 10, `solo ${tempranas.length} de 15 terminaron antes`);
  for (const p of tempranas) {
    assert.equal(p.rondas.at(-1).final.causa, 'fichas');
    assert.equal(p.llamadas, 2 * p.rondas.length);
    assert.equal(p.truncada, false);
    assert.ok(p.ganador === 0 || p.ganador === 1);
  }
});

test('con el mismo seed y los mismos bots la partida sale identica', async () => {
  const a = await jugar(7), b = await jugar(7);
  assert.deepEqual(a.rondas, b.rondas);
  assert.deepEqual(a.puntos, b.puntos);
});

test('una serie de 2 partidas invierte los asientos y repite el mismo orden del crupier', async () => {
  const plan = planDeSerie({ claves: CLAVES, partidas: 2, seedBase: 7, mismoSeed: true });
  const agentesPorClave = new Map(CLAVES.map((c) => [c, resolverAgente(c, mayormenor)]));
  const partidas = await ejecutarSerie({ juego: mayormenor, plan, agentesPorClave });
  assert.equal(partidas.length, 2);
  assert.deepEqual(partidas[0].jugadores.map((j) => j.id), ['contador', 'azar']);
  assert.deepEqual(partidas[1].jugadores.map((j) => j.id), ['azar', 'contador']);
  assert.deepEqual(partidas.map((p) => p.invertido), [false, true]);
  const crupier = (p) => p.rondas.map((r) => r.crupier);
  const comunes = Math.min(partidas[0].rondas.length, partidas[1].rondas.length);
  assert.deepEqual(crupier(partidas[0]).slice(0, comunes), crupier(partidas[1]).slice(0, comunes), 'mismo mundo: solo cambian los asientos');
  for (const p of partidas) assert.equal(p.truncada, false);
});

test('una partida cortada con maxRondas no se cae: sin final, sin epilogo, sin ganador inventado', async () => {
  const p = await jugar(7, { maxRondas: 4 }, ['prudente', 'prudente']);
  assert.equal(p.truncada, true);
  assert.equal(p.rondas.length, 4);
  assert.deepEqual(p.epilogo, []);
  assert.equal(p.ganador, null);
  assert.equal(p.empate, true);
  assert.equal(p.rondas.at(-1).final, null);
});

test('un modelo caido no tumba la partida: juega por reemplazo en cada ronda y el fallo queda anotado', async () => {
  const caido = { id: 'caido', nombre: 'Caido', color: '#888888', inicial: 'C', tipo: 'modelo', modelo: 'x/y', async jugar() { throw new Error('HTTP 500'); } };
  const p = await correrPartida({ juego: mayormenor, agentes: [caido, ...agentes(['prudente'])], seed: 3 });
  assert.equal(p.truncada, false);
  assert.equal(p.rondas.length, 18);
  assert.equal(p.rondas.filter((r) => r.errores[0] === 'HTTP 500').length, 18);
  assert.ok(p.rondas.every((r) => r.invalidas[0] === true));
  assert.equal(p.metricas[0].jugadasInvalidas, 18);
  assert.equal(p.metricas[0].ordenesTotal, 18);
});

test('el marcador lee la categoria, sus puntos y la obediencia sin conocer el juego, y no muestra NaN', async () => {
  const partidas = [await jugar(7), await jugar(8)];
  const ep = {
    etiqueta: 'prueba', fecha: '2026-10-11T00:00:00.000Z',
    juego: { id: mayormenor.id, nombre: mayormenor.nombre, categoria: mayormenor.categoria },
    seedBase: 7, modo: null, destino: 'pruebas', jugadores: CLAVES,
    serie: { partidas: 2, rotar: false, mismoSeed: false }, partidas,
  };
  const m = armarMarcador([{ archivo: 'prueba.json', ep }], '2026-10-11T00:00:00.000Z');
  const cat = m.categorias.find((c) => c.nombre === 'Estrategia de eliminación');
  assert.ok(cat);
  assert.equal(cat.tabla.length, 2);
  for (const f of cat.tabla) {
    assert.equal(f.partidas, 2);
    assert.equal(f.fiabilidad, null);
    assert.equal(f.obediencia, 1);
    assert.ok(Number.isFinite(f.puntosPorPartida));
    assert.equal(f.victorias + f.empates + f.derrotas, 2);
  }
  assert.doesNotMatch(JSON.stringify(m), /NaN/);
});
