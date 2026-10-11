import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearMapa, CONFIG, REC, distancias } from '../../mapa.js';

const SEEDS = [1, 2, 3, 11, 48];
const REINOS = [2, 3, 4, 5];

test('el mismo seed da el mismo mapa y otro seed da otro', () => {
  const huella = (m) => JSON.stringify([m.regs.map((r) => [r.centro, r.terr, r.rec, r.vecinos]), m.inicio.capitales]);
  assert.equal(huella(crearMapa(5, 3)), huella(crearMapa(5, 3)));
  assert.notEqual(huella(crearMapa(5, 3)), huella(crearMapa(6, 3)));
});

test('hay 26, 39, 52 y 65 regiones segun los reinos y se nombran R01, R02...', () => {
  for (const k of REINOS) for (const seed of SEEDS.slice(0, 3)) {
    const m = crearMapa(seed, k);
    assert.equal(m.regs.length, CONFIG[k].N, `k=${k} seed=${seed}`);
    assert.equal(m.regs[0].nombre, 'R01');
    assert.equal(m.regs.at(-1).nombre, 'R' + String(CONFIG[k].N).padStart(2, '0'));
  }
});

test('las regiones forman un solo continente y las vecindades son simetricas', () => {
  for (const k of REINOS) for (const seed of SEEDS.slice(0, 3)) {
    const m = crearMapa(seed, k);
    assert.ok(distancias(m.regs, 0).every((d) => d < 99), `k=${k} seed=${seed}: hay regiones aisladas`);
    for (const r of m.regs) for (const v of r.vecinos) assert.ok(m.regs[v].vecinos.includes(r.id), `${r.nombre} no es vecina de vuelta`);
  }
});

test('cada recurso aparece al menos ceil(N/18) veces y el terreno es ll, bo o mo', () => {
  for (const k of REINOS) for (const seed of SEEDS) {
    const m = crearMapa(seed, k), minimo = Math.ceil(m.regs.length / 18);
    for (const rec of REC) assert.ok(m.regs.filter((r) => r.rec === rec).length >= minimo, `k=${k} seed=${seed} ${rec}`);
    assert.ok(m.regs.every((r) => ['ll', 'bo', 'mo'].includes(r.terr)));
  }
});

test('cada capital tiene Comida y Madera a 2 regiones o menos', () => {
  for (const k of REINOS) for (const seed of SEEDS) {
    const m = crearMapa(seed, k);
    for (const c of m.inicio.capitales) {
      const d = distancias(m.regs, c), cerca = m.regs.filter((r) => d[r.id] <= 2);
      for (const rec of ['Comida', 'Madera']) assert.ok(cerca.some((r) => r.rec === rec), `k=${k} seed=${seed} capital R${c + 1} sin ${rec}`);
    }
  }
});

test('inicio: una capital por reino y 2 regiones vecinas de esa capital', () => {
  for (const k of REINOS) for (const seed of SEEDS) {
    const m = crearMapa(seed, k), { dueno, capitales } = m.inicio;
    assert.equal(capitales.length, k);
    assert.equal(new Set(capitales).size, k);
    for (let s = 0; s < k; s++) {
      assert.equal(dueno[capitales[s]], s);
      const suyas = [...dueno].map((d, r) => (d === s ? r : -1)).filter((r) => r >= 0 && r !== capitales[s]);
      assert.ok(suyas.length >= 1 && suyas.length <= 2, `k=${k} seed=${seed} reino ${s} tiene ${suyas.length} vecinas`);
      for (const r of suyas) assert.ok(m.regs[capitales[s]].vecinos.includes(r));
    }
  }
});
