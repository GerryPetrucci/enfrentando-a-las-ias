// El contrato de las mesas de casino (una por juego) y su clase base: lo que la pagina (escena.js) espera de cualquiera de ellas.
// Sin navegador: las mesas se pueden importar en Node porque no tocan el DOM hasta que se crean.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { juegosConEscena, mesaDe } from '../../../web/casino/lineas.js';
import { MesaBase } from '../../../web/casino/mesa-base.js';
import { construirLineaDeTiempo as lineaDuda } from '../../../web/casino/linea-de-tiempo-duda.js';
import { construirLineaDeTiempo as lineaMM } from '../../../web/casino/linea-de-tiempo-mayormenor.js';
import { construirLineaDeTiempo as lineaSol } from '../../../web/casino/linea-de-tiempo-solitario.js';
import { construirLineaDeTiempo as lineaTD } from '../../../web/casino/linea-de-tiempo-tripledado.js';
import { construirLineaDeTiempo as lineaSub } from '../../../web/casino/linea-de-tiempo-subasta.js';
import { jugar } from './ayudas.js';
import { jugarMM, jugarMMConCaido } from './ayudas-mm.js';
import { jugarSol, jugarSolConCaido } from './ayudas-sol.js';
import { jugarTD, jugarTDConCaido } from './ayudas-td.js';
import { jugarSub, jugarSubConCaido } from './ayudas-sub.js';
import { construirLineaDeTiempo as lineaFuga } from '../../../web/casino/linea-de-tiempo-fuga.js';
import { jugarFuga, jugarFugaConCaido } from './ayudas-fuga.js';

const METODOS = ['ejecutar', 'estadoVisible', 'mostrarEstadoInicial', 'fijarEstado', 'anim', 'esperar', 'programar', 'sonar', 'nombre', 'mostrarSubtitulos', 'voltear', 'volarFichas'];
const web = (r) => new URL(`../../../web/${r}`, import.meta.url);

test('la mesa de cada juego registrado cumple el contrato de la pagina y extiende la base comun', async () => {
  for (const id of juegosConEscena()) {
    const { Mesa } = await mesaDe(id);
    assert.equal(typeof Mesa, 'function', `${id}: el modulo de la mesa exporta Mesa`);
    assert.ok(Mesa.prototype instanceof MesaBase, `${id}: la mesa extiende MesaBase`);
    for (const m of METODOS) assert.equal(typeof Mesa.prototype[m], 'function', `${id}: falta el metodo ${m}`);
  }
});

test('el armazon de la pagina es escena.js (sirve a todos los juegos) y escena-duda.js ya no existe', () => {
  assert.ok(existsSync(web('casino/escena.js')));
  assert.ok(!existsSync(web('casino/escena-duda.js')), 'escena-duda.js se partio en escena.js y mesa-duda.js');
  const html = readFileSync(web('escena.html'), 'utf8');
  assert.match(html, /from '\.\/casino\/escena\.js'/);
  assert.doesNotMatch(html, /escena-duda/);
});

test('MesaBase: la velocidad acorta animaciones, esperas y temporizadores por igual, y el modo rapido no espera', async () => {
  const llamadas = [];
  const nodo = { animate: (frames, opciones) => { llamadas.push(opciones); return {}; } };
  const mesa = new MesaBase('9x16', { jugadores: [] }, { sfx: {}, vel: 4 }, {});
  mesa.anim(nodo, [], { duration: 400, delay: 200, fill: 'both' });
  assert.deepEqual(llamadas[0], { duration: 100, delay: 50, fill: 'both' });
  mesa.rapido = true;
  mesa.anim(nodo, [], { duration: 400, delay: 200, fill: 'both' });
  assert.deepEqual(llamadas[1], { duration: 1, delay: 0, fill: 'both' });
  const t0 = Date.now();
  await mesa.esperar(60000);
  assert.ok(Date.now() - t0 < 100, 'en modo rapido no se espera');
  let llamada = false;
  mesa.programar(60000, () => { llamada = true; });
  assert.equal(llamada, true, 'en modo rapido el temporizador corre al instante');
  mesa.rapido = false;
  // se mide contra la misma espera a velocidad 1 (en la misma maquina y con la misma carga): a vel 4 tiene que tardar bastante menos, sin depender de cuantos ms sean
  const normal = new MesaBase('9x16', { jugadores: [] }, { sfx: {}, vel: 1 }, {});
  const t0n = Date.now();
  await normal.esperar(400);
  const tNormal = Date.now() - t0n;
  const t1 = Date.now();
  await mesa.esperar(400);
  const paso = Date.now() - t1;
  assert.ok(paso < tNormal * 0.6, `esperar(400) a velocidad 4 tardo ${paso} ms y a velocidad 1, ${tNormal} ms`);
});

test('MesaBase.nombre cae en "Jugador N" si falta el jugador', () => {
  const mesa = new MesaBase('9x16', { jugadores: [{ nombre: 'Claude' }] }, { sfx: {} }, {});
  assert.equal(mesa.nombre(0), 'Claude');
  assert.equal(mesa.nombre(1), 'Jugador 2');
});

test('cada mesa declara METODOS (tipo de beat -> metodo) y cada tipo de beat que su juego produce tiene un metodo que existe (se vio: un campo con el mismo nombre tapaba un metodo)', async () => {
  const partidas = {
    dudaapuesta: async () => lineaDuda(await jugar(3)),
    mayormenor: async () => [...lineaMM(await jugarMM(3)), ...lineaMM(await jugarMMConCaido(2, 0)), ...lineaMM(await jugarMM(1, ['prudente', 'temerario']))],
    tripledado: async () => [...lineaTD(await jugarTD(3)), ...lineaTD(await jugarTDConCaido(2, 0)), ...lineaTD(await jugarTD(1, undefined, { maxRondas: 6 }))],
    subasta: async () => [...lineaSub(await jugarSub(3)), ...lineaSub(await jugarSubConCaido(2, 0)), ...lineaSub(await jugarSub(1, ['parejo', 'parejo', 'parejo', 'parejo', 'parejo'])), ...lineaSub(await jugarSub(1, undefined, { maxRondas: 5 }))],
    fuga: async () => [...lineaFuga(await jugarFuga(3)), ...lineaFuga(await jugarFugaConCaido(2, 0)), ...lineaFuga(await jugarFuga(1, ['traidor', 'traidor'])), ...lineaFuga(await jugarFuga(1, undefined, { maxRondas: 4 }))],
    solitario: async () => [...lineaSol(await jugarSol(3)), ...lineaSol(await jugarSolConCaido(2, 0)), ...lineaSol(await jugarSol(1, ['bajo', 'bajo', 'bajo', 'bajo', 'bajo']))],
  };
  for (const id of juegosConEscena()) {
    const { Mesa } = await mesaDe(id);
    assert.equal(typeof Mesa.METODOS, 'object', `${id}: falta Mesa.METODOS`);
    for (const [tipo, metodo] of Object.entries(Mesa.METODOS)) assert.equal(typeof Mesa.prototype[metodo], 'function', `${id}: el beat "${tipo}" apunta a ${metodo}, que no existe`);
    assert.ok(partidas[id], `${id}: falta una partida de prueba en esta prueba`);
    const tipos = new Set((await partidas[id]()).map((b) => b.tipo));
    for (const tipo of tipos) assert.ok(Mesa.METODOS[tipo], `${id}: el beat "${tipo}" no tiene metodo en la mesa`);
  }
});
