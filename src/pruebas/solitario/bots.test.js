// Los bots de control: juegan legal en las dos fases, no modifican el estado y solo usan el rng de su asiento.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOTS, INFO_BOTS } from '../../juegos/solitario-bots.js';
import { disponibles } from '../../juegos/solitario/estado.js';
import { aplicarTurno } from '../../juegos/solitario/turno.js';
import { normalizarRespuesta } from '../../juegos/solitario/ordenes.js';
import { crearRng } from '../../rng.js';
import { nuevoEstado, jugarConBots, pareja, ronda } from './ayudas.js';

const todos = Object.entries(BOTS);

test('hay cinco bots, cada uno con nombre publico y color', () => {
  assert.deepEqual(Object.keys(BOTS).sort(), ['azar', 'bajo', 'escalera', 'lector', 'medio']);
  for (const id of Object.keys(BOTS)) {
    assert.ok(INFO_BOTS[id].nombre && /^#[0-9A-Fa-f]{6}$/.test(INFO_BOTS[id].color), id);
  }
});

test('en la fase 1 devuelven dos cartas disponibles y distintas; en la fase 2, una de su pareja', () => {
  for (const [id, fn] of todos) {
    for (let seed = 1; seed <= 15; seed++) {
      const E = nuevoEstado(seed);
      const rng = crearRng(seed);
      for (let r = 0; r < 12 && !E.fin; r++) {
        const respuestas1 = [0, 1, 2, 3, 4].map((s) => (E.jugando[s] ? normalizarRespuesta(fn(E, s, rng)) : null));
        for (const s of [0, 1, 2, 3, 4]) {
          if (!E.jugando[s]) continue;
          const c = respuestas1[s].cartas;
          assert.ok(c && c.length === 2 && c[0] !== c[1], `${id} seed ${seed}: pareja ${JSON.stringify(c)}`);
          assert.ok(c.every((x) => disponibles(E, s).includes(x)), `${id}: carta no disponible`);
        }
        aplicarTurno(E, respuestas1);
        const respuestas2 = [0, 1, 2, 3, 4].map((s) => (E.jugando[s] ? normalizarRespuesta(fn(E, s, rng)) : null));
        for (const s of [0, 1, 2, 3, 4]) if (E.jugando[s]) assert.ok(E.parejas[s].includes(respuestas2[s].juega), `${id}: marca fuera de la pareja`);
        aplicarTurno(E, respuestas2);
      }
    }
  }
});

test('no modifican el estado y con el mismo rng responden lo mismo', () => {
  for (const [id, fn] of todos) {
    const E = nuevoEstado(5);
    ronda(E, [[1, 3], [1, 4], [2, 5], [4, 6], [5, 7]], [1, 1, 2, 4, 5]);
    const copia = JSON.stringify(E);
    const a = fn(E, 1, crearRng(9));
    const b = fn(E, 1, crearRng(9));
    assert.equal(JSON.stringify(E), copia, id);
    assert.deepEqual(a, b, id);
  }
});

test('bajo juega siempre lo mas bajo; lector evita el numero que mostraron mas rivales', () => {
  const E = nuevoEstado();
  assert.deepEqual(BOTS.bajo(E, 0, crearRng(1)).cartas, [1, 2]);
  aplicarTurno(E, [pareja(1, 3), pareja(1, 4), pareja(1, 5), pareja(2, 6), pareja(7, 8)]);
  assert.equal(BOTS.bajo(E, 0, crearRng(1)).juega, 1);
  // el jugador 3 (pareja 2 y 6) ve que ningun rival mostro el 2 ni el 6: empata y juega el menor (2); el jugador 0 (1 y 3) ve el 1 en dos rivales: juega el 3
  assert.equal(BOTS.lector(E, 3, crearRng(1)).juega, 2);
  assert.equal(BOTS.lector(E, 0, crearRng(1)).juega, 3);
});

test('una partida entera entre los cinco bots termina en 24 turnos sin una sola respuesta invalida', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const { E, registros } = jugarConBots(seed, Object.values(BOTS));
    assert.equal(E.fin, true, `seed ${seed}`);
    assert.equal(registros.length, 24, `seed ${seed}`);
    for (const reg of registros) assert.ok(reg.invalidas.every((x) => x !== true), `seed ${seed}`);
  }
});
