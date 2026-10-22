// Guerra 2.0.0, etapa 4: alianzas. Visitas de aliados, defensa conjunta, ruptura y terminar un pacto con unidades dentro, atacar donde ya estas, retirada, tierra ajena y caida de un reino con invitados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevoEstado, contexto, R, capital, frontera, fijarTropas, tropasDe } from './ayudas.js';
import { sumarUni, pila as pilaDe, presentes, totalUnidades, regionesDe } from '../../juegos/conquista/estado.js';
import { hambre, ordenesEconomicas } from '../../juegos/conquista/turno/economia.js';
import { rupturas } from '../../juegos/conquista/turno/diplomacia.js';
import { movimientos } from '../../juegos/conquista/turno/movimiento.js';
import { TIERRA_AJENA } from '../../juegos/conquista/constantes.js';

// Un turno hasta los movimientos (economia, rupturas, movimientos y batallas).
const turno = (E, porReino) => { const ctx = contexto(E, porReino); ordenesEconomicas(ctx); rupturas(ctx); movimientos(ctx); return ctx; };
const pacto = (E, a, b, hasta = 30) => { E.reinos[a].pactos[b] = E.reinos[b].pactos[a] = hasta; }; // vigente en el turno 1 si hasta >= 1
const L = (n) => [n, 0, 0, 0];
const redondea = (x) => +x.toFixed(4);
// Una region libre vecina de regiones de dos reinos distintos: { d, a, b, k1, k2 } con a de k1 y b de k2 (ninguna es capital). Las dos con 12 Lanceros.
function libreEntreDos(E) {
  for (const w of E.mapa.regs) {
    if (E.dueno[w.id] >= 0) continue;
    const prop = w.vecinos.filter((v) => E.dueno[v] >= 0 && !E.reinos.some((r) => r.capital === v));
    const duenos = [...new Set(prop.map((v) => E.dueno[v]))];
    if (duenos.length >= 2) {
      const [k1, k2] = duenos, a = prop.find((v) => E.dueno[v] === k1), b = prop.find((v) => E.dueno[v] === k2);
      fijarTropas(E, a, 12); fijarTropas(E, b, 12);
      return { d: w.id, a, b, k1, k2 };
    }
  }
  throw new Error('el mapa de prueba no tiene una region libre entre dos reinos');
}

// El reino 0 tiene 20 Lanceros en `a`; `d` es una region vecina de `a` del reino `duenoD` con `tropasD` Lanceros, sin fortaleza, llanura y sin edificio.
function escenario({ duenoD = 1, tropasD = 6 } = {}) {
  const E = nuevoEstado(4), [a, d] = frontera(E, 0, -1);
  E.dueno[d] = duenoD; E.fort[d] = 0; E.edif[d] = null; E.mapa.regs[d].terr = 'll';
  fijarTropas(E, d, tropasD);
  fijarTropas(E, a, 20);
  return { E, a, d };
}
// Una region vecina de `d` (distinta de las de `excluir`) que pasa a ser del reino `k` con `n` Lanceros.
function vecinaDeD(E, d, k, n, excluir = []) {
  const capitales = E.reinos.map((r) => r.capital);
  const b = E.mapa.regs[d].vecinos.find((v) => !excluir.includes(v) && !capitales.includes(v));
  E.dueno[b] = k; E.fort[b] = 0; E.edif[b] = null; fijarTropas(E, b, n);
  return b;
}

test('el valor de la tierra ajena es 0.85', () => { assert.equal(TIERRA_AJENA, 0.85); });

// ---- Visitas y capital cerrada ----

test('con pacto vigente se puede mover a una region del aliado: las unidades quedan de invitadas y no hay combate', () => {
  const { E, a, d } = escenario(); pacto(E, 0, 1);
  const ctx = turno(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} L8`] } });
  assert.deepEqual(ctx.descartes[0], []);
  assert.equal(E.dueno[d], 1);
  assert.deepEqual(pilaDe(E, d, 1), L(6));
  assert.deepEqual(pilaDe(E, d, 0), L(8));
  assert.equal(ctx.combates.length, 0);
  assert.deepEqual(presentes(E, d), [0, 1]);
  assert.equal(tropasDe(E, d), 6, 'la guarnicion del dueno no cuenta a los invitados');
});

test('la capital de un aliado esta cerrada: no se puede entrar a ella', () => {
  const E = nuevoEstado(4), cap1 = capital(E, 1), n = E.mapa.regs[cap1].vecinos.find((v) => !E.reinos.some((r) => r.capital === v));
  E.dueno[n] = 0; fijarTropas(E, n, 10); pacto(E, 0, 1);
  const ctx = turno(E, { 0: { ordenes: [`mover ${R(n)} ${R(cap1)} L5`] } });
  assert.equal(ctx.descartes[0][0].motivo, 'la capital de un aliado esta cerrada');
  assert.deepEqual(pilaDe(E, cap1, 0), L(0));
  assert.equal(tropasDe(E, n), 10);
});

test('sin pacto, mover a una region ajena sigue siendo atacar', () => {
  const { E, a, d } = escenario();
  const ctx = turno(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} L8`] } });
  assert.equal(ctx.combates.length, 1);
});

// ---- Tierra ajena ----

test('quien lucha en una region de un reino sin pacto con el rinde x0.85', () => {
  const { E, a, d } = escenario({ tropasD: 8 });
  const ctx = turno(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} L10`] } });
  assert.deepEqual(ctx.combates[0].bandos.map((b) => [b.k, redondea(b.f)]), [[0, 8.5], [1, 8]]);
  assert.equal(E.dueno[d], 0);
  assert.deepEqual(pilaDe(E, d, 0), L(1), 'floor(10 x (1 - 8 / 8.5)) = 0 -> al menos 1');
});

test('en una region libre las unidades no pierden fuerza: dos reinos que llegan a la vez pelean con su fuerza entera', () => {
  const F = nuevoEstado(4), { d, a, b, k1, k2 } = libreEntreDos(F);
  const ctx = turno(F, { [k1]: { ordenes: [`mover ${R(a)} ${R(d)} L10`] }, [k2]: { ordenes: [`mover ${R(b)} ${R(d)} L8`] } });
  assert.deepEqual(ctx.combates[0].bandos.map((x) => [x.k, x.f]), [[k1, 10], [k2, 8]]);
});

// ---- Defensa conjunta ----

test('si atacan una region de tu aliado, tus unidades de visita defienden con las suyas (con la fortaleza y el terreno del dueno)', () => {
  const { E, a, d } = escenario({ tropasD: 3 }); pacto(E, 0, 1);
  sumarUni(E, d, 0, 0, 4); // 4 Lanceros del reino 0, de visita
  E.fort[d] = 0;
  const b = vecinaDeD(E, d, 2, 20, [a]);
  let ctx = turno(E, { 2: { ordenes: [`mover ${R(b)} ${R(d)} L12`] } });
  assert.deepEqual(ctx.combates[0].bandos.map((x) => [x.k, x.n, redondea(x.f), x.defensor]), [[2, 12, 10.2, false], [1, 7, 7, true]]);
  assert.equal(E.dueno[d], 2, 'el atacante gana: 12 x 0.85 contra 3 + 4');
  assert.deepEqual(pilaDe(E, d, 2), L(3)); // floor(12 x (1 - 7 / 10.2))
  assert.deepEqual(pilaDe(E, d, 0), L(0), 'los invitados que defendieron y perdieron desaparecen');
  assert.deepEqual(pilaDe(E, d, 1), L(0));
});

test('los defensores conjuntos reparten los supervivientes y el dueno conserva al menos 1 unidad', () => {
  const { E, a, d } = escenario({ tropasD: 3 }); pacto(E, 0, 1);
  sumarUni(E, d, 0, 0, 4);
  const b = vecinaDeD(E, d, 2, 20, [a]);
  turno(E, { 2: { ordenes: [`mover ${R(b)} ${R(d)} L6`] } }); // 6 x 0.85 = 5.1 contra 7: defienden
  assert.equal(E.dueno[d], 1);
  assert.deepEqual(pilaDe(E, d, 1), L(1), 'floor(3 x 0.27) = 0, pero el dueno conserva 1 unidad');
  assert.deepEqual(pilaDe(E, d, 0), L(1), 'floor(4 x 0.27) = 1');
});

test('un aliado de los dos bandos no participa: se queda con todas sus unidades', () => {
  const { E, a, d } = escenario({ tropasD: 3 });
  pacto(E, 0, 1); pacto(E, 0, 2); // el reino 0 es aliado del dueno (1) y del atacante (2)
  sumarUni(E, d, 0, 0, 4);
  const b = vecinaDeD(E, d, 2, 20, [a]);
  const ctx = turno(E, { 2: { ordenes: [`mover ${R(b)} ${R(d)} L12`] } });
  assert.deepEqual(ctx.combates[0].bandos.map((x) => [x.k, x.n]), [[2, 12], [1, 3]]);
  assert.equal(E.dueno[d], 2);
  assert.deepEqual(pilaDe(E, d, 0), L(4), 'el neutral conserva sus unidades, ahora de visita en tierra de otro aliado');
});

test('dos atacantes con pacto entre si pelean del mismo lado, y el que conserva mas unidades se queda la region', () => {
  const { E, a, d } = escenario({ tropasD: 6 });
  pacto(E, 0, 2);
  const b = vecinaDeD(E, d, 2, 20, [a]);
  const ctx = turno(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} L8`] }, 2: { ordenes: [`mover ${R(b)} ${R(d)} L6`] } });
  assert.equal(ctx.combates.length, 1);
  assert.deepEqual(ctx.combates[0].bandos.map((x) => [x.k, x.n, redondea(x.f), x.defensor]), [[0, 14, 11.9, false], [1, 6, 6, true]]);
  assert.equal(E.dueno[d], 0, 'el reino 0 conserva 3 contra 2');
  assert.deepEqual(pilaDe(E, d, 0), L(3));
  assert.deepEqual(pilaDe(E, d, 2), L(2), 'el otro queda de invitado en la region que ayudo a tomar');
  assert.ok(!ctx.eventos.some((e) => e.tipo === 'conquista' && e.contra === 2));
});

test('dos aliados que llegan a la vez a una region libre no pelean: el de mas unidades es el dueno y el otro invitado', () => {
  const F = nuevoEstado(4), { d, a, b, k1, k2 } = libreEntreDos(F);
  pacto(F, k1, k2);
  const ctx = turno(F, { [k1]: { ordenes: [`mover ${R(a)} ${R(d)} L5`] }, [k2]: { ordenes: [`mover ${R(b)} ${R(d)} L7`] } });
  assert.equal(ctx.combates.length, 0);
  assert.equal(F.dueno[d], k2);
  assert.deepEqual(pilaDe(F, d, k2), L(7));
  assert.deepEqual(pilaDe(F, d, k1), L(5));
});

// ---- Romper, terminar un pacto, atacar donde estas, retirarse ----

test('romper el pacto y atacar donde ya estas: el traidor lucha con x0.85 y, si gana, toma la region', () => {
  const { E, d } = escenario({ tropasD: 6 }); pacto(E, 0, 1);
  sumarUni(E, d, 0, 0, 10);
  const ctx = turno(E, { 0: { ordenes: ['romper Ambar', `atacar ${R(d)}`] } });
  assert.deepEqual(ctx.descartes[0], []);
  assert.deepEqual(ctx.combates[0].bandos.map((x) => [x.k, redondea(x.f)]), [[0, 8.5], [1, 6]]);
  assert.equal(E.dueno[d], 0);
  assert.deepEqual(pilaDe(E, d, 0), L(2)); // floor(10 x (1 - 6 / 8.5))
  assert.deepEqual(pilaDe(E, d, 1), L(0));
  assert.equal(E.reinos[0].honor, 2, 'romper cuesta 3 de honor');
  assert.ok(ctx.eventos.some((e) => e.tipo === 'ruptura' && e.k === 0 && e.contra === 1));
  assert.ok(ctx.eventos.some((e) => e.tipo === 'conquista' && e.k === 0 && e.contra === 1 && e.r === d));
});

test('el traidor tambien puede perder: el dueno defiende con su terreno y su fortaleza', () => {
  const { E, d } = escenario({ tropasD: 6 }); pacto(E, 0, 1);
  E.fort[d] = 1; E.mapa.regs[d].terr = 'bo'; // defensa 6 x 1.5 x 1.25 = 11.25
  sumarUni(E, d, 0, 0, 10);
  turno(E, { 0: { ordenes: ['romper Ambar', `atacar ${R(d)}`] } });
  assert.equal(E.dueno[d], 1);
  assert.deepEqual(pilaDe(E, d, 1), L(1)); // floor(6 x (1 - 8.5 / 11.25)) = 1: la fortaleza y el bosque cuentan para el dueno
});

test('atacar donde estas exige enemigos ahi: con el pacto vigente la orden se descarta', () => {
  const { E, d } = escenario(); pacto(E, 0, 1);
  sumarUni(E, d, 0, 0, 10);
  const ctx = turno(E, { 0: { ordenes: [`atacar ${R(d)}`] } });
  assert.equal(ctx.descartes[0][0].motivo, 'no hay enemigos en esa region');
  assert.equal(ctx.combates.length, 0);
});

test('romper el pacto NO obliga a atacar: sin la orden atacar no hay combate y las unidades siguen ahi, ya hostiles', () => {
  const { E, d } = escenario({ tropasD: 6 }); pacto(E, 0, 1);
  sumarUni(E, d, 0, 0, 10);
  const ctx = turno(E, { 0: { ordenes: ['romper Ambar'] } });
  assert.equal(ctx.combates.length, 0);
  assert.equal(E.dueno[d], 1);
  assert.deepEqual(pilaDe(E, d, 0), L(10));
  assert.deepEqual(pilaDe(E, d, 1), L(6));
});

test('tras romper se puede retirar todo (un invitado no tiene que dejar 1 unidad) a una region propia', () => {
  const { E, a, d } = escenario({ tropasD: 6 }); pacto(E, 0, 1);
  sumarUni(E, d, 0, 0, 10);
  const ctx = turno(E, { 0: { ordenes: ['romper Ambar', `mover ${R(d)} ${R(a)} todo`] } });
  assert.deepEqual(ctx.descartes[0], []);
  assert.deepEqual(pilaDe(E, d, 0), L(0));
  assert.deepEqual(pilaDe(E, a, 0), L(30));
  assert.equal(E.dueno[d], 1);
});

test('un pacto que termina por si solo deja las unidades de visita hostiles: se puede atacar sin romper y sin perder honor', () => {
  const { E, d } = escenario({ tropasD: 6 });
  pacto(E, 0, 1, 0); // ya no esta vigente en el turno 1
  sumarUni(E, d, 0, 0, 10);
  const ctx = turno(E, { 0: { ordenes: [`atacar ${R(d)}`] } });
  assert.deepEqual(ctx.descartes[0], []);
  assert.equal(E.dueno[d], 0);
  assert.equal(E.reinos[0].honor, 5, 'terminar un pacto no cuesta honor');
});

test('el dueno puede atacar a los hostiles que tiene dentro: pelea con su fortaleza y su terreno, y los de fuera con x0.85', () => {
  const { E, d } = escenario({ tropasD: 6 });
  E.fort[d] = 1; E.mapa.regs[d].terr = 'bo'; // 6 x 1.5 x 1.25 = 11.25
  sumarUni(E, d, 0, 0, 6); // invitado hostil (sin pacto): 6 x 0.85 = 5.1
  const ctx = turno(E, { 1: { ordenes: [`atacar ${R(d)}`] } });
  assert.deepEqual(ctx.combates[0].bandos.map((x) => [x.k, redondea(x.f), x.defensor]), [[1, 11.25, true], [0, 5.1, false]]);
  assert.equal(E.dueno[d], 1);
  assert.deepEqual(pilaDe(E, d, 1), L(3)); // floor(6 x (1 - 5.1 / 11.25))
  assert.deepEqual(pilaDe(E, d, 0), L(0));
  assert.ok(ctx.eventos.some((e) => e.tipo === 'repelido' && e.contra === 1));
});

test('atacar con solo una parte de las unidades: las demas se quedan fuera de la pelea', () => {
  const { E, d } = escenario({ tropasD: 3 }); pacto(E, 0, 1, 0);
  sumarUni(E, d, 0, 0, 10); sumarUni(E, d, 0, 1, 2); // 10 Lanceros y 2 Arqueros hostiles
  turno(E, { 0: { ordenes: [`atacar ${R(d)} L4`] } });
  assert.equal(E.dueno[d], 0, '4 x 0.85 = 3.4 contra 3: gana el invitado');
  assert.deepEqual(pilaDe(E, d, 0), [6 + 1, 2, 0, 0], 'las 6 Lanceros que no pelearon se quedan y se suma el superviviente (floor(4 x 0.12) = 0 -> 1)');
});

test('una visita aliada que llega el mismo turno en que atacan la region tambien defiende', () => {
  const { E, a, d } = escenario({ tropasD: 3 }); pacto(E, 0, 1);
  const b = vecinaDeD(E, d, 2, 20, [a]);
  const ctx = turno(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} L4`] }, 2: { ordenes: [`mover ${R(b)} ${R(d)} L6`] } });
  assert.deepEqual(ctx.combates[0].bandos.map((x) => [x.k, x.n, redondea(x.f), x.defensor]), [[1, 7, 7, true], [2, 6, 5.1, false]]);
  assert.equal(E.dueno[d], 1);
  assert.deepEqual(pilaDe(E, d, 0), L(1), '4 Lanceros llegaron y defendieron: floor(4 x 0.2714) = 1');
});

// ---- Duelos entre invitados, ataques a varios enemigos a la vez y ordenes repetidas ----

test('dos invitados hostiles entre si pelean dentro de la region de un tercero: la region sigue siendo de su dueno, sin fortaleza ni terreno', () => {
  const { E, d } = escenario({ duenoD: 3, tropasD: 6 });
  E.fort[d] = 2; E.mapa.regs[d].terr = 'mo'; // si el dueno participara, tendria x2 x1.5
  pacto(E, 0, 3); // el dueno es aliado de quien ataca: no es su enemigo
  sumarUni(E, d, 0, 0, 10); sumarUni(E, d, 2, 0, 5); // el reino 2 es hostil al reino 0 (sin pacto) y tambien al dueno
  const ctx = turno(E, { 0: { ordenes: [`atacar ${R(d)}`] } });
  assert.equal(ctx.combates.length, 1);
  assert.equal(ctx.combates[0].resultado, 'duelo');
  assert.deepEqual(ctx.combates[0].bandos.map((x) => [x.k, redondea(x.f), x.defensor]), [[0, 10, false], [2, 4.25, false]], 'el reino 2 pelea en tierra ajena (x0.85) y el reino 0 en la de un aliado');
  assert.equal(E.dueno[d], 3);
  assert.deepEqual(pilaDe(E, d, 3), L(6), 'el dueno no pelea ni pierde nada');
  assert.deepEqual(pilaDe(E, d, 0), L(5)); // floor(10 x (1 - 4.25 / 10)) = 5
  assert.deepEqual(pilaDe(E, d, 2), L(0));
  assert.ok(ctx.eventos.some((e) => e.tipo === 'duelo' && e.k === 0 && e.contra === 2 && e.r === d));
});

test('atacar en sitio contra varios enemigos a la vez: pelean los dos bandos mas fuertes y el tercero desaparece', () => {
  const { E, d } = escenario({ tropasD: 4 }); pacto(E, 0, 1, 0);
  sumarUni(E, d, 0, 0, 12); sumarUni(E, d, 2, 0, 5); // el atacante (0) tiene como enemigos al dueno (1, 4 Lanceros) y a un invitado hostil (2, 5 Lanceros)
  const ctx = turno(E, { 0: { ordenes: [`atacar ${R(d)}`] } });
  assert.deepEqual(ctx.combates[0].bandos.map((x) => [x.k, redondea(x.f), x.defensor]), [[0, 10.2, false], [2, 4.25, false], [1, 4, true]]);
  assert.equal(E.dueno[d], 0, 'el reino 0 gana al segundo (el 2) y el dueno, que quedo tercero, desaparece');
  assert.deepEqual(pilaDe(E, d, 0), L(7)); // floor(12 x (1 - 4.25 / 10.2)) = 7
  assert.deepEqual(pilaDe(E, d, 1), L(0));
  assert.deepEqual(pilaDe(E, d, 2), L(0));
});

test('un tercero que no es aliado ni del atacante ni del dueno se queda como estaba cuando otros dos pelean', () => {
  const { E, a, d } = escenario({ tropasD: 3 });
  sumarUni(E, d, 2, 0, 5); // un invitado hostil del dueno (sin pacto con nadie)
  const ctx = turno(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} L12`] } });
  assert.deepEqual(ctx.combates[0].bandos.map((x) => x.k), [0, 1], 'el invitado hostil no es objetivo de un ataque que va contra el dueno');
  assert.equal(E.dueno[d], 0);
  assert.deepEqual(pilaDe(E, d, 2), L(5), 'se queda de visita en la region que ahora es del vencedor');
});

test('dos ordenes de atacar la misma region en un turno: la segunda se descarta; sin tropas ahi, o con una lista el dueno, tambien', () => {
  const { E, d } = escenario({ tropasD: 6 }); pacto(E, 0, 1, 0);
  sumarUni(E, d, 0, 0, 10);
  let ctx = turno(E, { 0: { ordenes: [`atacar ${R(d)} L4`, `atacar ${R(d)} L6`] } });
  assert.equal(ctx.descartes[0][0].motivo, 'ya ordenaste atacar esa region este turno');
  assert.equal(ctx.combates.length, 1);
  const F = escenario({ tropasD: 6 }); // el reino 3 no tiene tropas en esa region
  ctx = turno(F.E, { 3: { ordenes: [`atacar ${R(F.d)}`] } });
  assert.equal(ctx.descartes[3][0].motivo, 'no tienes tropas en esa region');
  const G = escenario({ tropasD: 6 }); sumarUni(G.E, G.d, 2, 0, 3); // un invitado hostil
  ctx = turno(G.E, { 1: { ordenes: [`atacar ${R(G.d)} L2`] } });
  assert.equal(ctx.descartes[1][0].motivo, 'en tu propia region peleas con toda tu guarnicion: escribe solo atacar REGION');
  assert.equal(ctx.combates.length, 0);
});

test('un movimiento y un ataque en sitio a la vez: el movimiento sale primero y atacan las unidades que se quedaron', () => {
  const { E, a, d } = escenario({ tropasD: 3 }); pacto(E, 0, 1, 0);
  sumarUni(E, d, 0, 0, 8);
  const ctx = turno(E, { 0: { ordenes: [`mover ${R(d)} ${R(a)} L6`, `atacar ${R(d)}`] } });
  assert.deepEqual(ctx.descartes[0], []);
  assert.deepEqual(ctx.combates[0].bandos.map((x) => [x.k, x.n]), [[1, 3], [0, 2]], 'de mayor a menor fuerza: 3 contra 2 x 0.85 = 1.7');
  assert.equal(E.dueno[d], 1);
  assert.deepEqual(pilaDe(E, a, 0), L(26), 'las 6 que salieron llegaron a su region (20 + 6)');
});

// ---- Caida de un reino con invitados ----

test('cuando un reino cae, sus unidades de visita desaparecen y sus regiones pasan al invitado con mas unidades', () => {
  const E = nuevoEstado(4), cap1 = capital(E, 1);
  const n = E.mapa.regs[cap1].vecinos.find((v) => !E.reinos.some((r) => r.capital === v));
  E.dueno[n] = 2; fijarTropas(E, n, 20); E.fort[cap1] = 0; E.mapa.regs[cap1].terr = 'll'; fijarTropas(E, cap1, 2);
  const otras1 = regionesDe(E, 1).filter((r) => r !== cap1);
  assert.ok(otras1.length >= 1);
  const d = otras1[0];
  pacto(E, 0, 1);
  sumarUni(E, d, 0, 0, 4); // el reino 0 tiene 4 Lanceros de visita en una region del reino 1
  const propia0 = regionesDe(E, 0)[0];
  sumarUni(E, propia0, 1, 0, 3); // y el reino 1 tiene 3 de visita en una region del reino 0
  const ctx = turno(E, { 2: { ordenes: [`mover ${R(n)} ${R(cap1)} L15`] } });
  assert.equal(E.reinos[1].vivo, false);
  assert.equal(totalUnidades(E, 1), 0, 'ninguna unidad del reino caido queda en el mapa');
  assert.equal(E.dueno[d], 0, 'el invitado con mas unidades se queda la region');
  assert.deepEqual(pilaDe(E, d, 0), L(4));
  otras1.slice(1).forEach((r) => { assert.equal(E.dueno[r], -1); });
  assert.ok(ctx.eventos.some((e) => e.tipo === 'caida' && e.k === 1 && e.por === 2));
});

// ---- Hambre y clasificacion con invitados ----

test('las unidades de visita comen de la Comida de su reino', () => {
  const E = nuevoEstado(4);
  const propias = regionesDe(E, 0), total = propias.reduce((s, r) => s + tropasDe(E, r), 0);
  const d = regionesDe(E, 1)[1];
  pacto(E, 0, 1);
  sumarUni(E, d, 0, 0, 8);
  E.reinos[0].stock.Comida = 20;
  hambre(contexto(E));
  assert.equal(E.reinos[0].stock.Comida, 20 - Math.ceil((total + 8) / 4));
});
