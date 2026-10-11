// El limitador reparte las llamadas en el tiempo para no pasar del tope por minuto de OpenRouter.
// Se prueba con un reloj falso: nadie espera de verdad. La pausa solo anota cuanto se pidio esperar; el reloj no se
// mueve solo, porque varias llamadas esperan a la vez desde el mismo instante.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearLimitador } from '../limitador.js';

function relojFalso(inicio = 1000) {
  let t = inicio;
  const pausas = [];
  return { ahora: () => t, pausa: async (ms) => { pausas.push(ms); }, pausas, avanzar: (ms) => { t += ms; } };
}

test('las llamadas que llegan juntas se escalonan a una cada 60/porMinuto segundos', async () => {
  const reloj = relojFalso();
  const lim = crearLimitador({ porMinuto: 20, ahora: reloj.ahora, pausa: reloj.pausa });
  assert.equal(lim.intervalo, 3000);
  await Promise.all([lim.esperar(), lim.esperar(), lim.esperar()]);
  assert.deepEqual(reloj.pausas, [3000, 6000]);
});

test('despues de un rato sin llamadas, la siguiente sale sin esperar', async () => {
  const reloj = relojFalso();
  const lim = crearLimitador({ porMinuto: 20, ahora: reloj.ahora, pausa: reloj.pausa });
  await lim.esperar();
  reloj.avanzar(60000);
  await lim.esperar();
  assert.deepEqual(reloj.pausas, []);
});

test('un ritmo que no es un numero positivo es un error de uso', () => {
  for (const malo of [0, -5, NaN, undefined, 'rapido']) assert.throws(() => crearLimitador({ porMinuto: malo }), /porMinuto/);
});
