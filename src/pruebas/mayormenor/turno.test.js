// Una ronda de Mayor o menor, turno por turno: el ejemplo de la regla, cada caso de resolucion, los reemplazos, el fin anticipado y el cierre.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarTurno } from '../../juegos/mayormenor/turno.js';
import { normalizarRespuesta } from '../../juegos/mayormenor/ordenes.js';
import { CARTAS_CRUPIER, RONDAS } from '../../juegos/mayormenor/constantes.js';
import { nuevoEstado, ronda, jugarConBots, politicaMinima } from './ayudas.js';

test('el ejemplo de la regla: crupier 5, el activo juega 8, el predictor apuesta 3 a mayor -> el activo gana 3 y el predictor acierta y gana 3', () => {
  const E = nuevoEstado();
  const reg = ronda(E, { crupier: 5, carta: 8, lado: 'mayor', fichas: 3 });
  assert.deepEqual([reg.ronda, reg.activo, reg.predictor, reg.crupier, reg.carta], [1, 0, 1, 5, 8]);
  assert.equal(reg.veredicto, 'mayor');
  assert.equal(reg.acierto, true);
  assert.equal(reg.ganaActivo, 3);
  assert.equal(reg.ganaPredictor, 3);
  assert.deepEqual(reg.fichasAntes, [10, 10]);
  assert.deepEqual(E.fichas, [13, 13]);
  assert.deepEqual(reg.fichas, [13, 13]);
  assert.deepEqual(E.mano[0], [0, 1, 2, 3, 4, 5, 6, 7, 9, 10]);
  assert.deepEqual(E.jugadas[0], [8]);
  assert.deepEqual(E.crupierSalidas[0], [5]);
  assert.equal(E.ronda, 2);
  assert.equal(E.stats[0].rondasActivo, 1);
  assert.equal(E.stats[0].fichasActivo, 3);
  assert.deepEqual(E.historial[0], { ronda: 1, activo: 0, crupier: 5, carta: 8, lado: 'mayor', apuesta: 3, veredicto: 'mayor', acierto: true, ganaActivo: 3, ganaPredictor: 3 });
});

test('con un 3 contra el 5 gana quien aposto "menor" y pierde quien aposto "mayor"; el activo no gana nada', () => {
  const E = nuevoEstado();
  const bien = ronda(E, { crupier: 5, carta: 3, lado: 'menor', fichas: 4 });
  assert.equal(bien.veredicto, 'menor');
  assert.equal(bien.ganaActivo, 0);
  assert.equal(bien.acierto, true);
  assert.deepEqual(E.fichas, [10, 14]);
  const F = nuevoEstado();
  const mal = ronda(F, { crupier: 5, carta: 3, lado: 'mayor', fichas: 4 });
  assert.equal(mal.acierto, false);
  assert.equal(mal.ganaPredictor, -4);
  assert.deepEqual(F.fichas, [10, 6]);
});

test('carta igual a la del crupier: nadie gana ni pierde y la apuesta se devuelve', () => {
  const E = nuevoEstado();
  const reg = ronda(E, { crupier: 5, carta: 5, lado: 'mayor', fichas: 7 });
  assert.equal(reg.veredicto, 'igual');
  assert.equal(reg.acierto, null);
  assert.deepEqual([reg.ganaActivo, reg.ganaPredictor], [0, 0]);
  assert.deepEqual(E.fichas, [10, 10]);
  assert.equal(E.stats[1].apuestas, 0, 'una apuesta sin resultado no cuenta como apuesta con resultado');
  assert.equal(E.stats[1].fichasApostadas, 7);
});

test('pedir mas fichas de las que se tienen es apostar todas (no es un error)', () => {
  const E = nuevoEstado();
  const reg = ronda(E, { crupier: 5, carta: 2, lado: 'menor', fichas: 99 });
  assert.equal(reg.apuesta, 10);
  assert.equal(reg.apostoTodo, true);
  assert.equal(reg.invalidas[1], false);
  assert.deepEqual(E.fichas, [10, 20]);
  assert.equal(E.stats[1].apostoTodo, 1);
  const F = nuevoEstado();
  assert.equal(ronda(F, { crupier: 5, carta: 2, lado: 'menor', fichas: 10 }).apostoTodo, true, 'apostar exactamente todo tambien');
  const G = nuevoEstado();
  assert.equal(ronda(G, { crupier: 5, carta: 2, lado: 'menor', fichas: 9 }).apostoTodo, false);
});

test('una apuesta ilegal del predictor se reemplaza por 1 ficha y el lado sorteado, y queda anotada', () => {
  for (const [sorteo, lado] of [[0.2, 'mayor'], [0.7, 'menor']]) {
    const E = nuevoEstado();
    E.azar[0].lado = sorteo;
    const reg = ronda(E, { crupier: 5, carta: 8, lado: 'quizas', fichas: 0 });
    assert.equal(reg.lado, lado);
    assert.equal(reg.apuesta, 1);
    assert.equal(reg.invalidas[1], true);
    assert.match(reg.motivos[1], /lado mal formado, fichas mal formadas/);
    assert.equal(reg.invalidas[0], false);
    assert.equal(E.stats[1].invalidas, 1);
    assert.equal(E.stats[1].apuestas, 0, 'una apuesta de reemplazo no cuenta como decision suya');
    assert.equal(E.stats[1].fichasApostadas, 0);
  }
});

test('una carta que no esta en la mano se reemplaza por una legal sorteada y queda anotada', () => {
  const E = nuevoEstado();
  ronda(E, { crupier: 5, carta: 8, lado: 'mayor', fichas: 1 }); // ronda 1 (activo: asiento 0)
  ronda(E, { crupier: 5, carta: 2, lado: 'mayor', fichas: 1 }); // ronda 2 (activo: asiento 1)
  E.azar[2].carta = 0; // la ronda 3 sortea la primera carta de la mano
  const reg = ronda(E, { crupier: 5, carta: 8, lado: 'mayor', fichas: 1 }); // el 8 ya se jugo
  assert.equal(reg.invalidas[0], true);
  assert.equal(reg.motivos[0], 'carta no disponible');
  assert.equal(reg.carta, 0);
  assert.equal(E.stats[0].invalidas, 1);
  assert.ok(!E.mano[0].includes(0));
});

test('los campos del otro papel se ignoran: un campo mal formado de la otra mitad no invalida la respuesta de este turno', () => {
  const E = nuevoEstado();
  const activo = normalizarRespuesta({ carta: 4, lado: 'quizas', fichas: 'x', razon: 'mezclo todo' });
  const predictor = normalizarRespuesta({ carta: 99, lado: 'mayor', fichas: 2 });
  assert.equal(activo.invalida, true, 'normalizar si ve el campo malo');
  const reg = aplicarTurno(E, [activo, predictor]);
  assert.deepEqual(reg.invalidas, [false, false]);
  assert.deepEqual(reg.motivos, [null, null]);
  assert.equal(reg.carta, 4);
  assert.equal(reg.lado, 'mayor');
});

test('un modelo caido (respuesta nula) juega por reemplazo en cada ronda y la partida sigue', () => {
  const E = nuevoEstado();
  const reg = aplicarTurno(E, [null, null]);
  assert.deepEqual(reg.invalidas, [true, true]);
  assert.deepEqual(reg.motivos, ['sin respuesta legible', 'sin respuesta legible']);
  assert.equal(E.ronda, 2);
  assert.equal(E.fin, false);
  assert.ok(reg.apuesta === 1 && ['mayor', 'menor'].includes(reg.lado));
});

test('la partida termina antes de la ronda 18 si el predictor se queda sin fichas (y nadie mas juega despues)', () => {
  const E = nuevoEstado();
  E.fichas = [10, 2];
  const reg = ronda(E, { crupier: 5, carta: 2, lado: 'mayor', fichas: 2 });
  assert.deepEqual(E.fichas, [10, 0]);
  assert.equal(E.fin, true);
  assert.equal(E.ronda, 1, 'la ronda no avanza al terminar');
  assert.deepEqual(reg.final, { ganador: 0, empate: false, causa: 'fichas', fichas: [10, 0], ranking: [0, 1] });
  assert.match(reg.narracion.map((l) => l.texto).join(' '), /\{0\}|\{1\}/);
  assert.throws(() => aplicarTurno(E, [null, null]), /ya termino/);
});

test('18 rondas: cada jugador es activo 9 veces, cada mazo del crupier sale completo una vez y a cada uno le quedan 2 cartas', () => {
  const { E, registros } = jugarConBots(3, [politicaMinima, politicaMinima]);
  assert.equal(registros.length, RONDAS);
  assert.equal(E.fin, true);
  assert.equal(E.ronda, RONDAS);
  assert.deepEqual(E.mano.map((m) => m.length), [2, 2]);
  for (const s of [0, 1]) {
    assert.deepEqual([...E.crupierSalidas[s]].sort((a, b) => a - b), CARTAS_CRUPIER);
    assert.equal(E.stats[s].rondasActivo, 9);
    assert.equal(E.jugadas[s].length, 9);
  }
  assert.deepEqual(registros.map((r) => r.activo), Array.from({ length: RONDAS }, (_, i) => i % 2));
  assert.equal(registros.at(-1).final.causa, 'rondas');
});

test('empate de fichas en la ronda 18 es empate, sin ganador', () => {
  const E = nuevoEstado();
  E.ronda = 18; // activo: asiento 1
  const reg = ronda(E, { crupier: 5, carta: 5, lado: 'mayor', fichas: 3 });
  assert.equal(E.fin, true);
  assert.deepEqual(reg.final, { ganador: null, empate: true, causa: 'rondas', fichas: [10, 10], ranking: [0, 1] });
});

test('al terminar la ronda 18 gana quien tenga mas fichas', () => {
  const E = nuevoEstado();
  E.ronda = 18;
  E.fichas = [12, 9];
  const reg = ronda(E, { crupier: 5, carta: 0, lado: 'mayor', fichas: 1 }); // el asiento 0 (predictor) falla y pierde 1
  assert.deepEqual(E.fichas, [11, 9]);
  assert.equal(reg.final.ganador, 0);
  assert.equal(reg.final.causa, 'rondas');
});

test('el registro trae lo que la arena y el reproductor esperan, sin oculto y sin NaN', () => {
  const E = nuevoEstado();
  const reg = ronda(E, { crupier: 5, carta: 8, lado: 'mayor', fichas: 3 });
  assert.equal(reg.errores.length, 2);
  assert.deepEqual(reg.errores, [null, null]);
  assert.deepEqual(reg.crudos, [null, null]);
  assert.deepEqual(reg.razones, ['prueba', 'prueba']);
  assert.equal(reg.final, null);
  assert.equal('oculto' in reg, false);
  assert.ok(reg.narracion.length >= 5);
  assert.deepEqual(reg.mano[0].includes(8), false);
  assert.deepEqual(reg.crupierQuedan[0].includes(5), false, 'el 5 ya salio del mazo del asiento 0');
  assert.equal(reg.crupierQuedan[1].length, 9);
  assert.doesNotMatch(JSON.stringify(reg), /NaN|undefined/);
});

test('el crudo de una respuesta invalida se guarda recortado y el de una valida no', () => {
  const E = nuevoEstado();
  const mala = { ...normalizarRespuesta('basura'), crudo: 'x'.repeat(900), error: null };
  const buena = { ...normalizarRespuesta({ lado: 'mayor', fichas: 1 }), crudo: 'ok', error: null };
  const reg = aplicarTurno(E, [mala, buena]);
  assert.equal(reg.crudos[0].length, 400);
  assert.equal(reg.crudos[1], null);
});
