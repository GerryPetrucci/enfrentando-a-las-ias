// La primera partida real de Lobo con modelos (25 oct 2026) se jugo entera y luego se cayo la consola al contar los errores de API: los registros de Lobo
// traen `invalidas` pero no `errores`, y src/correr.js asumia que todo juego los traia. El resultado se perdio. Aqui se protege ese camino sin red.
//
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import juego from '../../juegos/lobo.js';
import { ARQUETIPOS } from '../../juegos/lobo-bots.js';
import { resolverAgente } from '../../agentes.js';
import { correrPartida } from '../../arena.js';

const RAIZ = fileURLToPath(new URL('../../..', import.meta.url));
const JUGADORES = ARQUETIPOS.join(',');

test('la arena guarda en cada registro de Lobo los errores de API de cada asiento (null si no hubo)', async () => {
  const caido = { id: 'caido', nombre: 'Caido', color: '#888888', inicial: 'C', tipo: 'modelo', modelo: 'x/y', async jugar() { throw new Error('OpenRouter 500: boom'); } };
  const agentes = ARQUETIPOS.map((a, i) => (i === 3 ? caido : resolverAgente(a, juego)));
  const p = await correrPartida({ juego, agentes, seed: 5 });
  assert.ok(p.rondas.length > 3 && !p.truncada);
  for (const r of p.rondas) {
    assert.ok(Array.isArray(r.errores) && r.errores.length === 8, `turno ${r.turno}: errores = ${JSON.stringify(r.errores)}`);
    assert.ok(r.errores.every((e, i) => e === null || (i === 3 && /OpenRouter 500: boom/.test(e))), 'solo el asiento caido tiene error');
  }
  // Cada llamada que hizo el asiento caido quedo anotada, y el motor la trato como jugada invalida y la reemplazo.
  const conError = p.rondas.filter((r) => r.errores[3]).length;
  assert.equal(conError, p.usoPorJugador[3].llamadas);
  assert.equal(p.metricas[3].jugadasInvalidas, conError);
  assert.ok(conError > 0);
});

test('un juego que ya trae `errores` no se toca (se conserva su propio contenido)', async () => {
  const propio = { id: 'x', nombre: 'X', jugadores: 2, rondas: 1, reglas: '', formatoRespuesta: '', crear: () => ({ fin: false }), terminado: (e) => e.fin,
    vista: () => '', normalizar: (r) => r, aplicar: (e) => { e.fin = true; return { errores: ['propio', null] }; }, resultado: () => ({ puntos: [0, 0], ganador: null, empate: true }) };
  const bots = [0, 1].map((i) => ({ id: `b${i}`, nombre: `B${i}`, color: '#000000', inicial: 'B', tipo: 'bot', modelo: null, async jugar() { return { respuesta: {}, crudo: null, uso: null }; } }));
  const p = await correrPartida({ juego: propio, agentes: bots, seed: 1 });
  assert.deepEqual(p.rondas[0].errores, ['propio', null]);
});

test('la consola corre una partida de Lobo de punta a punta, dice quien gano y guarda el resultado con sus errores', () => {
  const r = spawnSync(process.execPath, ['src/correr.js', '--juego=lobo', `--jugadores=${JUGADORES}`, '--partidas=1', '--destino=pruebas', '--seed=7'], { cwd: RAIZ, encoding: 'utf8' });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /gana el bando (aldea|lobos)|empate/);
  assert.doesNotMatch(r.stdout, /undefined/);
  const ruta = /Guardado: (data\/pruebas\/[\w.\-]+\.json)/.exec(r.stdout)?.[1];
  assert.ok(ruta, r.stdout);
  try {
    const datos = JSON.parse(readFileSync(join(RAIZ, ruta), 'utf8'));
    assert.equal(datos.destino, 'pruebas');
    assert.equal(datos.partidas.length, 1);
    assert.ok(datos.partidas[0].rondas.every((x) => Array.isArray(x.errores) && x.errores.length === 8));
  } finally {
    rmSync(join(RAIZ, ruta), { force: true });
  }
});
