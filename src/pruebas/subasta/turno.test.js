// Una subasta de Subasta de tiempo, turno por turno: todas las apuestas se pagan, gana la mas alta si es unica, el empate en lo mas alto anula,
// el banco se agota y la partida cierra con la pieza y la eliminacion.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarTurno } from '../../juegos/subasta/turno.js';
import { normalizarRespuesta } from '../../juegos/subasta/ordenes.js';
import { SUBASTAS } from '../../juegos/subasta/constantes.js';
import { nuevoEstado, apuesta, subasta, jugarConBots } from './ayudas.js';

test('el ejemplo de la regla: Ana 15, Luis 32, Marta 47 y Pedro 51 -> gana Pedro, y todos pagan lo que apostaron', () => {
  const E = nuevoEstado();
  const reg = subasta(E, [15, 32, 47, 51, 0]);
  assert.equal(reg.subasta, 1);
  assert.equal(reg.ganador, 3);
  assert.equal(reg.sinGanador, null);
  assert.deepEqual(E.bancos, [5850, 5680, 5530, 5490, 6000]);
  assert.deepEqual(E.fichas, [0, 0, 0, 1, 0]);
  assert.deepEqual(E.apostado, [150, 320, 470, 510, 0]);
  assert.deepEqual(reg.oculto.apuestas, [15, 32, 47, 51, 0]);
  assert.deepEqual(reg.oculto.bancos, [585, 568, 553, 549, 600]);
  assert.deepEqual(reg.fichas, [0, 0, 0, 1, 0]);
  assert.equal(E.subasta, 2);
  assert.equal(E.stats[3].ganadas, 1);
  assert.equal(E.stats[4].retiradas, 1);
});

test('un empate en la apuesta mas alta anula la subasta: nadie recibe la ficha y el tiempo se pierde igual', () => {
  const E = nuevoEstado();
  const reg = subasta(E, [30, 30, 10, 0, 0]);
  assert.equal(reg.ganador, null);
  assert.equal(reg.sinGanador, 'empate');
  assert.deepEqual(reg.oculto.empatados, [0, 1]);
  assert.deepEqual(E.fichas, [0, 0, 0, 0, 0]);
  assert.deepEqual(E.bancos, [5700, 5700, 5900, 6000, 6000]);
  assert.equal(E.stats[0].empates, 1);
  assert.equal(E.stats[2].empates, 0);
  const tres = subasta(nuevoEstado(), [20, 20, 20, 0, 5]);
  assert.deepEqual(tres.oculto.empatados, [0, 1, 2]);
});

test('un empate en una apuesta baja no anula nada: gana la mas alta', () => {
  const E = nuevoEstado();
  const reg = subasta(E, [50, 10, 10, 0, 0]);
  assert.equal(reg.ganador, 0);
  assert.equal(reg.sinGanador, null);
  assert.deepEqual(reg.oculto.empatados, []);
});

test('si todos se retiran nadie gana y nadie pierde tiempo', () => {
  const E = nuevoEstado();
  const reg = subasta(E, [0, 0, 0, 0, 0]);
  assert.equal(reg.ganador, null);
  assert.equal(reg.sinGanador, 'nadie aposto');
  assert.deepEqual(E.bancos, [6000, 6000, 6000, 6000, 6000]);
  assert.deepEqual(E.stats.map((s) => s.retiradas), [1, 1, 1, 1, 1]);
});

test('una sola apuesta, por pequena que sea, gana', () => {
  const E = nuevoEstado();
  const reg = subasta(E, [0, 0.1, 0, 0, 0]);
  assert.equal(reg.ganador, 1);
  assert.equal(E.bancos[1], 5999);
});

test('pedir mas de lo que queda es apostar todo el banco, y no es una respuesta invalida', () => {
  const E = nuevoEstado();
  E.bancos[0] = 500; // 50.0 segundos
  const reg = subasta(E, [999, 10, 0, 0, 0]);
  assert.equal(reg.invalidas[0], false);
  assert.equal(reg.oculto.apuestas[0], 50);
  assert.equal(E.bancos[0], 0);
  assert.equal(reg.ganador, 0);
  assert.equal(E.stats[0].todoElBanco, 1);
  assert.deepEqual(reg.oculto.todoElBanco, [true, false, false, false, false]);
});

test('quien se queda sin banco ya no apuesta: la arena le pasa null y no cuenta como respuesta', () => {
  const E = nuevoEstado();
  E.bancos[2] = 0;
  const reg = subasta(E, [10, 20, null, 0, 5]);
  assert.equal(reg.oculto.apuestas[2], null);
  assert.equal(reg.invalidas[2], null);
  assert.equal(E.stats[2].respuestas, 0);
  assert.equal(E.apuestas[2].length, 0);
  assert.equal(reg.ganador, 1);
  // aunque llegue una respuesta, quien no tiene tiempo no puede apostar
  const F = nuevoEstado();
  F.bancos[2] = 0;
  const r2 = aplicarTurno(F, [apuesta(1), apuesta(2), apuesta(500), apuesta(0), apuesta(0)]);
  assert.equal(r2.oculto.apuestas[2], null);
  assert.equal(r2.ganador, 1);
});

test('una respuesta ilegible o incompleta equivale a retirarse, sin gastar nada, y se anota', () => {
  const E = nuevoEstado();
  const reg = aplicarTurno(E, [null, normalizarRespuesta({ apuesta: 'mucho' }), apuesta(10), normalizarRespuesta({}), apuesta(5)]);
  assert.deepEqual(reg.invalidas, [true, true, false, true, false]);
  assert.deepEqual(reg.motivos, ['sin respuesta legible', 'apuesta mal formada', null, 'sin apuesta', null]);
  assert.deepEqual(reg.oculto.apuestas, [0, 0, 10, 0, 5]);
  assert.equal(E.bancos[0], 6000);
  assert.equal(E.stats[0].invalidas, 1);
  assert.equal(E.stats[0].retiradas, 0, 'una respuesta invalida no cuenta como retirada elegida');
  assert.equal(reg.ganador, 2);
});

test('las apuestas se redondean a la decima de segundo', () => {
  const E = nuevoEstado();
  const reg = subasta(E, [12.34, 0.04, 0.05, 0.3, 1.1]);
  assert.deepEqual(reg.oculto.apuestas, [12.3, 0, 0.1, 0.3, 1.1]);
  assert.deepEqual(E.bancos, [5877, 6000, 5999, 5997, 5989]);
  assert.equal(E.stats[1].retiradas, 1, 'menos de una decima es retirarse');
});

test('cada jugador guarda su propia historia de apuestas, y el historial publico no trae apuestas', () => {
  const E = nuevoEstado();
  subasta(E, [15, 32, 47, 51, 0]);
  subasta(E, [0, 0, 5, 0, 7]);
  assert.deepEqual(E.apuestas[0], [{ subasta: 1, decimas: 150 }, { subasta: 2, decimas: 0 }]);
  assert.deepEqual(E.historial, [{ subasta: 1, ganador: 3, sinGanador: null }, { subasta: 2, ganador: 4, sinGanador: null }]);
});

// ---------- el final ----------
function ultimaSubastaCon({ fichas, bancos }) {
  const E = nuevoEstado();
  E.subasta = SUBASTAS;
  E.fichas = fichas;
  E.bancos = bancos;
  const reg = aplicarTurno(E, bancos.map((b) => (b > 0 ? apuesta(0) : null)));
  return { E, reg };
}

test('tras las 19 subastas gana la pieza el de mas fichas y es eliminado el de menos', () => {
  const { E, reg } = ultimaSubastaCon({ fichas: [4, 6, 3, 2, 4], bancos: [1000, 2000, 500, 3000, 100] });
  assert.equal(E.fin, true);
  assert.equal(reg.final.pieza, 1);
  assert.equal(reg.final.criterioPieza, 'fichas');
  assert.equal(reg.final.eliminado, 3);
  assert.equal(reg.final.criterioEliminado, 'fichas');
  assert.deepEqual(E.puesto, ['medio', 'pieza', 'medio', 'eliminado', 'medio']);
  assert.equal(reg.final.ranking[0].s, 1);
});

test('empate en el primer lugar: gana la pieza quien conserve mas tiempo; empate en el ultimo: se elimina a quien conserve menos', () => {
  const { E, reg } = ultimaSubastaCon({ fichas: [5, 5, 3, 1, 1], bancos: [1000, 2500, 500, 3000, 400] });
  assert.equal(reg.final.pieza, 1);
  assert.equal(reg.final.criterioPieza, 'tiempo');
  assert.equal(reg.final.eliminado, 4);
  assert.equal(reg.final.criterioEliminado, 'tiempo');
  assert.deepEqual(E.puesto, ['medio', 'pieza', 'medio', 'medio', 'eliminado']);
});

test('si tambien empatan en tiempo: nadie obtiene la pieza y nadie es eliminado', () => {
  const { E, reg } = ultimaSubastaCon({ fichas: [5, 5, 3, 1, 1], bancos: [1000, 1000, 500, 300, 300] });
  assert.equal(reg.final.pieza, null);
  assert.equal(reg.final.criterioPieza, 'sin pieza');
  assert.equal(reg.final.eliminado, null);
  assert.equal(reg.final.criterioEliminado, 'sin eliminado');
  assert.deepEqual(E.puesto, ['medio', 'medio', 'medio', 'medio', 'medio']);
});

test('con todos empatados en fichas, la pieza va a quien conserva mas tiempo y la eliminacion a quien conserva menos', () => {
  const { reg } = ultimaSubastaCon({ fichas: [2, 2, 2, 2, 2], bancos: [900, 100, 500, 700, 300] });
  assert.equal(reg.final.pieza, 0);
  assert.equal(reg.final.eliminado, 1);
});

test('la partida termina antes si nadie tiene tiempo, y despues de terminar no se puede seguir', () => {
  const E = nuevoEstado();
  E.subasta = 3;
  E.bancos = [100, 100, 100, 100, 100];
  const reg = subasta(E, [999, 999, 999, 999, 999]);
  assert.equal(reg.sinGanador, 'empate', 'todos apostaron todo: empate en lo mas alto');
  assert.deepEqual(E.bancos, [0, 0, 0, 0, 0]);
  assert.equal(E.fin, true);
  assert.notEqual(reg.final, null);
  assert.throws(() => aplicarTurno(E, [null, null, null, null, null]), /ya termino/);
});

test('el registro trae todo lo que el reproductor necesita', () => {
  const E = nuevoEstado();
  const reg = subasta(E, [15, 32, 47, 51, 0]);
  for (const k of ['subasta', 'ganador', 'sinGanador', 'fichas', 'invalidas', 'motivos', 'errores', 'crudos', 'razones', 'oculto', 'final', 'narracion']) assert.ok(k in reg, k);
  for (const k of ['apuestas', 'bancos', 'empatados', 'todoElBanco']) assert.ok(k in reg.oculto, k);
  assert.equal(reg.errores.length, 5);
  assert.equal(reg.final, null);
  assert.ok(reg.narracion.some((l) => l.tipo === 'resultado'));
});

test('los errores de API y la respuesta cruda de una respuesta invalida quedan en el registro', () => {
  const E = nuevoEstado();
  const caida = { ...normalizarRespuesta(null), error: 'HTTP 500', crudo: null };
  const rota = { ...normalizarRespuesta({ apuesta: 'x' }), crudo: 'x'.repeat(1000) };
  const reg = aplicarTurno(E, [caida, rota, apuesta(10), apuesta(5), apuesta(0)]);
  assert.equal(reg.errores[0], 'HTTP 500');
  assert.equal(reg.errores[1], null);
  assert.equal(reg.crudos[1].length, 400);
  assert.equal(reg.crudos[2], null);
  assert.deepEqual(reg.razones.slice(2, 4), ['prueba', 'prueba']);
});

test('una partida con las mismas respuestas termina siempre igual, en 19 subastas', () => {
  const jugar = () => {
    const { E, registros } = jugarConBots(11, [0, 1, 2, 3, 4].map((k) => () => ({ apuesta: 10 + 7 * k, razon: 'x' })));
    return { E, n: registros.length };
  };
  const a = jugar(), b = jugar();
  assert.deepEqual(a.E, b.E);
  assert.equal(a.n, SUBASTAS);
  assert.equal(a.E.fin, true);
  assert.equal(a.E.puesto.filter((p) => p === 'pieza').length, 1);
  assert.equal(a.E.puesto.filter((p) => p === 'eliminado').length, 1);
});
