import test from 'node:test';
import assert from 'node:assert/strict';
import { fundado, turno } from './ayudas.js';
import { perderRegion, resolverEstabilidad } from '../../juegos/civilizaciones/turno/estabilidad.js';
import { rngDe } from '../../juegos/civilizaciones/rng.js';
import { modificadores, produccion } from '../../juegos/civilizaciones/economia.js';
import { comprobarInvariantes } from '../../juegos/civilizaciones/estado.js';

const registro = () => ({ eventos: [] });
function critica(c, valor) {
  c.cultura = 0; c.hambre = false;
  c.temporales = [{ desde: 1, hasta: 30, efectos: [{ t: 'estabilidad', v: valor - 50 }] }];
}

test('region perdida: sin edificio por menor id; despues con edificio; nunca la capital', () => {
  const c = fundado().civs[0];
  c.capital = 4; c.regiones = [4, 7, 2, 1];
  c.edificios = { 1: { tipo: 'granero', desde: 1 }, 4: { tipo: 'templo', desde: 1 } };
  assert.equal(perderRegion(c), 2);
  assert.equal(perderRegion(c), 7);
  assert.equal(perderRegion(c), 1);
  assert.equal(c.edificios[1], undefined);
  assert.equal(perderRegion(c), null);
  assert.deepEqual(c.regiones, [4]);
  assert.ok(c.edificios[4]);
});

test('bajo 20: una tirada comun por turno, sin asiento; 20 no activa secesion', () => {
  for (let seed = 0; seed < 40; seed++) {
    const E = fundado({ seed });
    E.civs.forEach((c) => critica(c, 19));
    const rc = registro();
    E.civs.forEach((c) => resolverEstabilidad(E, c, 2, rc));
    const cae = rngDe(E.seedMundo, 2, 'secesion')() < 0.5;
    assert.deepEqual(E.civs.map((c) => c.regiones.length), [cae ? 2 : 3, cae ? 2 : 3]);
    assert.equal(rc.eventos.length, cae ? 2 : 0);
    assert.ok(rc.eventos.every((e) => e.tipo === 'secesion' && Number.isInteger(e.region)));
    const F = fundado({ seed });
    critica(F.civs[0], 20);
    resolverEstabilidad(F, F.civs[0], 2, registro());
    assert.equal(F.civs[0].regiones.length, 3);
  }
});

test('colapso: pierde ceil(25%) de gente y hasta dos regiones, guarda 30 y no hace secesion adicional', () => {
  const E = fundado(), c = E.civs[0];
  critica(c, -10); c.poblacion = 9;
  const rc = registro(), cierres = c.cierres, suma = c.sumaEstabilidad;
  resolverEstabilidad(E, c, 2, rc);
  assert.deepEqual([c.poblacion, c.regiones.length, c.estabilidad, c.colapsos], [6, 1, 30, 1]);
  assert.equal(c.cierres, cierres + 1);
  assert.equal(c.sumaEstabilidad, suma + 30);
  assert.deepEqual(rc.eventos.map((e) => e.tipo), ['colapso']);
  assert.equal(rc.eventos[0].regiones.length, 2);
  assert.deepEqual(comprobarInvariantes(E), []);
  c.poblacion = 1;
  resolverEstabilidad(E, c, 3, registro());
  assert.deepEqual([c.poblacion, c.regiones.length, c.estabilidad, c.colapsos], [1, 1, 30, 2]);
});

test('la secesion destruye el edificio de la region perdida y elimina su bono', () => {
  const E = fundado(), c = E.civs[0];
  const [capital, a, b] = c.regiones;
  c.capital = capital;
  c.edificios = { [a]: { tipo: 'granero', desde: 1 }, [b]: { tipo: 'aserradero', desde: 1 } };
  const menor = Math.min(a, b), tipo = c.edificios[menor].tipo;
  const antes = modificadores(c, 2);
  assert.equal(perderRegion(c), menor);
  const despues = modificadores(c, 3);
  const recurso = tipo === 'granero' ? 'Comida' : 'Madera';
  assert.ok(despues.pct[recurso] < antes.pct[recurso]);
  assert.deepEqual(comprobarInvariantes(E), []);
});

test('el cierre real usa la estabilidad recalculada: colapso una vez y promedio con 30', () => {
  const E = fundado(), c = E.civs[0];
  critica(c, -100); c.estabilidad = 100;
  const suma = c.sumaEstabilidad, cierres = c.cierres;
  const rc = turno(E);
  assert.equal(c.colapsos, 1);
  assert.equal(c.estabilidad, 30);
  assert.equal(c.sumaEstabilidad, suma + 30);
  assert.equal(c.cierres, cierres + 1);
  assert.equal(rc.eventos.filter((e) => e.s === 0 && e.tipo === 'colapso').length, 1);
  assert.equal(rc.instantanea.civs[0].estabilidad, 30);
});

test('produccion usa el cierre previo: 39 penaliza, 40 no; colapso no cambia la produccion ya hecha', () => {
  const E = fundado(), c = E.civs[0];
  critica(c, -100);
  c.estabilidad = 40;
  const normal = produccion(c, E.mundo, 2);
  c.estabilidad = 39;
  const penal = produccion(c, E.mundo, 2);
  assert.ok(Object.keys(normal).some((r) => penal[r] < normal[r]));
  c.estabilidad = 40;
  turno(E);
  assert.deepEqual(c.produccion, normal);
  assert.equal(c.estabilidad, 30);
});
