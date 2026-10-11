// Una ronda de El numero solitario, turno por turno: parejas, marcas, anulaciones, ganador, cartas, cortes y final.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarTurno } from '../../juegos/solitario/turno.js';
import { disponibles } from '../../juegos/solitario/estado.js';
import { normalizarRespuesta } from '../../juegos/solitario/ordenes.js';
import { RONDAS, CARTAS } from '../../juegos/solitario/constantes.js';
import { nuevoEstado, pareja, marca, ronda, rondaBasica } from './ayudas.js';

const EJEMPLO = [[1, 3], [1, 4], [2, 5], [4, 6], [5, 7]]; // Ana y Luis chocan en el 1; Marta gana con el 2

test('la fase 1 guarda las parejas ordenadas, no toca los puntos y pasa a la fase 2', () => {
  const E = nuevoEstado();
  const f1 = aplicarTurno(E, [pareja(3, 1), pareja(1, 4), pareja(2, 5), pareja(8, 7), pareja(6, 5)]);
  assert.equal(f1.fase, 1);
  assert.equal(f1.ronda, 1);
  assert.equal(f1.ciclo, 1);
  assert.deepEqual(f1.parejas, [[1, 3], [1, 4], [2, 5], [7, 8], [5, 6]]);
  assert.deepEqual(E.parejas, f1.parejas);
  assert.equal(E.fase, 2);
  assert.equal(E.ronda, 1);
  assert.deepEqual(E.puntos, [0, 0, 0, 0, 0]);
  assert.deepEqual(f1.invalidas, [false, false, false, false, false]);
  assert.ok(f1.narracion.length >= 6);
});

test('el ejemplo del enunciado: los dos unos se anulan y gana el 2, que es el menor numero que queda solo', () => {
  const E = nuevoEstado();
  const [, f2] = ronda(E, EJEMPLO, [1, 1, 2, 4, 5]);
  assert.equal(f2.fase, 2);
  assert.deepEqual(f2.anuladas, [true, true, false, false, false]);
  assert.equal(f2.ganador, 2);
  assert.equal(f2.numero, 2);
  assert.deepEqual(f2.puntosGanados, [0, 0, 2, 0, 0]);
  assert.deepEqual(E.puntos, [0, 0, 2, 0, 0]);
  assert.deepEqual(E.fichas, [0, 0, 1, 0, 0]);
  assert.equal(E.ultimaVictoria[2], 1);
  assert.equal(E.stats[2].rondasGanadas, 1);
  assert.equal(E.stats[0].anuladas, 1);
  assert.equal(E.stats[1].anuladas, 1);
  assert.equal(E.stats[2].senuelos, 0, 'jugo la mas baja de su pareja: no es senuelo');
  assert.deepEqual(f2.marcas, [1, 1, 2, 4, 5]);
  assert.deepEqual(E.historial, [{ ronda: 1, parejas: EJEMPLO, marcas: [1, 1, 2, 4, 5], ganador: 2, numero: 2 }]);
  assert.equal(E.ronda, 2);
  assert.equal(E.fase, 1);
  assert.deepEqual(E.parejas, [null, null, null, null, null]);
});

test('si tambien se repite el 2, gana el 4 (el menor que queda solo)', () => {
  const E = nuevoEstado();
  const [, f2] = ronda(E, [[1, 3], [1, 4], [2, 5], [4, 6], [2, 7]], [1, 1, 2, 4, 2]);
  assert.equal(f2.ganador, 3);
  assert.equal(f2.numero, 4);
  assert.equal(E.puntos[3], 4);
  assert.deepEqual(f2.anuladas, [true, true, true, false, true]);
});

test('el menor numero que queda solo puede ser alto: gana el 3 si el 1 y el 2 se repiten', () => {
  const E = nuevoEstado();
  const [, f2] = ronda(E, [[1, 4], [1, 5], [2, 6], [2, 7], [3, 8]], [1, 1, 2, 2, 3]);
  assert.equal(f2.numero, 3);
  assert.equal(f2.ganador, 4);
});

test('si ningun numero queda solo nadie gana, los puntos no se mueven y las cartas se descartan igual', () => {
  const E = nuevoEstado();
  const [, f2] = ronda(E, [[1, 3], [1, 4], [1, 5], [2, 6], [2, 7]], [1, 1, 1, 2, 2]);
  assert.equal(f2.ganador, null);
  assert.equal(f2.numero, null);
  assert.deepEqual(E.puntos, [0, 0, 0, 0, 0]);
  assert.deepEqual(E.fichas, [0, 0, 0, 0, 0]);
  assert.deepEqual(E.descartadas[0], [1]);
  assert.deepEqual(E.descartadas[3], [2]);
  assert.deepEqual(f2.anuladas, [true, true, true, true, true]);
});

test('la carta jugada se descarta, la otra queda bloqueada una ronda y despues vuelve', () => {
  const E = nuevoEstado();
  ronda(E, EJEMPLO, [1, 1, 2, 4, 5]); // el jugador 0 juega el 1 de [1, 3]
  assert.deepEqual(E.descartadas[0], [1]);
  assert.equal(E.bloqueada[0], 3);
  assert.deepEqual(disponibles(E, 0), [2, 4, 5, 6, 7, 8]);
  // ronda 2: el 3 esta bloqueado, el jugador 0 elige [2, 4] y juega el 2
  ronda(E, [[2, 4], [2, 5], [3, 6], [5, 7], [6, 8]], [2, 5, 3, 5, 6]);
  assert.equal(E.bloqueada[0], 4);
  assert.ok(disponibles(E, 0).includes(3), 'el 3 volvio a la mano');
  assert.ok(!disponibles(E, 0).includes(4), 'ahora el 4 esta bloqueado');
  assert.deepEqual(E.descartadas[0], [1, 2]);
});

test('en la ronda 6 de cada ciclo quedan exactamente 2 cartas disponibles', () => {
  const E = nuevoEstado();
  for (let r = 1; r <= 5; r++) rondaBasica(E);
  assert.equal(E.ronda, 6);
  for (let s = 0; s < 5; s++) if (E.jugando[s]) assert.equal(disponibles(E, s).length, 2, `jugador ${s}`);
  rondaBasica(E);
  for (let r = 7; r <= 11; r++) rondaBasica(E);
  assert.equal(E.ronda, 12);
  for (let s = 0; s < 5; s++) if (E.jugando[s]) assert.equal(disponibles(E, s).length, 2, `jugador ${s} en la ronda 12`);
});

test('al terminar la ronda 6 todos reciben mazo nuevo; al terminar la 3 no', () => {
  const E = nuevoEstado();
  for (let r = 1; r <= 3; r++) rondaBasica(E);
  for (let s = 0; s < 5; s++) if (E.jugando[s]) assert.equal(E.mano[s].length, 8 - 3, 'sin reinicio en la ronda 3');
  for (let r = 4; r <= 6; r++) rondaBasica(E);
  assert.equal(E.ronda, 7);
  for (let s = 0; s < 5; s++) {
    if (!E.jugando[s]) continue;
    assert.deepEqual(E.mano[s], CARTAS);
    assert.equal(E.bloqueada[s], null);
    assert.deepEqual(E.descartadas[s], []);
  }
});

test('el corte de la ronda 3 deja a salvo al de mas puntos y ese jugador sale de la partida', () => {
  const E = nuevoEstado();
  rondaBasica(E); rondaBasica(E);
  aplicarTurno(E, [0, 1, 2, 3, 4].map((s) => pareja(...disponibles(E, s).slice(0, 2))));
  E.puntos = [0, 9, 1, 1, 0];
  const f2 = aplicarTurno(E, [0, 1, 2, 3, 4].map((s) => marca(E.parejas[s][0]))); // chocan todos: nadie gana, sigue el 9
  assert.deepEqual(f2.corte.jugador, 1);
  assert.equal(f2.corte.numero, 1);
  assert.equal(f2.corte.puntos, 9);
  assert.equal(f2.corte.criterio, 'puntos');
  assert.equal(f2.corte.ranking[0].s, 1);
  assert.equal(f2.corte.ranking.length, 5);
  assert.equal(E.jugando[1], false);
  assert.equal(E.puesto[1], 'salvo');
  assert.equal(E.corteSalvo[1], 1);
  assert.ok(f2.narracion.some((l) => l.tipo === 'corte' && l.texto.includes('{1} queda a salvo con 9 puntos')));
  // la ronda 4 ya no le pregunta a nadie por el jugador 1
  const f1 = aplicarTurno(E, [0, 1, 2, 3, 4].map((s) => (s === 1 ? null : pareja(...disponibles(E, s).slice(0, 2)))));
  assert.equal(f1.parejas[1], null);
  assert.equal(f1.invalidas[1], null);
  assert.equal(f1.parejas.filter(Boolean).length, 4);
});

test('el corte desempata por fichas, luego por ultima victoria y al final por el sorteo guardado', () => {
  const corteCon = ({ puntos, fichas, ultima, sorteo }) => {
    const E = nuevoEstado();
    E.ronda = 3; E.fase = 2;
    E.parejas = [[1, 2], [1, 2], [1, 2], [1, 2], [1, 2]];
    E.puntos = puntos; E.fichas = fichas; E.ultimaVictoria = ultima; E.sorteo[0] = sorteo;
    return aplicarTurno(E, [1, 1, 1, 1, 1].map((n) => marca(n))).corte;
  };
  const cero = [0, 0, 0, 0, 0];
  const porFichas = corteCon({ puntos: [5, 5, 5, 0, 0], fichas: [1, 3, 2, 0, 0], ultima: cero, sorteo: [0.1, 0.2, 0.3, 0.4, 0.5] });
  assert.equal(porFichas.jugador, 1);
  assert.equal(porFichas.criterio, 'fichas');
  const porUltima = corteCon({ puntos: [5, 5, 5, 0, 0], fichas: [2, 2, 2, 0, 0], ultima: [1, 2, 3, 0, 0], sorteo: [0.1, 0.2, 0.3, 0.4, 0.5] });
  assert.equal(porUltima.jugador, 2);
  assert.equal(porUltima.criterio, 'ultima victoria');
  const porSorteo = corteCon({ puntos: cero, fichas: cero, ultima: cero, sorteo: [0.9, 0.2, 0.5, 0.6, 0.7] });
  assert.equal(porSorteo.jugador, 1);
  assert.equal(porSorteo.criterio, 'sorteo');
});

test('la final de la ronda 12: gana la pieza el de mas puntos, queda en medio el siguiente y es eliminado el ultimo', () => {
  const E = nuevoEstado();
  E.ronda = 12; E.fase = 2;
  E.jugando = [true, false, true, true, false];
  E.parejas = [[1, 2], null, [1, 2], [1, 2], null];
  E.puntos = [4, 0, 9, 4, 0]; E.fichas = [1, 0, 2, 1, 0]; E.ultimaVictoria = [10, 0, 11, 12, 0];
  const f2 = aplicarTurno(E, [marca(1), null, marca(1), marca(1), null]);
  assert.deepEqual(f2.final, {
    pieza: 2, medio: 3, eliminado: 0, criterioPieza: 'puntos', criterioEliminado: 'ultima victoria',
    ranking: [{ s: 2, puntos: 9, fichas: 2 }, { s: 3, puntos: 4, fichas: 1 }, { s: 0, puntos: 4, fichas: 1 }],
  });
  assert.equal(E.fin, true);
  assert.deepEqual([E.puesto[2], E.puesto[3], E.puesto[0]], ['pieza', 'medio', 'eliminado']);
  assert.deepEqual(E.final, f2.final);
  assert.equal(f2.corte, null);
  assert.throws(() => aplicarTurno(E, [null, null, null, null, null]), /ya termino/);
});

test('una respuesta ilegible o ilegal se reemplaza por una jugada legal del azar sorteado y se anota', () => {
  const E = nuevoEstado();
  ronda(E, EJEMPLO, [1, 1, 2, 4, 5]); // el jugador 0 queda con el 3 bloqueado
  const antes = [0, 1, 2].map((s) => disponibles(E, s));
  const f1 = aplicarTurno(E, [
    pareja(3, 4), // el 3 esta bloqueado
    null, // la arena le paso null (por ejemplo, error de API)
    normalizarRespuesta({ cartas: 'x' }),
    pareja(2, 5), // legal para el jugador 3 (jugo el 4 y tiene bloqueado el 6)
    pareja(1, 4), // legal para el jugador 4 (jugo el 5 y tiene bloqueado el 7)
  ]);
  assert.deepEqual(f1.invalidas, [true, true, true, false, false]);
  assert.deepEqual(f1.motivos.slice(0, 3), ['cartas no disponibles', 'sin respuesta legible', 'cartas mal formadas']);
  for (const s of [0, 1, 2]) {
    assert.equal(f1.parejas[s].length, 2);
    assert.notEqual(f1.parejas[s][0], f1.parejas[s][1]);
    assert.ok(f1.parejas[s].every((c) => antes[s].includes(c)), `la pareja de reemplazo del ${s} es legal`);
  }
  assert.equal(E.stats[0].invalidas, 1);
  assert.equal(E.stats[3].invalidas, 0);
  // determinista: el mismo estado produce la misma pareja de reemplazo
  const E2 = nuevoEstado();
  ronda(E2, EJEMPLO, [1, 1, 2, 4, 5]);
  const g1 = aplicarTurno(E2, [pareja(3, 4), null, normalizarRespuesta({ cartas: 'x' }), pareja(2, 5), pareja(1, 4)]);
  assert.deepEqual(g1.parejas, f1.parejas);
});

test('una marca fuera de la pareja o ausente se reemplaza por una de las dos cartas de la pareja', () => {
  const E = nuevoEstado();
  aplicarTurno(E, EJEMPLO.map((p) => pareja(...p)));
  const f2 = aplicarTurno(E, [marca(5), normalizarRespuesta({ cartas: [1, 2] }), marca(2), null, marca(5)]);
  assert.deepEqual(f2.invalidas, [true, true, false, true, false]);
  assert.equal(f2.motivos[0], 'marca fuera de la pareja');
  assert.equal(f2.motivos[1], 'sin marca');
  assert.equal(f2.motivos[3], 'sin respuesta legible');
  for (const s of [0, 1, 3]) assert.ok(EJEMPLO[s].includes(f2.marcas[s]), `la marca de reemplazo del ${s} es de su pareja`);
});

test('un campo mal formado de la OTRA fase no invalida la respuesta de esta fase', () => {
  const E = nuevoEstado();
  const conBasura = normalizarRespuesta({ cartas: [1, 2], juega: 99 });
  assert.equal(conBasura.invalida, true, 'el normalizador no sabe de fases');
  const f1 = aplicarTurno(E, [conBasura, pareja(1, 4), pareja(2, 5), pareja(4, 6), pareja(5, 7)]);
  assert.equal(f1.invalidas[0], false);
  assert.deepEqual(f1.parejas[0], [1, 2]);
  const f2 = aplicarTurno(E, [normalizarRespuesta({ cartas: 'rara', juega: 2 }), marca(1), marca(2), marca(4), marca(5)]);
  assert.equal(f2.invalidas[0], false);
  assert.equal(f2.marcas[0], 2);
});

test('los errores de API y la respuesta cruda de una jugada invalida quedan en el registro', () => {
  const E = nuevoEstado();
  const caida = { ...normalizarRespuesta(null), error: 'HTTP 500', crudo: null };
  const rota = { ...normalizarRespuesta({ cartas: [1, 1] }), crudo: 'x'.repeat(1000) };
  const f1 = aplicarTurno(E, [caida, rota, pareja(2, 5), pareja(4, 6), pareja(5, 7)]);
  assert.equal(f1.errores[0], 'HTTP 500');
  assert.equal(f1.errores[1], null);
  assert.equal(f1.crudos[0], null);
  assert.equal(f1.crudos[1].length, 400);
  assert.equal(f1.crudos[2], null);
  assert.deepEqual(f1.razones.slice(2, 4), ['prueba', 'prueba']);
});

test('las estadisticas cuentan respuestas, validas e invalidas de las dos fases', () => {
  const E = nuevoEstado();
  aplicarTurno(E, [null, pareja(1, 4), pareja(2, 5), pareja(4, 6), pareja(5, 7)]);
  aplicarTurno(E, [null, marca(1), marca(2), marca(4), marca(5)]);
  assert.deepEqual([E.stats[0].respuestas, E.stats[0].validas, E.stats[0].invalidas], [2, 0, 2]);
  assert.deepEqual([E.stats[1].respuestas, E.stats[1].validas, E.stats[1].invalidas], [2, 2, 0]);
});

test('ganar con la carta mas alta de la pareja cuenta como senuelo', () => {
  const E = nuevoEstado();
  const [, f2] = ronda(E, [[1, 5], [2, 6], [3, 7], [4, 8], [3, 6]], [5, 6, 7, 8, 6]);
  assert.equal(f2.ganador, 0);
  assert.equal(f2.numero, 5);
  assert.equal(E.stats[0].senuelos, 1);
});

test('el registro de la fase 2 trae todo lo que el reproductor necesita', () => {
  const E = nuevoEstado();
  const [, f2] = ronda(E, EJEMPLO, [1, 1, 2, 4, 5]);
  for (const k of ['ronda', 'ciclo', 'fase', 'parejas', 'marcas', 'anuladas', 'ganador', 'numero', 'puntosGanados', 'puntos', 'fichas', 'descartadas', 'bloqueadas',
    'razones', 'invalidas', 'motivos', 'errores', 'crudos', 'corte', 'final', 'narracion']) assert.ok(k in f2, k);
  assert.deepEqual(f2.puntos, [0, 0, 2, 0, 0]);
  assert.deepEqual(f2.bloqueadas, [3, 4, 5, 6, 7]);
  assert.deepEqual(f2.descartadas, [[1], [1], [2], [4], [5]]);
  assert.ok(f2.narracion.some((l) => l.tipo === 'resultado'));
  assert.equal(f2.errores.length, 5);
});

test('una partida con las mismas respuestas termina siempre igual y en 24 turnos', () => {
  const jugar = () => {
    const E = nuevoEstado(11);
    let turnos = 0;
    while (!E.fin) { rondaBasica(E); turnos += 2; }
    return { turnos, puntos: E.puntos, puesto: E.puesto, ronda: E.ronda };
  };
  const a = jugar(), b = jugar();
  assert.deepEqual(a, b);
  assert.equal(a.turnos, RONDAS * 2);
  assert.equal(a.puesto.filter((p) => p === 'pieza').length, 1);
  assert.equal(a.puesto.filter((p) => p === 'salvo').length, 2);
  assert.equal(a.puesto.filter((p) => p === 'medio').length, 1);
  assert.equal(a.puesto.filter((p) => p === 'eliminado').length, 1);
});
