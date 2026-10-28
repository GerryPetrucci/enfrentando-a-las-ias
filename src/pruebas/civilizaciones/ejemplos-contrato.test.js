import test from 'node:test';
import assert from 'node:assert/strict';
import { ejemplosDeContrato } from '../../juegos/civilizaciones/ejemplos-contrato.js';

test('ejemplos calculados por motor: personas, costos, difusion y reclutamiento', () => {
  const x = ejemplosDeContrato();
  assert.deepEqual(x.reparto.personas, [6, 2, 1, 1, 2, 1]);
  assert.deepEqual(x.reparto.produccionSinRegionesNiBonos, { Comida: 18, Madera: 4, Roca: 2, Hierro: 0, Oro: 2, Ciencia: 4, Cultura: 2 });
  assert.deepEqual(x.costos.normal, { Madera: 10, Roca: 7, Hierro: 2 });
  assert.deepEqual(x.costos.conGenio, { Madera: 6, Roca: 4, Hierro: 1 });
  assert.deepEqual(x.costos.colonizarConTresRegiones, { Comida: 5, Madera: 5 });
  assert.equal(x.difusion.sinDifusion, 17);
  assert.equal(x.difusion.conDifusion, 12);
  assert.equal(x.reclutamiento.comida, 2);
  assert.equal(x.reclutamiento.hierro, 2);
  assert.equal(x.reclutamiento.error, null);
  assert.ok(Math.abs(x.reclutamiento.defensa - 3.9) < 1e-9);
});

test('inversion exige saldo para la cantidad pedida antes de recortar al pendiente', () => {
  const x = ejemplosDeContrato().inversion;
  assert.equal(x.inversionRechazada, 'no alcanzan los recursos');
  assert.equal(x.saldoTrasRechazo, 7);
  assert.equal(x.inversionAceptada, null);
  assert.equal(x.saldoFinal, 3);
  assert.equal(x.invertidoFinal, 30);
});

test('fragmentos reproducibles y neutros, con construccion antes de investigacion real', () => {
  const a = ejemplosDeContrato(), b = ejemplosDeContrato();
  assert.deepEqual(a, b);
  assert.deepEqual(a.primerTurno.ordenes.map((o) => [o.tipo, o.estado]), [['construir', 'aplicada'], ['investigar', 'aplicada']]);
  assert.ok(a.primerTurno.proyectos.some((p) => p.tec === 'T1') || a.primerTurno.tecnologias.includes('T1'));
  assert.match(a.vistas.inicio, /TEMPORADA 1/);
  assert.match(a.vistas.despuesDelPrimerTurno, /Ejemplo A/);
  assert.ok(!/bot|cientifico|expansionista/i.test(a.vistas.despuesDelPrimerTurno));
});
