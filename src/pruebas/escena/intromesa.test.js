// La animacion de la tarjeta de arranque en MesaBase (web/casino/mesa-base.js): la misma para los 7 juegos y sin pasar por METODOS. El aspecto se verifica con capturas
// (herramientas/capturar-escena.mjs); aqui, que el beat se maneje solo, no toque los subtitulos del juego y no deje nada a la vista. Un DOM falso minimo, sin navegador.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MesaBase } from '../../../web/casino/mesa-base.js';
import { armarLinea } from '../../../web/casino/lineas.js';
import { textoDeJuego } from '../../../web/casino/textos-juego.js';
import { jugarConqBots, ESCENARIOS } from './ayudas-conq.js';

function nodoFalso() {
  const n = { style: {}, hijos: [], clases: new Set(), animaciones: [], innerHTML: '', className: '' };
  n.classList = { add: (c) => n.clases.add(c), remove: (c) => n.clases.delete(c), contains: (c) => n.clases.has(c) };
  n.append = (...h) => { n.hijos.push(...h); };
  n.animate = (frames, opciones) => { const a = { frames, opciones, cancel() { a.cancelada = true; } }; n.animaciones.push(a); return a; };
  n.getAnimations = () => n.animaciones.filter((a) => !a.cancelada);
  return n;
}

async function conDom(fn) {
  const anterior = globalThis.document;
  globalThis.document = { createElement: () => nodoFalso() };
  try { return await fn(); } finally { if (anterior === undefined) delete globalThis.document; else globalThis.document = anterior; }
}

const LAYOUT = { ancho: 1080, alto: 1920, zona: { x: 40, y: 150, ancho: 1000, alto: 1500 } };
async function beatIntro() {
  const p = await jugarConqBots(ESCENARIOS[0].seed, ESCENARIOS[0].bots);
  return (await armarLinea('conquista', p))[0];
}
function mesaDe(opciones = {}) {
  const mesa = new MesaBase('9x16', { jugadores: [] }, { sfx: {}, vel: 1, ...opciones }, LAYOUT);
  mesa.raiz = nodoFalso();
  mesa.subtitulos = nodoFalso();
  mesa.rapido = true;
  mesa.esperaron = [];
  return mesa;
}

test('un beat intro se anima en MesaBase aunque la mesa no lo tenga en METODOS, y no escribe en los subtitulos del juego', async () => {
  const beat = await beatIntro(), mesa = mesaDe();
  assert.equal(beat.tipo, 'intro');
  assert.equal(MesaBase.METODOS, undefined, 'la base no declara metodos: el intro no depende de ellos');
  await conDom(() => mesa.ejecutar(beat, beat.minMs));
  assert.equal(mesa.subtitulos.innerHTML, '', 'la tarjeta ya dice el texto: no se repite en los subtitulos');
  assert.equal(mesa.raiz.hijos.length, 1, 'la tarjeta se agrega a la mesa una sola vez');
});

test('la tarjeta lleva el nombre, la categoria, la regla y como se gana, y el aviso de IA; lo escapa; y al terminar no queda nada a la vista', async () => {
  const beat = await beatIntro(), mesa = mesaDe(), t = textoDeJuego('conquista');
  await conDom(async () => {
    await mesa.ejecutar(beat, beat.minMs);
    const html = mesa.raiz.hijos[0].innerHTML;
    for (const texto of [t.nombre, t.categoria, t.gana, 'Contenido generado por IA · Proyecto independiente']) assert.ok(html.includes(texto), `falta: ${texto}`);
    assert.ok(html.includes(t.regla.replace(/&/g, '&amp;')), 'falta la regla');
    assert.equal(String(mesa.raiz.hijos[0].style.opacity), '0', 'termina oculta');
    // texto peligroso: se escapa
    await mesa.ejecutar({ ...beat, pasos: [{ ...beat.pasos[0], nombre: '<img src=x onerror=1>', regla: 'a & b' }] }, beat.minMs);
    const peligroso = mesa.raiz.hijos[0].innerHTML;
    assert.ok(!peligroso.includes('<img'), 'el nombre se escapa');
    assert.ok(peligroso.includes('a &amp; b'));
    assert.equal(mesa.raiz.hijos.length, 1, 'una segunda ejecucion reutiliza la tarjeta');
  });
});

test('respeta la zona segura de la mesa y la velocidad (a mas velocidad, menos espera)', async () => {
  const beat = await beatIntro(), esperas = [];
  const mesa = mesaDe({ vel: 4 });
  mesa.rapido = false;
  mesa.esperar = async (ms) => { esperas.push(ms); };
  await conDom(() => mesa.ejecutar(beat, 6000));
  const tarjeta = mesa.raiz.hijos[0];
  assert.deepEqual([tarjeta.style.left, tarjeta.style.top, tarjeta.style.width, tarjeta.style.height], ['40px', '150px', '1000px', '1500px'], 'la caja va en la zona segura');
  assert.ok(esperas.length >= 2 && esperas.every((e) => Number.isFinite(e)), 'espera la muestra y la salida');
  assert.ok(Math.abs(esperas.reduce((a, b) => a + b, 0) - 6000) < 60, 'el beat dura lo que dice su linea de tiempo (a velocidad 1)');
  assert.ok(mesa.raiz.hijos[0].animaciones.length >= 2, 'entra y sale con animaciones (que anim() acorta con la velocidad)');
});

test('un beat intro roto no lanza (pasos sin intro o beat sin pasos)', async () => {
  const mesa = mesaDe();
  await conDom(async () => {
    await assert.doesNotReject(() => mesa.ejecutar({ id: 'intro', tipo: 'intro', mano: 1, pasos: [], lineas: [], minMs: 10 }, 10));
    await assert.doesNotReject(() => mesa.ejecutar({ id: 'intro', tipo: 'intro', mano: 1, minMs: 10 }, 10));
  });
});
