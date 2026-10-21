// Mayor o menor, reglas 2.0.0 (21 de octubre de 2026): cuatro cambios para que cualquiera pueda ganar (privado/spec/mayor-o-menor-balance.md y -medicion.md).
//   tope: nadie apuesta mas de 6 fichas en una ronda       B. carta igual cuenta como «menor» (se acaba el escudo del empate)
//   C. mano oculta: mazo de 33 cartas, cada jugador recibe 11 al azar en secreto     D. tres rondas dobles sorteadas (las ganancias se pagan al doble)
// Las reglas 1.0.0 siguen existiendo como configuracion (REGLAS_1_0): las pruebas del motor general las usan, y los bots miden cada cambio por separado.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearRng } from '../../rng.js';
import { crearEstado, apuestaMaxima, mazoCompleto, cartasDesconocidas } from '../../juegos/mayormenor/estado.js';
import { REGLAS_1_0, REGLAS_2_0, REGLAS_ACTIVAS, BANDAS_DOBLES, COPIAS_MAZO, CARTAS, RONDAS, FICHAS, TOPE_APUESTA } from '../../juegos/mayormenor/constantes.js';
import { aplicarTurno } from '../../juegos/mayormenor/turno.js';
import { normalizarRespuesta } from '../../juegos/mayormenor/ordenes.js';
import { activoDe } from '../../juegos/mayormenor/constantes.js';
import { fijarCrupier } from './ayudas.js';
import { vistaTexto } from '../../juegos/mayormenor/vista.js';

const estado = (seed = 7, reglas = REGLAS_2_0) => crearEstado(crearRng(seed), reglas);
const cuenta = (xs) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map());

// Una ronda con jugadas fijas sobre un estado ya armado (la carta del activo debe estar en su mano).
function ronda(E, { crupier, carta, lado, fichas }) {
  if (crupier !== undefined) fijarCrupier(E, crupier);
  const a = activoDe(E.ronda), p = 1 - a;
  const r = [null, null];
  r[a] = normalizarRespuesta({ carta, razon: 'prueba' });
  r[p] = normalizarRespuesta({ lado, fichas, razon: 'prueba' });
  return aplicarTurno(E, r);
}
// Deja la mano del activo con una carta conocida (la mano oculta es al azar).
const darCarta = (E, s, carta) => { if (!E.mano[s].includes(carta)) E.mano[s][0] = carta; };
// Salta a la ronda r sin jugar las anteriores (solo para probar una ronda concreta).
const irARonda = (E, r) => { E.ronda = r; };

test('las reglas 2.0.0 son las activas y las 1.0.0 siguen disponibles para medir', () => {
  assert.deepEqual({ ...REGLAS_2_0 }, { version: 'mayormenor-2.0.0', topeFijo: 6, igualEsMenor: true, manoOculta: true, dobles: 3, topeRival: false });
  assert.deepEqual({ ...REGLAS_1_0 }, { version: 'mayormenor-1.0.0', topeFijo: 0, igualEsMenor: false, manoOculta: false, dobles: 0, topeRival: false });
  assert.equal(TOPE_APUESTA, 6);
  assert.equal(FICHAS, 10);
  assert.equal(RONDAS, 18);
  assert.equal(REGLAS_ACTIVAS, REGLAS_2_0);
  assert.equal(crearEstado(crearRng(1)).reglas, REGLAS_2_0, 'sin pedir reglas, las activas');
  assert.ok(Object.isFrozen(REGLAS_2_0) && Object.isFrozen(REGLAS_1_0));
});

test('C: el mazo tiene 3 copias de cada carta; cada jugador recibe 11 al azar y en secreto, distintas por seed y siempre iguales con el mismo', () => {
  const mazo = mazoCompleto(REGLAS_2_0);
  assert.equal(mazo.length, 11 * COPIAS_MAZO);
  for (const c of CARTAS) assert.equal(mazo.filter((x) => x === c).length, COPIAS_MAZO);
  const manos = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const E = estado(seed);
    assert.equal(E.mano[0].length, 11);
    assert.equal(E.mano[1].length, 11);
    const juntas = cuenta([...E.mano[0], ...E.mano[1]]);
    for (const [c, n] of juntas) assert.ok(n <= COPIAS_MAZO, `seed ${seed}: la carta ${c} sale ${n} veces`);
    assert.deepEqual([...E.mano[0]], [...E.mano[0]].sort((a, b) => a - b), 'ordenadas para leerse');
    manos.add(E.mano[0].join());
  }
  assert.ok(manos.size > 20, 'otro seed, otra mano');
  assert.deepEqual(estado(5).mano, estado(5).mano);
  assert.notDeepEqual(estado(5).mano[0], estado(5).mano[1]);
});

test('sin mano oculta (reglas 1.0.0) cada jugador sigue con las 11 cartas del 0 al 10, y el crupier y los sorteos son los mismos con o sin las reglas nuevas', () => {
  const v1 = estado(9, REGLAS_1_0), v2 = estado(9, REGLAS_2_0);
  assert.deepEqual(v1.mano, [CARTAS, CARTAS]);
  assert.deepEqual(v1.dobles, []);
  assert.deepEqual(v1.crupier, v2.crupier, 'las reglas nuevas se sortean DESPUES: el mundo de un seed no cambia');
  assert.deepEqual(v1.azar, v2.azar);
  assert.equal(v1.semillaNarracion, v2.semillaNarracion);
});

test('D: tres rondas dobles, una por franja, sorteadas con el seed (nunca la 1 ni la 2)', () => {
  assert.deepEqual(BANDAS_DOBLES, [[3, 6], [8, 12], [14, 18]]);
  const vistas = new Set();
  for (let seed = 1; seed <= 60; seed++) {
    const d = estado(seed).dobles;
    assert.equal(d.length, 3, `seed ${seed}`);
    d.forEach((r, i) => assert.ok(r >= BANDAS_DOBLES[i][0] && r <= BANDAS_DOBLES[i][1], `seed ${seed}: ronda ${r} fuera de su franja`));
    assert.ok(d.every((r) => r >= 3 && r <= RONDAS));
    vistas.add(d.join());
  }
  assert.ok(vistas.size > 15, 'cambian de un seed a otro');
  assert.deepEqual(estado(4).dobles, estado(4).dobles);
});

test('tope: nadie apuesta mas de 6 fichas en una ronda, tenga las que tenga: pedir mas es apostar el tope (y queda anotado)', () => {
  const E = estado(2);
  E.fichas = [30, 20]; // ronda 1: activo el 0, predictor el 1 con 20 fichas
  assert.equal(apuestaMaxima(E, 1), 6);
  darCarta(E, 0, 1);
  const reg = ronda(E, { crupier: 5, carta: 1, lado: 'menor', fichas: 15 });
  assert.equal(reg.apuesta, 6, 'pidio 15, el tope es 6');
  assert.equal(reg.apostoTodo, true, 'apostar todo es apostar lo maximo permitido');
  assert.equal(reg.apuestaMaxima, 6);
  assert.equal(reg.ganaPredictor, 6);
  assert.deepEqual(reg.fichas, [30, 26]);
});

test('tope: con menos fichas que el tope se apuesta como mucho todo lo que se tiene; sin tope (reglas 1.0.0) se apuesta todo', () => {
  const E = estado(2);
  E.fichas = [30, 4];
  assert.equal(apuestaMaxima(E, 1), 4, 'las fichas que tiene');
  const v1 = estado(2, REGLAS_1_0);
  v1.fichas = [30, 20];
  assert.equal(apuestaMaxima(v1, 1), 20, 'en las reglas 1.0.0 no hay tope');
});

test('topeRival (solo para medir; el juego no lo usa): nadie apuesta mas fichas de las que tiene su rival, ademas del tope fijo', () => {
  const E = estado(2, { ...REGLAS_2_0, topeFijo: 0, topeRival: true });
  E.fichas = [4, 10]; // el predictor (asiento 1) tiene 10 y su rival 4
  assert.equal(apuestaMaxima(E, 1), 4);
  const F = estado(2, { ...REGLAS_2_0, topeRival: true });
  F.fichas = [30, 20];
  assert.equal(apuestaMaxima(F, 1), 6, 'el tope fijo sigue valiendo');
  F.fichas = [3, 20];
  assert.equal(apuestaMaxima(F, 1), 3);
});

test('B: la carta igual cuenta como «menor»: gana quien aposto menor, pierde quien aposto mayor, y el activo no gana nada', () => {
  const E = estado(3);
  darCarta(E, 0, 5);
  const reg = ronda(E, { crupier: 5, carta: 5, lado: 'menor', fichas: 3 });
  assert.equal(reg.veredicto, 'menor');
  assert.equal(reg.igual, true);
  assert.equal(reg.acierto, true);
  assert.equal(reg.ganaPredictor, 3);
  assert.equal(reg.ganaActivo, 0);
  const F = estado(3);
  darCarta(F, 0, 5);
  const reg2 = ronda(F, { crupier: 5, carta: 5, lado: 'mayor', fichas: 3 });
  assert.equal(reg2.acierto, false);
  assert.equal(reg2.ganaPredictor, -3);
  assert.deepEqual(reg2.fichas, [10, 7]);
});

test('B: en las reglas 1.0.0 la carta igual sigue devolviendo la apuesta', () => {
  const E = crearEstado(crearRng(3), REGLAS_1_0);
  const reg = ronda(E, { crupier: 5, carta: 5, lado: 'menor', fichas: 3 });
  assert.equal(reg.veredicto, 'igual');
  assert.equal(reg.igual, true);
  assert.equal(reg.acierto, null);
  assert.deepEqual(reg.fichas, [10, 10]);
});

test('con cartas repetidas en la mano, jugar una solo retira esa copia (con la mano oculta hay hasta 3 iguales)', () => {
  const E = estado(3);
  E.mano[0] = [2, 5, 5, 5, 7, 8, 9, 9, 10, 10, 10];
  const antes = E.mano[0].length;
  const reg = ronda(E, { crupier: 3, carta: 5, lado: 'mayor', fichas: 1 });
  assert.equal(E.mano[0].length, antes - 1);
  assert.deepEqual(E.mano[0], [2, 5, 5, 7, 8, 9, 9, 10, 10, 10]);
  assert.deepEqual(reg.mano[0], E.mano[0]);
  assert.deepEqual(E.jugadas[0], [5]);
});

test('una carta distinta de la del crupier no es «igual»', () => {
  const E = estado(3);
  darCarta(E, 0, 8);
  assert.equal(ronda(E, { crupier: 5, carta: 8, lado: 'mayor', fichas: 1 }).igual, false);
});

test('D: en una ronda doble las ganancias se pagan al doble (la del activo y la del predictor que acierta) y lo que se pierde no se duplica', () => {
  const E = estado(6);
  const r = E.dobles[0];
  irARonda(E, r);
  const a = activoDe(r), p = 1 - a;
  darCarta(E, a, 9);
  const gana = ronda(E, { crupier: 4, carta: 9, lado: 'mayor', fichas: 3 });
  assert.equal(gana.doble, 2);
  assert.equal(gana.ganaActivo, 10, '(9 - 4) x 2');
  assert.equal(gana.ganaPredictor, 6, '3 x 2');
  assert.equal(gana.fichas[a], 20);
  assert.equal(gana.fichas[p], 16);
  const F = estado(6);
  irARonda(F, r);
  darCarta(F, a, 9);
  const pierde = ronda(F, { crupier: 4, carta: 9, lado: 'menor', fichas: 3 });
  assert.equal(pierde.ganaPredictor, -3, 'perder cuesta lo apostado, no el doble');
  assert.equal(pierde.ganaActivo, 10);
});

test('una ronda que no es doble paga normal y lo dice (doble: 1)', () => {
  const E = estado(6);
  const normal = [1, 2, 3, 4, 5, 6].find((r) => !E.dobles.includes(r));
  irARonda(E, normal);
  const a = activoDe(normal);
  darCarta(E, a, 9);
  const reg = ronda(E, { crupier: 4, carta: 9, lado: 'mayor', fichas: 3 });
  assert.equal(reg.doble, 1);
  assert.equal(reg.ganaActivo, 5);
  assert.equal(reg.ganaPredictor, 3);
});

test('las reglas 1.0.0 nunca tienen rondas dobles', () => {
  const E = crearEstado(crearRng(6), REGLAS_1_0);
  for (let r = 1; r <= 6; r++) { irARonda(E, r); assert.equal(ronda(E, { crupier: 4, carta: 9, lado: 'mayor', fichas: 1 }).doble, 1); E.fin = false; }
});

// ---- la vista (lo que ve cada IA): INVARIANTE 2, nunca filtra lo secreto ----
test('C: la vista no muestra la mano del rival, solo cuantas cartas le quedan, las que ya jugo y las que se desconocen', () => {
  const E = estado(8);
  const v = vistaTexto(E, 0);
  assert.match(v, new RegExp(`Tus cartas: ${E.mano[0].join(' ')}`));
  assert.doesNotMatch(v, /Cartas que le quedan a tu rival:/);
  assert.match(v, /A tu rival le quedan 11 cartas \(no sabes cuales\)/);
  assert.match(v, /Cartas que tu rival ya jugo: \(ninguna\)/);
  assert.match(v, /Cartas desconocidas:/);
  assert.match(v, new RegExp(`Cartas desconocidas: ${cartasDesconocidas(E, 0).join(' ')}`));
  E.fichas = [10, 10];
  const reg = ronda(E, { crupier: 5, carta: E.mano[0][3], lado: 'mayor', fichas: 1 });
  const despues = vistaTexto(E, 1);
  assert.match(despues, new RegExp(`Cartas que tu rival ya jugo: ${reg.carta}`));
  assert.match(despues, /A tu rival le quedan 10 cartas/);
});

test('C: no interferencia: cambiar la mano del rival (que no se ve) no cambia la vista de nadie que no deba verla; cambiar la propia si', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const E = estado(seed), F = estado(seed);
    F.mano[1] = [...F.mano[1]].reverse().map((c) => (c + 1) % 11); // otra mano del asiento 1 (lo que el asiento 0 no sabe)
    assert.equal(vistaTexto(E, 0), vistaTexto(F, 0), `seed ${seed}: el asiento 0 no puede ver la mano del 1`);
    assert.notEqual(vistaTexto(E, 1), vistaTexto(F, 1), 'pero su dueno si ve su mano');
  }
});

test('C: las cartas desconocidas que muestra la vista no dependen de lo que el rival conserve, solo de lo que ya jugo', () => {
  const E = estado(12);
  ronda(E, { crupier: 3, carta: E.mano[0][5], lado: 'mayor', fichas: 1 });
  const antes = vistaTexto(E, 0);
  const F = estado(12);
  F.mano[1] = F.mano[1].map((c) => (c === 10 ? 0 : c)); // otra mano del rival
  ronda(F, { crupier: 3, carta: F.mano[0][5], lado: 'mayor', fichas: 1 });
  assert.equal(vistaTexto(F, 0), antes);
});

test('D: la vista dice cuales son las rondas dobles desde el principio y marca la ronda que lo es', () => {
  const E = estado(5);
  const [d1, d2, d3] = E.dobles;
  assert.match(vistaTexto(E, 0), new RegExp(`RONDAS DOBLES de esta partida: ${d1}, ${d2} y ${d3}`));
  assert.doesNotMatch(vistaTexto(E, 0), /ESTA RONDA ES DOBLE/);
  irARonda(E, d2);
  assert.match(vistaTexto(E, 0), /ESTA RONDA ES DOBLE/);
  assert.doesNotMatch(vistaTexto(estado(5, REGLAS_1_0), 0), /DOBLE/);
});

test('tope: el predictor ve cuanto puede apostar como maximo, y la instruccion lo usa', () => {
  const E = estado(5);
  E.fichas = [30, 20]; // ronda 1: predictor el asiento 1
  const v = vistaTexto(E, 1);
  assert.match(v, /Puedes apostar como maximo 6 fichas \(tus fichas, sin pasar del tope de 6 por ronda\)/);
  assert.match(v, /"fichas" \(un entero de 1 a 6; si pides mas, apuestas 6\)/);
  E.fichas = [30, 4];
  assert.match(vistaTexto(E, 1), /Puedes apostar como maximo 4 fichas/);
  assert.match(vistaTexto(E, 1), /"fichas" \(un entero de 1 a 4; si pides mas, apuestas 4\)/);
  assert.doesNotMatch(vistaTexto(E, 0), /Puedes apostar como maximo/, 'el activo no apuesta');
  const v1 = estado(5, REGLAS_1_0);
  assert.doesNotMatch(vistaTexto(v1, 1), /como maximo/);
});

test('B: el historial dice cuando la carta fue igual y cuenta como menor, y marca las rondas dobles', () => {
  const E = estado(6);
  darCarta(E, 0, 5);
  ronda(E, { crupier: 5, carta: 5, lado: 'menor', fichas: 2 });
  assert.match(vistaTexto(E, 1), /jugo 5 \(menor por ser igual\)/);
  const F = estado(6);
  irARonda(F, F.dobles[0]);
  const a = activoDe(F.ronda);
  darCarta(F, a, 9);
  ronda(F, { crupier: 4, carta: 9, lado: 'mayor', fichas: 2 });
  assert.match(vistaTexto(F, 0), /\[DOBLE\]/);
});

// ---- la narracion y el prompt completo ----
const textos = (reg) => reg.narracion.map((l) => l.texto).join(' | ');

test('la narracion de una ronda doble la anuncia y cuenta las ganancias al doble', () => {
  const E = estado(6);
  irARonda(E, E.dobles[0]);
  const a = activoDe(E.ronda);
  darCarta(E, a, 9);
  const reg = ronda(E, { crupier: 4, carta: 9, lado: 'mayor', fichas: 3 });
  const t = textos(reg);
  assert.match(t, /Ronda doble/);
  assert.match(t, /gana 10 fichas/, 'el activo: (9 - 4) x 2');
  assert.match(t, /gana 6 fichas/, 'el predictor: 3 x 2');
  assert.ok(reg.narracion.some((l) => l.tipo === 'comentario' && /doble/i.test(l.texto)), 'la voz lo dice');
  assert.doesNotMatch(t, /undefined|NaN/);
});

test('la narracion de una ronda normal no habla de doble', () => {
  const E = estado(6);
  const normal = [1, 2].find((r) => !E.dobles.includes(r));
  irARonda(E, normal);
  darCarta(E, activoDe(normal), 9);
  assert.doesNotMatch(textos(ronda(E, { crupier: 4, carta: 9, lado: 'mayor', fichas: 3 })), /doble/i);
});

test('la narracion de una carta igual dice que cuenta como menor (reglas 2.0.0) y ya no dice que la apuesta se devuelve', () => {
  const E = estado(3);
  darCarta(E, 0, 5);
  const t = textos(ronda(E, { crupier: 5, carta: 5, lado: 'menor', fichas: 3 }));
  assert.match(t, /igual que el crupier/);
  assert.match(t, /cuenta como menor/);
  assert.doesNotMatch(t, /se devuelve/);
  assert.match(t, /acierta y gana 3 fichas/);
});

test('una apuesta al tope NO lleva comentario de la voz (con el tope de 6 casi todas lo son: repetirlo cada ronda cansa), y no dice que lo apuesta todo si el tope se lo impide', () => {
  const E = estado(2);
  E.fichas = [30, 20];
  darCarta(E, 0, 1);
  const reg = ronda(E, { crupier: 5, carta: 1, lado: 'menor', fichas: 15 });
  const t = textos(reg);
  assert.match(t, /apuesta 6 fichas/);
  assert.equal(reg.apostoTodo, true, 'el registro si lo anota (la mesa muestra «¡Máximo!»)');
  assert.doesNotMatch(t, /máximo permitido/, 'ya no se dice en voz alta');
  assert.doesNotMatch(t, /lo apuesta todo/, 'no apuesta todo lo suyo: el tope se lo impide');
});

test('apostar TODAS sus fichas (cuando tiene menos que el tope) si es un momento: la voz dice «lo apuesta todo»', () => {
  const E = estado(2);
  E.fichas = [30, 4];
  darCarta(E, 0, 1);
  const reg = ronda(E, { crupier: 5, carta: 1, lado: 'menor', fichas: 9 });
  assert.equal(reg.apuesta, 4);
  assert.ok(reg.narracion.some((l) => l.tipo === 'comentario' && /lo apuesta todo/.test(l.texto)));
});

test('el prompt completo de las reglas 2.0.0 en el peor caso (ronda 18, con mano oculta y 17 rondas de historial) cabe en el tope de tokens', async () => {
  const { jugarConBots } = await import('./ayudas.js');
  const { BOTS } = await import('../../juegos/mayormenor-bots.js');
  const { REGLAS, FORMATO } = await import('../../juegos/mayormenor/reglas-texto.js');
  const { construirSistema, construirUsuario } = await import('../../prompt.js');
  const { E } = jugarConBots(5, [BOTS.prudente, BOTS.azar], { hasta: 17, reglas: REGLAS_2_0 });
  assert.equal(E.ronda, 18);
  const total = construirSistema({ nombre: 'Mayor o menor', reglas: REGLAS, formatoRespuesta: FORMATO }).length + construirUsuario(vistaTexto(E, 0)).length;
  const tokens = total / 1.97; // Claude en espanol
  assert.ok(tokens <= 3500, `entrada de ${Math.round(tokens)} tokens (tope 3500)`);
});

// ---- los bots de control con las reglas 2.0.0 ----
test('ningun bot lee la mano oculta del rival: cambiarla no cambia lo que responde (los 6 bots, los dos asientos, 12 seeds)', async () => {
  const { BOTS } = await import('../../juegos/mayormenor-bots.js');
  for (const [id, bot] of Object.entries(BOTS)) {
    for (let seed = 1; seed <= 12; seed++) {
      for (const s of [0, 1]) {
        const E = estado(seed), F = estado(seed);
        F.mano[1 - s] = F.mano[1 - s].map((c) => (c + 3) % 11);
        assert.deepEqual(bot(E, s, crearRng(5)), bot(F, s, crearRng(5)), `${id}, seed ${seed}, asiento ${s}`);
      }
    }
  }
});

test('con las reglas 2.0.0 todos los bots juegan legal: 20 partidas de todos contra todos sin respuestas invalidas ni apuestas sobre el tope', async () => {
  const { BOTS } = await import('../../juegos/mayormenor-bots.js');
  const { jugarConBots } = await import('./ayudas.js');
  const ids = Object.keys(BOTS);
  assert.ok(ids.includes('astuto'));
  for (const x of ids) for (const y of ids) {
    for (let seed = 1; seed <= 20; seed++) {
      const { registros } = jugarConBots(seed, [BOTS[x], BOTS[y]], { reglas: REGLAS_2_0 });
      for (const r of registros) {
        assert.deepEqual(r.invalidas, [false, false], `${x} contra ${y}, seed ${seed}, ronda ${r.ronda}: ${r.motivos}`);
        assert.ok(r.apuesta <= r.apuestaMaxima, 'nunca mas del tope');
      }
    }
  }
});

test('cartasDesconocidas: lo que no es tuyo ni lo ha jugado tu rival (de ahi sale el resto de su mano); con la mano publica no hay nada desconocido', () => {
  const E = estado(11);
  const mias = E.mano[0];
  const desc = cartasDesconocidas(E, 0);
  assert.equal(desc.length, 33 - 11, 'el mazo sin mi mano: 22 cartas, de las que 11 son de mi rival y 11 no se usan');
  const todas = cuenta([...mias, ...desc]);
  for (const c of CARTAS) assert.equal(todas.get(c), COPIAS_MAZO, `la carta ${c}`);
  E.jugadas[1].push(E.mano[1].shift());
  assert.equal(cartasDesconocidas(E, 0).length, 21, 'una carta jugada por el rival deja de ser desconocida');
  assert.deepEqual(cartasDesconocidas(estado(11, REGLAS_1_0), 0), [], 'con la mano publica no se desconoce nada');
});
