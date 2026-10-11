import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevoEstado, contexto, R, capital, frontera, dosPasos, vecinaComun } from './ayudas.js';
import { regionesDe } from '../../juegos/conquista/estado.js';
import { distancias } from '../../mapa.js';
import { ordenesEconomicas } from '../../juegos/conquista/turno/economia.js';
import { movimientos } from '../../juegos/conquista/turno/movimiento.js';

const mover = (E, porReino) => { const ctx = contexto(E, porReino); ordenesEconomicas(ctx); movimientos(ctx); return ctx; };

test('mover a una region sin dueno la toma con las tropas que llegan', () => {
  const E = nuevoEstado(4), [a, d] = frontera(E, 0, -1);
  E.tropas[a] = 10;
  mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} 6`] } });
  assert.equal(E.dueno[d], 0);
  assert.equal(E.tropas[d], 6);
  assert.equal(E.tropas[a], 4);
});

test('combate: gana la mayor fuerza, el defensor cuenta fortaleza y terreno, el ganador conserva tropas x (1 - segunda / suya)', () => {
  const E = nuevoEstado(4), [a, d] = frontera(E, 0, -1);
  E.dueno[d] = 1; E.tropas[d] = 4; E.fort[d] = 1; E.mapa.regs[d].terr = 'bo'; // defensa 4 x 1.5 x 1.25 = 7.5
  E.tropas[a] = 11;
  const ctx = mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} 10`] } });
  assert.equal(E.dueno[d], 0);
  assert.equal(E.tropas[d], 2); // floor(10 x (1 - 7.5/10))
  assert.equal(E.fort[d], 0); // la conquista baja la fortaleza un nivel
  assert.ok(ctx.eventos.some((e) => e.tipo === 'conquista' && e.k === 0 && e.contra === 1 && e.r === d));
  assert.equal(ctx.combates.length, 1);
});

test('combate: las armas suben el ataque un 25% por nivel', () => {
  const E = nuevoEstado(4), [a, d] = frontera(E, 0, -1);
  E.dueno[d] = 1; E.tropas[d] = 4; E.fort[d] = 1; E.mapa.regs[d].terr = 'bo';
  E.tropas[a] = 11; E.reinos[0].armas = 1; // ataque 12.5 contra 7.5
  mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} 10`] } });
  assert.equal(E.tropas[d], 4); // floor(10 x (1 - 7.5/12.5))
});

test('combate: si el defensor gana se queda con sus tropas x (1 - segunda / suya) y el atacante queda repelido', () => {
  const E = nuevoEstado(4), [a, d] = frontera(E, 0, -1);
  E.dueno[d] = 1; E.tropas[d] = 6; E.fort[d] = 1; E.mapa.regs[d].terr = 'll'; // defensa 9
  E.tropas[a] = 6;
  const ctx = mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} 5`] } });
  assert.equal(E.dueno[d], 1);
  assert.equal(E.tropas[d], 2); // floor(6 x (1 - 5/9))
  assert.ok(ctx.eventos.some((e) => e.tipo === 'repelido' && e.k === 0 && e.contra === 1));
});

test('combate: en un empate el defensor resiste con 1 tropa', () => {
  const E = nuevoEstado(4), [a, d] = frontera(E, 0, -1);
  E.dueno[d] = 1; E.tropas[d] = 6; E.fort[d] = 0; E.mapa.regs[d].terr = 'll';
  E.tropas[a] = 7;
  mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} 6`] } });
  assert.equal(E.dueno[d], 1);
  assert.equal(E.tropas[d], 1);
});

test('dos reinos que llegan a la misma region sin dueno en el mismo turno: gana el de mayor fuerza', () => {
  const E = nuevoEstado(4), [a, d, b] = vecinaComun(E);
  E.dueno[d] = -1; E.tropas[d] = 0; E.fort[d] = 0; E.edif[d] = null;
  E.dueno[a] = 0; E.tropas[a] = 6; E.dueno[b] = 1; E.tropas[b] = 6;
  mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} 5`] }, 1: { ordenes: [`mover ${R(b)} ${R(d)} 4`] } });
  assert.equal(E.dueno[d], 0);
  assert.equal(E.tropas[d], 1); // floor(5 x (1 - 4/5))
  assert.equal(E.tropas[a], 1);
  assert.equal(E.tropas[b], 2);
});

test('dos reinos que se intercambian regiones a la vez: todo se resuelve sin errores y cada uno toma la del otro', () => {
  const E = nuevoEstado(4), capitales = E.reinos.map((r) => r.capital);
  const a = regionesDe(E, 0).find((r) => !capitales.includes(r));
  const b = E.mapa.regs[a].vecinos.find((v) => !capitales.includes(v));
  E.dueno[b] = 1;
  [a, b].forEach((r) => { E.tropas[r] = 5; E.fort[r] = 0; E.mapa.regs[r].terr = 'll'; E.edif[r] = null; });
  mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(b)} 4`] }, 1: { ordenes: [`mover ${R(b)} ${R(a)} 4`] } });
  assert.equal(E.dueno[a], 1);
  assert.equal(E.dueno[b], 0);
  assert.equal(E.tropas[a], 3); // floor(4 x (1 - 1/4)) en cada lado
  assert.equal(E.tropas[b], 3);
});

test('siempre debe quedar al menos 1 tropa en la region de origen', () => {
  const E = nuevoEstado(4), [a, d] = frontera(E, 0, -1);
  E.tropas[a] = 10;
  const ctx = mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} 10`, `mover ${R(a)} ${R(d)} 9`] } });
  assert.equal(ctx.descartes[0][0].motivo, 'debe quedar al menos 1 tropa en la region de origen');
  assert.equal(E.tropas[d], 9);
  assert.equal(E.tropas[a], 1);
});

test('no se puede atacar a un aliado: la orden se descarta', () => {
  const E = nuevoEstado(4), [a, d] = frontera(E, 0, -1);
  E.dueno[d] = 1; E.tropas[d] = 1; E.tropas[a] = 10;
  E.reinos[0].pactos[1] = E.reinos[1].pactos[0] = 1; // vigente en el turno 1
  const ctx = mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} 8`] } });
  assert.equal(ctx.descartes[0][0].motivo, 'esa region es de un aliado (usa romper antes)');
  assert.equal(E.dueno[d], 1);
});

test('con Caballos (1 por cada 3 tropas) se llega a 2 regiones; sin ellos no, y mas lejos tampoco', () => {
  const E = nuevoEstado(4), [a, , c] = dosPasos(E);
  E.dueno[a] = 0; E.tropas[a] = 10; E.dueno[c] = -1; E.tropas[c] = 0; E.fort[c] = 0; E.edif[c] = null;
  E.reinos[0].stock.Caballos = 2;
  let ctx = mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(c)} 9`] } });
  assert.equal(ctx.descartes[0][0].motivo, 'faltan Caballos para mover a 2 regiones'); // 9 tropas piden 3 Caballos
  E.reinos[0].stock.Caballos = 3;
  ctx = mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(c)} 9`] } });
  assert.equal(E.dueno[c], 0);
  assert.equal(E.reinos[0].stock.Caballos, 0);
  const d3 = distancias(E.mapa.regs, a);
  const lejos = d3.findIndex((x) => x >= 3 && x < 99);
  E.tropas[a] = 10; E.reinos[0].stock.Caballos = 9;
  ctx = mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(lejos)} 3`] } });
  assert.equal(ctx.descartes[0][0].motivo, 'la region de destino no es vecina');
});

test('tomar la capital hace caer al reino: el vencedor se queda su almacen y sus demas regiones quedan sin dueno', () => {
  const E = nuevoEstado(4), cap1 = capital(E, 1), n = E.mapa.regs[cap1].vecinos[0];
  E.dueno[n] = 0; E.tropas[n] = 11;
  E.tropas[cap1] = 2; E.fort[cap1] = 0; E.mapa.regs[cap1].terr = 'll';
  E.reinos[1].stock.Comida = 7;
  const comida0 = E.reinos[0].stock.Comida, otras1 = regionesDe(E, 1).filter((r) => r !== cap1);
  const ctx = mover(E, { 0: { ordenes: [`mover ${R(n)} ${R(cap1)} 10`] } });
  assert.equal(E.reinos[1].vivo, false);
  assert.equal(E.reinos[1].cayoEn, 1);
  assert.equal(E.reinos[1].regsAlCaer, otras1.length);
  assert.equal(E.reinos[0].stock.Comida, comida0 + 7);
  assert.equal(E.reinos[1].stock.Comida, 0);
  otras1.forEach((r) => { assert.equal(E.dueno[r], -1); assert.equal(E.tropas[r], 0); });
  assert.ok(ctx.eventos.some((e) => e.tipo === 'caida' && e.k === 1 && e.por === 0));
});

test('al conquistar una region su edificio pasa danado; si el conquistador ya tiene 3 de ese tipo, se destruye', () => {
  const E = nuevoEstado(4), [a, d] = frontera(E, 0, -1);
  E.dueno[d] = 1; E.tropas[d] = 1; E.fort[d] = 0; E.edif[d] = 'granja'; E.tropas[a] = 10;
  mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} 8`] } });
  assert.equal(E.dueno[d], 0);
  assert.equal(E.edif[d], 'granja');
  assert.equal(E.dan[d], 1);
  // segunda conquista: el reino 0 ya tiene 3 granjas
  const E2 = nuevoEstado(4), [a2, d2] = frontera(E2, 0, -1);
  const otras = regionesDe(E2, 0).slice(0, 3);
  otras.forEach((r) => { E2.edif[r] = 'granja'; });
  E2.dueno[d2] = 1; E2.tropas[d2] = 1; E2.fort[d2] = 0; E2.edif[d2] = 'granja'; E2.tropas[a2] = 10;
  mover(E2, { 0: { ordenes: [`mover ${R(a2)} ${R(d2)} 8`] } });
  assert.equal(E2.dueno[d2], 0);
  assert.equal(E2.edif[d2], null);
});

test('un reino que ya cayo no mueve ni recibe llamadas: sus movimientos se ignoran sin errores', () => {
  const E = nuevoEstado(4);
  E.reinos[2].vivo = false;
  const [a, d] = frontera(E, 2, -1);
  E.tropas[a] = 10;
  const ctx = contexto(E, { 2: { ordenes: [`mover ${R(a)} ${R(d)} 5`] } });
  assert.equal(ctx.jugadas[2], null);
  assert.doesNotThrow(() => { ordenesEconomicas(ctx); movimientos(ctx); });
});
