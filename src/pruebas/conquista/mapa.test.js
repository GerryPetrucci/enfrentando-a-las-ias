import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

// Huellas calculadas el 17 de octubre de 2026 con el generador de ANTES de los biomas: el continente (bioma por defecto) no debe cambiar jamas para el mismo seed,
// porque las pruebas con seeds fijos y la reproduccion de partidas guardadas dependen de el.
const HUELLAS_CONTINENTE = {
  '1|2': '1c0b9b2022d24a4c595c690c0c819957e6552410', '1|3': 'da39967d4242b0490658bc324fe53a3df1b2bab8', '1|4': '7915b1fe47e7e8634054d71e4a4351c4ce8b8769', '1|5': 'a738b7775a04fea3cb2bff79318f2f5f9a427f5f',
  '2|2': 'dbe69d037df29cf04b4ad2492a06fb522fb91c2f', '2|3': 'ee63fda92f4b1130ff53b8d9d92a6ce084c974bd', '2|4': '22e9bcb08818c9a3ee34a3450843b70360daa5f5', '2|5': 'e7a1ff270af9d141072671278fc95003afa56243',
  '3|2': '279499af563bd2296e49fcca65be20137a9b7cdd', '3|3': 'c57f7daf418a3dbcee6ad4cf593e689f656a972a', '3|4': 'be6f9b747016df3b1ece358761a69983c2cd1a18', '3|5': 'f2ff961b2c243bd99952fc59de5914f3ebe74cb7',
};
const huellaCompleta = (m) => createHash('sha1').update(JSON.stringify({ terreno: Array.from(m.terreno), region: Array.from(m.region), regs: m.regs, inicio: { dueno: Array.from(m.inicio.dueno), capitales: m.inicio.capitales } })).digest('hex');

test('el continente no cambia: la huella de 12 mapas coincide con la de antes de los biomas', () => {
  for (const [clave, esperada] of Object.entries(HUELLAS_CONTINENTE)) {
    const [seed, k] = clave.split('|').map(Number);
    assert.equal(huellaCompleta(crearMapa(seed, k)), esperada, `seed ${seed}, ${k} reinos`);
  }
});
