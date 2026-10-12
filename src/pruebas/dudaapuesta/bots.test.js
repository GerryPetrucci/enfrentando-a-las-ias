// Las estrategias de control de Duda y apuesta: siempre legales, deterministas, sin modificar el estado y distintas entre si.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearRng } from '../../rng.js';
import { BOTS, INFO_BOTS } from '../../juegos/dudaapuesta-bots.js';
import { actorDe } from '../../juegos/dudaapuesta/estado.js';
import { normalizarRespuesta } from '../../juegos/dudaapuesta/ordenes.js';
import { aplicarTurno } from '../../juegos/dudaapuesta/turno.js';
import { narrarEpilogo } from '../../juegos/dudaapuesta/narracion.js';
import { nuevoEstado, jugarConBots } from './ayudas.js';

const NOMBRES = ['azar', 'calculador', 'farolero', 'retador', 'prudente'];
const mesa = (seed, desplazo = 0) => [0, 1, 2, 3].map((k) => BOTS[NOMBRES[(seed + k + desplazo) % 5]]);

test('hay cinco bots, cada uno con nombre publico y color', () => {
  assert.deepEqual(Object.keys(BOTS).sort(), [...NOMBRES].sort());
  for (const id of NOMBRES) {
    assert.equal(typeof BOTS[id], 'function');
    assert.ok(INFO_BOTS[id].nombre && /^#[0-9A-F]{6}$/i.test(INFO_BOTS[id].color), id);
  }
});

test('todos los bots juegan siempre legal: 0 respuestas de reemplazo en 300 partidas, y nunca pasan de 96 turnos', () => {
  let turnos = 0, maximo = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const { E, registros } = jugarConBots(seed, mesa(seed));
    assert.equal(E.fin, true, `seed ${seed}`);
    for (const r of registros) assert.ok(r.invalidas.every((x) => x !== true), `seed ${seed} mano ${r.mano}: ${r.motivos.find(Boolean)}`);
    turnos += registros.length;
    maximo = Math.max(maximo, registros.length);
  }
  assert.ok(maximo <= 96, `una partida de ${maximo} turnos`);
  assert.ok(turnos / 300 > 5, 'las partidas no son triviales');
});

test('un bot no modifica el estado: lo ve completo pero solo lo lee (ni siquiera cuando no es su turno)', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const E = nuevoEstado(seed);
    const rngs = [0, 1, 2, 3].map((k) => crearRng(seed + k));
    const fns = mesa(seed);
    while (!E.fin) {
      const antes = JSON.stringify(E);
      for (let k = 0; k < 4; k++) fns[k](E, k, rngs[k]);
      assert.equal(JSON.stringify(E), antes, `seed ${seed} mano ${E.mano}`);
      const k = actorDe(E), r = Array(4).fill(null);
      r[k] = normalizarRespuesta(fns[k](E, k, rngs[k]));
      aplicarTurno(E, r);
    }
  }
});

test('el mismo seed y los mismos bots dan la misma partida; el azar solo usa el rng que recibe', () => {
  const a = jugarConBots(11, mesa(11)), b = jugarConBots(11, mesa(11));
  assert.deepEqual(a.registros.map((r) => [r.accion, r.apuesta, r.anuncio]), b.registros.map((r) => [r.accion, r.apuesta, r.anuncio]));
  const E = nuevoEstado();
  const u = crearRng(5), v = crearRng(5);
  assert.deepEqual(BOTS.azar(E, 0, u), BOTS.azar(E, 0, v));
});

test('el azar de vez en cuando pide comprar un espacio (para ejercitar esa regla)', () => {
  const E = nuevoEstado();
  const rng = crearRng(3);
  const pidio = Array.from({ length: 200 }, () => BOTS.azar(E, 0, rng)).filter((r) => r.comprar_espacio).length;
  assert.ok(pidio > 5 && pidio < 60, `${pidio} de 200`);
});

// Las estrategias se distinguen de verdad (con muchas partidas, para no depender de la suerte).
function tasas(nombre, rival = 'calculador', partidas = 400) {
  const t = { anuncios: 0, falsos: 0, dudas: 0, respuestas: 0, ganadas: 0, elim: 0, pieza: 0 };
  for (let seed = 1; seed <= partidas; seed++) {
    const fns = [BOTS[nombre], BOTS[rival], BOTS[rival], BOTS[rival]];
    const { E } = jugarConBots(seed, fns);
    const st = E.stats[0];
    t.anuncios += st.anuncios; t.falsos += st.anunciosFalsos; t.dudas += st.dudas; t.ganadas += st.dudasGanadas;
    if (E.puesto[0] === 'eliminado') t.elim++;
    if (E.puesto[0] === 'pieza') t.pieza++;
  }
  return { ...t, farol: t.falsos / Math.max(1, t.anuncios), ojo: t.ganadas / Math.max(1, t.dudas), elim: t.elim / partidas, pieza: t.pieza / partidas, dudas: t.dudas / partidas };
}

test('el farolero hace mas faroles que el prudente; el retador duda mas; el calculador duda con mas ojo que el azar', () => {
  const farolero = tasas('farolero'), prudente = tasas('prudente'), retador = tasas('retador'), calculador = tasas('calculador'), azar = tasas('azar');
  assert.ok(farolero.farol > prudente.farol + 0.2, `farol ${farolero.farol} contra ${prudente.farol}`);
  assert.ok(retador.dudas > prudente.dudas, `dudas por partida ${retador.dudas} contra ${prudente.dudas}`);
  assert.ok(calculador.ojo > azar.ojo + 0.1, `ojo ${calculador.ojo} contra ${azar.ojo}`);
});

test('el calculador rinde mas que el azar: lo eliminan menos y gana la pieza mas', () => {
  const calculador = tasas('calculador', 'azar', 400), azar = tasas('azar', 'azar', 400);
  assert.ok(calculador.elim < azar.elim - 0.1, `eliminado ${calculador.elim} contra ${azar.elim}`);
  assert.ok(calculador.pieza > azar.pieza + 0.1, `pieza ${calculador.pieza} contra ${azar.pieza}`);
});

const sumaFichas = (E) => E.fichas.reduce((a, b) => a + b, 0) + E.fichasEspacio.reduce((a, b) => a + b, 0);

test('en cualquier partida entre bots las fichas se conservan salvo el pago a la banca, y nadie queda con menos de 0 fichas de espacio ni mas de 4', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const { registros } = jugarConBots(seed, [BOTS.azar, BOTS.calculador, BOTS.farolero, BOTS.retador]);
    assert.ok(registros.length > 0);
    let antes = sumaFichas(nuevoEstado(seed)); // 4 x (3 + 4) = 28
    for (const r of registros) {
      assert.ok(r.fichas.every((x) => x >= 0));
      assert.ok(r.fichasEspacio.every((x) => x >= 0 && x <= 4));
      const ahora = r.fichas.reduce((a, b) => a + b, 0) + r.fichasEspacio.reduce((a, b) => a + b, 0);
      assert.equal(ahora, antes - (r.pago ? 4 : 0), `seed ${seed} mano ${r.mano}`);
      antes = ahora;
    }
  }
});


test('en 60 partidas de bots: toda la historia es texto con nombres {0}-{3}, sin "undefined", sin NaN y sin palabras duras', () => {
  const DURAS = /delat|abandon|traici|traidor|culpa|rompi|mentir|miente|mintio|engan/i;
  const nombres = ['azar', 'calculador', 'farolero', 'retador', 'prudente'];
  let lineas = 0, comentarios = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const { E, registros } = jugarConBots(seed, [0, 1, 2, 3].map((k) => BOTS[nombres[(seed + k) % 5]]));
    for (const l of [...registros.flatMap((r) => r.narracion), ...narrarEpilogo(E)]) {
      lineas++;
      if (l.tipo === 'comentario') comentarios++;
      assert.ok(['apertura', 'hecho', 'comentario', 'epilogo'].includes(l.tipo), l.tipo);
      assert.equal(typeof l.texto, 'string');
      assert.doesNotMatch(l.texto, /undefined|NaN|\[object|\{[4-9]\}|\{\}/);
      assert.doesNotMatch(l.texto, DURAS);
    }
    assert.ok(registros.every((r) => r.narracion.length >= 1), 'cada turno aporta al menos una linea');
  }
  assert.ok(lineas > 500 && comentarios > 30, `${lineas} lineas, ${comentarios} comentarios`);
});

