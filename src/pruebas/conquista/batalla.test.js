import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolverBatalla } from '../../juegos/conquista/batalla.js';

const SIN = [0, 0, 0, 0];
const miembro = (k, pila, mejoras = SIN, mod = 1) => ({ k, pila, mejoras, mod });
// Dos bandos en campo abierto: los dos atacan, sin dueno, sin fortaleza.
const abierto = (a, b, ctx = {}) => resolverBatalla([{ miembros: [a], defensor: false, ataca: true }, { miembros: [b], defensor: false, ataca: true }], { terr: 'll', fort: 0, ...ctx });
// Un atacante y el dueno que defiende.
const asalto = (atacante, dueno, ctx = {}) => resolverBatalla([{ miembros: [atacante], defensor: false, ataca: true }, { miembros: [dueno], defensor: true, ataca: false }], { terr: 'll', fort: 0, ...ctx });

test('Lanceros contra Jinetes de igual costo: gana el Lancero (domina) y conserva la mitad', () => {
  const r = abierto(miembro(0, [21, 0, 0, 0]), miembro(1, [0, 0, 7, 0])); // 21 Comida contra 7 x (1 Comida + 1 Caballos de valor 2)
  assert.equal(r.empate, false);
  assert.equal(r.ganador.k, 0);
  assert.deepEqual(r.fichas.map((f) => f.f), [42, 21]); // 21 x 1 x 2 contra 7 x 3
  assert.equal(r.fraccion, 0.5);
  assert.deepEqual(r.supervivientes, [{ k: 0, pila: [10, 0, 0, 0] }]);
  assert.equal(r.perdidas, 21 - 10 + 7);
});

test('el dominio forma un ciclo: A>L, J>A, L>J', () => {
  assert.equal(abierto(miembro(0, [0, 10, 0, 0]), miembro(1, [20, 0, 0, 0])).ganador.k, 0, 'Arqueros contra Lanceros');
  assert.equal(abierto(miembro(0, [0, 0, 7, 0]), miembro(1, [0, 10, 0, 0])).ganador.k, 0, 'Jinetes contra Arqueros');
  assert.equal(abierto(miembro(0, [21, 0, 0, 0]), miembro(1, [0, 0, 7, 0])).ganador.k, 0, 'Lanceros contra Jinetes');
});

test('el defensor suma fortaleza (+50 % por nivel) y terreno (bosque 1.25, montana 1.5) y conserva tropas x (1 - segunda / suya)', () => {
  const r = asalto(miembro(0, [12, 0, 0, 0]), miembro(1, [10, 0, 0, 0]), { terr: 'bo', fort: 1 }); // defensa 10 x 1.5 x 1.25 = 18.75
  assert.equal(r.ganador.defensor, true);
  assert.equal(r.fichas[0].f, 18.75);
  assert.deepEqual(r.supervivientes, [{ k: 1, pila: [3, 0, 0, 0] }]); // floor(10 x (1 - 12 / 18.75))
});

test('las mejoras suben la fuerza de ese tipo un 25 % por nivel, atacando y defendiendo', () => {
  const r = asalto(miembro(0, [10, 0, 0, 0], [2, 0, 0, 0]), miembro(1, [10, 0, 0, 0], [1, 0, 0, 0]));
  assert.deepEqual(r.fichas.map((f) => f.f), [15, 12.5]);
});

test('los Ingenios debilitan la fortaleza: con 1/4 de las unidades atacantes cuenta la mitad, con 1/2 no cuenta', () => {
  const dueno = miembro(1, [10, 0, 0, 0]);
  const sin = asalto(miembro(0, [8, 0, 0, 0]), dueno, { fort: 2 });
  assert.equal(sin.fichas.find((f) => f.defensor).f, 20, 'sin Ingenios: 10 x (1 + 0.5 x 2)');
  const cuarto = asalto(miembro(0, [6, 0, 0, 2]), dueno, { fort: 2 }); // 2 de 8 = 1/4
  assert.equal(cuarto.fichas.find((f) => f.defensor).f, 15, 'fortaleza a la mitad: 10 x (1 + 0.5 x 1)');
  const mitad = asalto(miembro(0, [4, 0, 0, 4]), dueno, { fort: 2 }); // 4 de 8 = 1/2
  assert.equal(mitad.fichas.find((f) => f.defensor).f, 10, 'sin fortaleza');
  assert.equal(mitad.ganador.k, 0);
  const justoDebajo = asalto(miembro(0, [7, 0, 0, 1]), dueno, { fort: 2 }); // 1 de 8 < 1/4
  assert.equal(justoDebajo.fichas.find((f) => f.defensor).f, 20);
});

test('el terreno y la fortaleza son de quien defiende: el atacante no los recibe', () => {
  const r = asalto(miembro(0, [10, 0, 0, 0]), miembro(1, [1, 0, 0, 0]), { terr: 'mo', fort: 3 });
  assert.equal(r.fichas.find((f) => !f.defensor).f, 10);
});

test('si el que gana apenas supera al segundo conserva al menos 1 unidad', () => {
  const r = asalto(miembro(0, [7, 0, 0, 0]), miembro(1, [4, 0, 0, 0]), { terr: 'bo', fort: 1 }); // defensa 4 x 1.5 x 1.25 = 7.5 contra 7
  assert.equal(r.ganador.k, 1);
  assert.deepEqual(r.supervivientes, [{ k: 1, pila: [1, 0, 0, 0] }]); // floor(4 x 0.0667) = 0 -> 1
});

test('los supervivientes conservan cada tipo en proporcion (hacia abajo) y al menos 1 unidad en total', () => {
  const r = abierto(miembro(0, [4, 4, 0, 0]), miembro(1, [1, 0, 0, 0])); // los Arqueros dominan al Lancero: 4 + 16 = 20 contra 1 -> conserva el 95 %
  assert.deepEqual(r.supervivientes[0].pila, [3, 3, 0, 0]);
  const justo = abierto(miembro(0, [1, 0, 1, 0]), miembro(1, [3, 0, 0, 0])); // 4 contra 3 Lanceros que dominan a medio ejercito (x1.5 = 4.5): gana el de 3 con apenas 1/9 -> floor da 0 y se queda 1
  assert.equal(sumaTotal(justo.supervivientes), 1);
});
const sumaTotal = (sup) => sup.reduce((s, x) => s + x.pila.reduce((a, b) => a + b, 0), 0);

test('empate: no hay ganador, la ficha del defensor va primero y se informa el total de unidades', () => {
  const r = asalto(miembro(0, [6, 0, 0, 0]), miembro(1, [6, 0, 0, 0]));
  assert.equal(r.empate, true);
  assert.equal(r.ganador, null);
  assert.deepEqual(r.supervivientes, []);
  assert.equal(r.todos, 12);
  assert.equal(r.fichas[0].defensor, true, 'en un empate de fuerzas el defensor va antes');
});

test('tres bandos: pelean los dos mas fuertes; el tercero se elimina sin pelear y no cuenta en las perdidas', () => {
  const r = resolverBatalla([
    { miembros: [miembro(0, [6, 0, 0, 0])], defensor: false, ataca: true },
    { miembros: [miembro(1, [5, 0, 0, 0])], defensor: false, ataca: true },
    { miembros: [miembro(2, [3, 0, 0, 0])], defensor: true, ataca: false },
  ], { terr: 'll', fort: 0 });
  assert.deepEqual(r.fichas.map((f) => [f.k, f.n, f.f, f.defensor]), [[0, 6, 6, false], [1, 5, 5, false], [2, 3, 3, true]]);
  assert.equal(r.ganador.k, 0);
  assert.deepEqual(r.supervivientes, [{ k: 0, pila: [1, 0, 0, 0] }]);
  assert.equal(r.perdidas, 6 - 1 + 5);
});

test('desempate por orden: a igual fuerza va primero el defensor y despues el reino de menor numero', () => {
  const r = resolverBatalla([
    { miembros: [miembro(3, [5, 0, 0, 0])], defensor: false, ataca: true },
    { miembros: [miembro(1, [5, 0, 0, 0])], defensor: false, ataca: true },
    { miembros: [miembro(2, [5, 0, 0, 0])], defensor: true, ataca: false },
  ], { terr: 'll', fort: 0 });
  assert.deepEqual(r.fichas.map((f) => f.k), [2, 1, 3]);
});

test('un bando con varios reinos (aliados) suma sus fuerzas, tiene de lider al que mas unidades trae y reparte los supervivientes por reino', () => {
  const r = resolverBatalla([
    { miembros: [miembro(0, [8, 0, 0, 0]), miembro(2, [4, 0, 0, 0])], defensor: false, ataca: true },
    { miembros: [miembro(1, [6, 0, 0, 0])], defensor: false, ataca: true },
  ], { terr: 'll', fort: 0 });
  assert.equal(r.ganador.k, 0, 'el lider es el reino con mas unidades del bando');
  assert.equal(r.ganador.n, 12);
  assert.deepEqual(r.fichas.map((f) => f.f), [12, 6]);
  assert.deepEqual(r.supervivientes, [{ k: 0, pila: [4, 0, 0, 0] }, { k: 2, pila: [2, 0, 0, 0] }]); // conservan 1 - 6/12 = la mitad
});

test('los supervivientes no pierden una unidad por el redondeo de los decimales: 12 x (1 - 4.25 / 10.2) son 7 exactos, no 6.999...', () => {
  const r = abierto(miembro(0, [12, 0, 0, 0], SIN, 0.85), miembro(1, [5, 0, 0, 0], SIN, 0.85)); // 10.2 contra 4.25: la cuenta exacta es 12 x 7/12
  assert.deepEqual(r.supervivientes, [{ k: 0, pila: [7, 0, 0, 0] }]);
  assert.equal(r.perdidas, 12 - 7 + 5);
});

test('el dueno que gana conserva al menos 1 unidad aunque la cuenta le deje 0 (con otros miembros en su bando)', () => {
  const r = resolverBatalla([
    { miembros: [miembro(2, [6, 0, 0, 0], SIN, 0.85)], defensor: false, ataca: true },
    { miembros: [miembro(1, [3, 0, 0, 0]), miembro(0, [4, 0, 0, 0])], defensor: true, ataca: false },
  ], { terr: 'll', fort: 0, dueno: 1 }); // 5.1 contra 7
  assert.equal(r.ganador.defensor, true);
  assert.deepEqual(r.supervivientes, [{ k: 1, pila: [1, 0, 0, 0] }, { k: 0, pila: [1, 0, 0, 0] }], 'floor(3 x 0.27) = 0 pero el dueno conserva 1; floor(4 x 0.27) = 1');
});

test('los modificadores del reino (tierra ajena, Hegemon) multiplican la fuerza de ese reino', () => {
  const r = abierto(miembro(0, [10, 0, 0, 0], SIN, 0.85), miembro(1, [9, 0, 0, 0]));
  assert.deepEqual(r.fichas.map((f) => [f.k, f.f]), [[1, 9], [0, 8.5]]);
});
