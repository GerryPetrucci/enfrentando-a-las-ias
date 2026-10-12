// Triple dado de punta a punta: la arena, los bots de control, una serie con asientos rotados, el marcador, la partida cortada, el turno sin llamadas
// de la ronda 4 y un modelo caido. Sin red y sin API: todo con bots.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correrPartida } from '../../arena.js';
import { ejecutarSerie } from '../../ejecutar-serie.js';
import { planDeSerie, errorDeCantidad } from '../../serie.js';
import { resolverAgente } from '../../agentes.js';
import { armarMarcador } from '../../marcador.js';
import tripledado from '../../juegos/tripledado.js';
import { JUEGOS, obtenerJuego } from '../../juegos/index.js';
import { nuevoEstado } from './ayudas.js';

const CLAVES = ['goloso', 'reservado', 'tanque', 'calculador'];
const agentes = (claves = CLAVES) => claves.map((c) => resolverAgente(c, tripledado));
const jugar = (seed, extra = {}, claves = CLAVES) => correrPartida({ juego: tripledado, agentes: agentes(claves), seed, ...extra });

test('el juego esta registrado, cumple el contrato y la consola acepta sus bots por nombre', () => {
  assert.equal(JUEGOS.tripledado, tripledado);
  assert.equal(obtenerJuego('tripledado').nombre, 'Triple dado');
  assert.equal(tripledado.categoria, 'Estrategia de eliminación');
  assert.equal(tripledado.jugadores, 4);
  assert.equal(tripledado.minJugadores, 4);
  assert.equal(tripledado.maxJugadores, 4);
  assert.equal(tripledado.rondas, 16);
  assert.equal(tripledado.mismoSeedEnSerie, true);
  for (const f of ['crear', 'terminado', 'vista', 'normalizar', 'aplicar', 'resultado', 'activos']) assert.equal(typeof tripledado[f], 'function', f);
  assert.deepEqual(Object.keys(tripledado.bots).sort(), ['azar', 'calculador', 'goloso', 'reservado', 'tanque']);
  for (const id of Object.keys(tripledado.bots)) assert.equal(resolverAgente(id, tripledado).tipo, 'bot');
  assert.throws(() => resolverAgente('siempre-c', tripledado), /estrategia del Dilema/);
  assert.ok(errorDeCantidad(tripledado, 3));
  assert.ok(errorDeCantidad(tripledado, 5));
  assert.equal(errorDeCantidad(tripledado, 4), null);
});

test('activos: los cuatro en cada turno, ninguno en la prediccion de la ronda 4 (no cuesta llamadas) y ninguno al terminar', () => {
  const E = nuevoEstado();
  assert.deepEqual(tripledado.activos(E), [true, true, true, true]);
  E.fase = 'jugada';
  E.enfrentamiento = 2;
  assert.deepEqual(tripledado.activos(E), [true, true, true, true]);
  E.ronda = 4;
  E.fase = 'prediccion';
  E.enfrentamiento = 0;
  assert.deepEqual(tripledado.activos(E), [false, false, false, false]);
  E.fase = 'jugada';
  E.enfrentamiento = 1;
  assert.deepEqual(tripledado.activos(E), [true, true, true, true]);
  E.fin = true;
  assert.deepEqual(tripledado.activos(E), [false, false, false, false]);
});

test('una partida completa entre bots: 16 turnos, exactamente 60 llamadas (15 por jugador), y trae lo que la arena y el marcador esperan', async () => {
  for (let seed = 1; seed <= 10; seed++) {
    const p = await jugar(seed);
    assert.equal(p.truncada, false, `seed ${seed}`);
    assert.equal(p.rondas.length, 16);
    assert.equal(p.llamadas, 60, `seed ${seed}`);
    assert.deepEqual(p.usoPorJugador.map((u) => u.llamadas), [15, 15, 15, 15], 'la tarjeta de la ronda 4 no cuesta llamada');
    assert.deepEqual(p.avisos, []);
    assert.equal(p.juego.id, 'tripledado');
    assert.deepEqual(p.jugadores.map((j) => j.id), CLAVES);
    assert.equal(p.metricas.length, 4);
    assert.ok(p.puntos.every((x) => [0, 2, 4].includes(x)));
    assert.ok(p.epilogo.length >= 3);
    for (const r of p.rondas) {
      assert.equal(r.errores.length, 4);
      assert.ok(r.narracion.length >= 5);
      for (const l of r.narracion) assert.doesNotMatch(l.texto, /undefined|NaN/);
    }
    assert.equal(p.rondas[12].forzada, true);
    assert.notEqual(p.rondas.at(-1).final, null);
  }
});

test('con el mismo seed y los mismos bots la partida sale identica', async () => {
  const a = await jugar(7), b = await jugar(7);
  assert.deepEqual(a.rondas, b.rondas);
  assert.deepEqual(a.puntos, b.puntos);
});

test('una serie de 4 partidas rota los asientos y cada IA enfrenta los mismos dados por asiento', async () => {
  const plan = planDeSerie({ claves: CLAVES, partidas: 4, seedBase: 7, mismoSeed: true });
  const agentesPorClave = new Map(CLAVES.map((c) => [c, resolverAgente(c, tripledado)]));
  const partidas = await ejecutarSerie({ juego: tripledado, plan, agentesPorClave });
  assert.equal(partidas.length, 4);
  assert.deepEqual(partidas[1].jugadores.map((j) => j.id), ['reservado', 'tanque', 'calculador', 'goloso']);
  const dados = (p) => p.rondas.filter((r) => r.fase === 'prediccion').map((r) => r.lanzamiento.blancos);
  for (const p of partidas.slice(1)) assert.deepEqual(dados(p), dados(partidas[0]), 'mismo mundo: solo cambian los asientos');
  for (const p of partidas) assert.equal(p.truncada, false);
});

test('una partida cortada con maxRondas no se cae: sin final, sin epilogo, sin ganador inventado', async () => {
  const p = await jugar(7, { maxRondas: 6 });
  assert.equal(p.truncada, true);
  assert.equal(p.rondas.length, 6);
  assert.deepEqual(p.epilogo, []);
  assert.equal(p.ganador, null);
  assert.equal(p.empate, true);
  assert.equal(p.rondas.at(-1).final, null);
});

test('un modelo caido no tumba la partida: juega por reemplazo en cada turno que se le pregunta y el fallo queda anotado', async () => {
  const caido = { id: 'caido', nombre: 'Caido', color: '#888888', inicial: 'C', tipo: 'modelo', modelo: 'x/y', async jugar() { throw new Error('HTTP 500'); } };
  const p = await correrPartida({ juego: tripledado, agentes: [caido, ...agentes(['goloso', 'reservado', 'tanque'])], seed: 3 });
  assert.equal(p.truncada, false);
  assert.equal(p.rondas.length, 16);
  assert.equal(p.rondas.filter((r) => r.errores[0] === 'HTTP 500').length, 15);
  assert.ok(p.rondas.filter((r) => !r.forzada).every((r) => r.invalidas[0] === true));
  assert.equal(p.metricas[0].jugadasInvalidas, 15);
  assert.equal(p.metricas[0].ordenesTotal, 15);
  assert.equal(p.metricas[0].predicciones, 0, 'ninguna tarjeta la eligio el modelo');
});

test('el marcador lee la categoria, sus puntos y la obediencia sin conocer el juego, y no muestra NaN', async () => {
  const partidas = [await jugar(7), await jugar(8)];
  const ep = {
    etiqueta: 'prueba', fecha: '2026-10-11T00:00:00.000Z',
    juego: { id: tripledado.id, nombre: tripledado.nombre, categoria: tripledado.categoria },
    seedBase: 7, modo: null, destino: 'pruebas', jugadores: CLAVES,
    serie: { partidas: 2, rotar: false, mismoSeed: false }, partidas,
  };
  const m = armarMarcador([{ archivo: 'prueba.json', ep }], '2026-10-11T00:00:00.000Z');
  const cat = m.categorias.find((c) => c.nombre === 'Estrategia de eliminación');
  assert.ok(cat);
  assert.equal(cat.tabla.length, 4);
  for (const f of cat.tabla) {
    assert.equal(f.partidas, 2);
    assert.equal(f.fiabilidad, null);
    assert.equal(f.obediencia, 1);
    assert.ok(Number.isFinite(f.puntosPorPartida));
    assert.equal(f.victorias + f.empates + f.derrotas, 2);
  }
  assert.doesNotMatch(JSON.stringify(m), /NaN/);
});
