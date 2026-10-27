import test from 'node:test';
import assert from 'node:assert/strict';
import { validarArbol, opcionesDelArbol, progreso } from '../../juegos/civilizaciones/arbol.js';

const grupo = (minimo, ...opciones) => ({ minimo, opciones });
const raiz = (id) => ({ id, requiere: grupo(0) });
const ramas = Array.from({ length: 5 }, (_, i) => `E${i + 1}`);
const catalogo = [
  ...ramas.map(raiz),
  ...ramas.map((id) => ({ id: `T${id}`, requiere: id })),
  { id: 'E10', requiere: grupo(3, ...ramas.map((id) => grupo(2, id, `T${id}`))) },
];

test('tres ramas completas, no tres edificios y tecnologias de otras ramas', () => {
  const ver = (hitos) => opcionesDelArbol(catalogo, hitos).find((n) => n.id === 'E10');
  assert.equal(validarArbol(catalogo), true);
  const parcial = ver(['E1', 'E2', 'E3', 'TE1', 'TE4', 'TE5']);
  assert.equal(parcial.cumple, false);
  assert.equal(parcial.completadas, 1);
  assert.equal(parcial.necesarias, 3);
  for (const seleccion of [['E1', 'E2', 'E4'], ['E2', 'E3', 'E5']]) {
    assert.equal(ver(seleccion.flatMap((id) => [id, `T${id}`])).cumple, true);
  }
});

test('las opciones no modifican hitos ni catalogo y omiten lo completado', () => {
  const antes = JSON.stringify(catalogo);
  const hitos = ['E1'];
  const vista = opcionesDelArbol(catalogo, hitos);
  assert.equal(vista.some((n) => n.id === 'E1'), false);
  assert.equal(vista.find((n) => n.id === 'TE1').cumple, true);
  assert.deepEqual(hitos, ['E1']);
  assert.equal(JSON.stringify(catalogo), antes);
  assert.equal(progreso(grupo(0), new Set()).cumple, true);
});

test('rechaza catalogos imposibles o ambiguos antes de jugar', () => {
  for (const nodos of [
    [], [raiz('A'), raiz('A')], [{ id: 'A', requiere: 'B' }],
    [{ id: 'A', requiere: 'A' }],
    [{ id: 'A', requiere: 'B' }, { id: 'B', requiere: 'A' }],
    [raiz('A'), { id: 'B', requiere: grupo(2, 'A') }],
    [raiz('A'), { id: 'B', requiere: grupo(2, 'A', 'A') }],
    [raiz('A'), { id: 'B', requiere: grupo(0, 'A') }],
    [raiz('A'), { id: 'B', requiere: grupo(1.5, 'A') }],
    [raiz('A'), raiz('B'), { id: 'C', requiere: grupo(2, grupo(2, 'A', 'B'), grupo(2, 'B', 'A')) }],
  ]) assert.throws(() => validarArbol(nodos));
});

test('un ciclo opcional tambien se rechaza y las referencias futuras son validas', () => {
  assert.throws(() => validarArbol([
    raiz('A'), { id: 'B', requiere: grupo(1, 'A', 'C') }, { id: 'C', requiere: 'B' },
  ]), /ciclo/);
  assert.equal(validarArbol([...catalogo].reverse()), true);
});
