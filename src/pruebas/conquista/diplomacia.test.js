import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevoEstado, contexto, R, frontera, fijarTropas } from './ayudas.js';
import { ordenesEconomicas } from '../../juegos/conquista/turno/economia.js';
import { movimientos } from '../../juegos/conquista/turno/movimiento.js';
import { rupturas, pactosNuevos, mensajesYNotas } from '../../juegos/conquista/turno/diplomacia.js';

test('romper un pacto resta 3 de honor, lo acaba y deshonra a quien baja a 2 o menos', () => {
  const E = nuevoEstado(4);
  E.reinos[0].pactos[1] = E.reinos[1].pactos[0] = 2; E.reinos[0].pactoOk[1] = E.reinos[1].pactoOk[0] = true;
  const ctx = contexto(E, { 0: { ordenes: ['romper Ambar'] } });
  ordenesEconomicas(ctx); rupturas(ctx);
  assert.deepEqual([E.reinos[0].pactos[1], E.reinos[1].pactos[0]], [0, 0]);
  assert.equal(E.reinos[0].pactoOk[1], false);
  assert.equal(E.reinos[0].honor, 2);
  assert.equal(E.reinos[0].deshonrado, true);
  assert.equal(E.stats[0].rupturas, 1);
  assert.ok(ctx.eventos.some((e) => e.tipo === 'ruptura' && e.k === 0 && e.contra === 1));
  assert.ok(ctx.eventos.some((e) => e.tipo === 'deshonra' && e.k === 0));
});

test('romper sin pacto vigente se descarta', () => {
  const E = nuevoEstado(4);
  const ctx = contexto(E, { 0: { ordenes: ['romper Ambar'] } });
  ordenesEconomicas(ctx); rupturas(ctx);
  assert.equal(ctx.descartes[0][0].motivo, 'no tienes un pacto vigente con ese reino');
  assert.equal(E.reinos[0].honor, 5);
});

test('romper y atacar al aliado en el mismo turno es valido', () => {
  const E = nuevoEstado(4), [a, d] = frontera(E, 0, -1);
  E.dueno[d] = 1; fijarTropas(E, d, 1); E.fort[d] = 0; fijarTropas(E, a, 10);
  E.reinos[0].pactos[1] = E.reinos[1].pactos[0] = 1;
  const ctx = contexto(E, { 0: { ordenes: ['romper Ambar', `mover ${R(a)} ${R(d)} 8`] } });
  ordenesEconomicas(ctx); rupturas(ctx); movimientos(ctx);
  assert.equal(E.dueno[d], 0);
});

test('pacto: se firma cuando los dos lo proponen en el mismo turno y dura 2 turnos', () => {
  const E = nuevoEstado(4);
  const ctx = contexto(E, { 0: { pacto_con: 'Ambar' }, 1: { pacto_con: 'Azur' } });
  pactosNuevos(ctx);
  assert.equal(E.reinos[0].pactos[1], 3); // firmado al final del turno 1: vigente en los turnos 2 y 3
  assert.equal(E.reinos[1].pactos[0], 3);
  assert.equal(E.reinos[0].pactoOk[1], true);
  assert.equal(E.stats[0].pactos, 1);
  assert.ok(ctx.eventos.some((e) => e.tipo === 'pacto'));
});

test('pacto: la propuesta queda abierta un turno mas, pero no dos', () => {
  const E = nuevoEstado(4);
  pactosNuevos(contexto(E, { 0: { pacto_con: 'Ambar' } })); // turno 1: solo propone el reino 0
  assert.equal(E.reinos[0].pactos[1], 0);
  assert.equal(E.reinos[0].propuestaPrevia, 1);
  E.turno = 1;
  pactosNuevos(contexto(E, { 1: { pacto_con: 'Azur' } })); // turno 2: responde el reino 1
  assert.equal(E.reinos[0].pactos[1], 4);
  // si el reino 0 no repite en el turno 2 y el reino 1 responde en el 3, ya caduco
  const F = nuevoEstado(4);
  pactosNuevos(contexto(F, { 0: { pacto_con: 'Ambar' } }));
  F.turno = 1; pactosNuevos(contexto(F, {}));
  F.turno = 2; pactosNuevos(contexto(F, { 1: { pacto_con: 'Azur' } }));
  assert.equal(F.reinos[0].pactos[1], 0);
});

test('pacto: no lo firma un reino deshonrado ni hay pactos con 2 reinos ni en la muerte subita', () => {
  const E = nuevoEstado(4);
  E.reinos[0].honor = 2;
  pactosNuevos(contexto(E, { 0: { pacto_con: 'Ambar' }, 1: { pacto_con: 'Azur' } }));
  assert.equal(E.reinos[0].pactos[1], 0);
  const dos = nuevoEstado(2);
  pactosNuevos(contexto(dos, { 0: { pacto_con: 'Ambar' }, 1: { pacto_con: 'Azur' } }));
  assert.equal(dos.reinos[0].pactos[1], 0);
  const F = nuevoEstado(4);
  F.turno = 28; // se juega el turno 29
  pactosNuevos(contexto(F, { 0: { pacto_con: 'Ambar' }, 1: { pacto_con: 'Azur' } }));
  assert.equal(F.reinos[0].pactos[1], 0);
});

test('pacto_con a un reino que no existe en esta partida (Marfil con 3 reinos) o a uno mismo se ignora sin errores', () => {
  const E = nuevoEstado(3);
  assert.doesNotThrow(() => pactosNuevos(contexto(E, { 0: { pacto_con: 'Marfil' }, 1: { pacto_con: 'Ambar' } })));
  assert.equal(E.reinos[0].propuestaPrevia, null);
  assert.equal(E.reinos[1].propuestaPrevia, null);
});

test('mensajes publicos, privados (al turno siguiente), nota y ofertas', () => {
  const E = nuevoEstado(3);
  const ctx = contexto(E, { 0: { mensaje: 'Paz a todos', privados: [{ a: 'Ambar', texto: 'Ataca a Violeta' }, { a: 'Marfil', texto: 'no existe' }], nota: 'Plan A' } });
  ctx.pend.ofertas[1] = [{ de: 0, doy: 'Hierro', dc: 4, pido: 'Madera', pc: 4 }];
  ctx.obed[0].total = 3;
  mensajesYNotas(ctx);
  assert.deepEqual(ctx.mensajes, [{ k: 0, texto: 'Paz a todos' }]);
  assert.deepEqual(E.reinos[1].privIn, [{ de: 0, texto: 'Ataca a Violeta' }]);
  assert.deepEqual(ctx.privados, [{ k: 0, a: 1, texto: 'Ataca a Violeta' }]);
  assert.equal(E.reinos[0].nota, 'Plan A');
  assert.equal(E.reinos[1].ofertasIn.length, 1);
  assert.equal(ctx.descartes[0].length, 1); // el privado a Marfil
  assert.equal(ctx.obed[0].validas, 1);
});

test('la nota: sin campo se conserva, vacia se borra', () => {
  const E = nuevoEstado(3);
  E.reinos[0].nota = 'vieja';
  mensajesYNotas(contexto(E, {}));
  assert.equal(E.reinos[0].nota, 'vieja');
  mensajesYNotas(contexto(E, { 0: { nota: '' } }));
  assert.equal(E.reinos[0].nota, '');
});

test('un reino que cae en este turno deja su mensaje pero ya no recibe ni envia nada: ofertas y privados de caidos se descartan', () => {
  const E = nuevoEstado(3);
  const ctx = contexto(E, { 1: { mensaje: 'Adios', privados: [{ a: 'Azur', texto: 'ultimo privado' }] } });
  ctx.pend.ofertas[0] = [{ de: 1, doy: 'Hierro', dc: 4, pido: 'Madera', pc: 4 }];
  E.reinos[1].vivo = false; // cayo durante los movimientos de este turno
  E.reinos[2].privIn = [{ de: 1, texto: 'viejo' }];
  mensajesYNotas(ctx);
  assert.deepEqual(ctx.mensajes, [{ k: 1, texto: 'Adios' }]);
  assert.deepEqual(E.reinos[0].ofertasIn, []); // la oferta de un reino caido no llega
  assert.equal(E.reinos[1].privIn.length, 0);
});
