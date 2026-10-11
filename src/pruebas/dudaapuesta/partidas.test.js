// Duda y apuesta de punta a punta: la arena, los bots de control, una serie con asientos rotados, el marcador, la partida cortada y un modelo caido.
// Es el unico juego por turnos: un turno = una decision de un solo jugador = una llamada. Sin red y sin API: todo con bots.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correrPartida } from '../../arena.js';
import { ejecutarSerie } from '../../ejecutar-serie.js';
import { planDeSerie, errorDeCantidad } from '../../serie.js';
import { resolverAgente } from '../../agentes.js';
import { armarMarcador } from '../../marcador.js';
import dudaapuesta from '../../juegos/dudaapuesta.js';
import { JUEGOS, obtenerJuego } from '../../juegos/index.js';
import { nuevoEstado } from './ayudas.js';

const CLAVES = ['calculador', 'farolero', 'retador', 'prudente'];
const agentes = (claves = CLAVES) => claves.map((c) => resolverAgente(c, dudaapuesta));
const jugar = (seed, extra = {}, claves = CLAVES) => correrPartida({ juego: dudaapuesta, agentes: agentes(claves), seed, ...extra });

test('el juego esta registrado, cumple el contrato y la consola acepta sus bots por nombre', () => {
  assert.equal(JUEGOS.dudaapuesta, dudaapuesta);
  assert.equal(obtenerJuego('dudaapuesta').nombre, 'Duda y apuesta');
  assert.equal(dudaapuesta.categoria, 'Engaño y deducción');
  assert.equal(dudaapuesta.jugadores, 4);
  assert.equal(dudaapuesta.minJugadores, 4);
  assert.equal(dudaapuesta.maxJugadores, 4);
  assert.equal(dudaapuesta.rondas, 96);
  assert.equal(dudaapuesta.mismoSeedEnSerie, true);
  for (const f of ['crear', 'terminado', 'vista', 'normalizar', 'aplicar', 'resultado', 'activos']) assert.equal(typeof dudaapuesta[f], 'function', f);
  assert.deepEqual(Object.keys(dudaapuesta.bots).sort(), ['azar', 'calculador', 'farolero', 'prudente', 'retador']);
  for (const id of Object.keys(dudaapuesta.bots)) assert.equal(resolverAgente(id, dudaapuesta).tipo, 'bot');
  assert.throws(() => resolverAgente('siempre-c', dudaapuesta), /estrategia del Dilema/);
  assert.ok(errorDeCantidad(dudaapuesta, 3));
  assert.ok(errorDeCantidad(dudaapuesta, 5));
  assert.equal(errorDeCantidad(dudaapuesta, 4), null);
});

test('activos: exactamente un jugador por turno (al que le toca) y ninguno al terminar', () => {
  const E = nuevoEstado();
  assert.deepEqual(dudaapuesta.activos(E), [true, false, false, false]);
  E.fase = 'respuesta';
  E.cadena = [{ asiento: 0, color: 'rojo', cantidad: 3, apuesta: { fichas: 1, espacios: 0 } }];
  assert.deepEqual(dudaapuesta.activos(E), [false, true, false, false]);
  E.fase = 'defensa';
  assert.deepEqual(dudaapuesta.activos(E), [true, false, false, false], 'en la defensa decide quien anuncio');
  E.fin = true;
  assert.deepEqual(dudaapuesta.activos(E), [false, false, false, false]);
});

test('una partida completa entre bots: una llamada por turno, nunca mas de 96, y trae lo que la arena y el marcador esperan', async () => {
  for (let seed = 1; seed <= 12; seed++) {
    const p = await jugar(seed);
    assert.equal(p.truncada, false, `seed ${seed}`);
    assert.equal(p.llamadas, p.rondas.length, 'una llamada por turno: solo se le pregunta a quien le toca');
    assert.ok(p.llamadas >= 3 && p.llamadas <= 96, `seed ${seed}: ${p.llamadas} llamadas`);
    assert.equal(p.usoPorJugador.reduce((a, u) => a + u.llamadas, 0), p.llamadas);
    assert.deepEqual(p.avisos, []);
    assert.equal(p.juego.id, 'dudaapuesta');
    assert.deepEqual(p.jugadores.map((j) => j.id), CLAVES);
    assert.equal(p.metricas.length, 4);
    assert.ok(p.puntos.every((x) => [0, 2, 4].includes(x)));
    assert.ok(p.epilogo.length >= 3);
    assert.notEqual(p.rondas.at(-1).final, null);
    assert.ok(p.rondas.slice(0, -1).every((r) => r.final === null));
    for (const r of p.rondas) {
      assert.equal(r.errores.length, 4);
      assert.equal(r.invalidas.filter((x) => x !== null).length, 1, 'un solo jugador responde por turno');
      assert.ok(r.narracion.length >= 1);
      for (const l of r.narracion) assert.doesNotMatch(l.texto, /undefined|NaN/);
    }
  }
});

test('con el mismo seed y los mismos bots la partida sale identica', async () => {
  const a = await jugar(7), b = await jugar(7);
  assert.deepEqual(a.rondas, b.rondas);
  assert.deepEqual(a.puntos, b.puntos);
});

test('una serie de 4 partidas rota los asientos y cada IA enfrenta las mismas cartas por asiento', async () => {
  const plan = planDeSerie({ claves: CLAVES, partidas: 4, seedBase: 7, mismoSeed: true });
  const agentesPorClave = new Map(CLAVES.map((c) => [c, resolverAgente(c, dudaapuesta)]));
  const partidas = await ejecutarSerie({ juego: dudaapuesta, plan, agentesPorClave });
  assert.equal(partidas.length, 4);
  assert.deepEqual(partidas[1].jugadores.map((j) => j.id), ['farolero', 'retador', 'prudente', 'calculador']);
  const cartas = (p) => p.rondas[0].oculto.cartas;
  for (const p of partidas.slice(1)) assert.deepEqual(cartas(p), cartas(partidas[0]), 'mismo mundo: solo cambian los asientos');
  for (const p of partidas) assert.equal(p.truncada, false);
});

test('una partida cortada con maxRondas no se cae: sin final, sin epilogo, sin ganador inventado', async () => {
  const p = await jugar(7, { maxRondas: 3 });
  assert.equal(p.truncada, true);
  assert.equal(p.rondas.length, 3);
  assert.deepEqual(p.epilogo, []);
  assert.equal(p.ganador, null);
  assert.equal(p.empate, true);
  assert.equal(p.rondas.at(-1).final, null);
  assert.ok(p.puntos.every((x) => x === 2), 'una partida cortada cuenta todo como "medio"');
});

test('un modelo caido no tumba la partida: juega por reemplazo en cada turno que se le pregunta y el fallo queda anotado', async () => {
  const caido = { id: 'caido', nombre: 'Caido', color: '#888888', inicial: 'C', tipo: 'modelo', modelo: 'x/y', async jugar() { throw new Error('HTTP 500'); } };
  const p = await correrPartida({ juego: dudaapuesta, agentes: [caido, ...agentes(['calculador', 'retador', 'prudente'])], seed: 3 });
  assert.equal(p.truncada, false);
  const suyos = p.rondas.filter((r) => r.asiento === 0);
  assert.ok(suyos.length >= 1);
  assert.ok(suyos.every((r) => r.errores[0] === 'HTTP 500' && r.invalidas[0] === true));
  assert.equal(p.metricas[0].jugadasInvalidas, suyos.length);
  assert.equal(p.metricas[0].ordenesTotal, suyos.length);
  assert.equal(p.metricas[0].anuncios, 0, 'ningun anuncio lo eligio el modelo');
});

test('un modelo que contesta basura en todas las fases (accion inventada, color de otro juego) tampoco la tumba', async () => {
  const basura = { id: 'basura', nombre: 'Basura', color: '#888888', inicial: 'B', tipo: 'modelo', modelo: 'x/y', async jugar() { return { respuesta: { accion: 'volar', color: 'violeta', cantidad: -4 }, crudo: 'x', uso: null }; } };
  for (let seed = 1; seed <= 20; seed++) {
    const p = await correrPartida({ juego: dudaapuesta, agentes: [basura, basura, basura, basura], seed });
    assert.equal(p.truncada, false, `seed ${seed}`);
    assert.ok(p.llamadas <= 96);
    assert.ok(p.rondas.every((r) => r.invalidas.filter((x) => x === true).length === 1));
  }
});

test('el marcador lee la categoria, sus puntos y la obediencia sin conocer el juego, y no muestra NaN', async () => {
  const partidas = [await jugar(7), await jugar(8)];
  const ep = {
    etiqueta: 'prueba', fecha: '2026-10-11T00:00:00.000Z',
    juego: { id: dudaapuesta.id, nombre: dudaapuesta.nombre, categoria: dudaapuesta.categoria },
    seedBase: 7, modo: null, destino: 'pruebas', jugadores: CLAVES,
    serie: { partidas: 2, rotar: false, mismoSeed: false }, partidas,
  };
  const m = armarMarcador([{ archivo: 'prueba.json', ep }], '2026-10-11T00:00:00.000Z');
  const cat = m.categorias.find((c) => c.nombre === 'Engaño y deducción');
  assert.ok(cat);
  assert.equal(cat.tabla.length, 4);
  for (const f of cat.tabla) {
    assert.equal(f.partidas, 2);
    assert.equal(f.fiabilidad, null);
    assert.ok(f.obediencia === null || f.obediencia === 1, 'sin respuestas propias (nunca le toco decidir) la obediencia es null, no 0 ni NaN');
    assert.ok(Number.isFinite(f.puntosPorPartida));
    assert.equal(f.victorias + f.empates + f.derrotas, 2);
  }
  assert.ok(cat.tabla.some((f) => f.obediencia === 1), 'alguien contesto');
  assert.doesNotMatch(JSON.stringify(m), /NaN/);
});
