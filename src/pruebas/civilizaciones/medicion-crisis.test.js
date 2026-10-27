import test from 'node:test';
import assert from 'node:assert/strict';
import { fundado, turno, civilizaciones } from './ayudas.js';
import { compararInvasion, medirCrisis } from '../../juegos/civilizaciones/medicion-crisis.js';
import { medir, jugarPartida } from '../../juegos/civilizaciones/medicion.js';
import { crearRng } from '../../rng.js';
import { comprobarInvariantes } from '../../juegos/civilizaciones/estado.js';

test('invasiones pareadas: mismo estado preservado, mismos dados, solo cambia respuesta; informe reproducible', () => {
  const E = fundado();
  E.turno = 7;
  E.civs[0].stock.Oro = 100;
  const antes = structuredClone(E);
  const r = compararInvasion(E, ['cientifico', 'equilibrado'], 0);
  assert.deepEqual(E, antes);
  assert.equal(r.tributo.resultado, 'tributo');
  assert.equal(r.resistir.resultado, 'derrota');
  assert.deepEqual(r, compararInvasion(E, ['cientifico', 'equilibrado'], 0));
  assert.deepEqual(r.tributo.malos, []);
  assert.deepEqual(r.resistir.malos, []);
  assert.throws(() => compararInvasion({ ...E, turno: 8 }, ['cientifico', 'equilibrado'], 0), /antes/);
});

test('informe pareado cuenta todos los turnos y bots; IC agrupado por mundo, empates por separado', () => {
  const r = medirCrisis({ mundos: 2, bots: ['cientifico'] });
  assert.equal(r.resumen.pares, 2 * 2 * 4);
  assert.equal(r.resumen.tributoConMediasTablas.n, 2);
  assert.equal(r.resumen.tributoMejor + r.resumen.resistirMejor + r.resumen.empates, r.resumen.pares);
  assert.equal(r.invariantesRotos, 0);
  assert.deepEqual(Object.keys(r.porTurno), ['8', '14', '20', '26']);
});

test('ablacion de crisis conserva calendario y mapa del seed; no ejecuta eventos, dilemas ni invasiones', () => {
  const E = civilizaciones.crear(crearRng(11), { sin: ['crisis'] });
  const F = civilizaciones.crear(crearRng(11));
  assert.deepEqual(E.mundo, F.mundo);
  assert.deepEqual(E.calendario, F.calendario);
  for (let t = 1; t <= 30; t++) {
    const r = turno(E);
    assert.ok(r.eventos.every((e) => !['evento', 'dilema', 'invasion', 'colapso', 'secesion'].includes(e.tipo)));
  }
  const a = jugarPartida(['cientifico', 'equilibrado'], 5, { sin: ['crisis'] });
  const b = jugarPartida(['cientifico', 'equilibrado'], 5);
  assert.notDeepEqual(a.civs, b.civs, 'la capa si tiene efecto observable');
});

test('sondas voraz y adaptativa: partidas completas sin mutar estado al decidir, sin errores de invariantes', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const E = civilizaciones.crear(crearRng(seed));
    for (let t = 1; t <= 30; t++) {
      const antes = structuredClone(E);
      const respuestas = ['voraz', 'adaptativa'].map((id, s) => civilizaciones.bots[id].fn(E, s, crearRng(seed * 31 + t)));
      assert.deepEqual(E, antes);
      turno(E, respuestas);
      assert.deepEqual(comprobarInvariantes(E), []);
    }
    assert.equal(civilizaciones.terminado(E), true);
  }
});

test('remontadas se agrupan por ventaja >1 y por seed, con todos los denominadores visibles', () => {
  const r = medir({ mundos: 3, invariantes: true });
  assert.equal(r.remontadasT10.reduce((a, x) => a + x.partidas, 0), r.liderT10.partidas);
  for (const tramo of r.remontadasT10) {
    assert.ok(tramo.remontadas <= tramo.partidas);
    assert.ok(tramo.ic.n <= 3);
  }
});
