// vista(estado, i) decide lo que sabe cada jugador. Un error aqui invalida todas las partidas de ese juego (CLAUDE.md, invariante 2). Lo secreto de este juego:
// los dados de la ronda ANTES de lanzarlos, el valor de los ocultos ajenos que no se han usado, las tarjetas de la ronda en curso y lo que los demas
// eligen a la vez en el enfrentamiento en curso.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vistaTexto } from '../../juegos/tripledado/vista.js';
import { disponibles } from '../../juegos/tripledado/estado.js';
import { aplicarTurno } from '../../juegos/tripledado/turno.js';
import { normalizarRespuesta } from '../../juegos/tripledado/ordenes.js';
import { RONDAS, TARJETAS } from '../../juegos/tripledado/constantes.js';
import { crearRng } from '../../rng.js';
import { nuevoEstado, fijarDados, escenarioBasico, prediccion, enfrentamiento, PRIMEROS } from './ayudas.js';

const enPrimerEnfrentamiento = (tarjetas = ['MORE', 'MIN', 'MAX', 'ZERO']) => {
  const E = nuevoEstado();
  prediccion(E, tarjetas);
  escenarioBasico(E);
  return E;
};

test('la prediccion: ronda, fase, quien eres, tus tarjetas, puntos, la instruccion, y NINGUN dado (aun no se lanzan)', () => {
  const E = nuevoEstado();
  const v = vistaTexto(E, 1);
  assert.match(v, /^RONDA 1 DE 4 - PREDICCION/);
  assert.equal(v.split('\n')[1], 'Eres el Jugador 2 (en el historial apareces como J2)');
  assert.ok(v.includes('Tus tarjetas que te quedan: ZERO MIN MORE MAX'));
  assert.ok(v.includes('PUNTOS ACUMULADOS: J1 0 | J2 (tu) 0 | J3 0 | J4 0'));
  assert.ok(v.includes('AHORA: elige UNA de tus tarjetas (ZERO, MIN, MORE, MAX)'));
  assert.doesNotMatch(v, /TUS DADOS|DADOS DE LOS RIVALES|HISTORIAL|Tu tarjeta de esta ronda|TARJETAS YA USADAS/);
});

test('el enfrentamiento: tu tarjeta, tus dados con identificador, los blancos de los rivales y que ocultos les quedan, sin el valor de sus ocultos', () => {
  const E = enPrimerEnfrentamiento();
  const v = vistaTexto(E, 1);
  assert.match(v, /^RONDA 1 DE 4 - ENFRENTAMIENTO 1 DE 3/);
  assert.ok(v.includes('Tu tarjeta de esta ronda: MIN'));
  assert.ok(v.includes('TUS DADOS que no has gastado: b1=3 b2=4 b3=5 b4=2 b5=2 b6=2 b7=2 b8=2 b9=2 rojo=1 azul=1'));
  assert.ok(v.includes('J1: blancos 5 5 2 1 1 1 1 1 1 | ocultos sin usar: rojo azul'));
  assert.ok(v.includes('J3: blancos 6 4 3 3 3 3 3 3 1 | ocultos sin usar: rojo azul'));
  assert.ok(v.includes('AHORA: elige TRES dados distintos de los que no has gastado'));
  // el jugador 1 tiene rojo=6 y azul=3: el jugador 2 no debe verlos (ni en ningun otro formato)
  assert.doesNotMatch(v, /rojo=6|azul=3|rojo=5|azul=2|rojo=4|azul=4/);
  assert.ok(vistaTexto(E, 0).includes('rojo=6 azul=3'), 'cada uno ve los suyos');
  assert.ok(!v.includes('Tu tarjeta de esta ronda: MORE'), 'ni la tarjeta de los demas');
  // la tarjeta en curso ya no cuenta entre las que "te quedan": son las de las rondas siguientes
  assert.ok(v.includes('Tus tarjetas para las rondas siguientes: ZERO MORE MAX'));
  assert.doesNotMatch(v, /Tus tarjetas que te quedan/);
});

test('lo que ya no queda se dice "ninguno" o "ninguna", sin parentesis: rival sin blancos ni ocultos, y yo sin tarjetas para las rondas siguientes', () => {
  const E = enPrimerEnfrentamiento();
  E.gastados[0] = { blancos: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9'], rojo: true, azul: true };
  assert.ok(vistaTexto(E, 1).includes('J1: blancos ninguno | ocultos sin usar: ninguno'));
  const F = nuevoEstado();
  F.ronda = RONDAS;
  F.fase = 'jugada';
  F.enfrentamiento = 1;
  F.tarjetasUsadas = [['ZERO', 'MIN', 'MORE'], ['ZERO', 'MIN', 'MORE'], ['ZERO', 'MIN', 'MORE'], ['ZERO', 'MIN', 'MORE']];
  F.tarjetaActual = ['MAX', 'MAX', 'MAX', 'MAX'];
  assert.ok(vistaTexto(F, 0).includes('Tus tarjetas para las rondas siguientes: ninguna'));
  assert.doesNotMatch(vistaTexto(F, 0), /\(ninguna\)|\(ninguno\)/);
});

test('despues de un enfrentamiento el historial es publico y compacto, con los puntos y los dados gastados', () => {
  const E = enPrimerEnfrentamiento();
  enfrentamiento(E, PRIMEROS);
  const v = vistaTexto(E, 1);
  assert.match(v, /^RONDA 1 DE 4 - ENFRENTAMIENTO 2 DE 3/);
  assert.ok(v.includes('R1E1: J1 5-5-2 +3 | J2 5-4-3 +6 | J3 6-4-1 +0 | J4 2-1-1 +1'));
  assert.ok(v.includes('PUNTOS DE ESTA RONDA: J1 3 | J2 (tu) 6 | J3 0 | J4 1'), 'el "(tu)" va en el mismo lugar que en PUNTOS ACUMULADOS');
  assert.ok(v.includes('TUS DADOS que no has gastado: b4=2 b5=2 b6=2 b7=2 b8=2 b9=2 rojo=1 azul=1'));
  assert.ok(v.includes('J1: blancos 1 1 1 1 1 1 | ocultos sin usar: rojo azul'), 'J1 gasto b1 b2 b3 (5, 5, 2): le quedan seis unos');
});

test('un dado oculto usado se marca con r o a en el historial, con su valor ya revelado, y deja de aparecer como oculto sin usar', () => {
  const E = enPrimerEnfrentamiento();
  enfrentamiento(E, [['b1', 'b2', 'rojo'], ...PRIMEROS.slice(1)]);
  const v = vistaTexto(E, 1);
  assert.ok(v.includes('R1E1: J1 6r-5-5 +3 | J2 5-4-3 +6 | J3 6-4-1 +0 | J4 2-1-1 +1'));
  assert.ok(v.includes('J1: blancos 2 1 1 1 1 1 1 | ocultos sin usar: azul'));
  assert.doesNotMatch(vistaTexto(E, 0), /rojo=6/, 'el rojo ya se gasto: tampoco aparece entre mis dados');
});

test('una jugada que puso el juego se marca [reemplazo] en el historial', () => {
  const E = enPrimerEnfrentamiento();
  E.azar.dados[0][0][0] = [0, 0, 0];
  aplicarTurno(E, [null, ...PRIMEROS.slice(1).map((d) => normalizarRespuesta({ dados: d }))]);
  assert.match(vistaTexto(E, 1), /R1E1: J1 [^|]* \+\d+(\.\d+)? \[reemplazo\] \| J2 [^|]*\| J3/);
  assert.doesNotMatch(vistaTexto(E, 1).split('\n').find((l) => l.startsWith('R1E1')).split('|')[1], /reemplazo/);
});

test('despues del tercer enfrentamiento: la linea de cierre, las tarjetas ya usadas de todos y los puntos acumulados con premio', () => {
  const E = enPrimerEnfrentamiento(['MORE', 'ZERO', 'MIN', 'MAX']);
  fijarDados(E, 0, { blancos: [6, 6, 6, 1, 1, 1, 1, 1, 1] });
  fijarDados(E, 1, { blancos: [1, 2, 4, 1, 1, 1, 1, 1, 1] });
  fijarDados(E, 2, { blancos: [5, 5, 1, 1, 1, 1, 1, 1, 1] });
  fijarDados(E, 3, { blancos: [5, 5, 1, 1, 1, 1, 1, 1, 1] });
  E.enfrentamiento = 3;
  E.puntosRonda = [36, 0, 66, 108];
  enfrentamiento(E, PRIMEROS);
  const v = vistaTexto(E, 0);
  assert.match(v, /^RONDA 2 DE 4 - PREDICCION/);
  assert.ok(v.includes('R1 CIERRE: J1 MORE 9 acierta (18) | J2 ZERO 0 acierta (40) | J3 MIN 7.5 falla (7.5) | J4 MAX 11 acierta (22)'));
  assert.ok(v.includes('Tus tarjetas que te quedan: ZERO MIN MAX (ya usaste: MORE)'));
  assert.ok(v.includes('TARJETAS YA USADAS: J1 MORE | J2 ZERO | J3 MIN | J4 MAX'));
  assert.ok(v.includes('PUNTOS ACUMULADOS: J1 (tu) 18 | J2 40 | J3 7.5 | J4 22'));
  assert.doesNotMatch(v, /TUS DADOS/, 'otra vez antes de lanzar: ningun dado de la ronda 2');
});

test('una tarjeta que puso el juego se marca [reemplazo] en la linea de cierre', () => {
  const E = nuevoEstado();
  E.historial.push({
    tipo: 'cierre', ronda: 1, tarjetas: ['MORE', 'ZERO', 'MIN', 'MAX'], totales: [108, 0, 90, 132], aciertos: [true, true, false, true],
    puntos: [216, 480, 90, 264], reemplazadas: [false, true, false, false],
  });
  assert.ok(vistaTexto(E, 0).includes('J2 ZERO [reemplazo] 0 acierta (40)'));
});

test('no interferencia: cambiar los dados aun no lanzados, los ocultos ajenos sin usar, las tarjetas ajenas en curso, los sorteos y las estadisticas no cambia la vista de nadie (25 partidas)', () => {
  const nuevosDados = (rng) => ({ blancos: Array.from({ length: 9 }, () => 1 + Math.floor(rng() * 6)), rojo: 1 + Math.floor(rng() * 6), azul: 1 + Math.floor(rng() * 6) });
  for (let seed = 1; seed <= 25; seed++) {
    const E = nuevoEstado(seed);
    const rng = crearRng(seed * 17);
    while (!E.fin) {
      const forzada = E.fase === 'prediccion' && E.ronda === RONDAS;
      if (!forzada) {
        for (const i of [0, 1, 2, 3]) {
          const base = vistaTexto(E, i);
          const otro = structuredClone(E);
          // en la prediccion los dados de ESTA ronda aun no se lanzaron; en un enfrentamiento solo los de las rondas siguientes
          const desde = E.fase === 'jugada' ? E.ronda : E.ronda - 1;
          for (let ro = desde; ro < RONDAS; ro++) for (let s = 0; s < 4; s++) otro.dados[ro][s] = nuevosDados(rng);
          if (E.fase === 'jugada') {
            for (const s of [0, 1, 2, 3]) {
              if (s === i) continue;
              if (!E.gastados[s].rojo) otro.dados[E.ronda - 1][s].rojo = 1 + Math.floor(rng() * 6);
              if (!E.gastados[s].azul) otro.dados[E.ronda - 1][s].azul = 1 + Math.floor(rng() * 6);
              otro.tarjetaActual[s] = TARJETAS[Math.floor(rng() * 4)];
              otro.eligio[s] = !E.eligio[s];
            }
          }
          otro.azar = { tarjeta: otro.azar.tarjeta.map((f) => f.map(() => rng())), dados: otro.azar.dados.map((a) => a.map((b) => b.map(() => [rng(), rng(), rng()]))) };
          otro.semillaNarracion = Math.floor(rng() * 1e9);
          otro.stats = otro.stats.map(() => ({ respuestas: 99, validas: 98, invalidas: 1, predicciones: 5, aciertos: 4, ceros: 2, ocultosUsados: 9, puntosDeDados: 999 }));
          assert.equal(vistaTexto(otro, i), base, `seed ${seed}, ronda ${E.ronda}, fase ${E.fase} ${E.enfrentamiento}, jugador ${i}`);
          assert.doesNotMatch(base, /undefined|NaN|null/);
        }
      }
      const respuestas = [0, 1, 2, 3].map((s) => {
        if (forzada) return null;
        if (E.fase === 'prediccion') {
          const q = TARJETAS.filter((t) => !E.tarjetasUsadas[s].includes(t));
          return normalizarRespuesta({ tarjeta: q[Math.floor(rng() * q.length)] });
        }
        const pool = [...disponibles(E, s)];
        return normalizarRespuesta({ dados: [0, 1, 2].map(() => pool.splice(Math.floor(rng() * pool.length), 1)[0]) });
      });
      aplicarTurno(E, respuestas);
    }
  }
});

test('terminada la partida la vista solo dice los puntos finales (sin dados ni "undefined")', () => {
  const E = nuevoEstado();
  E.fin = true;
  E.ronda = RONDAS;
  E.puntos = [60 * 12, 20 * 12, 35 * 12, 10 * 12];
  const v = vistaTexto(E, 2);
  assert.match(v, /^PARTIDA TERMINADA/);
  assert.ok(v.includes('PUNTOS FINALES: J1 60 | J2 20 | J3 (tu) 35 | J4 10'));
  assert.doesNotMatch(v, /undefined|NaN|TUS DADOS/);
});
