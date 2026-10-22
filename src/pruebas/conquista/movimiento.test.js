import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevoEstado, contexto, R, capital, frontera, dosPasos, vecinaComun, fijarTropas, tropasDe } from './ayudas.js';
import { regionesDe, sumarUni, pila as pilaDe } from '../../juegos/conquista/estado.js';
import { distancias } from '../../mapa.js';
import { ordenesEconomicas } from '../../juegos/conquista/turno/economia.js';
import { movimientos } from '../../juegos/conquista/turno/movimiento.js';

const mover = (E, porReino) => { const ctx = contexto(E, porReino); ordenesEconomicas(ctx); movimientos(ctx); return ctx; };

test('mover a una region sin dueno la toma con las tropas que llegan', () => {
  const E = nuevoEstado(4), [a, d] = frontera(E, 0, -1);
  fijarTropas(E, a, 10);
  mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} 6`] } });
  assert.equal(E.dueno[d], 0);
  assert.equal(tropasDe(E, d), 6);
  assert.equal(tropasDe(E, a), 4);
});

// Desde la etapa 4 (alianzas), quien ataca una region de otro reino sin pacto rinde x0.85 (tierra ajena): los numeros de estas pruebas ya lo incluyen.
test('combate: gana la mayor fuerza, el defensor cuenta fortaleza y terreno, el ganador conserva tropas x (1 - segunda / suya)', () => {
  const E = nuevoEstado(4), [a, d] = frontera(E, 0, -1);
  E.dueno[d] = 1; fijarTropas(E, d, 4); E.fort[d] = 1; E.mapa.regs[d].terr = 'bo'; // defensa 4 x 1.5 x 1.25 = 7.5
  fijarTropas(E, a, 13);
  const ctx = mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} 12`] } });
  assert.equal(E.dueno[d], 0);
  assert.equal(tropasDe(E, d), 3); // ataque 12 x 0.85 = 10.2: floor(12 x (1 - 7.5/10.2))
  assert.equal(E.fort[d], 0); // la conquista baja la fortaleza un nivel
  assert.ok(ctx.eventos.some((e) => e.tipo === 'conquista' && e.k === 0 && e.contra === 1 && e.r === d));
  assert.equal(ctx.combates.length, 1);
});

test('combate: cada mejora del tipo suma 25 % a su fuerza', () => {
  const E = nuevoEstado(4), [a, d] = frontera(E, 0, -1);
  E.dueno[d] = 1; fijarTropas(E, d, 4); E.fort[d] = 1; E.mapa.regs[d].terr = 'bo';
  fijarTropas(E, a, 13); E.reinos[0].mejoras[0] = 1; // ataque 12 x 1.25 x 0.85 = 12.75 contra 7.5 (una mejora de Lanceros: +25 %)
  mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} 12`] } });
  assert.equal(tropasDe(E, d), 4); // floor(12 x (1 - 7.5/12.75)); sin la mejora quedan 3
});

test('combate: si el defensor gana se queda con sus tropas x (1 - segunda / suya) y el atacante queda repelido', () => {
  const E = nuevoEstado(4), [a, d] = frontera(E, 0, -1);
  E.dueno[d] = 1; fijarTropas(E, d, 6); E.fort[d] = 1; E.mapa.regs[d].terr = 'll'; // defensa 9
  fijarTropas(E, a, 6);
  const ctx = mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} 5`] } });
  assert.equal(E.dueno[d], 1);
  assert.equal(tropasDe(E, d), 3); // ataque 5 x 0.85 = 4.25: floor(6 x (1 - 4.25/9))
  assert.ok(ctx.eventos.some((e) => e.tipo === 'repelido' && e.k === 0 && e.contra === 1));
});

test('combate: en un empate el defensor resiste con 1 tropa', () => {
  const E = nuevoEstado(4), [a, d] = frontera(E, 0, -1);
  E.dueno[d] = 1; fijarTropas(E, d, 17); E.fort[d] = 0; E.mapa.regs[d].terr = 'll'; // defensa 17
  fijarTropas(E, a, 21);
  mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} 20`] } }); // 20 x 0.85 = 17
  assert.equal(E.dueno[d], 1);
  assert.equal(tropasDe(E, d), 1);
});

test('dos reinos que llegan a la misma region sin dueno en el mismo turno: gana el de mayor fuerza', () => {
  const E = nuevoEstado(4), [a, d, b] = vecinaComun(E);
  E.dueno[d] = -1; fijarTropas(E, d, 0); E.fort[d] = 0; E.edif[d] = null;
  E.dueno[a] = 0; fijarTropas(E, a, 6); E.dueno[b] = 1; fijarTropas(E, b, 6);
  mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} 5`] }, 1: { ordenes: [`mover ${R(b)} ${R(d)} 4`] } });
  assert.equal(E.dueno[d], 0);
  assert.equal(tropasDe(E, d), 1); // floor(5 x (1 - 4/5))
  assert.equal(tropasDe(E, a), 1);
  assert.equal(tropasDe(E, b), 2);
});

test('dos reinos que se intercambian regiones a la vez: todo se resuelve sin errores y cada uno toma la del otro', () => {
  const E = nuevoEstado(4), capitales = E.reinos.map((r) => r.capital);
  const a = regionesDe(E, 0).find((r) => !capitales.includes(r));
  const b = E.mapa.regs[a].vecinos.find((v) => !capitales.includes(v));
  E.dueno[b] = 1;
  [a, b].forEach((r) => { fijarTropas(E, r, 5); E.fort[r] = 0; E.mapa.regs[r].terr = 'll'; E.edif[r] = null; });
  mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(b)} 4`] }, 1: { ordenes: [`mover ${R(b)} ${R(a)} 4`] } });
  assert.equal(E.dueno[a], 1);
  assert.equal(E.dueno[b], 0);
  assert.equal(tropasDe(E, a), 2); // 4 x 0.85 = 3.4 contra 1: floor(4 x (1 - 1/3.4)) en cada lado
  assert.equal(tropasDe(E, b), 2);
});

test('siempre debe quedar al menos 1 tropa en la region de origen', () => {
  const E = nuevoEstado(4), [a, d] = frontera(E, 0, -1);
  fijarTropas(E, a, 10);
  const ctx = mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} 10`, `mover ${R(a)} ${R(d)} 9`] } });
  assert.equal(ctx.descartes[0][0].motivo, 'debe quedar al menos 1 tropa en la region de origen');
  assert.equal(tropasDe(E, d), 9);
  assert.equal(tropasDe(E, a), 1);
});

test('un aliado con pacto vigente no es atacado: mover a su region es una visita aunque sobre fuerza (para atacarlo hay que romper)', () => {
  const E = nuevoEstado(4), [a, d] = frontera(E, 0, -1);
  E.dueno[d] = 1; fijarTropas(E, d, 1); fijarTropas(E, a, 10);
  E.reinos[0].pactos[1] = E.reinos[1].pactos[0] = 1; // vigente en el turno 1
  const ctx = mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} 8`] } });
  assert.deepEqual(ctx.descartes[0], []);
  assert.equal(ctx.combates.length, 0);
  assert.equal(E.dueno[d], 1);
  assert.equal(tropasDe(E, d), 1);
  assert.deepEqual(pilaDe(E, d, 0), [8, 0, 0, 0], 'las 8 unidades quedan de visita');
});

test('solo los Jinetes llegan a 2 regiones: con otro tipo, o mezclados, la orden se descarta; mas lejos tampoco', () => {
  const E = nuevoEstado(4), [a, , c] = dosPasos(E);
  E.dueno[a] = 0; fijarTropas(E, a, 10); sumarUni(E, a, 0, 2, 4); // 10 Lanceros y 4 Jinetes
  E.dueno[c] = -1; fijarTropas(E, c, 0); E.fort[c] = 0; E.edif[c] = null;
  let ctx = mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(c)} L5`] } });
  assert.equal(ctx.descartes[0][0].motivo, 'solo los Jinetes llegan a 2 regiones');
  ctx = mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(c)} L2 J2`] } });
  assert.equal(ctx.descartes[0][0].motivo, 'solo los Jinetes llegan a 2 regiones', 'una mezcla tampoco llega');
  assert.equal(E.dueno[c], -1);
  ctx = mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(c)} J3`] } });
  assert.deepEqual(ctx.descartes[0], []);
  assert.equal(E.dueno[c], 0);
  assert.deepEqual(pilaDe(E, c, 0), [0, 0, 3, 0]);
  assert.deepEqual(pilaDe(E, a, 0), [10, 0, 1, 0]);
  const d3 = distancias(E.mapa.regs, a);
  const lejos = d3.findIndex((x) => x >= 3 && x < 99);
  ctx = mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(lejos)} J1`] } });
  assert.equal(ctx.descartes[0][0].motivo, 'la region de destino no es vecina');
});

test('tomar la capital hace caer al reino: el vencedor se queda su almacen y sus demas regiones quedan sin dueno', () => {
  const E = nuevoEstado(4), cap1 = capital(E, 1), n = E.mapa.regs[cap1].vecinos[0];
  E.dueno[n] = 0; fijarTropas(E, n, 11);
  fijarTropas(E, cap1, 2); E.fort[cap1] = 0; E.mapa.regs[cap1].terr = 'll';
  E.reinos[1].stock.Comida = 7;
  const comida0 = E.reinos[0].stock.Comida, otras1 = regionesDe(E, 1).filter((r) => r !== cap1);
  const ctx = mover(E, { 0: { ordenes: [`mover ${R(n)} ${R(cap1)} 10`] } });
  assert.equal(E.reinos[1].vivo, false);
  assert.equal(E.reinos[1].cayoEn, 1);
  assert.equal(E.reinos[1].regsAlCaer, otras1.length);
  assert.equal(E.reinos[0].stock.Comida, comida0 + 7);
  assert.equal(E.reinos[1].stock.Comida, 0);
  otras1.forEach((r) => { assert.equal(E.dueno[r], -1); assert.equal(tropasDe(E, r), 0); });
  assert.ok(ctx.eventos.some((e) => e.tipo === 'caida' && e.k === 1 && e.por === 0));
});

test('al conquistar una region su edificio pasa danado; si el conquistador ya tiene 3 de ese tipo, se destruye', () => {
  const E = nuevoEstado(4), [a, d] = frontera(E, 0, -1);
  E.dueno[d] = 1; fijarTropas(E, d, 1); E.fort[d] = 0; E.edif[d] = 'granja'; fijarTropas(E, a, 10);
  mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} 8`] } });
  assert.equal(E.dueno[d], 0);
  assert.equal(E.edif[d], 'granja');
  assert.equal(E.dan[d], 1);
  // segunda conquista: el reino 0 ya tiene 3 granjas
  const E2 = nuevoEstado(4), [a2, d2] = frontera(E2, 0, -1);
  const otras = regionesDe(E2, 0).slice(0, 3);
  otras.forEach((r) => { E2.edif[r] = 'granja'; });
  E2.dueno[d2] = 1; fijarTropas(E2, d2, 1); E2.fort[d2] = 0; E2.edif[d2] = 'granja'; fijarTropas(E2, a2, 10);
  mover(E2, { 0: { ordenes: [`mover ${R(a2)} ${R(d2)} 8`] } });
  assert.equal(E2.dueno[d2], 0);
  assert.equal(E2.edif[d2], null);
});

test('un reino que ya cayo no mueve ni recibe llamadas: sus movimientos se ignoran sin errores', () => {
  const E = nuevoEstado(4);
  E.reinos[2].vivo = false;
  const [a, d] = frontera(E, 2, -1);
  fijarTropas(E, a, 10);
  const ctx = contexto(E, { 2: { ordenes: [`mover ${R(a)} ${R(d)} 5`] } });
  assert.equal(ctx.jugadas[2], null);
  assert.doesNotThrow(() => { ordenesEconomicas(ctx); movimientos(ctx); });
});

// ---- Lo que registra cada combate para la escena del video (solo datos: los campos de siempre no cambian) ----

test('un combate de dos bandos registra bandos (con sus unidades por tipo), terreno, fortaleza, resultado y tropas que quedan', () => {
  const E = nuevoEstado(4), [a, d] = frontera(E, 0, -1);
  E.dueno[d] = 1; fijarTropas(E, d, 9); E.fort[d] = 1; E.mapa.regs[d].terr = 'll'; // defensa 9 x 1.5 = 13.5
  fijarTropas(E, a, 14); E.reinos[0].mejoras[0] = 1; // ataque 13 x 1.25 x 0.85 (tierra ajena) = 13.8125
  const ctx = mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} 13`] } });
  assert.deepEqual(ctx.combates, [{
    d, k: 0, perdidas: 21, dueno: 1, terr: 'll', fort: 1, resultado: 'captura', quedan: 1,
    bandos: [
      { k: 0, n: 13, f: 13.8125, defensor: false, armas: 1, uni: [13, 0, 0, 0], miembros: [{ k: 0, uni: [13, 0, 0, 0] }] },
      { k: 1, n: 9, f: 13.5, defensor: true, armas: 0, uni: [9, 0, 0, 0], miembros: [{ k: 1, uni: [9, 0, 0, 0] }] },
    ],
  }]);
});

test('el combate registra la fortaleza de ANTES de la batalla (la conquista la baja un nivel despues) y el terreno de la region', () => {
  const E = nuevoEstado(4), [a, d] = frontera(E, 0, -1);
  E.dueno[d] = 1; fijarTropas(E, d, 4); E.fort[d] = 2; E.mapa.regs[d].terr = 'mo';
  fijarTropas(E, a, 30);
  const ctx = mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} 29`] } });
  assert.equal(E.fort[d], 1, 'la conquista bajo la fortaleza');
  assert.equal(ctx.combates[0].fort, 2);
  assert.equal(ctx.combates[0].terr, 'mo');
});

test('el combate que repele el defensor y el empate con defensor registran su resultado y las tropas que quedan', () => {
  const E = nuevoEstado(4), [a, d] = frontera(E, 0, -1);
  E.dueno[d] = 1; fijarTropas(E, d, 6); E.fort[d] = 1; E.mapa.regs[d].terr = 'll'; // defensa 9
  fijarTropas(E, a, 6);
  const repelido = mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} 5`] } }).combates[0];
  assert.equal(repelido.resultado, 'repelido');
  assert.equal(repelido.quedan, 3); // floor(6 x (1 - 4.25/9)), con el ataque de 5 x 0.85
  assert.equal(repelido.k, 1);
  assert.deepEqual(repelido.bandos.map((b) => [b.k, b.defensor]), [[1, true], [0, false]]); // de mayor a menor fuerza

  const E2 = nuevoEstado(4), [a2, d2] = frontera(E2, 0, -1);
  E2.dueno[d2] = 1; fijarTropas(E2, d2, 17); E2.fort[d2] = 0; E2.mapa.regs[d2].terr = 'll';
  fijarTropas(E2, a2, 21);
  const empate = mover(E2, { 0: { ordenes: [`mover ${R(a2)} ${R(d2)} 20`] } }).combates[0]; // 20 x 0.85 = 17 contra 17
  assert.equal(empate.resultado, 'empate');
  assert.equal(empate.quedan, 1);
  assert.equal(empate.k, 1);
});

test('un empate sin defensor deja la region vacia y lo registra', () => {
  const E = nuevoEstado(4), [a, d, b] = vecinaComun(E);
  E.dueno[d] = -1; fijarTropas(E, d, 0); E.fort[d] = 0; E.edif[d] = null;
  E.dueno[a] = 0; fijarTropas(E, a, 6); E.dueno[b] = 1; fijarTropas(E, b, 6);
  const ctx = mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} 5`] }, 1: { ordenes: [`mover ${R(b)} ${R(d)} 5`] } });
  assert.equal(ctx.combates.length, 1);
  assert.deepEqual([ctx.combates[0].resultado, ctx.combates[0].quedan, ctx.combates[0].k], ['empate', 0, -1]);
  assert.equal(ctx.combates[0].bandos.length, 2);
});

test('tres bandos: se registran los tres, de mayor a menor fuerza, y el refuerzo propio suma a las tropas del defensor', () => {
  const E = nuevoEstado(4), [a, d, b] = vecinaComun(E);
  E.dueno[d] = 2; fijarTropas(E, d, 3); E.fort[d] = 0; E.mapa.regs[d].terr = 'll';
  E.dueno[a] = 0; fijarTropas(E, a, 7); E.dueno[b] = 1; fijarTropas(E, b, 6);
  const ctx = mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} 6`] }, 1: { ordenes: [`mover ${R(b)} ${R(d)} 5`] } });
  const c = ctx.combates[0];
  assert.equal(c.bandos.length, 3);
  assert.deepEqual(c.bandos.map((x) => [x.k, x.n, x.f, x.defensor]), [[0, 6, 5.1, false], [1, 5, 4.25, false], [2, 3, 3, true]]); // los atacantes rinden x0.85 en tierra ajena
  assert.equal(c.resultado, 'captura');
  assert.equal(c.quedan, 1);

  const E2 = nuevoEstado(4), [a2, d2, b2] = vecinaComun(E2);
  E2.dueno[d2] = 1; fijarTropas(E2, d2, 4); E2.fort[d2] = 0; E2.mapa.regs[d2].terr = 'll';
  E2.dueno[b2] = 1; fijarTropas(E2, b2, 6); E2.dueno[a2] = 0; fijarTropas(E2, a2, 9);
  const c2 = mover(E2, { 0: { ordenes: [`mover ${R(a2)} ${R(d2)} 8`] }, 1: { ordenes: [`mover ${R(b2)} ${R(d2)} 3`] } }).combates[0];
  assert.equal(c2.bandos.find((x) => x.defensor).n, 7, 'el refuerzo propio (3) se suma a las 4 tropas que ya estaban');
});

test('una conquista sin lucha (region con dueno pero sin tropas) no registra combate y el evento conquista si', () => {
  const E = nuevoEstado(4), [a, d] = frontera(E, 0, -1);
  E.dueno[d] = 1; fijarTropas(E, d, 0); E.fort[d] = 0;
  fijarTropas(E, a, 10);
  const ctx = mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} 6`] } });
  assert.equal(ctx.combates.length, 0);
  assert.ok(ctx.eventos.some((e) => e.tipo === 'conquista' && e.k === 0 && e.contra === 1 && e.r === d));
});

// ---- Guerra 2.0.0, etapa 1: el paso de 2 regiones no cruza territorio de otro reino ----

// Un salto a 2 regiones a -> c con TODAS sus regiones intermedias puestas por la prueba: `medio` recibe el dueno de cada una (-1 = libre).
function saltoCon(medio, pacto = false) {
  const E = nuevoEstado(4), [a, , c] = dosPasos(E), regs = E.mapa.regs;
  const comunes = regs[a].vecinos.filter((v) => regs[c].vecinos.includes(v));
  E.dueno[a] = 0; fijarTropas(E, a, 10); sumarUni(E, a, 0, 2, 3); E.dueno[c] = -1; fijarTropas(E, c, 0); E.fort[c] = 0; E.edif[c] = null; // 10 Lanceros y 3 Jinetes
  for (const w of comunes) { E.dueno[w] = medio; fijarTropas(E, w, medio < 0 ? 0 : 3); E.edif[w] = null; }
  if (pacto) E.reinos[0].pactos[1] = E.reinos[1].pactos[0] = 1; // vigente en el turno 1
  const ctx = mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(c)} J3`] } });
  return { E, ctx, c };
}

test('los Jinetes no cruzan territorio de otro reino: la orden se descarta y la region de destino no se toca', () => {
  const { E, ctx, c } = saltoCon(1);
  assert.equal(ctx.descartes[0][0].motivo, 'no puedes cruzar territorio de otro reino');
  assert.equal(E.dueno[c], -1);
});

test('los Jinetes cruzan una region propia, una libre o una de un aliado con pacto vigente', () => {
  for (const [nombre, medio, pacto] of [['propia', 0, false], ['libre', -1, false], ['de un aliado', 1, true]]) {
    const { E, ctx, c } = saltoCon(medio, pacto);
    assert.deepEqual(ctx.descartes[0], [], `medio ${nombre}: la orden debia valer`);
    assert.equal(E.dueno[c], 0, `medio ${nombre}: la region de destino debia ser tomada`);
  }
});

test('el salto vale si AL MENOS UNA region intermedia se puede cruzar', () => {
  const E = nuevoEstado(4), [a, , c] = dosPasos(E), regs = E.mapa.regs;
  const comunes = regs[a].vecinos.filter((v) => regs[c].vecinos.includes(v));
  E.dueno[a] = 0; fijarTropas(E, a, 10); E.dueno[c] = -1; fijarTropas(E, c, 0); E.fort[c] = 0; E.edif[c] = null;
  comunes.forEach((w, i) => { E.dueno[w] = i === 0 ? -1 : 1; fijarTropas(E, w, i === 0 ? 0 : 3); E.edif[w] = null; });
  sumarUni(E, a, 0, 2, 3);
  const ctx = mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(c)} J3`] } });
  assert.deepEqual(ctx.descartes[0], []);
  assert.equal(E.dueno[c], 0);
});

test('mover ... todo lleva todas las tropas menos 1; con 1 sola tropa no hay nada que mover', () => {
  const E = nuevoEstado(4), [a, d] = frontera(E, 0, -1);
  fijarTropas(E, a, 10);
  mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} todo`] } });
  assert.equal(E.dueno[d], 0);
  assert.equal(tropasDe(E, d), 9);
  assert.equal(tropasDe(E, a), 1);
  const E2 = nuevoEstado(4), [a2, d2] = frontera(E2, 0, -1);
  fijarTropas(E2, a2, 1);
  const ctx = mover(E2, { 0: { ordenes: [`mover ${R(a2)} ${R(d2)} todo`] } });
  assert.equal(ctx.descartes[0][0].motivo, 'no hay tropas de sobra: debe quedar al menos 1 en la region de origen');
  assert.equal(E2.dueno[d2], -1);
});

// ---- Guerra 2.0.0, etapa 3: unidades en las ordenes de movimiento ----

test('mover con tipos lleva exactamente esas unidades; pedir las que no hay se descarta', () => {
  const E = nuevoEstado(4), [a, d] = frontera(E, 0, -1);
  fijarTropas(E, a, 6); sumarUni(E, a, 0, 1, 3); // 6 Lanceros y 3 Arqueros
  let ctx = mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} J1`] } });
  assert.equal(ctx.descartes[0][0].motivo, 'no tienes esas unidades en la region de origen');
  ctx = mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} L4 A2`] } });
  assert.deepEqual(ctx.descartes[0], []);
  assert.deepEqual(pilaDe(E, d, 0), [4, 2, 0, 0]);
  assert.deepEqual(pilaDe(E, a, 0), [2, 1, 0, 0]);
  assert.deepEqual(ctx.movs, [{ f: a, d, n: 6, k: 0, uni: [4, 2, 0, 0] }]);
});

test('mover todo deja la unidad mas barata (la de menor indice) y lleva el resto', () => {
  const E = nuevoEstado(4), [a, d] = frontera(E, 0, -1);
  fijarTropas(E, a, 3); sumarUni(E, a, 0, 1, 2); sumarUni(E, a, 0, 2, 1);
  mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} todo`] } });
  assert.deepEqual(pilaDe(E, a, 0), [1, 0, 0, 0]);
  assert.deepEqual(pilaDe(E, d, 0), [2, 2, 1, 0]);
  const E2 = nuevoEstado(4), [a2, d2] = frontera(E2, 0, -1);
  fijarTropas(E2, a2, 0); sumarUni(E2, a2, 0, 1, 2); sumarUni(E2, a2, 0, 2, 1); // sin Lanceros: se queda 1 Arquero
  mover(E2, { 0: { ordenes: [`mover ${R(a2)} ${R(d2)} todo`] } });
  assert.deepEqual(pilaDe(E2, a2, 0), [0, 1, 0, 0]);
  assert.deepEqual(pilaDe(E2, d2, 0), [0, 1, 1, 0]);
});

test('la region de origen no puede quedar sin unidades aunque se pidan todas las de un tipo', () => {
  const E = nuevoEstado(4), [a, d] = frontera(E, 0, -1);
  fijarTropas(E, a, 5);
  const ctx = mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} L5`] } });
  assert.equal(ctx.descartes[0][0].motivo, 'debe quedar al menos 1 tropa en la region de origen');
  assert.equal(E.dueno[d], -1);
});

test('el dominio decide la batalla: 6 Jinetes contra 12 Lanceros que los dominan pierden aunque suman mas fuerza', () => {
  const E = nuevoEstado(4), [a, d] = frontera(E, 0, -1);
  E.dueno[d] = 1; fijarTropas(E, d, 12); E.fort[d] = 0; E.mapa.regs[d].terr = 'll'; // defensa 12 x 1 x 1 = 12 (los Jinetes atacantes no la dominan)
  fijarTropas(E, a, 1); sumarUni(E, a, 0, 2, 6); // 6 Jinetes atacan: 18 de fuerza, pero cada Lancero rinde x2 contra ellos: 24
  const ctx = mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} J6`] } });
  assert.equal(E.dueno[d], 1, 'los Lanceros defienden');
  assert.equal(ctx.combates[0].resultado, 'repelido');
  assert.deepEqual(ctx.combates[0].bandos.map((b) => [b.k, +b.f.toFixed(4)]), [[1, 24], [0, 15.3]]); // los Jinetes atacan en tierra ajena: 18 x 0.85
  assert.deepEqual(pilaDe(E, d, 1), [4, 0, 0, 0]); // floor(12 x (1 - 15.3/24))
});

test('una captura deja en la region las unidades que sobreviven, con su composicion', () => {
  const E = nuevoEstado(4), [a, d] = frontera(E, 0, -1);
  E.dueno[d] = 1; fijarTropas(E, d, 4); E.fort[d] = 0; E.mapa.regs[d].terr = 'll'; // defensa 4
  fijarTropas(E, a, 1); sumarUni(E, a, 0, 1, 6); sumarUni(E, a, 0, 0, 3); // 4 Lanceros + 6 Arqueros atacan: los Arqueros dominan a los Lanceros (x2)
  mover(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} L3 A6`] } });
  assert.equal(E.dueno[d], 0);
  assert.deepEqual(pilaDe(E, d, 0), [2, 4, 0, 0]); // fuerza (3 + 24) x 0.85 = 22.95 contra 4: conserva el 82.6 % (floor)
  assert.deepEqual(pilaDe(E, d, 1), [0, 0, 0, 0], 'el dueno anterior no deja unidades');
});
