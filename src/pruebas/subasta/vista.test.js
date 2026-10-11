// vista(estado, i) decide lo que sabe cada jugador. Un error aqui invalida la temporada entera (CLAUDE.md, invariante 2): el secreto de este
// juego es el banco de los demas y cuanto apostaron.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vistaTexto } from '../../juegos/subasta/vista.js';
import { crearRng } from '../../rng.js';
import { SUBASTAS } from '../../juegos/subasta/constantes.js';
import { nuevoEstado, subasta, apuesta } from './ayudas.js';
import { aplicarTurno } from '../../juegos/subasta/turno.js';

test('al empezar trae la subasta, tu banco, tus fichas, la tabla de fichas y la instruccion, y ningun historial', () => {
  const E = nuevoEstado();
  const v = vistaTexto(E, 1);
  assert.match(v, /^SUBASTA 1 DE 19 \(despues de esta quedan 18\)/);
  assert.ok(v.includes('Tu banco: 600.0 segundos'));
  assert.ok(v.includes('Tus fichas: 0'));
  assert.ok(v.includes('Jugador 1: 0 | Jugador 2 (tu): 0 | Jugador 3: 0 | Jugador 4: 0 | Jugador 5: 0'));
  assert.ok(v.includes('AHORA: responde "apuesta"'));
  assert.doesNotMatch(v, /HISTORIAL/);
});

test('despues de las subastas el historial dice quien gano y cual fue TU apuesta, nunca la de los demas', () => {
  const E = nuevoEstado();
  subasta(E, [15, 32, 47, 51, 0]);
  subasta(E, [0, 0, 5, 0, 0]);
  subasta(E, [20, 20, 3, 0, 0]);
  const v = vistaTexto(E, 0);
  assert.match(v, /^SUBASTA 4 DE 19 \(despues de esta quedan 15\)/);
  assert.ok(v.includes('S1: gana J4 | tu apuesta 15.0'));
  assert.ok(v.includes('S2: gana J3 | tu apuesta 0.0'));
  assert.ok(v.includes('S3: nadie gana | tu apuesta 20.0'));
  assert.ok(v.includes('Tu banco: 565.0 segundos'));
  assert.ok(v.includes('Jugador 1 (tu): 0 | Jugador 2: 0 | Jugador 3: 1 | Jugador 4: 1 | Jugador 5: 0'));
  const v3 = vistaTexto(E, 2);
  assert.ok(v3.includes('S1: gana J4 | tu apuesta 47.0'));
  assert.ok(v3.includes('Tu banco: 545.0 segundos'));
  // el Jugador 3 aposto 47.0 en la subasta 1; el Jugador 1 no debe verlo
  assert.ok(!v.includes('47.0'));
  assert.ok(!v.includes('51.0'));
  assert.ok(!v.includes('32.0'));
});

test('el banco y las apuestas de los demas no aparecen aunque sean numeros distintivos', () => {
  const E = nuevoEstado();
  E.bancos = [111.1, 222.2, 333.3, 444.4, 555.5].map((s) => Math.round(s * 10));
  E.apuestas = [[{ subasta: 1, decimas: 71 }], [{ subasta: 1, decimas: 88 }], [{ subasta: 1, decimas: 99 }], [{ subasta: 1, decimas: 66 }], [{ subasta: 1, decimas: 55 }]];
  E.historial = [{ subasta: 1, ganador: 2, sinGanador: null }];
  E.subasta = 2;
  const v = vistaTexto(E, 0);
  assert.ok(v.includes('111.1') && v.includes('7.1'), 'lo propio si se ve');
  for (const ajeno of ['222.2', '333.3', '444.4', '555.5', '8.8', '9.9', '6.6', '5.5']) assert.ok(!v.includes(ajeno), `se filtro ${ajeno}`);
});

test('no interferencia: si cambian el banco y las apuestas de los demas, mi vista queda identica (25 partidas al azar)', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const E = nuevoEstado(seed);
    const rng = crearRng(seed * 17);
    while (!E.fin) {
      for (let i = 0; i < 5; i++) {
        if (E.bancos[i] <= 0) continue;
        const base = vistaTexto(E, i);
        const otro = structuredClone(E);
        for (let t = 0; t < 5; t++) {
          if (t === i) continue;
          otro.bancos[t] = Math.floor(rng() * 6000);
          otro.apostado[t] = Math.floor(rng() * 6000);
          otro.apuestas[t] = Array.from({ length: otro.apuestas[t].length }, (_, k) => ({ subasta: k + 1, decimas: Math.floor(rng() * 999) }));
          otro.stats[t] = { respuestas: 99, validas: 98, invalidas: 1, retiradas: 5, ganadas: 7, empates: 3, todoElBanco: 2 };
        }
        assert.equal(vistaTexto(otro, i), base, `seed ${seed}, subasta ${E.subasta}, jugador ${i}`);
        assert.doesNotMatch(base, /undefined|NaN|null/);
      }
      aplicarTurno(E, E.bancos.map((b) => (b > 0 ? apuesta(Math.round(rng() * 60 * 10) / 10) : null)));
    }
  }
});

test('la ultima subasta dice que ya no quedan mas', () => {
  const E = nuevoEstado();
  for (let n = 1; n < SUBASTAS; n++) subasta(E, [0, 0, 0, 0, 0]);
  assert.match(vistaTexto(E, 0), /^SUBASTA 19 DE 19 \(es la ultima\)/);
});
