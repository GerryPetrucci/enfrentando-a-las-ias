import test from 'node:test';
import assert from 'node:assert/strict';
import { fundado, turno } from './ayudas.js';
import { vistaDetallada, vistaTexto } from '../../juegos/civilizaciones/vista.js';
import { desgloseProduccion, modificadores } from '../../juegos/civilizaciones/economia.js';
import { RECURSOS, MAX_ORDENES, DILEMAS } from '../../juegos/civilizaciones/constantes.js';

test('desglose usa territorio, oficios, hierro especial, planos y penalizacion; redondea una vez', () => {
  const E = fundado(), c = E.civs[0];
  c.rasgos = []; c.regiones = []; c.poblacion = 13; c.reparto = [30, 20, 10, 10, 20, 10];
  c.estabilidad = 39; c.edificios = { 0: { tipo: 'mina', desde: 2 } };
  const m = modificadores(c, 2);
  m.mineroHierro = 2; m.hierroMina = 3; m.plano.Hierro = 1; m.pct.Hierro = 0.5;
  const d = desgloseProduccion(c, E.mundo, 2, m);
  assert.deepEqual(d.gente, [6, 2, 1, 1, 2, 1]);
  assert.deepEqual(d.recursos.Hierro, { territorio: 0, trabajo: 2, bonosPlanos: 4, bono: 0.5, penalizacion: 0.2, total: 8 });
  assert.equal(d.total.Comida, 14);
  m.pct.Comida = -3;
  assert.equal(desgloseProduccion(c, E.mundo, 2, m).total.Comida, 0);
});

test('produccion real conserva el momento de producir, antes de crecer; proyeccion no altera estado', () => {
  const E = fundado(), c = E.civs[0], d = structuredClone(c.ultimaProduccion);
  assert.equal(d.poblacion, 10);
  assert.equal(d.consumo, 10);
  assert.deepEqual(d.total, c.produccion);
  c.poblacion = 17; c.reparto = [0, 0, 0, 0, 0, 100];
  c.dilemas[2] = 2;
  const antes = structuredClone(E), v = vistaDetallada(E, 0);
  assert.deepEqual(E, antes);
  assert.deepEqual(c.ultimaProduccion, d);
  assert.match(v, /Tus rasgos: eruditos .*constructores/);
  assert.ok(v.includes(DILEMAS[2].opciones[1].nombre));
  assert.match(v, /Produccion REAL bruta T1/);
  assert.match(v, /Proyeccion bruta T2/);
  assert.match(v, /artistas 17/);
  for (const r of RECURSOS) assert.ok(v.includes(`${r}: (`));
  assert.ok(!vistaTexto(E, 0).includes('INFORMACION PROPIA'));
});

test('retorna descartes de parser, motor y comercio ya liquidado, solo del ultimo turno', () => {
  const E = fundado(); E.calendario = [];
  E.civs[1].ofertas = [{ n: 1, da: 'Oro', nDa: 10, pide: 'Madera', nPide: 1, vence: 2 }];
  E.civs[1].stock.Oro = 0;
  turno(E, [{ ordenes: ['orden inexistente', 'dilema 2', 'aceptar 1'] }, {}]);
  const u = E.civs[0].ultimasOrdenes;
  assert.equal(u.turno, 2); assert.equal(u.descartadas.length, 3);
  assert.ok(u.descartadas.some((o) => o.motivo === 'sin fondos al liquidar'));
  assert.match(vistaDetallada(E, 0), /no hay un dilema pendiente/);
  const copia = structuredClone(u);
  turno(E, [{}, {}]);
  assert.equal(E.civs[0].ultimasOrdenes.descartadas.length, 0);
  assert.equal(copia.descartadas.length, 3);
  assert.ok(!vistaDetallada(E, 0).includes('sin fondos al liquidar'));
});

test('informa respuesta invalida y agrupa exceso sin conservar un historial ilimitado', () => {
  const E = fundado();
  turno(E, [null, {}]);
  assert.match(vistaDetallada(E, 0), /Respuesta invalida: la respuesta no traia/);
  turno(E, [{ ordenes: Array(MAX_ORDENES + 50).fill('dilema 1') }, {}]);
  assert.equal(E.civs[0].ultimasOrdenes.exceso, 50);
  assert.equal(E.civs[0].ultimasOrdenes.descartadas.length, MAX_ORDENES);
  assert.match(vistaDetallada(E, 0), /limite de ordenes: 50/);
});

test('variante no expone rasgos, dilemas, produccion, descartes ni textos privados del rival', () => {
  const E = fundado(), antes = vistaDetallada(E, 0), b = E.civs[1];
  b.rasgos = ['pioneros', 'guerreros']; b.dilemas = { 2: 3 };
  b.stock.Oro = 987654; b.reparto = [0, 0, 0, 0, 0, 100];
  b.nota = 'NOTA SECRETA'; b.ultimaProduccion = { secreto: 'PRODUCCION SECRETA' };
  b.ultimasOrdenes = { secreto: 'ORDENES SECRETAS' };
  assert.equal(vistaDetallada(E, 0), antes);
});

test('hambre registra consumo requerido y saldo cero; no reconstruye con poblacion posterior', () => {
  const E = fundado(); E.calendario = []; const c = E.civs[0];
  c.stock.Comida = 0; c.reparto = [0, 0, 0, 0, 0, 100]; c.guardias = 4;
  const poblacion = c.poblacion;
  turno(E, [{}, {}]);
  assert.equal(c.ultimaProduccion.consumo, poblacion + 4);
  assert.equal(c.ultimaProduccion.poblacion, poblacion);
  assert.equal(c.ultimaProduccion.hambre, true);
  assert.equal(c.ultimaProduccion.comidaTrasConsumo, 0);
  assert.ok(c.poblacion < poblacion);
  assert.match(vistaDetallada(E, 0), /hambre si; Comida justo despues de comer 0/);
});
