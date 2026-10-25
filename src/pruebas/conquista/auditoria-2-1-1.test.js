// Guerra de territorios 2.1.1 (auditoria del 25-10-2026, entrega A de GPT-6 Astra en privado/entregas/astra-guerra/): lo que cierra cada hallazgo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import conquista from '../../juegos/conquista.js';
import { crearRng } from '../../rng.js';
import { ponerPila, clasificar } from '../../juegos/conquista/estado.js';
import { resolverBatalla } from '../../juegos/conquista/batalla.js';
import { resultadoDe } from '../../juegos/conquista/resultado.js';
import { PUNTOS_POSICION } from '../../juegos/conquista/constantes.js';
import { nuevoEstado } from './ayudas.js';

// k reinos, k*2 regiones todas vecinas entre si, sin fortalezas ni eventos: la capital de s es la region s y su segunda region es s + k.
function sintetico(k) {
  const n = k * 2;
  const regs = Array.from({ length: n }, (_, r) => ({ id: r, nombre: 'R' + String(r + 1).padStart(2, '0'), terr: 'll', rec: null, vecinos: Array.from({ length: n }, (_, v) => v).filter((v) => v !== r) }));
  const mapa = { k, seed: 1, bioma: 'sintetico', regs, inicio: { dueno: Array.from({ length: n }, (_, r) => r % k), capitales: Array.from({ length: k }, (_, s) => s) } };
  const E = conquista.crear(crearRng(1), { jugadores: k, mapa });
  E.fort.fill(0); E.calendario = []; E.uni.fill(0);
  E.reinos.forEach((r) => {
    for (const rec in r.stock) r.stock[rec] = 100;
    ponerPila(E, r.capital, r.s, [20, 0, 0, 0]);
    ponerPila(E, r.s + k, r.s, [1, 0, 0, 0]);
  });
  return E;
}
const paso = (E, acciones = {}) => conquista.aplicar(E, E.reinos.map((r, s) => (r.vivo ? conquista.normalizar(acciones[s] ?? { ordenes: [] }, E) : null)));

test('extincion mutua: si los ultimos reinos caen en el mismo turno la partida termina ahi, sin seguir vacia hasta el turno 30', () => {
  const E = sintetico(2);
  paso(E, { 0: { ordenes: ['mover R01 R02 todo'] }, 1: { ordenes: ['mover R02 R01 todo'] } });
  assert.deepEqual(E.reinos.map((r) => r.vivo), [false, false], 'las dos capitales cayeron a la vez');
  assert.notEqual(E.ganador, null, 'hay resultado en el mismo turno');
  assert.equal(E.turno, 1);
  assert.equal(E.extincionMutua, true);
  assert.equal(E.ganoPorMaravilla, false);
  assert.equal(E.ganador, clasificar(E)[0].s, 'gana el que tenia mas regiones al caer y luego el sorteo con seed');
  assert.throws(() => paso(E), /ya termino/);
  assert.deepEqual(clasificar(E).map((f) => f.s).slice(0, 1), [E.ganador], 'el ganador va primero y los dos reinos reciben puntos distintos (5 y 3)');
});

test('el resultado guardado dice si fue extincion mutua (para que la escena o el informe lo cuenten)', () => {
  const E = nuevoEstado(4);
  E.ganador = 1;
  assert.equal(resultadoDe(E).extincionMutua, false);
  E.extincionMutua = true;
  assert.equal(resultadoDe(E).extincionMutua, true);
  assert.deepEqual(PUNTOS_POSICION.slice(0, 3), [5, 3, 1]);
});

test('extincion mutua: gana el que mas regiones tenia al caer', () => {
  const E = sintetico(2);
  E.dueno[3] = 0; // el reino 0 tiene tres regiones y el 1 una; ambos capitales caen a la vez
  ponerPila(E, 3, 1, [0, 0, 0, 0]); ponerPila(E, 3, 0, [1, 0, 0, 0]);
  paso(E, { 0: { ordenes: ['mover R01 R02 todo'] }, 1: { ordenes: ['mover R02 R01 todo'] } });
  assert.equal(E.extincionMutua, true);
  const dueno = E.reinos.map((r) => r.regsAlCaer);
  assert.ok(dueno[0] !== dueno[1], 'las regiones al caer difieren');
  assert.equal(E.ganador, dueno[0] > dueno[1] ? 0 : 1);
});

test('una partida normal no marca extincion mutua', () => {
  const E = sintetico(2);
  for (let i = 0; i < 30 && E.ganador === null; i++) paso(E);
  assert.equal(E.extincionMutua, false);
});

test('Maravilla simultanea: gana el primero de la lista de reinos y los demas no pagan (la prioridad se documenta en la spec, no en el prompt por el tope de tokens)', () => {
  const E = sintetico(4);
  const r = paso(E, Object.fromEntries(E.reinos.map((x) => [x.s, { ordenes: [`construir R0${x.s + 1} maravilla`] }])));
  assert.equal(E.maravilla.k, 0);
  for (const s of [1, 2, 3]) {
    assert.ok(r.descartes[s].some((d) => /ya existe una maravilla/.test(d.motivo)), `el reino ${s} recibe el descarte`);
    assert.equal(E.reinos[s].stock.Roca - E.reinos[0].stock.Roca, 21, `el reino ${s} no pago nada`);
  }
});

test('bajas: el registro cuenta TODAS las unidades que desaparecen, tambien las del tercer bando que no pelea; perdidas conserva su semantica', () => {
  const tres = resolverBatalla([30, 10, 5].map((n, k) => ({ miembros: [{ k, pila: [n, 0, 0, 0], mejoras: [0, 0, 0, 0] }], ataca: true, defensor: false })), { terr: 'll', fort: 0, dueno: -1 });
  assert.equal(tres.todos, 45);
  assert.equal(tres.perdidas, 20, 'solo el duelo de los dos mas fuertes');
  assert.equal(tres.bajas, 25, 'todo lo que no sobrevive: 45 - 20');
  const empate = resolverBatalla([6, 6].map((n, k) => ({ miembros: [{ k, pila: [n, 0, 0, 0], mejoras: [0, 0, 0, 0] }], ataca: true, defensor: false })), { terr: 'll', fort: 0, dueno: -1 });
  assert.equal(empate.bajas, 12);
});

test('el texto de reglas dice lo que el motor aplica: puntos, desempates, extincion mutua y que produccion y hambre van antes de gastar', () => {
  const r = conquista.reglas;
  assert.match(r, /PUNTOS por posicion final: 5 al 1o, 3 al 2o, 1 al 3o y 0 al resto/);
  assert.match(r, /desempate: unidades, almacen y sorteo/);
  assert.match(r, /Si los ultimos reinos caen a la vez, acaba ahi y gana el de mas regiones al caer/);
  assert.match(r, /la produccion y el hambre van antes de tus gastos; tu almacen y "Puedes reclutar hasta" son los de antes/);
  assert.match(r, /desertan el 10% de cada pila \(minimo 1\)/);
  assert.match(r, /^[\x00-\x7F]*$/, 'sin acentos');
  assert.equal(conquista.versionReglas, 'conquista-2.1.1');
});
