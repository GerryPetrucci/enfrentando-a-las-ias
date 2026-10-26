import test from 'node:test';
import assert from 'node:assert/strict';
import { vistaTexto } from '../../juegos/civilizaciones/vista.js';
import { civilizaciones, nuevoEstado, fundado, turno } from './ayudas.js';

test('turno 1: la vista ofrece los 3 sitios de capital y todavia no habla de almacen ni de rival', () => {
  const E = nuevoEstado();
  const v = vistaTexto(E, 0);
  assert.match(v, /Funda tu civilizacion/);
  for (let k = 1; k <= 3; k++) assert.match(v, new RegExp(`^${k}: R\\d\\d`, 'm'));
  assert.ok(!/Almacen|Rival/.test(v));
  assert.equal(civilizaciones.vista(E, 0), v);
});

test('la vista de una civilizacion nunca filtra lo privado del rival (reparto, almacen, reserva, nota ni ordenes), solo lo publico', () => {
  const E = fundado();
  const [a, b] = E.civs;
  b.reparto = [10, 10, 10, 10, 10, 50]; b.stock.Oro = 43210; b.stock.Hierro = 98765; b.reservaCiencia = 87654;
  b.nota = 'SECRETO-NOTA-DEL-RIVAL'; b.mensaje = 'MENSAJE-PUBLICO-DEL-RIVAL'; b.proyectos = [{ tec: 'T1', progreso: 6 }];
  a.nota = 'MI-NOTA-PRIVADA';
  const v = vistaTexto(E, 0);
  for (const secreto of ['SECRETO-NOTA-DEL-RIVAL', '43210', '98765', '87654', 'artistas 50']) assert.ok(!v.includes(secreto), `filtra ${secreto}`);
  assert.ok(v.includes('MENSAJE-PUBLICO-DEL-RIVAL'), 'el ultimo mensaje del rival es publico');
  assert.ok(v.includes('MI-NOTA-PRIVADA'), 'mi nota si');
  assert.ok(v.includes(b.nombre) && v.includes(b.lema), 'nombre y lema del rival son publicos');
});

test('la vista de cada asiento habla de SU civilizacion: sus recursos y su reparto', () => {
  const E = fundado();
  E.civs[0].stock.Oro = 31; E.civs[1].stock.Oro = 77;
  assert.match(vistaTexto(E, 0), /Oro 31\b/);
  assert.match(vistaTexto(E, 1), /Oro 77\b/);
  assert.ok(!vistaTexto(E, 0).includes('Oro 77'));
});

test('la vista lista lo que se puede hacer: colonizar, investigar y construir lo desbloqueado con su costo', () => {
  const E = fundado();
  assert.match(vistaTexto(E, 0), /Puedes investigar: .*Cultivo/);
  assert.ok(!/Puedes construir/.test(vistaTexto(E, 0)), 'sin tecnologias no hay nada que construir');
  E.civs[0].tecnologias.push('T1');
  const v = vistaTexto(E, 0);
  assert.match(v, /Puedes colonizar: R\d\d/);
  assert.ok(!/Puedes investigar: .*Cultivo/.test(v), 'lo que ya conoces no se ofrece');
  assert.match(v, /Puedes construir: granero \(3 Madera \+ 2 Roca\)/);
  const F = fundado();
  turno(F, [{ ordenes: ['investigar cultivo'] }, {}]);
  assert.match(vistaTexto(F, 0), /Investigas: Cultivo|Puedes construir: granero/, 'o sigue en curso o ya se completo y se puede construir');
});
