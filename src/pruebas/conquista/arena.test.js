// La Guerra de territorios dentro de la arena de verdad, con bots de control (sin red ni API).
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correrPartida } from '../../arena.js';
import { resolverAgente } from '../../agentes.js';
import conquista from '../../juegos/conquista.js';
import { BIOMAS, CONFIG, restaurarMapa } from '../../mapa.js';

const bots = (...claves) => claves.map((c) => resolverAgente(c, conquista));
const COMBO = ['agresivo', 'pacifico', 'economico', 'azar'];
const jugar = (seed, claves = COMBO, extra = {}) => correrPartida({ juego: conquista, agentes: bots(...claves), seed, ...extra });

test('una partida de 4 bots corre en la arena y deja un resultado completo y guardable', async () => {
  const r = await jugar(12);
  assert.ok(r.ganador >= 0 && r.ganador < 4);
  assert.equal(r.truncada, false);
  assert.equal(r.puntos[r.ganador], 5);
  assert.equal(r.jugadores.length, 4);
  assert.equal(r.usoPorJugador.reduce((s, u) => s + u.llamadas, 0), r.llamadas);
  assert.doesNotThrow(() => JSON.stringify(r));
  assert.ok(r.rondas.every((x) => Array.isArray(x.errores) && Array.isArray(x.respuestas)));
});

test('la partida guardada trae su mapa completo y su bioma, y el mapa se restaura desde el JSON', async () => {
  for (const bioma of BIOMAS) {
    const r = await jugar(5, COMBO, { opciones: { bioma } });
    const guardada = JSON.parse(JSON.stringify(r));
    assert.equal(guardada.mapa.bioma, bioma);
    assert.equal(guardada.mapa.k, 4);
    const m = restaurarMapa(guardada.mapa);
    assert.equal(m.regs.length, CONFIG[4].N);
    assert.equal(m.bioma, bioma);
    assert.ok(JSON.stringify(guardada.mapa).length <= 30000);
  }
});

test('de 2 a 5 reinos terminan con un solo ganador y 5/3/1/0 puntos', async () => {
  for (const claves of [COMBO.slice(0, 2), COMBO.slice(0, 3), COMBO, [...COMBO, 'agresivo']]) {
    const r = await jugar(3, claves);
    assert.equal(r.jugadores.length, claves.length);
    assert.equal(r.puntos.filter((p) => p === 5).length, 1, claves.join());
    assert.equal(r.puntos[r.ganador], 5);
  }
});

test('un reino caido deja de recibir llamadas', async () => {
  let vistos = 0;
  for (let seed = 1; seed <= 40 && !vistos; seed++) {
    const r = await jugar(seed, ['agresivo', 'agresivo', 'agresivo', 'agresivo']);
    if (!r.rondas.some((x) => x.eventos.some((e) => e.tipo === 'caida'))) continue;
    vistos++;
    const vivosAlInicio = (i) => (i === 0 ? 4 : r.rondas[i - 1].estado.vivo.filter(Boolean).length);
    assert.equal(r.llamadas, r.rondas.reduce((suma, _, i) => suma + vivosAlInicio(i), 0));
    assert.ok(r.llamadas < 4 * r.rondas.length);
  }
  assert.equal(vistos, 1, 'ninguna de las 40 partidas tuvo un reino caido');
});

test('mismo seed y mismos bots (incluido el azar): la misma partida, turno por turno', async () => {
  const a = await jugar(9), b = await jugar(9), c = await jugar(10);
  assert.equal(JSON.stringify(a.rondas), JSON.stringify(b.rondas));
  assert.notEqual(JSON.stringify(a.rondas), JSON.stringify(c.rondas));
});

test('el registro de cada turno trae lo que el espectador necesita: razon, ordenes, pacto y la causa si algo fallo', async () => {
  const valido = { ...resolverAgente('pacifico', conquista), necesitaEstado: false, async jugar() { return { respuesta: { ordenes: ['armar'], pacto_con: 'Ambar', razon: 'por si acaso' }, crudo: 'texto', uso: null }; } };
  const basura = { ...resolverAgente('azar', conquista), necesitaEstado: false, async jugar() { return { respuesta: 'hola', crudo: 'x'.repeat(1000), uso: null }; } };
  const roto = { ...resolverAgente('azar', conquista), necesitaEstado: false, async jugar() { throw new Error('se cayo la red'); } };
  const r = await correrPartida({ juego: conquista, agentes: [valido, basura, roto], seed: 1, maxRondas: 1 });
  const [x] = r.rondas;
  assert.deepEqual(x.respuestas[0], { ordenes: ['armar'], pactoCon: 1, razon: 'por si acaso', invalida: false, motivo: null, crudo: null });
  assert.equal(x.respuestas[1].invalida, true);
  assert.ok(x.respuestas[1].motivo);
  assert.equal(x.respuestas[1].crudo.length, 400);
  assert.equal(x.respuestas[2].invalida, true);
  assert.deepEqual(x.errores, [null, null, 'se cayo la red']);
  assert.equal(r.truncada, true);
});

test('las metricas traen las claves que lee el marcador', async () => {
  const r = await jugar(12);
  for (const m of r.metricas) {
    for (const c of ['traiciones', 'promesasHechas', 'promesasRotas', 'jugadasInvalidas', 'ordenesValidas', 'ordenesTotal']) assert.equal(typeof m[c], 'number', c);
    assert.ok(m.ordenesValidas <= m.ordenesTotal);
    assert.equal(m.promesasHechas, m.pactosFirmados);
    assert.equal(m.promesasRotas, m.traiciones);
  }
});

test('el juego declara cuantos reinos admite y que una serie conserva el mapa', () => {
  assert.equal(conquista.minJugadores, 2);
  assert.equal(conquista.maxJugadores, 5);
  assert.equal(conquista.mismoSeedEnSerie, true);
});
