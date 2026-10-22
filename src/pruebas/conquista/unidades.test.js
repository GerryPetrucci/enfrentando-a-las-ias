import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNIDADES, DOMINA, DOMINIO, MEJORAS, N_TIPOS } from '../../juegos/conquista/constantes.js';
import { sumaPila, multiplicadorDominio, fuerzaDeMiembro, racionesDe, costoDePila, unidadDeTexto, pilaDeTipo, dejarUna } from '../../juegos/conquista/unidades.js';

const L = 0, A = 1, J = 2, I = 3;

test('hay 4 tipos de unidad con costo, fuerza y racion; el Ingenio defiende con 1 y ataca con 3.5', () => {
  assert.equal(N_TIPOS, 4);
  assert.deepEqual(UNIDADES.map((u) => u.id), ['L', 'A', 'J', 'I']);
  assert.deepEqual(UNIDADES.map((u) => u.fuerzaAtaca), [1, 2, 3, 3.5]);
  assert.deepEqual(UNIDADES.map((u) => u.fuerzaDefiende), [1, 2, 3, 1]);
  assert.deepEqual(UNIDADES.map((u) => u.racion), [1, 1, 2, 2]);
  assert.deepEqual(UNIDADES[J].costo, { Comida: 1, Caballos: 1 });
  assert.deepEqual(UNIDADES[I].costo, { Comida: 1, Madera: 1, Roca: 1, Hierro: 1 });
});

test('el dominio es L>J, A>L, J>A, J>I y el Ingenio no domina a nadie', () => {
  assert.deepEqual(DOMINA[L], [J]);
  assert.deepEqual(DOMINA[A], [L]);
  assert.deepEqual(DOMINA[J].sort(), [A, I]);
  assert.deepEqual(DOMINA[I], []);
  assert.equal(DOMINIO, 2);
});

test('contra un rival de un solo tipo, quien lo domina rinde el doble y los demas lo normal', () => {
  assert.equal(multiplicadorDominio(L, [0, 0, 5, 0]), 2); // Lancero contra Jinetes
  assert.equal(multiplicadorDominio(A, [5, 0, 0, 0]), 2); // Arquero contra Lanceros
  assert.equal(multiplicadorDominio(J, [0, 5, 0, 0]), 2); // Jinete contra Arqueros
  assert.equal(multiplicadorDominio(J, [0, 0, 0, 5]), 2); // Jinete contra Ingenios
  assert.equal(multiplicadorDominio(L, [5, 0, 0, 0]), 1);
  assert.equal(multiplicadorDominio(L, [0, 5, 0, 0]), 1, 'el dominado no pierde nada extra: un Lancero contra Arqueros rinde lo normal');
  assert.equal(multiplicadorDominio(I, [3, 3, 3, 3]), 1, 'el Ingenio no domina a nadie');
});

test('contra una mezcla el doble cuenta en proporcion al numero de unidades de cada tipo', () => {
  assert.equal(multiplicadorDominio(L, [6, 0, 2, 0]), 1.25); // 2 de 8 son Jinetes
  assert.equal(multiplicadorDominio(J, [0, 3, 0, 1]), 2); // todos dominados por el Jinete
  assert.equal(multiplicadorDominio(J, [1, 1, 1, 1]), 1.5); // la mitad de la mezcla (A e I)
  assert.equal(multiplicadorDominio(L, [0, 0, 0, 0]), 1, 'sin rival no hay dominio');
});

test('la fuerza de una pila suma unidades x fuerza x (1 + 0.25 por mejora) x dominio x modificador', () => {
  assert.equal(fuerzaDeMiembro([4, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], true), 4);
  assert.equal(fuerzaDeMiembro([2, 3, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0], true), 2 + 6 + 3);
  assert.equal(fuerzaDeMiembro([4, 0, 0, 0], [2, 0, 0, 0], [0, 0, 0, 0], true), 4 * 1.5, 'dos mejoras de Lancero: +50 %');
  assert.equal(fuerzaDeMiembro([0, 0, 0, 2], [0, 0, 0, 0], [0, 0, 0, 0], true), 7, 'Ingenio atacando: 3.5 cada uno');
  assert.equal(fuerzaDeMiembro([0, 0, 0, 2], [0, 0, 0, 0], [0, 0, 0, 0], false), 2, 'Ingenio defendiendo: 1 cada uno');
  assert.equal(fuerzaDeMiembro([4, 0, 0, 0], [0, 0, 0, 0], [0, 0, 6, 0], true), 8, 'Lanceros contra Jinetes: el doble');
  assert.equal(fuerzaDeMiembro([4, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], true, 0.5), 2, 'un modificador del reino multiplica el total');
  assert.equal(MEJORAS.bono, 0.25);
  assert.equal(MEJORAS.maximo, 2);
});

test('la racion pesa doble para Jinetes e Ingenios', () => {
  assert.equal(racionesDe([4, 4, 0, 0]), 8);
  assert.equal(racionesDe([0, 0, 3, 2]), 10);
});

test('el costo de reclutar suma por recurso y redondea hacia arriba UNA vez por recurso (cuartel: mitad)', () => {
  assert.deepEqual(costoDePila([4, 0, 0, 0]), { Comida: 4 });
  assert.deepEqual(costoDePila([2, 3, 1, 1]), { Comida: 7, Madera: 4, Caballos: 1, Roca: 1, Hierro: 1 });
  assert.deepEqual(costoDePila([5, 0, 0, 0], 0.5), { Comida: 3 }, 'ceil(5 x 0.5)');
  assert.deepEqual(costoDePila([0, 3, 0, 0], 0.5), { Comida: 2, Madera: 2 });
  assert.deepEqual(costoDePila([0, 0, 0, 0]), {});
});

test('los tipos se leen por inicial o por nombre, sin importar mayusculas, acentos ni plural', () => {
  for (const [t, i] of [['L', L], ['l', L], ['lancero', L], ['Lanceros', L], ['A', A], ['arquero', A], ['ARQUEROS', A], ['J', J], ['jinete', J], ['Jinetes', J], ['I', I], ['ingenio', I], ['Ingenios', I]]) assert.equal(unidadDeTexto(t), i, t);
  for (const t of ['', 'x', 'caballeria', 'lan', 'jinet', null, undefined, 7]) assert.equal(unidadDeTexto(t), null, String(t));
});

test('sumaPila, pilaDeTipo y dejarUna', () => {
  assert.equal(sumaPila([1, 2, 3, 4]), 10);
  assert.deepEqual(pilaDeTipo(J, 3), [0, 0, 3, 0]);
  assert.deepEqual(dejarUna([2, 5, 5, 0]), [0, 1, 0, 0], 'deja 1 unidad del tipo mas numeroso (empate: el de menor indice)');
  assert.deepEqual(dejarUna([0, 0, 0, 3]), [0, 0, 0, 1]);
});
