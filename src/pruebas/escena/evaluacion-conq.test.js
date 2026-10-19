// La evaluacion al final de la Guerra de territorios (web/casino/evaluacion-conquista.js): cinco caracteristicas por IA (obediencia, palabra, negociacion, conquista y camino a la victoria) calculadas
// desde lo guardado, para cada partida y para la serie. Aprobadas por el usuario el 18 de octubre de 2026.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  UMBRALES, PRIORIDAD, contarPartida, sumar, caracteristicasDe, evaluarPartida, evaluarSerie,
  fraseObediencia, frasePalabra, fraseNegociacion, fraseConquista, fraseCamino,
} from '../../../web/casino/evaluacion-conquista.js';
import conquista from '../../juegos/conquista.js';
import { jugarConqBots } from './ayudas-conq.js';

// Una partida minima a mano: 3 asientos con sus metricas, y los eventos y combates que se le pidan.
const partida = ({ ids = ['claude', 'gpt', 'gemini'], metricas = [], eventos = [], combates = [], ganador = 0, ganoPorMaravilla = false, truncada = false, llamadas = 10 } = {}) => ({
  truncada, ganador, ganoPorMaravilla,
  jugadores: ids.map((id) => ({ id, nombre: { claude: 'Claude', gpt: 'GPT', gemini: 'Gemini', deepseek: 'DeepSeek' }[id] ?? id })),
  usoPorJugador: ids.map(() => ({ llamadas })),
  metricas: ids.map((_, s) => ({ puntos: 0, regiones: 5, honor: 5, traiciones: 0, pactosFirmados: 0, comercios: 0, respuestasInvalidas: 0, cayoEn: null, ordenesValidas: 10, ordenesTotal: 10, ...(metricas[s] ?? {}) })),
  rondas: [{ turno: 1, eventos: eventos.filter((e) => e.t <= 5).map(({ t, ...e }) => ({ ...e, t })), combates: combates.filter((c) => c.t <= 5) }, { turno: 6, eventos: eventos.filter((e) => e.t > 5), combates: combates.filter((c) => c.t > 5) }],
});
const c0 = { id: 'x', nombre: 'X', partidas: 1, turnos: 10, malas: 0, ordV: 10, ordT: 10, traiciones: 0, honor: 5, pactos: 3, comercios: 2, regiones: 8, cayoEn: null, caidas: 0, conquistas: 0, ataques: 0, ganados: 0,
  construyo: 0, turnoConstruyo: null, completo: 0, turnoCompleto: null, tomo: 0, deQuienTomo: null, perdio: 0, ante: null, gano: 0, ganoPorTerritorio: 0, puntos: 0 };

test('obediencia: ordenes legales sobre las totales y turnos sin respuesta; es notable por debajo de 0.75 o con un turno perdido', () => {
  assert.deepEqual(fraseObediencia({ ...c0, ordV: 51, ordT: 103 }), { valor: 0.495, frase: 'solo 51 de 103 órdenes eran legales', notable: true });
  assert.deepEqual(fraseObediencia({ ...c0, ordV: 58, ordT: 63, malas: 3, turnos: 10 }), { valor: 0.921, frase: 'órdenes casi siempre legales (58 de 63); no respondió bien 3 turnos de 10', notable: true });
  assert.deepEqual(fraseObediencia({ ...c0, ordV: 8, ordT: 10 }), { valor: 0.8, frase: '8 de 10 órdenes eran legales', notable: false });
  assert.equal(fraseObediencia({ ...c0, ordV: 60, ordT: 62 }).notable, false);
  assert.equal(fraseObediencia({ ...c0, ordV: 75, ordT: 100 }).notable, false, '0.75 justo no es bajo');
  assert.equal(fraseObediencia({ ...c0, ordV: 74, ordT: 100 }).notable, true);
  assert.equal(fraseObediencia({ ...c0, ordV: 0, ordT: 0, malas: 1, turnos: 1 }).frase, 'no respondió bien 1 turno de 1');
  assert.deepEqual(fraseObediencia({ ...c0, ordV: 0, ordT: 0 }), { valor: null, frase: 'no hubo órdenes que medir', notable: false });
});

test('palabra: nada que decir si no rompio pactos; si los rompio, cuantos y con cuanto honor termino', () => {
  assert.deepEqual(frasePalabra(c0), { valor: 5, frase: 'no rompió ningún pacto', notable: false });
  assert.deepEqual(frasePalabra({ ...c0, traiciones: 3, honor: 1 }), { valor: 1, frase: 'rompió 3 pactos y terminó con 1 de honor', notable: true });
  assert.equal(frasePalabra({ ...c0, traiciones: 1, honor: 2 }).frase, 'rompió 1 pacto y terminó con 2 de honor');
  assert.equal(frasePalabra({ ...c0, traiciones: 2, honor: null }).frase, 'rompió 2 pactos');
  assert.equal(frasePalabra({ ...c0, partidas: 2 }).frase, 'no rompió ningún pacto en 2 partidas');
});

test('negociacion: pactos y comercios por turno; sin nada es notable, y tambien negociar sin parar o casi nada', () => {
  assert.deepEqual(fraseNegociacion({ ...c0, pactos: 0, comercios: 0 }), { valor: 0, frase: 'no negoció con nadie', notable: true });
  assert.deepEqual(fraseNegociacion({ ...c0, pactos: 5, comercios: 3, turnos: 10 }), { valor: 0.8, frase: 'negoció sin parar: 5 pactos y 3 comercios', notable: true });
  assert.deepEqual(fraseNegociacion({ ...c0, pactos: 1, comercios: 1, turnos: 10 }), { valor: 0.2, frase: 'casi no negoció: 1 pacto y 1 comercio', notable: true });
  assert.deepEqual(fraseNegociacion({ ...c0, pactos: 3, comercios: 2, turnos: 10 }), { valor: 0.5, frase: 'negoció lo normal: 3 pactos y 2 comercios', notable: false });
});

test('conquista: si cayo, si conquisto 3 o mas, si no ataco a nadie en una partida larga, o el balance normal', () => {
  assert.deepEqual(fraseConquista({ ...c0, caidas: 1, cayoEn: 11 }), { valor: 8, frase: 'cayó en el turno 11', notable: true });
  assert.equal(fraseConquista({ ...c0, caidas: 1, partidas: 2 }).frase, 'cayó en 1 partida');
  assert.deepEqual(fraseConquista({ ...c0, conquistas: 4, ataques: 6, ganados: 5 }), { valor: 4, frase: 'conquistó 4 regiones a otros reinos (ganó 5 de 6 batallas)', notable: true });
  assert.equal(fraseConquista({ ...c0, conquistas: 2, ataques: 2, ganados: 2 }).notable, false, '2 conquistas no llegan a conquistador');
  assert.deepEqual(fraseConquista({ ...c0, ataques: 0, turnos: 10, regiones: 15 }), { valor: 0, frase: 'no atacó a nadie: termina con 15 regiones', notable: true });
  assert.equal(fraseConquista({ ...c0, ataques: 0, turnos: 7 }).notable, false, 'en una partida corta no atacar no dice nada');
  assert.equal(fraseConquista({ ...c0, ataques: 0, turnos: 12, partidas: 2 }).notable, false, 'con 2 partidas se piden 16 turnos');
  assert.equal(fraseConquista({ ...c0, ataques: 3, ganados: 0, regiones: 4 }).frase, 'no conquistó regiones de otros reinos (ganó 0 de 3 batallas); termina con 4 regiones');
  assert.equal(fraseConquista({ ...c0, conquistas: 1, ataques: 1, ganados: 1, regiones: 11 }).frase, 'conquistó 1 región a otros reinos (ganó 1 de 1 batalla); termina con 11 regiones');
});

test('camino: completar, tomar, perder o construir la Maravilla (en ese orden de importancia), ganar por territorio, o nada', () => {
  assert.equal(fraseCamino({ ...c0, construyo: 1, completo: 1, turnoCompleto: 10, gano: 1 }).frase, 'completó la Maravilla en el turno 10 y ganó');
  assert.equal(fraseCamino({ ...c0, tomo: 1, deQuienTomo: 'GPT' }).frase, 'conquistó la Maravilla de GPT');
  assert.equal(fraseCamino({ ...c0, construyo: 1, perdio: 1, ante: 'Gemini' }).frase, 'construyó la Maravilla y la perdió ante Gemini');
  assert.equal(fraseCamino({ ...c0, construyo: 1, turnoConstruyo: 5 }).frase, 'construyó la Maravilla en el turno 5');
  assert.deepEqual(fraseCamino({ ...c0, gano: 1, ganoPorTerritorio: 1 }), { valor: 'territorio', frase: 'ganó por territorio', notable: true });
  assert.deepEqual(fraseCamino(c0), { valor: null, frase: 'no fue por la Maravilla', notable: false });
  // en una serie se cuentan partidas, sin turnos ni nombres de una sola
  assert.equal(fraseCamino({ ...c0, partidas: 2, completo: 1, turnoCompleto: null }).frase, 'completó la Maravilla en 1 partida');
  assert.equal(fraseCamino({ ...c0, partidas: 2, ganoPorTerritorio: 2 }).frase, 'ganó por territorio en 2 partidas');
  assert.equal(fraseCamino({ ...c0, partidas: 2 }).frase, 'no fue por la Maravilla en 2 partidas');
});

test('las destacadas son hasta 3 notables en el orden de prioridad, y sin ninguna se dice la conquista', () => {
  assert.deepEqual(PRIORIDAD, ['camino', 'palabra', 'obediencia', 'conquista', 'negociacion']);
  const todas = caracteristicasDe({ ...c0, completo: 1, turnoCompleto: 9, traiciones: 1, honor: 2, ordV: 1, ordT: 10, ataques: 0, pactos: 0, comercios: 0 });
  assert.deepEqual(todas.destacadas, ['completó la Maravilla en el turno 9 y ganó', 'rompió 1 pacto y terminó con 2 de honor', 'solo 1 de 10 órdenes eran legales']);
  assert.equal(todas.destacadas.length, 3);
  assert.deepEqual(Object.keys(todas.caracteristicas), ['obediencia', 'palabra', 'negociacion', 'conquista', 'camino']);
  const ninguna = caracteristicasDe({ ...c0, ordV: 9, ordT: 10 });
  assert.deepEqual(ninguna.destacadas, [ninguna.caracteristicas.conquista.frase]);
});

test('contarPartida lee de lo guardado: conquistas, batallas propias ganadas, Maravilla (construida, completada, tomada, perdida), honor y turnos', () => {
  const p = partida({
    metricas: [{ traiciones: 1, honor: 2, pactosFirmados: 4, comercios: 1, respuestasInvalidas: 2, ordenesValidas: 30, ordenesTotal: 40, regiones: 9, puntos: 3 }, {}, { cayoEn: 7 }],
    eventos: [{ tipo: 'conquista', k: 0, contra: 1, r: 3, t: 2 }, { tipo: 'conquista', k: 0, contra: 2, r: 4, t: 3 }, { tipo: 'conquista', k: 1, contra: 0, r: 5, t: 3 },
      { tipo: 'maravilla', k: 1, r: 8, t: 4 }, { tipo: 'maravilla_cae', k: 0, de: 1, t: 8 }, { tipo: 'maravilla_gana', k: 0, t: 12 }],
    combates: [
      { t: 2, k: 0, bandos: [{ k: 0, defensor: false }, { k: 1, defensor: true }], resultado: 'captura' },
      { t: 3, k: 2, bandos: [{ k: 0, defensor: false }, { k: 2, defensor: true }], resultado: 'repelido' },
      { t: 4, k: 0, bandos: [{ k: 1, defensor: false }, { k: 0, defensor: true }], resultado: 'repelido' }, // el asiento 0 DEFIENDE y gana: ni es un ataque suyo ni una batalla ganada
      { t: 7, k: 1, bandos: [{ k: 1, defensor: false }, { k: 0, defensor: false }], resultado: 'captura' },
    ],
    ganador: 0, ganoPorMaravilla: true,
  });
  const c = contarPartida(p, 0);
  assert.deepEqual({ id: c.id, nombre: c.nombre, turnos: c.turnos, malas: c.malas, ordV: c.ordV, ordT: c.ordT, traiciones: c.traiciones, honor: c.honor, pactos: c.pactos, comercios: c.comercios, regiones: c.regiones, puntos: c.puntos },
    { id: 'claude', nombre: 'Claude', turnos: 10, malas: 2, ordV: 30, ordT: 40, traiciones: 1, honor: 2, pactos: 4, comercios: 1, regiones: 9, puntos: 3 });
  assert.deepEqual({ conquistas: c.conquistas, ataques: c.ataques, ganados: c.ganados }, { conquistas: 2, ataques: 3, ganados: 1 }, 'ataca en 3 combates y gana 1 (el defensor no cuenta como ataque)');
  assert.deepEqual({ tomo: c.tomo, deQuienTomo: c.deQuienTomo, completo: c.completo, turnoCompleto: c.turnoCompleto, gano: c.gano, ganoPorTerritorio: c.ganoPorTerritorio }, { tomo: 1, deQuienTomo: 'GPT', completo: 1, turnoCompleto: 12, gano: 1, ganoPorTerritorio: 0 });
  const g = contarPartida(p, 1);
  assert.deepEqual({ construyo: g.construyo, turnoConstruyo: g.turnoConstruyo, perdio: g.perdio, ante: g.ante, gano: g.gano }, { construyo: 1, turnoConstruyo: 4, perdio: 1, ante: 'Claude', gano: 0 });
  assert.equal(contarPartida(p, 2).caidas, 1);
  assert.equal(contarPartida(partida({ ganador: 1 }), 1).ganoPorTerritorio, 1, 'ganar sin Maravilla es ganar por territorio');
});

test('evaluarPartida: una entrada por asiento en su orden; una partida cortada, rota o vacia no se evalua', () => {
  const e = evaluarPartida(partida({ metricas: [{ puntos: 5 }, { puntos: 3 }, { puntos: 1 }] }));
  assert.deepEqual(e.jugadores.map((j) => [j.asiento, j.id, j.nombre, j.puntos]), [[0, 'claude', 'Claude', 5], [1, 'gpt', 'GPT', 3], [2, 'gemini', 'Gemini', 1]]);
  for (const j of e.jugadores) assert.ok(j.destacadas.length >= 1 && j.destacadas.length <= 3);
  for (const mala of [null, undefined, 7, 'x', {}, partida({ truncada: true }), { ...partida(), jugadores: [] }, { ...partida(), rondas: null }, { ...partida(), metricas: null }]) assert.deepEqual(evaluarPartida(mala), { jugadores: [] }, JSON.stringify(mala)?.slice(0, 40));
});

test('evaluarSerie junta las partidas de cada jugador por su id (aunque roten los asientos), ordena por puntos por partida y avisa que son pocas', () => {
  const p1 = partida({ ids: ['claude', 'gpt', 'gemini'], metricas: [{ puntos: 0, ordenesValidas: 3, ordenesTotal: 10 }, { puntos: 5 }, { puntos: 3 }], ganador: 1 });
  const p2 = partida({ ids: ['gpt', 'gemini', 'claude'], metricas: [{ puntos: 1 }, { puntos: 5 }, { puntos: 3, ordenesValidas: 4, ordenesTotal: 10 }], ganador: 1 });
  const s = evaluarSerie([p1, p2, partida({ truncada: true })]);
  assert.equal(s.partidas, 2, 'la cortada no cuenta');
  assert.deepEqual(s.jugadores.map((j) => [j.id, j.partidas, j.puntosPorPartida]), [['gemini', 2, 4], ['gpt', 2, 3], ['claude', 2, 1.5]]);
  const claude = s.jugadores.find((j) => j.id === 'claude');
  assert.equal(claude.caracteristicas.obediencia.frase, 'solo 7 de 20 órdenes eran legales', 'suma de las dos partidas aunque cambio de asiento');
  assert.equal(s.comentario[0].tipo, 'resumen');
  assert.match(s.comentario[0].texto, /^En estas 2 partidas de Guerra de territorios, con estas reglas, Gemini sumó más puntos por partida \(4\)\.$/);
  assert.ok(s.comentario.some((l) => l.tipo === 'aviso' && /menos de una vuelta completa/.test(l.texto)));
  assert.ok(s.comentario.some((l) => l.tipo === 'jugador' && l.texto.startsWith('Claude: ')));
  for (const mala of [null, undefined, [], [null], 'x', [partida({ truncada: true })]]) assert.deepEqual(evaluarSerie(mala), { partidas: 0, jugadores: [], comentario: [] });
});

test('sumar: honor es el peor de las partidas y el turno o el nombre solo se guardan si hay una sola partida', () => {
  const a = { ...c0, honor: 5, turnoCompleto: 9, deQuienTomo: 'GPT', conquistas: 1 }, b = { ...c0, honor: 2, conquistas: 2 };
  const dos = sumar([a, b]);
  assert.deepEqual({ honor: dos.honor, conquistas: dos.conquistas, partidas: dos.partidas, turnoCompleto: dos.turnoCompleto, deQuienTomo: dos.deQuienTomo }, { honor: 2, conquistas: 3, partidas: 2, turnoCompleto: null, deQuienTomo: null });
  assert.deepEqual({ honor: sumar([a]).honor, turnoCompleto: sumar([a]).turnoCompleto, deQuienTomo: sumar([a]).deQuienTomo }, { honor: 5, turnoCompleto: 9, deQuienTomo: 'GPT' });
});

test('el juego usa esta evaluacion al final de la serie, con partidas reales del motor', async () => {
  assert.equal(typeof conquista.evaluar, 'function');
  const p = await jugarConqBots(18, ['agresivo', 'pacifico', 'economico', 'azar']);
  const e = conquista.evaluar([p]);
  assert.equal(e.partidas, 1);
  assert.equal(e.jugadores.length, 4);
  for (const j of e.jugadores) assert.deepEqual(Object.keys(j.caracteristicas), ['obediencia', 'palabra', 'negociacion', 'conquista', 'camino']);
  assert.ok(e.comentario.length >= 6);
  assert.equal(evaluarPartida(p).jugadores.length, 4);
});

test('el modulo es de la web: no importa nada de src/ ni de herramientas/ (el sitio publica solo web/ y data/)', () => {
  const fuente = readFileSync(new URL('../../../web/casino/evaluacion-conquista.js', import.meta.url), 'utf8');
  for (const m of fuente.matchAll(/^import .* from '([^']+)'/gm)) assert.ok(m[1].startsWith('./'), `importa ${m[1]}`);
  assert.deepEqual(UMBRALES, { obedienciaBaja: 0.75, obedienciaAlta: 0.9, negociaMucho: 0.8, negociaPoco: 0.2, conquistador: 3, turnosParaPasivo: 8 });
});
