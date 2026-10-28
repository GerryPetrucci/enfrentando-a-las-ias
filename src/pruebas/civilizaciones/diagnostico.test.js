import test from 'node:test';
import assert from 'node:assert/strict';
import J from '../../juegos/civilizaciones.js';
import { crearRng } from '../../rng.js';
import { BOTS, PERFILES } from '../../juegos/civilizaciones-bots.js';
import { diagnosticarDecision, resumirDiagnostico, analizarRutas } from '../../juegos/civilizaciones/diagnostico.js';
import { OFICIOS } from '../../juegos/civilizaciones/constantes.js';

function escenario() {
  const E = J.crear(crearRng(5));
  J.aplicar(E, [0, 1].map((s) => J.normalizar(BOTS.cientifico(E, s, crearRng(s)), E)));
  const c = E.civs[0];
  c.stock = { Comida: 100, Madera: 6, Roca: 100, Hierro: 100, Oro: 100 };
  c.reservaCiencia = 100;
  return E;
}

test('el bot reserva el centro de investigacion antes de expandirse y ejecuta ambas fases sin descartes', () => {
  const E = escenario(), antes = structuredClone(E);
  const respuesta = BOTS.cientifico(E, 0, crearRng(1));
  assert.deepEqual(E, antes, 'decidir no modifica estado');
  assert.ok(respuesta.ordenes.some((o) => o.startsWith('construir ')));
  assert.ok(respuesta.ordenes.some((o) => o.startsWith('investigar ')));
  assert.ok(!respuesta.ordenes.some((o) => o.startsWith('colonizar ')), 'no puede pagar colonia y centro');
  const r = J.aplicar(E, [J.normalizar(respuesta, E), J.normalizar({}, E)]);
  assert.ok(r.civs[0].ordenes.every((o) => o.estado === 'aplicada'));
  assert.ok(E.civs[0].tecnologias.length > 0);
});

test('reservar no prohibe colonizar cuando alcanza para colonia y centro', () => {
  const E = escenario();
  E.civs[0].stock.Madera = 100;
  const r = BOTS.cientifico(E, 0, crearRng(1));
  assert.ok(r.ordenes.some((o) => o.startsWith('colonizar ')));
  assert.ok(r.ordenes.some((o) => o.startsWith('construir ')));
});

test('Ciencia ociosa mueve diez puntos a Madera, revierte al financiar el centro y respeta hambre', () => {
  const E = escenario(), c = E.civs[0];
  c.stock.Madera = 0;
  const respuesta = BOTS.cientifico(E, 0, crearRng(1));
  const orden = J.normalizar(respuesta, E).ordenes.find((o) => o.tipo === 'asignar');
  assert.deepEqual(OFICIOS.map((o) => orden.reparto[o]), [30, 20, 10, 0, 30, 10]);
  c.reparto = OFICIOS.map((o) => orden.reparto[o]);
  c.stock.Madera = 100;
  const vuelta = J.normalizar(BOTS.cientifico(E, 0, crearRng(1)), E).ordenes.find((o) => o.tipo === 'asignar');
  assert.deepEqual(OFICIOS.map((o) => vuelta.reparto[o]), PERFILES.cientifico.reparto);
  c.hambre = true; c.stock.Madera = 0;
  const hambre = J.normalizar(BOTS.cientifico(E, 0, crearRng(1)), E).ordenes.find((o) => o.tipo === 'asignar');
  assert.deepEqual(OFICIOS.map((o) => hambre.reparto[o]), [40, 10, 10, 0, 30, 10]);
  c.reparto = OFICIOS.map((o) => hambre.reparto[o]);
  const persistente = J.normalizar(BOTS.cientifico(E, 0, crearRng(1)), E).ordenes.find((o) => o.tipo === 'asignar');
  assert.equal(persistente.reparto.granjeros, 50, 'otra ronda con hambre sigue aumentando alimentos');
});

test('diagnostico separa centro financiable de falta de recursos y no altera el estado', () => {
  const E = escenario(), antes = structuredClone(E);
  const a = diagnosticarDecision(E, 0, PERFILES.cientifico, { ordenes: [] });
  assert.equal(a.bloqueo, 'centro financiable');
  assert.deepEqual(E, antes);
  E.civs[0].stock.Madera = 0;
  const b = diagnosticarDecision(E, 0, PERFILES.cientifico, { ordenes: [] });
  assert.equal(b.bloqueo, 'recursos para centro');
  assert.ok(b.centros.every((n) => n.faltan.Madera > 0));
  const r = resumirDiagnostico([a, { ...b, turno: 3 }, { ...a, turno: 4, bloqueo: null }])[0];
  assert.equal(r.rachaMaxima, 2);
  assert.deepEqual(r.bloqueosAlInicio, { 'centro financiable': 1, 'recursos para centro': 1 });
});

test('alternativas aparentes pueden compartir un requisito imprescindible', () => {
  const nodos = [
    { id: 'base', requiere: { minimo: 0, opciones: [] } },
    { id: 'a', requiere: 'base' }, { id: 'b', requiere: 'base' },
    { id: 'meta', requiere: { minimo: 1, opciones: ['a', 'b'] } },
  ];
  assert.deepEqual(analizarRutas(nodos, 'meta').imprescindibles, ['base']);
  assert.deepEqual(analizarRutas(nodos, 'meta').inalcanzables, []);
  assert.throws(() => analizarRutas(nodos, 'no existe'), /objetivo/);
});
