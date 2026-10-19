// vista(estado, i) decide lo que sabe cada jugador. Un error aqui invalida todas las partidas de ese juego (CLAUDE.md, invariante 2): lo secreto de este juego
// es el orden futuro del crupier y, mientras se decide, lo que el rival juega a la vez (que el estado ni siquiera guarda todavia).
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vistaTexto } from '../../juegos/mayormenor/vista.js';
import { crearRng } from '../../rng.js';
import { activoDe, RONDAS } from '../../juegos/mayormenor/constantes.js';
import { crupierDeRonda } from '../../juegos/mayormenor/estado.js';
import { aplicarTurno } from '../../juegos/mayormenor/turno.js';
import { normalizarRespuesta } from '../../juegos/mayormenor/ordenes.js';
import { nuevoEstado, ronda, fijarCrupier } from './ayudas.js';

test('al empezar: ronda, papel, carta del crupier, fichas, manos, mazos del crupier, instruccion y ningun historial', () => {
  const E = nuevoEstado(4);
  const c = crupierDeRonda(E);
  const v0 = vistaTexto(E, 0), v1 = vistaTexto(E, 1);
  assert.match(v0, /^RONDA 1 DE 18 \(despues de esta quedan 17\)/);
  assert.ok(v0.includes('Tu papel: JUGADOR ACTIVO'));
  assert.ok(v1.includes('Tu papel: PREDICTOR'));
  for (const v of [v0, v1]) {
    assert.ok(v.includes(`Carta del crupier esta ronda: ${c} (sale del mazo del Jugador 1)`));
    assert.ok(v.includes('Tus fichas: 10 | Fichas del rival: 10'));
    assert.ok(v.includes('Tus cartas: 0 1 2 3 4 5 6 7 8 9 10'));
    assert.ok(v.includes('Cartas que le quedan a tu rival: 0 1 2 3 4 5 6 7 8 9 10'));
    assert.doesNotMatch(v, /HISTORIAL/);
  }
  assert.ok(v0.includes('Mazo del Jugador 1 (tu): ya salieron (ninguna) | faltan'));
  assert.ok(v1.includes('Mazo del Jugador 1: ya salieron (ninguna) | faltan'));
  assert.ok(v1.includes('Mazo del Jugador 2 (tu): ya salieron (ninguna) | faltan 1 2 3 4 5 6 7 8 9'));
  assert.ok(v0.includes('AHORA: eres el jugador activo: responde "carta"'));
  assert.ok(v1.includes('AHORA: eres el predictor: responde "lado"'));
  assert.ok(v1.includes('de 1 a 10'));
});

test('la vista dice quien eres: "Eres el Jugador N" en la segunda linea, para leer el historial (J1 / J2)', () => {
  const E = nuevoEstado();
  assert.equal(vistaTexto(E, 0).split('\n')[1], 'Eres el Jugador 1 (en el historial apareces como J1)');
  assert.equal(vistaTexto(E, 1).split('\n')[1], 'Eres el Jugador 2 (en el historial apareces como J2)');
});

test('el historial marca con [reemplazo] las jugadas que puso el juego por una respuesta ilegal, las de los dos', () => {
  const E = nuevoEstado();
  fijarCrupier(E, 5);
  E.azar[0].carta = 0; // el activo (asiento 0) no responde: el juego le juega la primera carta de su mano
  aplicarTurno(E, [null, normalizarRespuesta({ lado: 'mayor', fichas: 2 })]);
  E.azar[1].lado = 0.2; // el predictor (asiento 0, ronda 2) responde mal: 1 ficha al lado sorteado ("mayor")
  ronda(E, { crupier: 5, carta: 2, lado: 'quizas', fichas: 0 });
  for (const i of [0, 1]) {
    const v = vistaTexto(E, i);
    assert.ok(v.includes('R1 (activo J1): crupier 5, jugo 0 (menor) [reemplazo] | J2 aposto 2 a mayor: falla (-2)'), v);
    assert.ok(v.includes('R2 (activo J2): crupier 5, jugo 2 (menor) | J1 aposto 1 a mayor [reemplazo]: falla (-1)'), v);
  }
});

test('despues del final la vista no revela la carta siguiente del crupier ni muestra "undefined"', () => {
  const E = nuevoEstado(1);
  E.fichas = [10, 2];
  ronda(E, { crupier: 5, carta: 2, lado: 'mayor', fichas: 2 }); // fin anticipado: la siguiente carta del mazo nunca salio
  assert.equal(E.fin, true);
  for (const i of [0, 1]) {
    const v = vistaTexto(E, i);
    assert.match(v, /^PARTIDA TERMINADA \(se jugo 1 ronda de 18\)/);
    assert.doesNotMatch(v, /Carta del crupier|undefined|NaN|AHORA/);
  }
  assert.ok(vistaTexto(E, 0).includes('Tus fichas: 10 | Fichas del rival: 0'));
  const F = nuevoEstado(2);
  F.ronda = RONDAS;
  ronda(F, { crupier: 5, carta: 5, lado: 'mayor', fichas: 1 });
  assert.match(vistaTexto(F, 0), /^PARTIDA TERMINADA \(se jugaron 18 rondas de 18\)/);
  assert.doesNotMatch(vistaTexto(F, 1), /Carta del crupier|undefined/);
});

test('la carta de esta ronda no aparece entre las que "faltan" de su mazo (ya se conoce)', () => {
  const E = nuevoEstado(9);
  const c = crupierDeRonda(E);
  const linea = vistaTexto(E, 0).split('\n').find((l) => l.startsWith('Mazo del Jugador 1'));
  const faltan = linea.split('| faltan ')[1].split(' ').map(Number);
  assert.equal(faltan.length, 8);
  assert.ok(!faltan.includes(c));
});

test('despues de las rondas el historial es publico: cartas, apuestas y resultados de los dos', () => {
  const E = nuevoEstado();
  ronda(E, { crupier: 5, carta: 8, lado: 'mayor', fichas: 3 });
  ronda(E, { crupier: 4, carta: 4, lado: 'menor', fichas: 2 });
  ronda(E, { crupier: 7, carta: 1, lado: 'mayor', fichas: 5 });
  for (const i of [0, 1]) {
    const v = vistaTexto(E, i);
    assert.match(v, /^RONDA 4 DE 18/);
    assert.ok(v.includes('R1 (activo J1): crupier 5, jugo 8 (mayor, +3) | J2 aposto 3 a mayor: acierta (+3)'));
    assert.ok(v.includes('R2 (activo J2): crupier 4, jugo 4 (igual) | J1 aposto 2 a menor: se devuelve'));
    assert.ok(v.includes('R3 (activo J1): crupier 7, jugo 1 (menor) | J2 aposto 5 a mayor: falla (-5)'));
  }
  const v = vistaTexto(E, 0);
  assert.ok(v.includes('Tus fichas: 13 | Fichas del rival: 8'), v);
  assert.ok(v.includes('Mazo del Jugador 1 (tu): ya salieron 5 7'));
  assert.ok(v.includes('Mazo del Jugador 2: ya salieron 4'));
  assert.ok(v.includes('Cartas que le quedan a tu rival: 0 1 2 3 5 6 7 8 9 10'));
});

test('no interferencia: cambiar el orden futuro del crupier, los sorteos y las estadisticas ajenas no cambia la vista de nadie (25 partidas)', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const E = nuevoEstado(seed);
    const rng = crearRng(seed * 17);
    while (!E.fin) {
      for (const i of [0, 1]) {
        const base = vistaTexto(E, i);
        const otro = structuredClone(E);
        for (const s of [0, 1]) {
          // lo que ya se conoce del mazo (salidas y, para el activo, la carta de esta ronda) queda igual; el resto se reordena
          const desde = E.crupierSalidas[s].length + (activoDe(E.ronda) === s ? 1 : 0);
          const futuro = otro.crupier[s].slice(desde).reverse();
          otro.crupier[s].splice(desde, futuro.length, ...futuro);
        }
        otro.azar = otro.azar.map(() => ({ carta: rng(), lado: rng() }));
        otro.semillaNarracion = Math.floor(rng() * 1e9);
        otro.stats[1 - i] = { respuestas: 99, validas: 98, invalidas: 1, apuestas: 5, aciertos: 4, fichasApostadas: 40, apostoTodo: 2, rondasActivo: 9, fichasActivo: 33 };
        assert.equal(vistaTexto(otro, i), base, `seed ${seed}, ronda ${E.ronda}, jugador ${i}`);
        assert.doesNotMatch(base, /undefined|NaN|null/);
      }
      const a = activoDe(E.ronda);
      const resp = [null, null];
      resp[a] = normalizarRespuesta({ carta: E.mano[a][Math.floor(rng() * E.mano[a].length)] });
      resp[1 - a] = normalizarRespuesta({ lado: rng() < 0.5 ? 'mayor' : 'menor', fichas: 1 + Math.floor(rng() * 3) });
      aplicarTurno(E, resp);
    }
  }
});

test('la ultima ronda dice que ya no quedan mas', () => {
  const E = nuevoEstado();
  E.ronda = RONDAS;
  assert.match(vistaTexto(E, 0), /^RONDA 18 DE 18 \(es la ultima\)/);
});
