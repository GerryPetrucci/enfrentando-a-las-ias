import test from 'node:test';
import assert from 'node:assert/strict';
import { comprobarInvariantes } from '../../juegos/civilizaciones/estado.js';
import { civilizaciones, jugar } from './ayudas.js';

// Spec 4: poblacion >= 1, ningun recurso negativo, el reparto suma 100, a lo sumo un edificio por region (y solo en regiones propias), una Maravilla un constructor,
// las tecnologias no pasan de lo que permiten las eras, la capital es propia y el Indice esta entre 0 y 100. Se revisan tras CADA turno.
const BOTS = ['cientifico', 'expansionista', 'equilibrado', 'pasivo', 'azar'];

test('100 partidas de bots (al azar y de politica) cumplen todos los invariantes despues de cada turno y terminan en el turno 30', async () => {
  let partidas = 0;
  for (let seed = 1; partidas < 100; seed++) {
    const a = BOTS[seed % BOTS.length], b = BOTS[(seed * 3 + 1) % BOTS.length];
    const malos = [];
    const p = await jugar(a, b, 1000 + seed, { opciones: { seedTemporada: seed }, alRegistrar: (_r, E) => { const m = comprobarInvariantes(E); if (m.length) malos.push(`turno ${E.turno}: ${m.join('; ')}`); } });
    assert.deepEqual(malos, [], `${a} vs ${b} seed ${1000 + seed}`);
    assert.equal(p.truncada, false);
    assert.equal(p.rondas.length, 30);
    partidas++;
  }
  assert.equal(partidas, 100);
});

test('dos bots al azar (basura, fundaciones invalidas, ordenes imposibles) nunca tumban el motor', async () => {
  for (let seed = 1; seed <= 40; seed++) {
    const malos = [];
    const p = await jugar('azar', 'azar', 5000 + seed, { alRegistrar: (_r, E) => malos.push(...comprobarInvariantes(E)) });
    assert.deepEqual(malos, [], `seed ${5000 + seed}`);
    assert.equal(p.rondas.length, 30);
    assert.ok(p.metricas.every((m) => m.ordenesTotal > 0));
  }
});

test('los invariantes detectan lo que deben: poblacion 0, recurso negativo, reparto que no suma 100, edificio en region ajena, Maravilla con dos constructores', async () => {
  const p = await jugar('cientifico', 'equilibrado', 9, { maxRondas: 12 });
  assert.equal(p.rondas.length, 12);
  const { nuevoEstado, fundado } = await import('./ayudas.js');
  const E = fundado();
  assert.deepEqual(comprobarInvariantes(E), []);
  const rompe = (f) => { const x = fundado(); f(x.civs[0], x); return comprobarInvariantes(x).length; };
  assert.ok(rompe((c) => { c.poblacion = 0; }) > 0);
  assert.ok(rompe((c) => { c.guardias = -1; }) > 0);
  assert.ok(rompe((c) => { c.guardias = 1.5; }) > 0);
  assert.ok(rompe((c) => { c.estabilidad = 101; }) > 0);
  assert.ok(rompe((c) => { c.stock.Oro = -1; }) > 0);
  assert.ok(rompe((c) => { c.reparto = [50, 50, 10, 0, 0, 0]; }) > 0);
  assert.ok(rompe((c) => { c.reparto = [45, 55, 0, 0, 0, 0]; }) > 0);
  assert.ok(rompe((c) => { c.edificios[99] = { tipo: 'granero', desde: 1 }; }) > 0);
  assert.ok(rompe((c) => { c.capital = 99; }) > 0);
  assert.ok(rompe((c) => { c.tecnologias = ['T3']; }) > 0, 'una tecnologia de la era 3 sin la era');
  assert.ok(rompe((c, x) => { c.maravillas = [{ id: 'faro', desde: 2 }]; x.civs[1].maravillas = [{ id: 'faro', desde: 2 }]; }) > 0);
  assert.ok(rompe((c) => { c.culturaAcumulada = 1e12; c.tecnologias = []; c.stock.Oro = Number.NaN; }) > 0);
  assert.equal(nuevoEstado().turno, 0);
  assert.equal(civilizaciones.terminado(nuevoEstado()), false);
});
