// Los biomas del mapa de la Guerra de territorios (src/mapa.js): cuatro formas de tierra que cambian solo la silueta y el aspecto, nunca las reglas.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearMapa, CONFIG, REC, BIOMAS, distancias } from '../../mapa.js';

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
