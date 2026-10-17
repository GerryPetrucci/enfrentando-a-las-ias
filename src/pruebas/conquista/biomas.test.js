// Los biomas del mapa de la Guerra de territorios (src/mapa.js): cuatro formas de tierra que cambian solo la silueta y el aspecto, nunca las reglas.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearMapa, CONFIG, REC, BIOMAS, distancias, serializarMapa, restaurarMapa, biomaDeSeed } from '../../mapa.js';
import { crearRng } from '../../rng.js';
import { crearEstado } from '../../juegos/conquista/estado.js';

const REINOS = [2, 3, 4, 5];
const SEEDS_100 = Array.from({ length: 100 }, (_, i) => i + 1);
const huella = (m) => JSON.stringify([Array.from(m.terreno), m.regs.map((r) => [r.centro, r.terr, r.rec, r.vecinos]), m.inicio.capitales]);
const agua = (m) => Array.from(m.terreno).filter((t) => t <= 1).length / m.terreno.length;
const contar = (m, codigo) => Array.from(m.terreno).filter((t) => t === codigo).length / m.terreno.length;
const promedio = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

// las propiedades de siempre de un mapa (las mismas que prueba mapa.test.js para el continente)
function propiedades(m, k, etiqueta) {
  assert.equal(m.regs.length, CONFIG[k].N, `${etiqueta}: numero de regiones`);
  assert.ok(distancias(m.regs, 0).every((d) => d < 99), `${etiqueta}: hay regiones aisladas`);
  for (const r of m.regs) for (const v of r.vecinos) assert.ok(m.regs[v].vecinos.includes(r.id), `${etiqueta}: ${r.nombre} no es vecina de vuelta`);
  const minimo = Math.ceil(m.regs.length / 18);
  for (const rec of REC) assert.ok(m.regs.filter((r) => r.rec === rec).length >= minimo, `${etiqueta}: pocos nodos de ${rec}`);
  assert.ok(m.regs.every((r) => ['ll', 'bo', 'mo'].includes(r.terr)), `${etiqueta}: terreno raro`);
  const { dueno, capitales } = m.inicio;
  assert.equal(capitales.length, k, `${etiqueta}: capitales`);
  assert.equal(new Set(capitales).size, k, `${etiqueta}: capitales repetidas`);
  for (let s = 0; s < k; s++) {
    assert.equal(dueno[capitales[s]], s, `${etiqueta}: duena de la capital`);
    const suyas = [...dueno].map((d, r) => (d === s ? r : -1)).filter((r) => r >= 0 && r !== capitales[s]);
    assert.ok(suyas.length >= 1 && suyas.length <= 2, `${etiqueta}: reino ${s} tiene ${suyas.length} vecinas`);
    for (const r of suyas) assert.ok(m.regs[capitales[s]].vecinos.includes(r), `${etiqueta}: vecina que no toca la capital`);
    const d = distancias(m.regs, capitales[s]), cerca = m.regs.filter((r) => d[r.id] <= 2);
    for (const rec of ['Comida', 'Madera']) assert.ok(cerca.some((r) => r.rec === rec), `${etiqueta}: capital ${s} sin ${rec} cerca`);
  }
}

test('hay cuatro biomas y el mapa dice cual se uso', () => {
  assert.deepEqual(BIOMAS, ['continente', 'arido', 'mares', 'interior']);
  assert.equal(crearMapa(5, 3).bioma, 'continente');
  for (const b of BIOMAS) assert.equal(crearMapa(5, 3, { bioma: b }).bioma, b);
});

test('un bioma desconocido da un error que lista los validos', () => {
  for (const raro of ['raro', 'ARIDO', '', null, 7, {}]) {
    assert.throws(() => crearMapa(1, 4, { bioma: raro }), /bioma invalido: .*continente.*arido.*mares.*interior/, String(raro));
  }
});

test('los cuatro biomas generan en los cuatro tamanos sin lanzar y con las propiedades de siempre (100 seeds)', () => {
  for (const bioma of BIOMAS) for (const k of REINOS) for (const seed of SEEDS_100) {
    propiedades(crearMapa(seed, k, { bioma }), k, `${bioma} k=${k} seed=${seed}`);
  }
});

test('el mismo seed y bioma dan el mismo mapa; el mismo seed con otro bioma da otro', () => {
  for (const k of REINOS) for (const seed of [3, 8]) {
    const huellas = BIOMAS.map((bioma) => huella(crearMapa(seed, k, { bioma })));
    assert.deepEqual(huellas, BIOMAS.map((bioma) => huella(crearMapa(seed, k, { bioma }))), `k=${k} seed=${seed}: no es determinista`);
    assert.equal(new Set(huellas).size, BIOMAS.length, `k=${k} seed=${seed}: dos biomas dieron el mismo mapa`);
  }
});

test('los biomas miden lo que dicen: arido con poca agua y casi sin bosque, mares con mas agua, interior con un mar rodeado de tierra', () => {
  const seeds = Array.from({ length: 20 }, (_, i) => i + 1);
  const mapas = (bioma) => seeds.map((s) => crearMapa(s, 4, { bioma }));
  const [cont, ari, mar, int] = BIOMAS.map(mapas);
  assert.ok(promedio(ari.map(agua)) < promedio(cont.map(agua)), 'el arido tiene menos agua que el continente');
  assert.ok(promedio(mar.map(agua)) > promedio(cont.map(agua)), 'mucho mar tiene mas agua que el continente');
  assert.ok(promedio(ari.map((m) => contar(m, 4))) < 0.02, 'el arido casi no tiene bosque');
  assert.ok(promedio(cont.map((m) => contar(m, 4))) > promedio(ari.map((m) => contar(m, 4))), 'el continente tiene mas bosque que el arido');
  // agua DENTRO de la caja que rodea a la tierra: un mar interior la tiene de sobra, un continente casi nada
  const aguaInterior = (m) => {
    const { ancho: W, alto: H, terreno } = m; let x0 = W, x1 = 0, y0 = H, y1 = 0;
    for (let i = 0; i < terreno.length; i++) if (terreno[i] >= 2) { const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    let n = 0; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (terreno[y * W + x] <= 1) n++;
    return n / ((x1 - x0 + 1) * (y1 - y0 + 1));
  };
  assert.ok(promedio(int.map(aguaInterior)) > promedio(cont.map(aguaInterior)), 'el mar interior deja mas agua dentro de la tierra que el continente');
});

test('el mapa serializado va y vuelve sin perder nada, sin arreglos tipados y cabe en 30 KB', () => {
  for (const bioma of BIOMAS) for (const k of REINOS) {
    const m = crearMapa(7, k, { bioma }), s = serializarMapa(m), texto = JSON.stringify(s);
    assert.deepStrictEqual(restaurarMapa(JSON.parse(texto)), m, `${bioma} k=${k}: la ida y vuelta cambia el mapa`);
    assert.ok(texto.length <= 30000, `${bioma} k=${k}: pesa ${texto.length} bytes`);
    assert.equal(s.bioma, bioma);
    assert.equal(typeof s.terreno, 'string');
    assert.equal(s.terreno.length, s.ancho * s.alto);
    assert.ok(Array.isArray(s.region) && Array.isArray(s.inicio.dueno) && Array.isArray(s.inicio.capitales));
    const tipados = []; // ningun arreglo tipado en todo el objeto
    (function recorrer(x, ruta) { if (ArrayBuffer.isView(x)) tipados.push(ruta); else if (x && typeof x === 'object') for (const [c, v] of Object.entries(x)) recorrer(v, `${ruta}.${c}`); })(s, 'mapa');
    assert.deepEqual(tipados, [], `${bioma} k=${k}: hay arreglos tipados`);
  }
});

// el seed del mapa que crearEstado saca de la partida: su primer sorteo (asi lo hace el motor)
const seedMapaDe = (seed) => Math.floor(crearRng(seed)() * 4294967296) >>> 0;

test('biomaDeSeed es determinista y reparte los cuatro biomas (cada uno entre 15 % y 35 % de 400 seeds)', () => {
  const cuenta = Object.fromEntries(BIOMAS.map((b) => [b, 0]));
  for (let s = 1; s <= 400; s++) {
    const b = biomaDeSeed(s * 7919);
    assert.equal(b, biomaDeSeed(s * 7919));
    assert.ok(BIOMAS.includes(b), b);
    cuenta[b]++;
  }
  for (const b of BIOMAS) assert.ok(cuenta[b] >= 60 && cuenta[b] <= 140, `${b}: ${cuenta[b]} de 400 (${JSON.stringify(cuenta)})`);
});

test('elegir el bioma del seed no mueve el rng de la partida: forzar el mismo bioma da la partida identica y el rng queda igual', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const elegido = biomaDeSeed(seedMapaDe(seed));
    const r1 = crearRng(seed), r2 = crearRng(seed);
    const auto = crearEstado(r1, { jugadores: 4 }), forzado = crearEstado(r2, { jugadores: 4, bioma: elegido });
    assert.equal(auto.mapa.bioma, elegido, `seed ${seed}`);
    assert.deepEqual(auto.desempate, forzado.desempate);
    assert.equal(huella(auto.mapa), huella(forzado.mapa));
    assert.equal(r1(), r2(), `seed ${seed}: el rng de la partida quedo en otro punto`);
  }
});

test('un bioma explicito manda sobre el del seed, y un mapa ya creado manda sobre cualquier bioma pedido', () => {
  const seed = [1, 2, 3, 4, 5, 6, 7, 8].find((s) => biomaDeSeed(seedMapaDe(s)) !== 'arido');
  assert.ok(seed, 'hace falta un seed que no elija el arido');
  assert.equal(crearEstado(crearRng(seed), { jugadores: 4, bioma: 'arido' }).mapa.bioma, 'arido');
  const dado = crearMapa(seed, 4);
  assert.equal(crearEstado(crearRng(seed), { jugadores: 4, mapa: dado, bioma: 'arido' }).mapa.bioma, 'continente');
});

test('restaurarMapa con basura no lanza: devuelve null', () => {
  for (const raro of [null, undefined, 7, 'x', {}, { k: 4 }, { terreno: 5 }]) assert.equal(restaurarMapa(raro), null, String(raro));
});
