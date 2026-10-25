// El dibujo del mapa de la Guerra de territorios en canvas (web/casino/mapa-dibujo.js): lo puro (geometria, centros, bordes) y que cada funcion de dibujo respete su espacio.
// El aspecto se verifica con capturas (herramientas/capturar-escena.mjs). Sin DOM ni red.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geometriaDelMapa, centroDeRegion, bordesDeRegion, pintarTerreno, pintarReinos, pintarFichas, pintarFlecha, pintarEstallido, pintarContorno, pintarIcono, pilasDeRegion, pintarLeyendaUnidades, COLOR_DE_TIPO, COLOR_CORONA } from '../../../web/casino/mapa-dibujo.js';
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
  // Aislar torres/capitales: los recursos también usan escalas para su pixel-grid.
  const sinRecursos = { ...m, regs: m.regs.map(r => ({ ...r, rec: null })) };
  pintarFichas(a.ctx, sinRecursos, g, sinFort, colores); pintarFichas(b.ctx, sinRecursos, g, estado, colores);
  assert.ok(b.llamadas.length > a.llamadas.length, 'las torres de las capitales agregan dibujo');
  // torres y estrellas se dibujan con `scale`: sin fortaleza solo quedan las estrellas de las capitales, con fortaleza se suma una torre por capital (la unica region que empieza fortificada)
  const escalas = (l) => l.filter(([n]) => n === 'scale').length, capitalesN = m.inicio.capitales.length;
  assert.equal(escalas(a.llamadas), capitalesN, 'sin fortaleza no hay torres');
  assert.equal(escalas(b.llamadas), 2 * capitalesN, 'una torre por capital fortificada');
  for (const ultimo of p.rondas.filter((r) => r.estado)) assert.doesNotThrow(() => pintarFichas(ctxFalso().ctx, m, g, ultimo.estado, colores));
  assert.doesNotThrow(() => pintarFichas(ctxFalso().ctx, m, g, { ...estado, maravilla: { r: 3, k: 1, n: 2, t0: 4 } }, colores));
});

test('pintarContorno traza solo los bordes de la region pedida y pintarIcono dibuja los 6 recursos', () => {
  const m = mapaDe(5, 3), g = geometriaDelMapa(m, colocarConquista('9x16', m).mapa);
  for (const id of [0, 5, m.regs.length - 1]) {
    const { ctx, llamadas, propiedades } = ctxFalso();
    pintarContorno(ctx, m, g, id, '#ffffff', 4);
    const esperados = bordesDeRegion(m).filter((b) => b.r1 === id || b.r2 === id).length;
    assert.equal(llamadas.filter(([n]) => n === 'moveTo').length, esperados, `region ${id}`);
    assert.ok(esperados > 0);
    assert.ok(propiedades.some(([n, v]) => n === 'strokeStyle' && v === '#ffffff') && propiedades.some(([n, v]) => n === 'lineWidth' && v === 4));
  }
  const sin = ctxFalso();
  assert.doesNotThrow(() => pintarContorno(sin.ctx, m, g, 999, '#fff', 4), 'una region que no existe no dibuja ni lanza');
  assert.equal(sin.llamadas.length, 0, 'ni una llamada para una region que no existe');
  for (const tipo of ['Comida', 'Madera', 'Roca', 'Hierro', 'Oro', 'Caballos']) { const { ctx, llamadas } = ctxFalso(); pintarIcono(ctx, tipo, 20, 20, 12); assert.ok(llamadas.length > 2, tipo); }
  const raro = ctxFalso(); assert.doesNotThrow(() => pintarIcono(raro.ctx, 'Plutonio', 20, 20, 12));
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

// ---- Guerra 2.0.0: composicion por tipo, tropas de visita, regiones aisladas y Hegemon en las fichas ----
const COLORES5 = ['#d97757', '#f4f4f2', '#4285f4', '#4d6bfe', '#d946ef'];
async function fichasDe() {
  const p = await jugarConqBots(18, ['azar', 'azar', 'agresivo', 'economico', 'pacifico']), m = leerMapa(p.mapa);
  const g = geometriaDelMapa(m, colocarConquista('9x16', m).mapa), base = estadoInicial(p), capital = m.inicio.capitales[0];
  const dibujar = (estado) => { const f = ctxFalso(); pintarFichas(f.ctx, m, g, estado, COLORES5); return f; };
  const conPila = (r, k, pila) => ({ ...base, tropas: base.tropas.map((n, i) => (i === r && k === base.dueno[r] ? pila.reduce((a, b) => a + b, 0) : n)), uni: [...base.uni.filter(([rr, kk]) => !(rr === r && kk === k)), [r, k, ...pila]] });
  const tiene = (f, nombre, valor) => f.propiedades.some(([n, v]) => n === nombre && v === valor);
  return { p, m, g, base, capital, dibujar, conPila, tiene };
}

test('pilasDeRegion lee las unidades de cada reino en una region desde `estado.uni`; sin `uni` (partida de formato anterior) o con filas rotas no inventa nada', () => {
  const estado = { uni: [[3, 0, 5, 3, 0, 0], [3, 2, 2, 0, 0, 1], [4, 1, 7, 0, 0, 0], null, [3], 'x', [3, 1, 0, 0, 0, 0]] };
  assert.deepEqual(pilasDeRegion(estado, 3), [{ k: 0, pila: [5, 3, 0, 0], total: 8 }, { k: 2, pila: [2, 0, 0, 1], total: 3 }], 'una pila vacia no cuenta');
  assert.deepEqual(pilasDeRegion(estado, 9), []);
  for (const raro of [{}, null, undefined, { uni: 'x' }, { uni: null }]) assert.deepEqual(pilasDeRegion(raro, 3), []);
});

test('pintarFichas (2.0.0): una barra de composicion bajo la ficha con los colores de los tipos que hay, y ninguna si el ejercito es solo de Lanceros', async () => {
  const { conPila, dibujar, tiene, capital, base } = await fichasDe();
  const mixto = dibujar(conPila(capital, 0, [5, 3, 2, 0]));
  assert.ok(tiene(mixto, 'fillStyle', COLOR_DE_TIPO[0]) && tiene(mixto, 'fillStyle', COLOR_DE_TIPO[1]) && tiene(mixto, 'fillStyle', COLOR_DE_TIPO[2]), 'Lanceros, Arqueros y Jinetes');
  assert.ok(!tiene(mixto, 'fillStyle', COLOR_DE_TIPO[3]), 'sin Ingenios no hay su color');
  const soloL = dibujar(base);
  for (const c of COLOR_DE_TIPO) assert.ok(!tiene(soloL, 'fillStyle', c), 'al empezar todo son Lanceros: ninguna barra');
  const soloA = dibujar(conPila(capital, 0, [0, 6, 0, 0]));
  assert.ok(tiene(soloA, 'fillStyle', COLOR_DE_TIPO[1]), 'un ejercito de un solo tipo que no es Lancero se marca');
});

test('pintarFichas (2.0.0): cada tramo de la barra mide lo que pesa su tipo (6 Lanceros y 2 Arqueros: el tramo de los Lanceros es 3 veces el de los Arqueros)', async () => {
  const { conPila, dibujar, capital, g } = await fichasDe();
  const rad = Math.max(13, g.T * 0.62), alto = Math.max(3, rad * 0.24);
  const tramos = dibujar(conPila(capital, 0, [6, 2, 0, 0])).llamadas.filter(([n, , , , h]) => n === 'fillRect' && Math.abs(h - alto) < 1e-9).map(([, , , w]) => w);
  assert.equal(tramos.length, 2, 'un tramo por tipo presente');
  assert.ok(Math.abs(tramos[0] / tramos[1] - 3) < 1e-9, tramos.join(' y '));
  assert.ok(Math.abs(tramos[0] + tramos[1] - rad * 1.7) < 1e-9, 'entre los dos llenan la barra');
});

test('pintarFichas (2.0.0): un pip por cada reino de visita con su color y su numero de unidades; sin visitas, ninguno', async () => {
  const { base, dibujar, tiene, capital } = await fichasDe();
  const conVisita = { ...base, uni: [...base.uni, [capital, 2, 20, 10, 5, 2]] }; // 37 unidades del reino 2 de visita en la capital del 0
  const f = dibujar(conVisita);
  assert.ok(f.llamadas.some(([n, t]) => n === 'fillText' && t === '37'), 'el numero de la visita');
  assert.ok(tiene(f, 'fillStyle', COLORES5[2]), 'en el color del reino de visita');
  assert.ok(!dibujar(base).llamadas.some(([n, t]) => n === 'fillText' && t === '37'));
});

test('pintarFichas (2.0.0): las regiones aisladas llevan un anillo punteado (y el punteado se apaga despues)', async () => {
  const { base, dibujar, m } = await fichasDe();
  const propias = base.dueno.map((d, r) => (d >= 0 ? r : -1)).filter((r) => r >= 0).slice(0, 2);
  const punteados = (f) => f.llamadas.filter(([n, a]) => n === 'setLineDash' && Array.isArray(a) && a.length > 0).length;
  assert.equal(punteados(dibujar({ ...base, aisladas: propias })), propias.length);
  assert.equal(punteados(dibujar(base)), 0);
  const f = dibujar({ ...base, aisladas: propias });
  assert.ok(f.llamadas.filter(([n, a]) => n === 'setLineDash' && Array.isArray(a) && a.length === 0).length >= propias.length, 'cada punteado se deshace para no manchar lo que se dibuja despues');
  assert.doesNotThrow(() => dibujar({ ...base, aisladas: [9999, -1, 'x'] }), `${m.regs.length} regiones: lo que no es una region no dibuja ni lanza`);
});

test('pintarFichas (2.0.0): la capital del Hegemon lleva una corona y solo ella', async () => {
  const { base, dibujar, tiene } = await fichasDe();
  assert.ok(!tiene(dibujar(base), 'fillStyle', COLOR_CORONA), 'sin Hegemon no hay corona');
  assert.ok(!tiene(dibujar({ ...base, hegemon: -1 }), 'fillStyle', COLOR_CORONA));
  const coronas = (f) => f.propiedades.filter(([n, v]) => n === 'fillStyle' && v === COLOR_CORONA).length;
  assert.equal(coronas(dibujar({ ...base, hegemon: 0 })), 1, 'una corona, en la capital del reino 0');
  assert.equal(coronas(dibujar({ ...base, hegemon: 3 })), 1);
  const traslados = (f) => f.llamadas.filter(([n]) => n === 'translate').map(([, x, y]) => `${x},${y}`).sort();
  assert.deepEqual(traslados(dibujar({ ...base, hegemon: 0 })), traslados(dibujar(base)), 'la corona ocupa el lugar de la estrella de la capital, encima de la ficha (no debajo, donde tapa la barra)');
});

test('pintarFichas (2.0.0): el numero de cada casilla se dibuja siempre, con dueno o sin el, y con los recursos sale ademas su nombre rotulado', async () => {
  const { base, dibujar, m, capital } = await fichasDe();
  for (const estado of [base, { ...base, dueno: base.dueno.map(() => -1) }]) {
    const f = dibujar(estado);
    const textos = f.llamadas.filter(([n]) => n === 'fillText').map(([, t]) => t);
    for (const reg of m.regs) assert.ok(textos.includes(reg.nombre), `falta el numero de ${reg.nombre}`);
  }
  const conRecurso = m.regs.find((r) => r.rec);
  if (conRecurso) {
    const f = dibujar(base);
    const textos = f.llamadas.filter(([n]) => n === 'fillText').map(([, t]) => t);
    assert.ok(textos.includes(conRecurso.rec), `falta el rotulo del recurso ${conRecurso.rec}`);
  }
  assert.doesNotThrow(() => dibujar({ ...base, maravilla: { r: capital, k: 0, n: 3 } }), 'la Maravilla no tapa ni lanza sobre una capital');
});

test('pintarLeyendaUnidades dibuja los cuatro tipos con su letra y su color', () => {
  const { ctx, llamadas, propiedades } = ctxFalso();
  pintarLeyendaUnidades(ctx, 20, 20, 14);
  const letras = llamadas.filter(([n]) => n === 'fillText').map(([, t]) => t);
  for (const l of ['L', 'A', 'J', 'I']) assert.ok(letras.includes(l), l);
  for (const c of COLOR_DE_TIPO) assert.ok(propiedades.some(([n, v]) => n === 'fillStyle' && v === c), c);
  assert.equal(COLOR_DE_TIPO.length, 4);
  assert.equal(new Set(COLOR_DE_TIPO).size, 4, 'cuatro colores distintos');
});
