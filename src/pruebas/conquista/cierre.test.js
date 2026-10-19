import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevoEstado, contexto, jugadasDe, R, capital } from './ayudas.js';
import { clasificar } from '../../juegos/conquista/estado.js';
import { aplicarTurno } from '../../juegos/conquista/turno/index.js';
import { maravillaYVictoria } from '../../juegos/conquista/turno/cierre.js';
import { resultadoDe } from '../../juegos/conquista/resultado.js';
import { resumenPublico } from '../../juegos/conquista/texto.js';

test('la Maravilla gana al cumplirse 8 turnos seguidos, contados desde el turno siguiente al de su construccion', () => {
  const E = nuevoEstado(4), c = capital(E, 0);
  E.maravilla = { r: c, k: 0, n: 0, t0: 0 };
  for (let i = 1; i <= 7; i++) { maravillaYVictoria(contexto(E)); assert.equal(E.ganador, null, `turno ${i}`); }
  assert.equal(E.maravilla.n, 7);
  const ctx = contexto(E);
  maravillaYVictoria(ctx);
  assert.equal(E.ganador, 0);
  assert.equal(E.ganoPorMaravilla, true);
  assert.ok(ctx.eventos.some((e) => e.tipo === 'maravilla_gana'));
});

test('la Maravilla recien construida no cuenta ese mismo turno', () => {
  const E = nuevoEstado(4);
  E.maravilla = { r: capital(E, 0), k: 0, n: 0, t0: 1 }; // construida en el turno 1
  maravillaYVictoria(contexto(E)); // se cierra el turno 1
  assert.equal(E.maravilla.n, 0);
});

test('tomar la capital con Maravilla en el turno en que se cumplia la cuenta: no gana quien acaba de perderla', () => {
  const E = nuevoEstado(4), cap0 = capital(E, 0), n = E.mapa.regs[cap0].vecinos[0];
  E.maravilla = { r: cap0, k: 0, n: 7, t0: 0 };
  E.dueno[n] = 1; E.tropas[n] = 30;
  E.tropas[cap0] = 1; E.fort[cap0] = 0; E.mapa.regs[cap0].terr = 'll';
  E.reinos[1].stock.Comida = 99; // el hambre va antes de las ordenes: sin Comida desertarian tropas y el movimiento de 29 ya no valdria
  const reg = aplicarTurno(E, jugadasDe(E, { 1: { ordenes: [`mover ${R(n)} ${R(cap0)} 29`] } }));
  assert.equal(E.ganador, null);
  assert.equal(E.maravilla.k, 1);
  assert.equal(E.maravilla.n, 0);
  assert.equal(E.reinos[0].vivo, false);
  assert.ok(reg.eventos.some((e) => e.tipo === 'maravilla_cae' && e.k === 1));
});

test('gana el ultimo reino vivo', () => {
  const E = nuevoEstado(3);
  E.reinos[1].vivo = false; E.reinos[2].vivo = false;
  aplicarTurno(E, jugadasDe(E));
  assert.equal(E.ganador, 0);
  assert.equal(E.ganoPorMaravilla, false);
});

test('30 turnos sin ordenes: termina en el turno 30 con el ganador de la clasificacion y no admite mas turnos', () => {
  const E = nuevoEstado(4);
  for (let i = 0; i < 30 && E.ganador === null; i++) aplicarTurno(E, jugadasDe(E));
  assert.equal(E.turno, 30);
  assert.notEqual(E.ganador, null);
  assert.equal(E.ganador, clasificar(E)[0].s);
  assert.throws(() => aplicarTurno(E, jugadasDe(E)), /ya termino/);
});

test('un reino sin respuesta (null) pasa el turno y la partida sigue', () => {
  const E = nuevoEstado(4);
  assert.doesNotThrow(() => aplicarTurno(E, [null, null, null, null]));
  assert.equal(E.turno, 1);
});

test('aplicarTurno devuelve un registro simple y guardable, y deja lo del turno anterior para la vista siguiente', () => {
  const E = nuevoEstado(4);
  const reg = aplicarTurno(E, jugadasDe(E, { 0: { mensaje: 'hola', privados: [{ a: 'Ambar', texto: 'psst' }], nota: 'Plan' } }));
  assert.equal(reg.turno, 1);
  for (const c of ['eventos', 'movs', 'combates', 'mensajes', 'privados', 'descartes', 'obediencia', 'estado']) assert.ok(c in reg, c);
  assert.deepEqual(reg.privados, [{ k: 0, a: 1, texto: 'psst' }]);
  assert.equal(reg.estado.notas[0], 'Plan');
  assert.doesNotThrow(() => JSON.stringify(reg));
  assert.deepEqual(E.reinos[1].privIn, [{ de: 0, texto: 'psst' }]);
  assert.deepEqual(E.mensajesPrevios, [{ k: 0, texto: 'hola' }]);
});

test('resumenPublico cuenta lo que todos pueden saber, sin cantidades de comercio y sin acentos', () => {
  const lineas = resumenPublico([
    { tipo: 'conquista', k: 0, contra: 1, r: 21 }, { tipo: 'ruptura', k: 2, contra: 3 }, { tipo: 'comercio', k: 0, con: 1, doy: 'Hierro', dc: 4, pido: 'Madera', pc: 4 },
    { tipo: 'maravilla', k: 1, r: 7 }, { tipo: 'caida', k: 3, por: 0 },
  ]);
  assert.deepEqual(lineas, [
    'Azur conquisto R22 de Ambar', 'Violeta rompio su pacto con Rosa', 'Azur y Ambar comerciaron', 'Ambar construyo la Maravilla en R08', 'Rosa cayo (su capital fue tomada por Azur)',
  ]);
  assert.ok(lineas.every((l) => /^[\x00-\x7F]*$/.test(l)));
});

test('resultadoDe: 5, 3, 1 y 0 puntos por posicion; los caidos se ordenan por quien cayo mas tarde', () => {
  const E = nuevoEstado(4);
  E.reinos[3].vivo = false; E.reinos[3].cayoEn = 5;
  E.reinos[2].vivo = false; E.reinos[2].cayoEn = 9;
  E.dueno.forEach((d, r) => { if (d === -1 && E.dueno.filter((x) => x === 1).length < 6) E.dueno[r] = 1; }); // el reino 1 tiene mas regiones que el 0
  for (let r = 0; r < E.dueno.length; r++) if (E.dueno[r] === 1) E.tropas[r] = Math.max(1, E.tropas[r]);
  E.ganador = 1;
  const r = resultadoDe(E);
  assert.deepEqual(r.puntos, [3, 5, 1, 0]);
  assert.deepEqual(r.orden, [1, 0, 2, 3]);
  assert.equal(r.ganador, 1);
  assert.equal(r.empate, false);
  assert.equal(r.metricas[1].posicion, 1);
  assert.equal(r.metricas[3].cayoEn, 5);
});

test('resultadoDe con 2 reinos: 5 y 3 puntos', () => {
  const E = nuevoEstado(2);
  E.ganador = 0;
  assert.deepEqual(resultadoDe(E).puntos, [5, 3]);
});
