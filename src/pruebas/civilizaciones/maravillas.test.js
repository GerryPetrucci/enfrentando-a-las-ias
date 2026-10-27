import test from 'node:test';
import assert from 'node:assert/strict';
import { fundado, turno, civilizaciones } from './ayudas.js';
import { invertir, resolverMaravillas, avanceMaravilla } from '../../juegos/civilizaciones/turno/maravillas.js';
import { MARAVILLA } from '../../juegos/civilizaciones/constantes.js';
import { modificadores } from '../../juegos/civilizaciones/economia.js';
import { rngDe } from '../../juegos/civilizaciones/rng.js';
import { comprobarInvariantes } from '../../juegos/civilizaciones/estado.js';
import { resolverInvasion } from '../../juegos/civilizaciones/turno/invasion.js';
import { jugarPartida } from '../../juegos/civilizaciones/medicion.js';

const preparar = () => {
  const E = fundado();
  E.civs.forEach((c) => { c.tecnologias = ['E1', 'S1', 'T1', 'M1', 'S2']; c.era = 2; for (const r in c.stock) c.stock[r] = 100; });
  return E;
};
const completar = (E, c, id, t) => { for (const [r,n] of Object.entries(MARAVILLA[id].costo)) assert.equal(invertir(E, c, id, r, n, t), null); };

test('invertir valida tecnologia, recurso y fondos sin tocar estado si descarta; recorta al costo pendiente', () => {
  const E = preparar(), c = E.civs[0];
  const antes = structuredClone(E);
  assert.match(invertir(E, c, 'faro', 'Madera', 1, 2), /tecnologia/);
  assert.match(invertir(E, c, 'piramide', 'Oro', 1, 2), /recurso/);
  assert.match(invertir(E, c, 'piramide', 'Roca', 101, 2), /recursos/);
  assert.deepEqual(E, antes);
  assert.equal(invertir(E, c, 'piramide', 'Roca', 20, 2), null);
  assert.equal(invertir(E, c, 'piramide', 'Roca', 20, 3), null);
  assert.equal(c.stock.Roca, 70);
  assert.equal(c.proyectosMaravillas.piramide.inicio, 2);
  assert.equal(avanceMaravilla(c, 'piramide'), 60);
  assert.match(invertir(E, c, 'piramide', 'Roca', 1, 3), /cubierto/);
});

test('cierre compartido: simultanea usa Estabilidad anterior, reembolsa tambien proyecto incompleto y activa bono despues', () => {
  const E = preparar(); E.civs[0].estabilidad = 40; E.civs[1].estabilidad = 60;
  completar(E, E.civs[0], 'piramide', 2); completar(E, E.civs[1], 'piramide', 2);
  const oro = E.civs[0].stock.Oro, rc = { eventos: [] };
  resolverMaravillas(E, 2, rc);
  assert.equal(E.civs[1].maravillas[0].id, 'piramide');
  assert.equal(E.civs[0].stock.Oro, oro + 25);
  assert.equal(E.civs[1].stock.Oro, 100, 'el ganador no recibe reembolso');
  assert.equal(E.civs[0].proyectosMaravillas.piramide, undefined);
  assert.equal(modificadores(E.civs[1], 2).espacio, 0);
  assert.equal(modificadores(E.civs[1], 3).espacio, 6);
  assert.equal(rc.eventos[0].simultanea, true);
  assert.equal(rc.eventos[0].ganador, 1);
  assert.match(invertir(E, E.civs[0], 'piramide', 'Roca', 1, 3), /construida/);
  const despues = structuredClone(E);
  resolverMaravillas(E, 3, rc); assert.deepEqual(E, despues, 'sin doble premio ni reembolso');
});

test('proyecto perdedor incompleto devuelve exactamente el 50%, incluso medio Oro', () => {
  const E = preparar();
  completar(E, E.civs[1], 'piramide', 3);
  invertir(E, E.civs[0], 'piramide', 'Roca', 3, 2);
  const oro = E.civs[0].stock.Oro, rc = { eventos: [] };
  resolverMaravillas(E, 3, rc);
  assert.equal(E.civs[0].stock.Oro, oro + 1.5);
  assert.equal(rc.eventos[0].inicios[0], 2);
  assert.equal(rc.eventos[0].inicios[1], 3);
});

test('empate usa clave por maravilla y mismo seed, sin depender del orden de resolucion', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const E = preparar(); E.seedMundo = seed;
    E.civs.forEach((c) => completar(E, c, 'piramide', 2));
    const F = structuredClone(E); F.civs.reverse();
    const r = { eventos: [] }, q = { eventos: [] };
    resolverMaravillas(E, 2, r); resolverMaravillas(F, 2, q);
    assert.deepEqual(r, q);
    assert.equal(r.eventos[0].ganador, rngDe(seed, 2, 'maravilla-piramide')() < 0.5 ? 0 : 1);
  }
});

test('dos Maravillas diferentes se construyen juntas; el rival solo ve porcentaje, nunca cantidades', () => {
  const E = preparar();
  completar(E, E.civs[0], 'piramide', 2); completar(E, E.civs[1], 'biblioteca mayor', 2);
  const rc = { eventos: [] }; resolverMaravillas(E, 2, rc);
  assert.equal(rc.eventos.length, 2);
  assert.equal(E.civs[0].maravillas.length, 1); assert.equal(E.civs[1].maravillas.length, 1);
  const F = preparar(); invertir(F, F.civs[1], 'piramide', 'Roca', 17, 2);
  const v = civilizaciones.vista(F, 0);
  assert.match(v, /piramide tu 0% \/ rival 34%/); assert.doesNotMatch(v, /Roca 17|inicio/);
});

test('turno real: inversiones de ambos antes del cierre; no usa estabilidad recalculada este turno', () => {
  const E = preparar(); E.calendario = [];
  E.civs[0].estabilidad = 60; E.civs[1].estabilidad = 40;
  E.civs[1].temporales.push({ desde: 2, hasta: 2, efectos: [{ t: 'estabilidad', v: 50 }] });
  const ordenes = ['invertir piramide Roca 30', 'invertir piramide Madera 20'];
  const rc = turno(E, [{ ordenes }, { ordenes }]);
  assert.equal(rc.eventos.find((e) => e.tipo === 'maravilla').ganador, 0);
  assert.ok(E.civs[1].estabilidad > E.civs[0].estabilidad);
  assert.equal(rc.instantanea.civs[0].maravillas[0], 'piramide');
  assert.deepEqual(comprobarInvariantes(E), []);
});

test('sin=carrera impide inversiones y cierre de Maravillas', () => {
  const E = preparar(); E.capas.carrera = false;
  assert.match(invertir(E, E.civs[0], 'piramide', 'Roca', 1, 2), /desactivada/);
  const rc = { eventos: [] }; resolverMaravillas(E, 2, rc);
  assert.deepEqual(rc.eventos, []);
});

test('saqueo tras reembolso fraccionario nunca cobra mas Oro del almacen: regresion espejo cientifico seed 1', () => {
  const E = preparar(), c = E.civs[0]; c.stock.Oro = 0.5; c.guardias = 0;
  resolverInvasion(E, c, { turno: 8, fuerza: 6 }, 1, true, { eventos: [] });
  assert.equal(c.stock.Oro, 0);
  assert.deepEqual(comprobarInvariantes(E), []);
  assert.deepEqual(jugarPartida(['cientifico', 'cientifico'], 1, { invariantes: true }).malos, []);
});
