// El dibujo del mapa de la Guerra de territorios en canvas (web/casino/mapa-dibujo.js): lo puro (geometria, centros, bordes) y que cada funcion de dibujo respete su espacio.
// El aspecto se verifica con capturas (herramientas/capturar-escena.mjs). Sin DOM ni red.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geometriaDelMapa, centroDeRegion, bordesDeRegion, pintarTerreno, pintarReinos, pintarFichas, pintarFlecha, pintarEstallido } from '../../../web/casino/mapa-dibujo.js';
import { leerMapa, estadoInicial, paletaDe } from '../../../web/casino/conquista-datos.js';
import { colocarConquista } from '../../../web/casino/layout-conquista.js';
import { crearMapa, serializarMapa, BIOMAS, CONFIG } from '../../mapa.js';
import { jugarConqBots } from './ayudas-conq.js';

const mapaDe = (seed, k, bioma) => leerMapa(JSON.parse(JSON.stringify(serializarMapa(crearMapa(seed, k, { bioma })))));

// Un contexto 2D falso que anota todo lo que se le pide (en Node no hay canvas).
function ctxFalso() {
  const llamadas = [], propiedades = [];
  const ctx = new Proxy({}, {
    get: (_, nombre) => (...args) => { llamadas.push([nombre, ...args]); },
    set: (_, nombre, valor) => { propiedades.push([nombre, valor]); return true; },
  });
  return { ctx, llamadas, propiedades };
}
const rellenos = (llamadas) => llamadas.filter(([n]) => n === 'fillRect');

test('geometriaDelMapa da una celda entera que cabe en el espacio y centra el mapa, para los 4 tamanos y los 2 formatos', () => {
  for (const formato of ['9x16', '16x9']) for (const c of Object.values(CONFIG)) {
    const mapa = { ancho: c.W, alto: c.H }, L = colocarConquista(formato, mapa);
    const g = geometriaDelMapa(mapa, L.mapa);
    assert.ok(Number.isInteger(g.T) && g.T >= 1);
    assert.equal(g.T, L.escalaCelda);
    assert.deepEqual([g.ox, g.oy], [L.mapa.x, L.mapa.y]);
    assert.ok(g.ox >= 0 && g.oy >= 0 && g.ox + c.W * g.T <= L.ancho && g.oy + c.H * g.T <= L.alto);
  }
  const g = geometriaDelMapa({ ancho: 10, alto: 10 }, { x: 100, y: 50, ancho: 95, alto: 400 });
  assert.deepEqual(g, { T: 9, ox: 102, oy: 50 + Math.floor((400 - 90) / 2) });
});

test('centroDeRegion cae dentro de una celda de esa region', () => {
  for (const bioma of BIOMAS) {
    const m = mapaDe(5, 4, bioma), g = geometriaDelMapa(m, colocarConquista('9x16', m).mapa);
    for (const r of m.regs) {
      const { x, y } = centroDeRegion(m, r.id, g);
      const cx = Math.floor((x - g.ox) / g.T), cy = Math.floor((y - g.oy) / g.T);
      assert.equal(m.region[cy * m.ancho + cx], r.id, `${bioma} ${r.nombre}: su centro cae en otra region`);
    }
  }
  assert.deepEqual(centroDeRegion(mapaDe(5, 2), 999, { T: 10, ox: 0, oy: 0 }), null);
});

test('bordesDeRegion marca solo los bordes entre regiones distintas (o entre una region y el mar) y los marca una sola vez', () => {
  const m = mapaDe(5, 3), bordes = bordesDeRegion(m);
  const esperados = [];
  for (let y = 0; y < m.alto; y++) for (let x = 0; x < m.ancho; x++) {
    const a = m.region[y * m.ancho + x];
    if (x < m.ancho - 1) { const b = m.region[y * m.ancho + x + 1]; if (a !== b && (a >= 0 || b >= 0)) esperados.push(`v:${x + 1}:${y}`); }
    if (y < m.alto - 1) { const b = m.region[(y + 1) * m.ancho + x]; if (a !== b && (a >= 0 || b >= 0)) esperados.push(`h:${x}:${y + 1}`); }
  }
  assert.deepEqual(bordes.map((b) => `${b.horizontal ? 'h' : 'v'}:${b.x}:${b.y}`).sort(), esperados.sort());
  assert.ok(bordes.every((b) => b.r1 !== b.r2));
  assert.ok(bordes.length > m.regs.length);
});

test('pintarTerreno pinta cada celda del mapa una vez dentro de su espacio, con los colores de la paleta, y sin tocar nada fuera', () => {
  for (const bioma of BIOMAS) {
    const m = mapaDe(5, 2, bioma), L = colocarConquista('9x16', m), g = geometriaDelMapa(m, L.mapa), paleta = paletaDe(bioma);
    const { ctx, llamadas } = ctxFalso();
    pintarTerreno(ctx, m, g, paleta);
    const celdas = rellenos(llamadas).filter(([, , , w]) => w === g.T);
    assert.ok(celdas.length >= m.ancho * m.alto, `${bioma}: faltan celdas`);
    for (const [, x, y, w, h] of rellenos(llamadas)) assert.ok(x >= L.mapa.x && y >= L.mapa.y && x + w <= L.mapa.x + L.mapa.ancho && y + h <= L.mapa.y + L.mapa.alto, `${bioma}: pinta fuera de su espacio`);
  }
});

test('pintarReinos tine solo las celdas con region y dueno, con el tinte pedido, y no pinta el mar ni las regiones libres', () => {
  const m = mapaDe(5, 2), g = geometriaDelMapa(m, colocarConquista('9x16', m).mapa);
  const dueno = m.regs.map((r) => (r.id === 0 ? 0 : -1));
  const { ctx, llamadas, propiedades } = ctxFalso();
  pintarReinos(ctx, m, g, dueno, ['#ff0000', '#00ff00'], 0.35);
  const celdasDeLaRegion0 = Array.from(m.region).filter((r) => r === 0).length;
  assert.equal(rellenos(llamadas).filter(([, , , w]) => w === g.T).length, celdasDeLaRegion0);
  assert.ok(propiedades.some(([n, v]) => n === 'globalAlpha' && v === 0.35), 'el tinte pedido');
  assert.ok(propiedades.every(([n, v]) => n !== 'fillStyle' || typeof v === 'string'));
  assert.doesNotThrow(() => pintarReinos(ctxFalso().ctx, m, g, dueno, [['#f00', '#0f0', '#00f'], '#ff0'], 0.35), 'un reino multicolor (Gemini) tambien se pinta');
});

test('pintarFichas dibuja las fichas de una partida real sin lanzar y solo pone torre donde hay fortaleza', async () => {
  const p = await jugarConqBots(18, ['azar', 'azar', 'agresivo', 'economico', 'pacifico']), m = leerMapa(p.mapa);
  const g = geometriaDelMapa(m, colocarConquista('9x16', m).mapa), colores = ['#d97757', '#f4f4f2', '#4285f4', '#4d6bfe', '#d946ef'];
  const estado = estadoInicial(p);
  const { ctx, llamadas } = ctxFalso();
  assert.doesNotThrow(() => pintarFichas(ctx, m, g, estado, colores));
  assert.ok(llamadas.some(([n]) => n === 'fillText'), 'escribe las tropas');
  const sinFort = { ...estado, fort: estado.fort.map(() => 0), edif: estado.edif.map(() => null) }, a = ctxFalso(), b = ctxFalso();
  pintarFichas(a.ctx, m, g, sinFort, colores); pintarFichas(b.ctx, m, g, estado, colores);
  assert.ok(b.llamadas.length > a.llamadas.length, 'las torres de las capitales agregan dibujo');
  // torres y estrellas se dibujan con `scale`: sin fortaleza solo quedan las estrellas de las capitales, con fortaleza se suma una torre por capital (la unica region que empieza fortificada)
  const escalas = (l) => l.filter(([n]) => n === 'scale').length, capitalesN = m.inicio.capitales.length;
  assert.equal(escalas(a.llamadas), capitalesN, 'sin fortaleza no hay torres');
  assert.equal(escalas(b.llamadas), 2 * capitalesN, 'una torre por capital fortificada');
  for (const ultimo of p.rondas.filter((r) => r.estado)) assert.doesNotThrow(() => pintarFichas(ctxFalso().ctx, m, g, ultimo.estado, colores));
  assert.doesNotThrow(() => pintarFichas(ctxFalso().ctx, m, g, { ...estado, maravilla: { r: 3, k: 1, n: 2, t0: 4 } }, colores));
});

test('pintarFlecha y pintarEstallido dibujan sin lanzar y la flecha lleva su numero', () => {
  const { ctx, llamadas } = ctxFalso();
  pintarFlecha(ctx, { x: 10, y: 10 }, { x: 200, y: 120 }, '#f00', 9, 13);
  assert.ok(llamadas.some(([n, t]) => n === 'fillText' && t === '9'));
  assert.doesNotThrow(() => pintarEstallido(ctxFalso().ctx, 50, 50, 30));
  const cero = ctxFalso();
  assert.doesNotThrow(() => pintarFlecha(cero.ctx, { x: 5, y: 5 }, { x: 5, y: 5 }, '#f00', 3, 13), 'origen y destino iguales no dividen por cero');
  assert.equal(cero.llamadas.some((args) => args.slice(1).some((a) => typeof a === 'number' && !Number.isFinite(a))), false, 'una flecha de largo cero no dibuja con NaN');
});
