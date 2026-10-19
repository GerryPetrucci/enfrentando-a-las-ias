// vista(estado, i) decide lo que sabe cada jugador. Un error aqui invalida todas las partidas de ese juego (CLAUDE.md, invariante 2).
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vistaTexto } from '../../juegos/solitario/vista.js';
import { aplicarTurno } from '../../juegos/solitario/turno.js';
import { normalizarRespuesta } from '../../juegos/solitario/ordenes.js';
import { disponibles } from '../../juegos/solitario/estado.js';
import { crearRng } from '../../rng.js';
import { nuevoEstado, pareja, marca, ronda, rondaBasica } from './ayudas.js';

const EJEMPLO = [[1, 3], [1, 4], [2, 5], [4, 6], [5, 7]];

test('la fase 1 trae la ronda, tus cartas, la tabla, el proximo corte y la instruccion, y ninguna pareja', () => {
  const E = nuevoEstado();
  const v = vistaTexto(E, 0);
  assert.match(v, /^RONDA 1 DE 12 \(ciclo 1\) - FASE 1 DE 2: ELIGE TU PAREJA/);
  assert.ok(v.includes('Tus cartas disponibles: 1 2 3 4 5 6 7 8'));
  assert.ok(v.includes('Carta bloqueada esta ronda: ninguna'));
  assert.ok(v.includes('Cartas que ya jugaste en este ciclo: ninguna'));
  assert.ok(v.includes('Jugador 1 (tu): sigue, puntos 0, fichas 0'));
  assert.ok(v.includes('Jugador 2: sigue, puntos 0, fichas 0; cartas disponibles: 1 2 3 4 5 6 7 8; bloqueada: ninguna'));
  assert.ok(v.includes('Proximo corte: al final de la ronda 3'));
  assert.ok(v.includes('AHORA (fase 1): responde solo "cartas"'));
  assert.doesNotMatch(v, /pareja de esta ronda|Tu pareja|HISTORIAL/);
});

test('la fase 2 trae tu pareja y la de cada rival que sigue, pero ninguna marca', () => {
  const E = nuevoEstado();
  aplicarTurno(E, EJEMPLO.map((p) => pareja(...p)));
  const v = vistaTexto(E, 0);
  assert.match(v, /FASE 2 DE 2: MARCA LA CARTA QUE JUEGAS/);
  assert.ok(v.includes('Tu pareja: 1 y 3'));
  assert.ok(v.includes('Jugador 2: sigue, puntos 0, fichas 0; cartas disponibles: 1 2 3 4 5 6 7 8; bloqueada: ninguna; pareja de esta ronda: 1 y 4'));
  assert.ok(v.includes('pareja de esta ronda: 5 y 7'));
  assert.ok(v.includes('AHORA (fase 2): responde solo "juega"'));
  assert.ok(!v.includes('Jugador 1 (tu): sigue, puntos 0, fichas 0; cartas'), 'de uno mismo no se repite la lista');
});

test('despues de una ronda el historial cuenta parejas, marcas y ganador, y la carta bloqueada aparece', () => {
  const E = nuevoEstado();
  ronda(E, EJEMPLO, [1, 1, 2, 4, 5]);
  const v = vistaTexto(E, 0);
  assert.match(v, /RONDA 2 DE 12/);
  assert.ok(v.includes('HISTORIAL (J = jugador; pareja > carta que jugo):'));
  assert.ok(v.includes('R1: J1(tu) 1/3>1 | J2 1/4>1 | J3 2/5>2 | J4 4/6>4 | J5 5/7>5 -> gana J3 con 2'));
  assert.ok(v.includes('Carta bloqueada esta ronda: 3'));
  assert.ok(v.includes('Cartas que ya jugaste en este ciclo: 1'));
  assert.ok(v.includes('Tus cartas disponibles: 2 4 5 6 7 8'));
  assert.ok(v.includes('Jugador 3: sigue, puntos 2, fichas 1'));
  assert.ok(vistaTexto(E, 2).includes('Jugador 3 (tu): sigue, puntos 2, fichas 1'));
  const sinGanador = nuevoEstado();
  ronda(sinGanador, [[1, 3], [1, 4], [1, 5], [2, 6], [2, 7]], [1, 1, 1, 2, 2]);
  assert.ok(vistaTexto(sinGanador, 1).includes('J5 2/7>2 -> nadie gana'));
});

test('tu puesto se calcula por puntos, fichas y ultima victoria, sin usar el sorteo', () => {
  const E = nuevoEstado();
  assert.ok(vistaTexto(E, 0).includes('Tu puesto ahora (sin contar el sorteo): 1 de 5 (empatado con 4 mas)'));
  E.puntos = [2, 7, 7, 0, 0]; E.fichas = [1, 2, 1, 0, 0]; E.ultimaVictoria = [1, 2, 3, 0, 0];
  assert.ok(vistaTexto(E, 1).includes('Tu puesto ahora (sin contar el sorteo): 1 de 5'));
  assert.ok(vistaTexto(E, 2).includes('Tu puesto ahora (sin contar el sorteo): 2 de 5'));
  assert.ok(vistaTexto(E, 0).includes('Tu puesto ahora (sin contar el sorteo): 3 de 5'));
});

test('un jugador a salvo aparece como tal, y despues de la ronda 6 el proximo hito es la final', () => {
  const E = nuevoEstado();
  for (let r = 1; r <= 3; r++) rondaBasica(E);
  const salvo = E.puesto.indexOf('salvo');
  const otro = E.jugando.indexOf(true);
  assert.ok(vistaTexto(E, otro).includes(`Jugador ${salvo + 1}: a salvo (corte 1), puntos`));
  assert.ok(vistaTexto(E, otro).includes('Proximo corte: al final de la ronda 6'));
  for (let r = 4; r <= 6; r++) rondaBasica(E);
  const v = vistaTexto(E, E.jugando.indexOf(true));
  assert.ok(v.includes('Final: al final de la ronda 12'));
  assert.ok(v.includes('a salvo (corte 2)'));
  assert.doesNotMatch(v, /Proximo corte/);
});

test('la vista nunca filtra el azar de reemplazo ni el sorteo, con jugadas variadas, salidas y respuestas ilegales', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const E = nuevoEstado(seed);
    const rng = crearRng(seed * 13);
    const pick = (xs) => xs[Math.floor(rng() * xs.length)];
    while (!E.fin) {
      const r = E.ronda - 1;
      const ocultos = [...E.sorteo.flat(), ...E.azar[r].marca, ...E.azar[r].pareja.flat()].map((d) => String(d).slice(0, 8));
      for (let s = 0; s < 5; s++) {
        if (!E.jugando[s]) continue;
        const v = vistaTexto(E, s);
        for (const o of ocultos) assert.ok(!v.includes(o), `seed ${seed}: la vista contiene ${o}`);
        assert.doesNotMatch(v, /undefined|NaN|null/, `seed ${seed}`);
      }
      if (E.fase === 1) {
        aplicarTurno(E, [0, 1, 2, 3, 4].map((s) => {
          if (!E.jugando[s]) return null;
          if (rng() < 0.15) return normalizarRespuesta({ cartas: [9, 9] }); // ilegal: se reemplaza
          const d = disponibles(E, s), a = pick(d);
          return pareja(a, pick(d.filter((c) => c !== a)));
        }));
      } else {
        aplicarTurno(E, [0, 1, 2, 3, 4].map((s) => (E.jugando[s] ? (rng() < 0.15 ? null : marca(pick(E.parejas[s]))) : null)));
      }
    }
  }
});
