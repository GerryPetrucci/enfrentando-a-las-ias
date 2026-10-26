import test from 'node:test';
import assert from 'node:assert/strict';
import { hash32, rngDe, dadoDe } from '../../juegos/civilizaciones/rng.js';
import { crearMundo, regionesIniciales, fronteraDe, nombreRegion } from '../../juegos/civilizaciones/mundo.js';
import { BIOMAS } from '../../mapa.js';
import { REGIONES, SITIOS, TERRENO } from '../../juegos/civilizaciones/constantes.js';
import { mapaDe, nuevoEstado, FUNDACION, turno } from './ayudas.js';

test('rngDe es determinista por (seed, turno, clave) y claves distintas dan tiradas distintas', () => {
  assert.equal(hash32(7, 3, 'tipo-de-evento'), hash32(7, 3, 'tipo-de-evento'));
  assert.deepEqual([rngDe(7, 3, 'x')(), rngDe(7, 3, 'x')()], [rngDe(7, 3, 'x')(), rngDe(7, 3, 'x')()]);
  const distintos = new Set([hash32(7, 3, 'a'), hash32(7, 3, 'b'), hash32(7, 4, 'a'), hash32(8, 3, 'a')]);
  assert.equal(distintos.size, 4);
  const u = rngDe(7, 3, 'x'); const a = u(), b = u();
  assert.notEqual(a, b, 'el flujo avanza');
});

test('los dados salen en [0, 1) y se reparten parejo (media cerca de 0.5 en 4,000 turnos)', () => {
  let suma = 0;
  for (let t = 0; t < 4000; t++) { const d = dadoDe(123, t, 'secesion'); assert.ok(d >= 0 && d < 1); suma += d; }
  assert.ok(Math.abs(suma / 4000 - 0.5) < 0.02);
});

test('C08: la clave de un dado NO lleva el asiento, asi que los dos mundos gemelos tiran lo mismo', () => {
  const E = nuevoEstado(11);
  // el motor no tiene ninguna funcion que combine el asiento con la clave: lo que sortea una civilizacion lo sortea la otra con el mismo (seed, turno, clave)
  const porAsiento = E.civs.map(() => dadoDe(E.seedMundo, 5, 'secesion'));
  assert.equal(porAsiento[0], porAsiento[1]);
});

test('el mundo tiene 26 regiones, flujos del terreno y de los recursos, y 3 sitios de capital distintos en los 8 biomas', () => {
  for (const bioma of BIOMAS) {
    for (const seed of [3, 11, 29]) {
      const w = crearMundo(seed, { mapa: mapaDe(seed, bioma) });
      assert.equal(w.regs.length, REGIONES, `${bioma} ${seed}`);
      assert.equal(w.sitios.length, SITIOS);
      assert.equal(new Set(w.sitios).size, SITIOS, `${bioma} ${seed}: sitios distintos`);
      for (const r of w.regs) {
        const esperado = (TERRENO[r.terr] ? 1 : 0) + (r.rec ? 2 : 0);
        assert.equal(Object.values(r.flujo).reduce((a, b) => a + b, 0), esperado, `${bioma} ${seed} ${r.nombre}`);
      }
    }
  }
});

test('Caballos produce Oro y un recurso da +2 de si mismo; nombres R01..R26', () => {
  const w = crearMundo(7, { mapa: mapaDe(7) });
  const conRec = w.regs.filter((r) => r.rec);
  assert.ok(conRec.length > 0);
  for (const r of conRec) assert.equal(r.flujo[r.rec === 'Caballos' ? 'Oro' : r.rec] >= 2, true);
  assert.equal(nombreRegion(0), 'R01');
  assert.equal(nombreRegion(25), 'R26');
});

test('la capital empieza con sus 2 vecinas mas cercanas (3 regiones; 4 con pioneros) y las dos civilizaciones pueden elegir el mismo sitio', () => {
  const w = crearMundo(7, { mapa: mapaDe(7) });
  const tres = regionesIniciales(w, w.sitios[0], 3);
  assert.equal(tres.length, 3);
  assert.equal(tres[0], w.sitios[0]);
  assert.ok(tres.slice(1).every((r) => w.ds[w.sitios[0]][r] <= 2));
  assert.equal(regionesIniciales(w, w.sitios[0], 4).length, 4);
  const E = nuevoEstado(7);
  turno(E, [{ fundacion: { ...FUNDACION, sitio: 2 } }, { fundacion: { ...FUNDACION, sitio: 2, rasgos: ['pioneros', 'eruditos'] } }]);
  assert.equal(E.civs[0].capital, E.civs[1].capital);
  assert.equal(E.civs[0].regiones.length, 3);
  assert.equal(E.civs[1].regiones.length, 4, 'pioneros: +1 region inicial');
});

test('la frontera son las vecinas libres de las propias, sin repetir ni incluir las propias', () => {
  const w = crearMundo(7, { mapa: mapaDe(7) });
  const propias = regionesIniciales(w, w.sitios[0], 3);
  const f = fronteraDe(w, propias);
  assert.ok(f.length > 0);
  assert.equal(new Set(f).size, f.length);
  for (const r of f) { assert.ok(!propias.includes(r)); assert.ok(w.regs[r].vecinos.some((v) => propias.includes(v))); }
});
