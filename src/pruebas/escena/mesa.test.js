// El contrato de las mesas de casino (una por juego) y su clase base: lo que la pagina (escena.js) espera de cualquiera de ellas.
// Sin navegador: las mesas se pueden importar en Node porque no tocan el DOM hasta que se crean.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { juegosConEscena, mesaDe } from '../../../web/casino/lineas.js';
import { MesaBase } from '../../../web/casino/mesa-base.js';

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
  const t1 = Date.now();
  await mesa.esperar(400); // a vel 4: unos 100 ms
  const paso = Date.now() - t1;
  assert.ok(paso >= 80 && paso < 300, `esperar(400) a velocidad 4 tardo ${paso} ms`);
});

test('MesaBase.nombre cae en "Jugador N" si falta el jugador', () => {
  const mesa = new MesaBase('9x16', { jugadores: [{ nombre: 'Claude' }] }, { sfx: {} }, {});
  assert.equal(mesa.nombre(0), 'Claude');
  assert.equal(mesa.nombre(1), 'Jugador 2');
});
