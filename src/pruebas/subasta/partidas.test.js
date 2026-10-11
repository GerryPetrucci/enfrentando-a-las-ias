// Subasta de tiempo de punta a punta: la arena, los bots de control, una serie con asientos rotados, el marcador y un modelo caido.
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
import subasta from '../../juegos/subasta.js';
import { JUEGOS, obtenerJuego } from '../../juegos/index.js';

const CLAVES = ['retirado', 'parejo', 'azar', 'gastador', 'cuentagotas'];
const agentes = (claves = CLAVES) => claves.map((c) => resolverAgente(c, subasta));
const jugar = (seed, extra = {}, claves = CLAVES) => correrPartida({ juego: subasta, agentes: agentes(claves), seed, ...extra });

test('el juego esta registrado, cumple el contrato y la consola acepta sus bots por nombre', () => {
  assert.equal(JUEGOS.subasta, subasta);
  assert.equal(obtenerJuego('subasta').nombre, 'Subasta de tiempo');
  assert.equal(subasta.categoria, 'Estrategia de eliminación');
  assert.equal(subasta.jugadores, 5);
  assert.equal(subasta.minJugadores, 5);
  assert.equal(subasta.maxJugadores, 5);
  assert.equal(subasta.rondas, 19);
  assert.equal(subasta.mismoSeedEnSerie, true);
  for (const f of ['crear', 'terminado', 'vista', 'normalizar', 'aplicar', 'resultado', 'activos']) assert.equal(typeof subasta[f], 'function', f);
  assert.deepEqual(Object.keys(subasta.bots).sort(), ['azar', 'cuentagotas', 'gastador', 'parejo', 'retirado']);
  for (const id of Object.keys(subasta.bots)) assert.equal(resolverAgente(id, subasta).tipo, 'bot');
  assert.throws(() => resolverAgente('siempre-c', subasta), /estrategia del Dilema/);
  assert.ok(errorDeCantidad(subasta, 4));
  assert.ok(errorDeCantidad(subasta, 6));
  assert.equal(errorDeCantidad(subasta, 5), null);
});

test('una partida completa entre bots termina en 19 subastas y a lo mas 95 llamadas, y trae lo que la arena y el marcador esperan', async () => {
  for (let seed = 1; seed <= 10; seed++) {
    const p = await jugar(seed);
    assert.equal(p.truncada, false, `seed ${seed}`);
    assert.equal(p.rondas.length, 19);
    assert.ok(p.llamadas <= 95 && p.llamadas > 19, `llamadas ${p.llamadas}`);
    assert.deepEqual(p.avisos, []);
    assert.equal(p.juego.id, 'subasta');
    assert.deepEqual(p.jugadores.map((j) => j.id), CLAVES);
    assert.equal(p.metricas.length, 5);
    assert.equal(p.puntos.reduce((a, b) => a + b, 0) <= 10, true);
    assert.ok(p.epilogo.length >= 3);
    for (const r of p.rondas) {
      assert.equal(r.errores.length, 5);
      assert.ok(r.narracion.length >= 3);
      for (const l of r.narracion) assert.doesNotMatch(l.texto, /undefined|NaN/);
    }
    assert.notEqual(p.rondas.at(-1).final, null);
  }
});

test('cada jugador cuesta una llamada por subasta mientras tenga banco', async () => {
  const p = await jugar(4);
  const esperadas = p.rondas.reduce((n, r) => n + r.oculto.apuestas.filter((a) => a !== null).length, 0);
  assert.equal(p.llamadas, esperadas);
  const retirado = p.usoPorJugador[0].llamadas;
  assert.equal(retirado, 19, 'el que nunca apuesta conserva su banco y juega las 19');
  assert.ok(p.usoPorJugador[3].llamadas < 19, 'el gastador se queda sin tiempo antes');
});

test('con el mismo seed y los mismos bots la partida sale identica', async () => {
  const a = await jugar(7), b = await jugar(7);
  assert.deepEqual(a.rondas, b.rondas);
  assert.deepEqual(a.puntos, b.puntos);
});

test('con asientos rotados la serie corre completa', async () => {
  const plan = planDeSerie({ claves: CLAVES, partidas: 5, seedBase: 7, mismoSeed: true });
  const agentesPorClave = new Map(CLAVES.map((c) => [c, resolverAgente(c, subasta)]));
  const partidas = await ejecutarSerie({ juego: subasta, plan, agentesPorClave });
  assert.equal(partidas.length, 5);
  assert.deepEqual(partidas[1].jugadores.map((j) => j.id), ['parejo', 'azar', 'gastador', 'cuentagotas', 'retirado']);
  for (const p of partidas) assert.equal(p.truncada, false);
});

test('una partida cortada con maxRondas no se cae: sin final, sin epilogo', async () => {
  const p = await jugar(7, { maxRondas: 4 });
  assert.equal(p.truncada, true);
  assert.equal(p.rondas.length, 4);
  assert.deepEqual(p.epilogo, []);
  assert.equal(p.ganador, null);
  assert.equal(p.rondas.at(-1).final, null);
});

test('un modelo caido no tumba la partida: se retira en cada subasta y el fallo queda anotado', async () => {
  const caido = { id: 'caido', nombre: 'Caido', color: '#888888', inicial: 'C', tipo: 'modelo', modelo: 'x/y', async jugar() { throw new Error('HTTP 500'); } };
  const todos = [caido, ...agentes(['parejo', 'azar', 'gastador', 'cuentagotas'])];
  const p = await correrPartida({ juego: subasta, agentes: todos, seed: 3 });
  assert.equal(p.truncada, false);
  assert.equal(p.rondas.filter((r) => r.errores[0] === 'HTTP 500').length, 19);
  assert.ok(p.rondas.every((r) => r.invalidas[0] === true && r.oculto.apuestas[0] === 0));
  assert.equal(p.metricas[0].jugadasInvalidas, 19);
  assert.equal(p.metricas[0].bancoFinal, 600);
});

test('el marcador lee la categoria, sus puntos y la obediencia sin conocer el juego, y no muestra NaN', async () => {
  const partidas = [await jugar(7), await jugar(8)];
  const ep = {
    etiqueta: 'prueba', fecha: '2026-10-11T00:00:00.000Z',
    juego: { id: subasta.id, nombre: subasta.nombre, categoria: subasta.categoria },
    seedBase: 7, modo: null, destino: 'pruebas', jugadores: CLAVES,
    serie: { partidas: 2, rotar: false, mismoSeed: false }, partidas,
  };
  const m = armarMarcador([{ archivo: 'prueba.json', ep }], '2026-10-11T00:00:00.000Z');
  const cat = m.categorias.find((c) => c.nombre === 'Estrategia de eliminación');
  assert.ok(cat);
  assert.equal(cat.tabla.length, 5);
  for (const f of cat.tabla) {
    assert.equal(f.partidas, 2);
    assert.equal(f.fiabilidad, null);
    assert.equal(f.obediencia, 1);
    assert.ok(Number.isFinite(f.puntosPorPartida));
    assert.equal(f.victorias + f.empates + f.derrotas, 2);
  }
  assert.doesNotMatch(JSON.stringify(m), /NaN/);
});
