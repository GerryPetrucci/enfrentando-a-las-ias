// La linea de comandos de punta a punta, solo con bots de control (sin red, sin API, sin gastar nada).
// Cada prueba borra el archivo que crea. El modo gratis/pago se prueba aparte, en modo.test.js.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { biomaDeSeed, BIOMAS } from '../mapa.js';
import { crearRng } from '../rng.js';

const RAIZ = fileURLToPath(new URL('../..', import.meta.url));
const cli = (...args) => spawnSync(process.execPath, ['src/correr.js', ...args], { cwd: RAIZ, encoding: 'utf8' });
const BOTS = 'agresivo,pacifico,economico,azar';

// Corre la consola, devuelve { r, datos } y borra el archivo guardado al terminar.
function correrYLeer(...args) {
  const r = cli(...args);
  assert.equal(r.status, 0, r.stderr);
  const ruta = /Guardado: (data\/[\w/.\-]+\.json)/.exec(r.stdout)?.[1];
  assert.ok(ruta, `la consola no dijo donde guardo:\n${r.stdout}`);
  try {
    return { r, ruta, datos: JSON.parse(readFileSync(join(RAIZ, ruta), 'utf8')) };
  } finally {
    rmSync(join(RAIZ, ruta), { force: true });
  }
}

test('una serie de conquista con 4 bots rota los asientos, conserva el seed y va a data/pruebas', () => {
  const { ruta, datos } = correrYLeer('--juego=conquista', `--jugadores=${BOTS}`, '--partidas=4', '--destino=pruebas', '--seed=7');
  assert.match(ruta, /^data\/pruebas\//);
  assert.equal(datos.destino, 'pruebas');
  assert.equal(datos.modo, null);
  assert.deepEqual(datos.jugadores, BOTS.split(','));
  assert.equal(datos.partidas.length, 4);
  assert.ok(datos.partidas.every((p) => p.seed === 7));
  assert.deepEqual(datos.partidas.map((p) => p.jugadores[0].id), ['agresivo', 'pacifico', 'economico', 'azar']);
  for (const p of datos.partidas) assert.equal(p.puntos.filter((x) => x === 5).length, 1);
  assert.deepEqual(datos.serie, { partidas: 4, rotar: true, mismoSeed: true });
  assert.ok(datos.partidas.every((p) => typeof p.llamadas === 'number' && p.llamadas > 0));
});

test('el duelo del Dilema sigue igual: alterna asientos, un seed distinto por partida y va a data/', () => {
  const { ruta, datos } = correrYLeer('--a=tomaydaca', '--b=siempre-t', '--partidas=2', '--seed=5');
  assert.match(ruta, /^data\/[^/]+\.json$/);
  assert.equal(datos.destino, 'oficial');
  assert.deepEqual(datos.partidas.map((p) => p.jugadores[0].id), ['tomaydaca', 'siempre-t']);
  assert.deepEqual(datos.partidas.map((p) => p.invertido), [false, true]);
  assert.equal(datos.partidas[1].seed - datos.partidas[0].seed, 7919);
});

test('--bioma=arido fuerza el bioma en toda la serie, queda guardado en cada partida y la consola lo dice', () => {
  // seed fijo, y uno al que el seed NO le da arido por si solo: sin esto, algunos dias (el seed sale de la fecha) la prueba pasaria aunque --bioma se ignorara
  const seedMapa = Math.floor(crearRng(7)() * 4294967296) >>> 0;
  assert.notEqual(biomaDeSeed(seedMapa), 'arido', 'el seed 7 no debe dar arido por si solo');
  const { r, datos } = correrYLeer('--juego=conquista', `--jugadores=${BOTS}`, '--partidas=2', '--destino=pruebas', '--seed=7', '--bioma=arido');
  assert.ok(datos.partidas.every((p) => p.mapa.bioma === 'arido'));
  assert.match(r.stdout, /bioma arido/);
});

test('sin --bioma, cada partida de conquista guarda el que le toca por seed y la consola lo dice', () => {
  const { r, datos } = correrYLeer('--juego=conquista', `--jugadores=${BOTS}`, '--partidas=2', '--destino=pruebas', '--seed=7');
  const b = datos.partidas[0].mapa.bioma;
  assert.ok(BIOMAS.includes(b), b);
  assert.ok(datos.partidas.every((p) => p.mapa.bioma === b), 'la serie cambio de bioma');
  assert.match(r.stdout, new RegExp(`bioma ${b}`));
});

test('--bioma con un valor que no es uno de los biomas, vacio o sin valor da un error que los lista; con otro juego, tambien', () => {
  for (const malo of ['--bioma=raro', '--bioma=ARIDO', '--bioma=', '--bioma']) {
    const r = cli('--juego=conquista', `--jugadores=${BOTS}`, '--partidas=2', '--destino=pruebas', malo);
    assert.equal(r.status, 1, malo);
    assert.match(r.stderr, new RegExp('--bioma debe ser uno de: ' + BIOMAS.join(', ')), `${malo}: el error debe salir de la consola, antes de correr nada`);
  }
  // con otro juego el duelo seria real y se guardaria en data/ (el destino oficial): --partidas=1 --destino=pruebas acota el dano si la comprobacion faltara algun dia
  const r = cli('--a=tomaydaca', '--b=siempre-t', '--partidas=1', '--destino=pruebas', '--bioma=arido');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /solo vale para la Guerra de territorios/);
});

test('una serie desbalanceada se corre pero avisa', () => {
  const { r } = correrYLeer('--juego=conquista', `--jugadores=${BOTS}`, '--partidas=2', '--destino=pruebas');
  assert.match(r.stdout, /desbalanceada/);
});

test('errores de uso: cantidad de jugadores, estrategia de otro juego, destino invalido y modelo sin modo', () => {
  let r = cli('--juego=conquista', '--jugadores=agresivo');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /entre 2 y 5/);

  r = cli('--juego=conquista', '--jugadores=tomaydaca,agresivo');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /del Dilema/);

  r = cli('--a=tomaydaca', '--b=siempre-t', '--destino=cualquiera');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /destino/);

  r = cli('--juego=conquista', '--jugadores=claude,agresivo,pacifico');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--modo=gratis/);
});
