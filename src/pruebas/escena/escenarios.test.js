// Las mini escenas de La Fuga (web/casino/escenarios-fuga.js): composiciones de piezas reutilizables, una por situacion del catalogo. Puras: sin DOM.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGO } from '../../juegos/fuga/catalogo.js';
import { PALETA } from '../../../web/paleta.js';
import { PIEZAS, IDS, escenaDe } from '../../../web/casino/escenarios-fuga.js';
import { colocarFuga } from '../../../web/casino/layout-fuga.js';

const INTERIOR = ['celda', 'ronda', 'camara', 'cocina', 'lavanderia', 'enfermeria', 'panel', 'escalera'];
const PATIO = ['patio', 'perros', 'taller', 'reja', 'turno', 'foco', 'zanja', 'basura'];
const PERIMETRO = ['muro', 'alambre', 'reflectores', 'alcantarilla', 'vehiculos', 'foso', 'final', 'camioneta'];
const DIBUJADAS = [...INTERIOR, ...PATIO, ...PERIMETRO];
const colores = JSON.stringify(PALETA).match(/#[0-9a-fA-F]{3,8}/g) ?? [];

test('IDS lista las 24 situaciones del catalogo del motor, en su orden (si el motor agrega una situacion, esta prueba falla hasta dibujarla)', () => {
  assert.equal(CATALOGO.length, 24);
  assert.deepEqual(IDS, CATALOGO.map((s) => s.id));
  assert.equal(new Set(IDS).size, 24);
});

test('las 24 escenas (interior, patio y perimetro) estan dibujadas, una por situacion del catalogo, cada una en la fase que le toca', () => {
  assert.deepEqual(DIBUJADAS, IDS);
  for (const [fase, ids] of [['interior', INTERIOR], ['patio', PATIO], ['perimetro', PERIMETRO]]) for (const id of ids) assert.equal(escenaDe(id).fase, fase, id);
  assert.equal(IDS.filter((id) => escenaDe(id).generica).length, 0, 'ninguna situacion queda sin dibujar');
});

test('las escenas estan dibujadas: cada pieza existe, cabe en la imagen de la camara en 9:16 y en 16:9 y el carril de la silueta cae dentro', () => {
  for (const id of DIBUJADAS) {
    const e = escenaDe(id);
    assert.equal(e.id, id);
    assert.equal(e.generica, false, `${id}: sigue siendo generica`);
    assert.equal(e.fase, CATALOGO.find((s) => s.id === id).fase);
    assert.ok(e.piezas.length >= 1, `${id}: sin piezas`);
    assert.ok(e.carril.desde >= 0 && e.carril.hasta <= 1 && e.carril.desde < e.carril.hasta, `${id}: carril`);
    for (const f of ['9x16', '16x9']) {
      const { ancho: W, alto: H } = colocarFuga(f).camaras[0].escena;
      for (const p of e.piezas) {
        assert.ok(PIEZAS[p.pieza], `${id}: la pieza ${p.pieza} no existe`);
        const w = p.alto * H * PIEZAS[p.pieza].ratio, h = p.alto * H;
        const caja = { x: p.x * W - w / 2, y: p.y * H - h, ancho: w, alto: h };
        assert.ok(caja.x >= 0 && caja.y >= 0 && caja.x + caja.ancho <= W && caja.y + caja.alto <= H, `${f} ${id}: ${p.pieza} se sale de la imagen ${JSON.stringify(caja)}`);
      }
    }
  }
});

test('ninguna escena nombra ni dibuja el metodo mejor ni la pista (la pista enganosa no se dibuja): ninguna pieza se llama mejor o pista y la escena depende solo de la situacion', () => {
  for (const nombre of Object.keys(PIEZAS)) assert.doesNotMatch(nombre, /mejor|pista|sigilo|fuerza|engano|esperar/i, `la pieza ${nombre} insinua un metodo`);
  for (const id of IDS) {
    assert.equal(escenaDe.length, 1, 'escenaDe recibe solo el id: el metodo no puede cambiar el dibujo');
    assert.deepEqual(escenaDe(id), escenaDe(id));
    assert.doesNotMatch(JSON.stringify(escenaDe(id)), /mejor|pista|sigilo|fuerza|engano|esperar/i, `${id}: la escena insinua un metodo`);
  }
});

test('un id desconocido (o basura) da la escena generica sin lanzar, y las situaciones aun sin dibujar tambien', () => {
  for (const raro of ['no-existe', '', null, undefined, 7, {}, '__proto__', 'toString']) {
    const e = escenaDe(raro);
    assert.equal(e.generica, true, String(raro));
    assert.deepEqual(e.piezas, []);
    assert.ok(e.carril.desde < e.carril.hasta);
  }
});

test('las piezas son SVG deterministas y sin colores de IA: usan el color de la camara (currentColor) y neutros; el color de la silueta llega aparte', () => {
  for (const [nombre, p] of Object.entries(PIEZAS)) {
    assert.ok(p.ratio > 0.2 && p.ratio <= 6, `${nombre}: ratio`);
    const svg = p.svg();
    assert.equal(svg, p.svg(), `${nombre}: el dibujo cambia entre llamadas`);
    assert.match(svg, /^<svg [^>]*viewBox="0 0 [\d.]+ [\d.]+"[^>]*>.*<\/svg>$/s, `${nombre}: no es un svg completo`);
    for (const c of colores) assert.ok(!svg.toLowerCase().includes(c.toLowerCase()), `${nombre}: usa el color de una IA (${c})`);
    assert.doesNotMatch(svg, /Math\.random|undefined|NaN|\[object/);
  }
});

test('las escenas de situaciones distintas se distinguen: no hay dos con las mismas piezas en los mismos sitios, ni dos con el mismo conjunto de piezas', () => {
  const huellas = IDS.map((id) => JSON.stringify(escenaDe(id).piezas));
  assert.equal(new Set(huellas).size, IDS.length);
  const conjuntos = IDS.map((id) => [...new Set(escenaDe(id).piezas.map((p) => p.pieza))].sort().join('+'));
  assert.equal(new Set(conjuntos).size, IDS.length, 'dos situaciones usan exactamente las mismas piezas');
});

test('las piezas de la tentacion no se dibujan al abrir la situacion (el botin aparece en la consecuencia): ninguna escena trae la pieza botin', () => {
  for (const id of IDS) assert.ok(!escenaDe(id).piezas.some((p) => p.pieza === 'botin'), id);
});

test('cada pieza se usa en alguna escena (ninguna queda sin uso) menos el botin, que lo pone la mesa', () => {
  const usadas = new Set(IDS.flatMap((id) => escenaDe(id).piezas.map((p) => p.pieza)));
  for (const nombre of Object.keys(PIEZAS)) if (nombre !== 'botin') assert.ok(usadas.has(nombre), `la pieza ${nombre} no se usa en ninguna escena`);
});
