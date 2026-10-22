// Guerra 2.0.0, etapa 6: paquete de equilibrio. Hegemon (el que va muy arriba recibe +25 % de los demas), Reconquista (3 turnos de +25 % para recuperar una region perdida), Patria (+25 % de defensa con
// 3 regiones o menos) y eventos del mundo (Sequia, Peste, Cosecha, Caravana) sorteados con el seed del mapa y anunciados un turno antes. Cada pieza se apaga con su constante `activo`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearRng } from '../../rng.js';
import { crearEstado, regionesDe, pila as pilaDe, totalUnidades, sumarUni, limpiarRegion, instantanea } from '../../juegos/conquista/estado.js';
import { nuevoEstado, contexto, R, frontera, fijarTropas, tropasDe, mapaDe } from './ayudas.js';
import { HEGEMON, RECONQUISTA, PATRIA, EVENTOS } from '../../juegos/conquista/constantes.js';
import { actualizarHegemon, sortearCalendario } from '../../juegos/conquista/equilibrio.js';
import { eventosDelMundo } from '../../juegos/conquista/turno/mundo.js';
import { recoleccion, ordenesEconomicas } from '../../juegos/conquista/turno/economia.js';
import { rupturas } from '../../juegos/conquista/turno/diplomacia.js';
import { movimientos } from '../../juegos/conquista/turno/movimiento.js';
import { aplicarTurno } from '../../juegos/conquista/turno/index.js';
import { vistaTexto } from '../../juegos/conquista/vista.js';
import { resumenPublico } from '../../juegos/conquista/texto.js';

const redondea = (x) => +x.toFixed(4);
const turno = (E, porReino) => { const ctx = contexto(E, porReino); ordenesEconomicas(ctx); rupturas(ctx); movimientos(ctx); return ctx; };
const vaciar = (E, s, extra = {}) => { E.reinos[s].stock = { Comida: 0, Madera: 0, Roca: 0, Hierro: 0, Oro: 0, Caballos: 0, ...extra }; };
// Apaga una pieza del paquete mientras corre `f` y la vuelve a encender.
const sin = (pieza, f) => { const antes = pieza.activo; pieza.activo = false; try { return f(); } finally { pieza.activo = antes; } };
// El reino `atacante` (0) tiene 20 Lanceros en `a` y la region vecina d es del reino `duenoD` (1) con `tropasD` Lanceros, llanura y sin fortaleza.
function escenario({ atacante = 0, duenoD = 1, tropasD = 6 } = {}) {
  const E = nuevoEstado(4), [a, d] = frontera(E, atacante, -1);
  E.dueno[d] = duenoD; E.fort[d] = 0; E.edif[d] = null; E.mapa.regs[d].terr = 'll';
  fijarTropas(E, d, tropasD); fijarTropas(E, a, 20);
  return { E, a, d };
}
// Deja al reino s con exactamente n regiones: la capital, las de `conservar` y las primeras que tenga; las demas quedan libres.
function dejarRegiones(E, s, n, conservar = []) {
  const cap = E.reinos[s].capital, propias = regionesDe(E, s), orden = [cap, ...conservar.filter((r) => r !== cap), ...propias.filter((r) => r !== cap && !conservar.includes(r))];
  for (const r of orden.slice(n)) { limpiarRegion(E, r); E.dueno[r] = -1; E.fort[r] = 0; E.edif[r] = null; E.dan[r] = 0; }
  return E;
}
// Reparte las regiones con dueno: cuenta[s] regiones para cada reino (las demas, libres), para probar los porcentajes del Hegemon.
function repartir(E, cuenta) {
  E.dueno.fill(-1); E.uni.fill(0);
  const capitales = E.reinos.map((r) => r.capital);
  capitales.forEach((c, s) => { E.dueno[c] = s; E.uni[(c * E.k + s) * 4] = 5; });
  let i = 0; const orden = E.mapa.regs.map((r) => r.id).filter((r) => !capitales.includes(r));
  for (let s = 0; s < E.k; s++) for (let n = 1; n < cuenta[s]; n++) { const r = orden[i++]; E.dueno[r] = s; E.uni[(r * E.k + s) * 4] = 2; }
}

// ---- Calendario de eventos ----

test('el calendario tiene un evento en cada turno de EVENTOS.turnos, nunca el mismo tipo dos veces seguidas, y depende solo del seed del mapa', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const c = sortearCalendario(seed * 977);
    assert.deepEqual(c.map((e) => e.t), EVENTOS.turnos);
    assert.ok(c.every((e) => EVENTOS.tipos.includes(e.tipo)));
    c.slice(1).forEach((e, i) => assert.notEqual(e.tipo, c[i].tipo, `seed ${seed}: ${e.tipo} dos veces seguidas`));
    assert.deepEqual(sortearCalendario(seed * 977), c, 'mismo seed, mismo calendario');
  }
  assert.ok(new Set(Array.from({ length: 40 }, (_, i) => JSON.stringify(sortearCalendario(i * 977)))).size > 10, 'seeds distintos dan calendarios distintos');
  assert.deepEqual(sin(EVENTOS, () => sortearCalendario(5)), [], 'apagados, no hay eventos');
});

test('el estado nace con su calendario, que no depende de lo que jueguen los reinos', () => {
  const a = crearEstado(crearRng(7), { jugadores: 4, mapa: mapaDe(7, 4) }), b = crearEstado(crearRng(7), { jugadores: 4, mapa: mapaDe(7, 4) });
  assert.deepEqual(a.calendario, b.calendario);
  assert.equal(a.calendario.length, EVENTOS.turnos.length);
  assert.deepEqual([a.hegemon, a.sequiaHasta], [-1, 0]);
  assert.equal(a.perdidas.length, a.mapa.regs.length);
  assert.ok(a.perdidas.every((p) => p === null));
  const c = crearEstado(crearRng(8), { jugadores: 4, mapa: mapaDe(7, 4) });
  assert.notDeepEqual(c.calendario, a.calendario, 'el calendario sale del seed de la partida (el que sortea el mapa), no del mapa dado');
});

// ---- Hegemon ----

test('Hegemon: el reino con mas regiones lo es desde el 35 % de las regiones con dueno; la histeresis lo conserva hasta bajar del 30 %', () => {
  const E = nuevoEstado(4);
  repartir(E, [7, 5, 4, 4]); // 7 de 20 = 35 %
  assert.equal(actualizarHegemon(E), 0);
  assert.equal(E.hegemon, 0);
  repartir(E, [6, 5, 5, 4]); // 6 de 20 = 30 %: ya no entraria, pero lo conserva (>= 30 %)
  assert.equal(actualizarHegemon(E), 0);
  repartir(E, [5, 6, 5, 4]); // el reino 0 ya no es el que mas tiene: pierde el titulo y el 1 (30 %) no llega a 35 %
  assert.equal(actualizarHegemon(E), -1);
  repartir(E, [6, 5, 5, 4]); // ya sin titulo: 30 % no basta para entrar
  assert.equal(actualizarHegemon(E), -1);
  repartir(E, [7, 5, 4, 4]); actualizarHegemon(E);
  repartir(E, [5, 5, 5, 5]); // 25 %: baja del 30 % y lo pierde aunque siga empatado
  assert.equal(actualizarHegemon(E), -1);
});

test('Hegemon: para entrar debe ser el unico con mas regiones (un empate no lo da), quien ya lo es lo conserva en un empate, y el titulo pasa al nuevo lider cuando llega al 35 %', () => {
  const E = nuevoEstado(4);
  repartir(E, [8, 8, 2, 2]); // empate en la punta
  assert.equal(actualizarHegemon(E), -1);
  repartir(E, [8, 5, 4, 3]); // 8 de 20 = 40 %
  assert.equal(actualizarHegemon(E), 0);
  repartir(E, [6, 6, 4, 4]); // el 0 queda empatado en la punta con el 1 (30 %): conserva el titulo
  assert.equal(actualizarHegemon(E), 0);
  repartir(E, [5, 8, 4, 3]); // el 1 pasa al 40 %: le quita el titulo
  assert.equal(actualizarHegemon(E), 1);
});

test('Hegemon: un reino caido no puede serlo, sin regiones con dueno no hay Hegemon y apagado nunca hay', () => {
  const E = nuevoEstado(4);
  repartir(E, [8, 5, 4, 3]); E.hegemon = 0; E.reinos[0].vivo = false; E.dueno.forEach((d, r) => { if (d === 0) E.dueno[r] = -1; });
  assert.equal(actualizarHegemon(E), 1, '5 de 12 = 41 %: el siguiente lo hereda');
  const F = nuevoEstado(4); F.dueno.fill(-1);
  assert.equal(actualizarHegemon(F), -1);
  const G = nuevoEstado(4); repartir(G, [8, 5, 4, 3]);
  assert.equal(sin(HEGEMON, () => actualizarHegemon(G)), -1);
});

test('Hegemon: los demas reinos lo atacan con +25 % (se acumula con la tierra ajena); apagado o sin Hegemon, no', () => {
  const { E, a, d } = escenario({ tropasD: 8 }); E.hegemon = 1;
  let ctx = turno(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} L10`] } });
  assert.deepEqual(ctx.combates[0].bandos.map((b) => [b.k, redondea(b.f)]), [[0, 10.625], [1, 8]], '10 x 0.85 x 1.25');
  const F = escenario({ tropasD: 8 });
  ctx = turno(F.E, { 0: { ordenes: [`mover ${R(F.a)} ${R(F.d)} L10`] } });
  assert.deepEqual(ctx.combates[0].bandos.map((b) => [b.k, redondea(b.f)]), [[0, 8.5], [1, 8]], 'sin Hegemon: solo la tierra ajena');
  const G = escenario({ tropasD: 8 }); G.E.hegemon = 1;
  const ctx2 = sin(HEGEMON, () => turno(G.E, { 0: { ordenes: [`mover ${R(G.a)} ${R(G.d)} L10`] } }));
  assert.deepEqual(ctx2.combates[0].bandos.map((b) => redondea(b.f)), [8.5, 8], 'apagado');
});

test('Hegemon: el bono es de quien ataca a su region, no del Hegemon cuando ataca a otros', () => {
  const { E, a, d } = escenario({ atacante: 1, duenoD: 0, tropasD: 8 }); E.hegemon = 1; // ataca el Hegemon (1) a la region del reino 0
  const ctx = turno(E, { 1: { ordenes: [`mover ${R(a)} ${R(d)} L10`] } });
  assert.equal(redondea(ctx.combates[0].bandos.find((b) => b.k === 1).f), 8.5);
});

// ---- Reconquista ----

test('Reconquista: al conquistar una region se anota quien la perdio y en que turno', () => {
  const { E, a, d } = escenario({ tropasD: 3 });
  turno(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} L10`] } });
  assert.deepEqual(E.perdidas[d], { k: 1, t: 1 });
});

test('Reconquista: la victima ataca con +25 % los 3 turnos siguientes (t+1, t+2 y t+3) y el cuarto ya no', () => {
  for (const [t, bono] of [[2, 1.25], [3, 1.25], [4, 1.25], [5, 1]]) {
    const { E, a, d } = escenario({ atacante: 1, duenoD: 0, tropasD: 8 });
    E.turno = t - 1; E.perdidas[d] = { k: 1, t: 1 };
    const ctx = turno(E, { 1: { ordenes: [`mover ${R(a)} ${R(d)} L10`] } });
    assert.equal(redondea(ctx.combates[0].bandos.find((x) => x.k === 1).f), redondea(10 * 0.85 * bono), `turno ${t}`);
  }
});

test('Reconquista: solo la victima la usa; al recuperar la region el bono pasa a quien la acaba de perder; apagada no hay bono', () => {
  const { E, a, d } = escenario({ tropasD: 8 });
  E.perdidas[d] = { k: 2, t: 0 }; // la perdio el reino 2, no el 0
  let ctx = turno(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} L10`] } });
  assert.equal(redondea(ctx.combates[0].bandos.find((x) => x.k === 0).f), 8.5, 'el reino 0 no la perdio: sin bono');
  const F = escenario({ tropasD: 8 }); F.E.perdidas[F.d] = { k: 0, t: 0 }; F.E.turno = 1;
  ctx = sin(RECONQUISTA, () => turno(F.E, { 0: { ordenes: [`mover ${R(F.a)} ${R(F.d)} L10`] } }));
  assert.equal(redondea(ctx.combates[0].bandos.find((x) => x.k === 0).f), 8.5, 'apagada');
  const G = escenario({ tropasD: 3 }); G.E.perdidas[G.d] = { k: 0, t: 0 }; G.E.turno = 1;
  turno(G.E, { 0: { ordenes: [`mover ${R(G.a)} ${R(G.d)} L10`] } });
  assert.equal(G.E.dueno[G.d], 0);
  assert.deepEqual(G.E.perdidas[G.d], { k: 1, t: 2 }, 'el reino 0 la recupero: ahora quien tiene el bono es el reino 1, que la acaba de perder');
});

// ---- Patria ----

test('Patria: con 2 regiones o menos (todos empiezan con 3) las regiones del reino defienden con +25 %; con 3 no; apagada no', () => {
  const { E, a, d } = escenario({ tropasD: 8 });
  dejarRegiones(E, 1, 2, [d]);
  assert.equal(regionesDe(E, 1).length, 2);
  let ctx = turno(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} L10`] } });
  assert.equal(redondea(ctx.combates[0].bandos.find((x) => x.k === 1).f), 10, '8 x 1.25');
  const F = escenario({ tropasD: 8 }); dejarRegiones(F.E, 1, 3, [F.d]);
  assert.equal(regionesDe(F.E, 1).length, 3);
  ctx = turno(F.E, { 0: { ordenes: [`mover ${R(F.a)} ${R(F.d)} L10`] } });
  assert.equal(redondea(ctx.combates[0].bandos.find((x) => x.k === 1).f), 8, 'con 3 regiones (las del inicio) no hay bono');
  const G = escenario({ tropasD: 8 }); dejarRegiones(G.E, 1, 2, [G.d]);
  ctx = sin(PATRIA, () => turno(G.E, { 0: { ordenes: [`mover ${R(G.a)} ${R(G.d)} L10`] } }));
  assert.equal(redondea(ctx.combates[0].bandos.find((x) => x.k === 1).f), 8, 'apagada');
});

test('Patria cuenta las regiones que se tenian al empezar el turno: si el reino baja a 2 durante el turno, el bono no vale en las batallas de ese mismo turno', () => {
  const { E, a, d } = escenario({ tropasD: 8 });
  dejarRegiones(E, 1, 3, [d]);
  const ctx = contexto(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} L10`] } }); // el contexto anota las 3 regiones del inicio del turno
  const otra = regionesDe(E, 1).find((r) => r !== d && r !== E.reinos[1].capital);
  limpiarRegion(E, otra); E.dueno[otra] = -1; // a mitad del turno el reino 1 se queda con 2
  ordenesEconomicas(ctx); rupturas(ctx); movimientos(ctx);
  assert.equal(regionesDe(E, 1).length === 2 || E.dueno[d] === 0, true);
  assert.equal(redondea(ctx.combates[0].bandos.find((x) => x.k === 1).f), 8);
});

// ---- Eventos del mundo ----

const conEvento = (E, tipo, t = 1) => { E.calendario = [{ t, tipo }]; return contexto(E); };

test('Sequia: la cosecha base baja a la mitad durante 2 turnos (el evento y el siguiente) y vuelve a la normalidad', () => {
  const E = nuevoEstado(4), n = regionesDe(E, 0).length;
  E.mapa.regs.forEach((r) => { r.rec = null; });
  vaciar(E, 0);
  const normal = Math.floor(n / 2);
  const ctx = conEvento(E, 'sequia');
  eventosDelMundo(ctx);
  assert.equal(E.sequiaHasta, 2);
  assert.ok(ctx.eventos.some((e) => e.tipo === 'evento' && e.evento === 'sequia'));
  recoleccion(ctx);
  assert.equal(E.reinos[0].stock.Comida, Math.floor(normal / 2), 'turno 1: mitad');
  vaciar(E, 0); E.turno = 1; recoleccion(contexto(E));
  assert.equal(E.reinos[0].stock.Comida, Math.floor(normal / 2), 'turno 2: mitad');
  vaciar(E, 0); E.turno = 2; recoleccion(contexto(E));
  assert.equal(E.reinos[0].stock.Comida, normal, 'turno 3: normal');
});

test('Cosecha: +1 Comida por cada region no aislada, solo el turno del evento', () => {
  const E = nuevoEstado(4), n = regionesDe(E, 0).length;
  E.mapa.regs.forEach((r) => { r.rec = null; });
  vaciar(E, 0);
  const ctx = conEvento(E, 'cosecha');
  eventosDelMundo(ctx); recoleccion(ctx);
  assert.equal(E.reinos[0].stock.Comida, Math.floor(n / 2) + n);
  vaciar(E, 0); E.turno = 1; recoleccion(contexto(E));
  assert.equal(E.reinos[0].stock.Comida, Math.floor(n / 2), 'el turno siguiente ya no');
});

test('Peste: el reino con mas unidades pierde el 15 % (repartido por sus pilas, sin vaciar una region propia); con empate, todos los empatados', () => {
  const E = nuevoEstado(4);
  regionesDe(E, 0).forEach((r) => fijarTropas(E, r, 10)); // el reino 0 es el de mas unidades
  const antes = totalUnidades(E, 0), otros = [1, 2, 3].map((s) => totalUnidades(E, s));
  const ctx = conEvento(E, 'peste');
  eventosDelMundo(ctx);
  assert.equal(totalUnidades(E, 0), antes - Math.round(antes * 0.15));
  assert.deepEqual([1, 2, 3].map((s) => totalUnidades(E, s)), otros, 'los demas no pierden nada');
  regionesDe(E, 0).forEach((r) => assert.ok(tropasDe(E, r) >= 1));
  assert.deepEqual(ctx.eventos.find((e) => e.evento === 'peste').afectados, [{ k: 0, n: Math.round(antes * 0.15) }]);

  const F = nuevoEstado(4); // los 4 reinos con exactamente las mismas unidades: pierden todos
  for (let s = 0; s < 4; s++) { dejarRegiones(F, s, 3); regionesDe(F, s).forEach((r) => fijarTropas(F, r, 10)); }
  assert.deepEqual([0, 1, 2, 3].map((s) => totalUnidades(F, s)), [30, 30, 30, 30]);
  eventosDelMundo(conEvento(F, 'peste'));
  [0, 1, 2, 3].forEach((s) => assert.equal(totalUnidades(F, s), 30 - 5, `reino ${s}: round(30 x 0.15) = 5`));
});

test('Peste: una region propia con una sola unidad no se vacia aunque le toque una del reparto; la pila de visita se resiente', () => {
  const E = nuevoEstado(4);
  regionesDe(E, 0).forEach((r) => fijarTropas(E, r, 1)); // 3 regiones con 1 unidad
  const d = regionesDe(E, 1)[1];
  sumarUni(E, d, 0, 0, 47); // 47 Lanceros de visita: 50 en total, la peste pide round(7.5) = 8; el piso de la visita es 7 y la unidad que falta le tocaria a una region propia de 1 unidad
  const ctx = conEvento(E, 'peste');
  eventosDelMundo(ctx);
  regionesDe(E, 0).forEach((r) => assert.equal(tropasDe(E, r), 1), 'las regiones propias con una unidad se quedan con ella');
  assert.equal(pilaDe(E, d, 0)[0], 40, 'la visita pierde 7 (el piso de 15 % de 47)');
  assert.deepEqual(ctx.eventos.find((e) => e.evento === 'peste').afectados, [{ k: 0, n: 7 }], 'se informa lo que se perdio de verdad');
});

test('Peste: la perdida sale de todos los tipos en proporcion (metodo del mayor resto) y nunca deja una pila negativa', () => {
  const E = nuevoEstado(4), c = E.reinos[0].capital;
  dejarRegiones(E, 0, 3);
  fijarTropas(E, c, 20); sumarUni(E, c, 0, 1, 10); sumarUni(E, c, 0, 2, 5); // 20 L, 10 A, 5 J
  regionesDe(E, 0).filter((r) => r !== c).forEach((r) => fijarTropas(E, r, 1)); // + 2 unidades sueltas: 37 en total, round(5.55) = 6 de perdida
  const antes = pilaDe(E, c, 0);
  eventosDelMundo(conEvento(E, 'peste'));
  const despues = pilaDe(E, c, 0);
  despues.forEach((n, t) => assert.ok(n >= 0 && n <= antes[t]));
  assert.deepEqual(antes.map((n, t) => n - despues[t]), [3, 2, 1, 0], 'pisos 3, 1 y 0 (suman 4); los 2 que faltan son para los mayores restos: Jinetes (0.75) y Arqueros (0.5)');
  assert.equal(totalUnidades(E, 0), 37 - 6);
});

test('Caravana: el reino con menos regiones recibe 6 Oro y 3 Caballos; con empate, todos los empatados', () => {
  const E = nuevoEstado(4);
  dejarRegiones(E, 2, 2);
  const antes = E.reinos.map((r) => [r.stock.Oro, r.stock.Caballos]);
  const ctx = conEvento(E, 'caravana');
  eventosDelMundo(ctx);
  E.reinos.forEach((r, s) => assert.deepEqual([r.stock.Oro, r.stock.Caballos], s === 2 ? [antes[s][0] + 6, antes[s][1] + 3] : antes[s]));
  assert.deepEqual(ctx.eventos.find((e) => e.evento === 'caravana').afectados, [{ k: 2 }]);
  const F = nuevoEstado(4);
  dejarRegiones(F, 1, 2); dejarRegiones(F, 3, 2);
  eventosDelMundo(conEvento(F, 'caravana'));
  assert.deepEqual([1, 3].map((s) => F.reinos[s].stock.Caballos), [3, 3]);
  assert.equal(F.reinos[0].stock.Caballos, 0);
});

test('un turno sin evento no pasa nada, y con los eventos apagados tampoco', () => {
  const E = nuevoEstado(4); E.calendario = [{ t: 5, tipo: 'peste' }];
  const antes = JSON.stringify(E.reinos.map((r) => r.stock)) + totalUnidades(E, 0);
  const ctx = contexto(E);
  eventosDelMundo(ctx);
  assert.deepEqual(ctx.eventos, []);
  assert.equal(JSON.stringify(E.reinos.map((r) => r.stock)) + totalUnidades(E, 0), antes);
  const F = nuevoEstado(4); F.calendario = [{ t: 1, tipo: 'peste' }];
  const ctx2 = contexto(F);
  sin(EVENTOS, () => eventosDelMundo(ctx2));
  assert.deepEqual(ctx2.eventos, []);
});

test('aplicarTurno aplica el evento y actualiza el Hegemon al cerrar: la instantanea trae los dos', () => {
  const E = nuevoEstado(4); E.calendario = [{ t: 1, tipo: 'sequia' }];
  repartir(E, [8, 5, 4, 3]);
  const reg = aplicarTurno(E, []);
  assert.ok(reg.eventos.some((e) => e.tipo === 'evento' && e.evento === 'sequia'));
  assert.ok(reg.eventos.some((e) => e.tipo === 'hegemon' && e.k === 0), 'el reino 0 pasa al 40 %');
  assert.equal(reg.estado.sequia, true, 'el turno 2 sigue en sequia');
  assert.equal(reg.estado.hegemon, 0);
});

// ---- Lo que ven las IAs ----

test('la vista anuncia el Hegemon, el evento de este turno y el Presagio del siguiente', () => {
  const E = nuevoEstado(4); E.hegemon = 2;
  E.calendario = [{ t: 1, tipo: 'peste' }, { t: 2, tipo: 'cosecha' }];
  const v = vistaTexto(E, 0);
  assert.ok(v.includes('Hegemon: Violeta'), v);
  assert.ok(v.includes('Evento de este turno: Peste.'));
  assert.ok(v.includes('Presagio: en el turno 2 habra Cosecha.'));
  assert.ok(!vistaTexto(nuevoEstado(4), 0).includes('Hegemon'), 'sin Hegemon no hay linea');
  assert.ok(!vistaTexto(nuevoEstado(4), 0).includes('Presagio') && !vistaTexto(nuevoEstado(4), 0).includes('Evento de este turno'));
  const F = nuevoEstado(4); F.calendario = [{ t: 5, tipo: 'sequia' }];
  F.turno = 2; assert.ok(!vistaTexto(F, 0).includes('Presagio'), 'en el turno 3 el siguiente evento queda lejos');
  F.turno = 3; assert.ok(vistaTexto(F, 0).includes('Presagio: en el turno 5 habra Sequia.'));
});

test('la vista le dice a cada reino su Reconquista y su Patria, solo a el', () => {
  const G = nuevoEstado(4), d = regionesDe(G, 1)[1];
  G.turno = 2; G.perdidas[d] = { k: 0, t: 1 }; dejarRegiones(G, 0, 2);
  const v0 = vistaTexto(G, 0), v1 = vistaTexto(G, 1);
  assert.ok(v0.includes(`Reconquista (+25% si atacas): ${R(d)} (hasta el turno 4)`), v0.split('\n').find((l) => l.startsWith('Reconquista')));
  assert.ok(v0.includes('Patria: tus regiones defienden con +25%'));
  assert.ok(!v1.includes('Reconquista') && !v1.includes('Patria'));
  G.turno = 4; assert.ok(!vistaTexto(G, 0).includes('Reconquista'), 'pasados los 3 turnos ya no se anuncia');
});

test('el resumen publico cuenta los eventos del mundo y los cambios de Hegemon', () => {
  const nombres = ['Azur', 'Ambar', 'Violeta', 'Rosa'];
  assert.deepEqual(resumenPublico([{ tipo: 'evento', evento: 'peste', afectados: [{ k: 0, n: 4 }], t: 5 }], nombres), ['Evento: Peste (Azur pierde 4 unidades)']);
  assert.deepEqual(resumenPublico([{ tipo: 'evento', evento: 'peste', afectados: [{ k: 0, n: 4 }, { k: 1, n: 4 }], t: 5 }], nombres), ['Evento: Peste (Azur pierde 4 unidades y Ambar pierde 4 unidades)']);
  assert.deepEqual(resumenPublico([{ tipo: 'evento', evento: 'caravana', afectados: [{ k: 2 }, { k: 3 }], t: 5 }], nombres), ['Evento: Caravana (Violeta y Rosa reciben 6 Oro y 3 Caballos)']);
  assert.deepEqual(resumenPublico([{ tipo: 'evento', evento: 'sequia', afectados: [], t: 5 }], nombres), ['Evento: Sequia (la cosecha base baja a la mitad 2 turnos)']);
  assert.deepEqual(resumenPublico([{ tipo: 'evento', evento: 'cosecha', afectados: [], t: 5 }], nombres), ['Evento: Cosecha (+1 Comida por region)']);
  assert.deepEqual(resumenPublico([{ tipo: 'hegemon', k: 1, t: 5 }, { tipo: 'hegemon_fin', k: 1, t: 6 }], nombres), ['Ambar es ahora el Hegemon', 'Ambar deja de ser el Hegemon']);
});

test('instantanea trae hegemon y sequia', () => {
  const E = nuevoEstado(4); E.hegemon = 3; E.sequiaHasta = 5; E.turno = 4;
  const i = instantanea(E);
  assert.equal(i.hegemon, 3);
  assert.equal(i.sequia, true);
  E.turno = 5;
  assert.equal(instantanea(E).sequia, false, 'el turno 6 ya no');
});
