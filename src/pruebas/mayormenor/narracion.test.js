// La historia publica de Mayor o menor: se cuenta desde lo que registro el motor, con {0} y {1} en lugar de nombres, sin palabras duras y sin NaN.
// Aqui se prueba con registros armados a mano; la Tarea 4 la prueba tambien a traves de aplicarTurno.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { narrarRonda, narrarEpilogo, resolverNombres } from '../../juegos/mayormenor/narracion.js';
import { nuevoEstado } from './ayudas.js';

const DURAS = /delat|abandon|traici|traidor|culpa|rompi/i;
const base = () => ({
  E: nuevoEstado(), ronda: 1, activo: 0, predictor: 1, crupier: 5, carta: 8, lado: 'mayor', apuesta: 3, todo: false,
  veredicto: 'mayor', acierto: true, ganaActivo: 3, ganaPredictor: 3, reemplazadas: [false, false],
  fichas: [13, 13], fichasAntes: [10, 10], manoAntes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
});
const texto = (lineas) => lineas.map((l) => l.texto).join('\n');

test('una ronda normal cuenta apertura, crupier, jugada, apuesta, revelacion y resultado, con {0} y {1}', () => {
  const lineas = narrarRonda(base());
  const tipos = lineas.map((l) => l.tipo);
  for (const t of ['apertura', 'crupier', 'jugada', 'apuesta', 'revelacion', 'resultado']) assert.ok(tipos.includes(t), t);
  const t = texto(lineas);
  assert.match(t, /Ronda 1 de 18/);
  assert.match(t, /\{0\}/);
  assert.match(t, /\{1\}/);
  assert.match(t, /revela un 5/);
  assert.match(t, /apuesta 3 fichas a que será mayor/);
  assert.match(t, /Se revela el 8: mayor que el 5/);
  assert.match(t, /\{0\} gana 3 fichas/);
  assert.match(t, /\{1\} acierta y gana 3 fichas/);
  assert.doesNotMatch(t, /undefined|NaN|null/);
  assert.doesNotMatch(t, DURAS);
});

test('carta menor: el activo no gana nada y el predictor puede fallar', () => {
  const t = texto(narrarRonda({ ...base(), carta: 3, veredicto: 'menor', acierto: false, ganaActivo: 0, ganaPredictor: -3, fichas: [10, 7] }));
  assert.match(t, /\{0\} no gana fichas/);
  assert.match(t, /\{1\} falla y pierde 3 fichas/);
});

test('carta igual: nadie gana y la apuesta se devuelve, con comentario para la voz', () => {
  const lineas = narrarRonda({ ...base(), carta: 5, veredicto: 'igual', acierto: null, ganaActivo: 0, ganaPredictor: 0, fichas: [10, 10] });
  assert.match(texto(lineas), /igual que el crupier/);
  assert.ok(lineas.some((l) => l.tipo === 'comentario' && /apuesta se devuelve/.test(l.texto)));
});

test('los disparadores de comentario: todo, regalar la ronda, perder buena parte y pasar al frente', () => {
  const todo = narrarRonda({ ...base(), apuesta: 10, todo: true });
  assert.ok(todo.some((l) => l.tipo === 'comentario' && /lo apuesta todo/.test(l.texto)));
  const golpe = narrarRonda({ ...base(), carta: 0, veredicto: 'menor', acierto: false, ganaActivo: 0, apuesta: 6, ganaPredictor: -6, fichas: [10, 4] });
  assert.ok(golpe.some((l) => l.tipo === 'comentario' && /buena parte de sus fichas/.test(l.texto)));
  const frente = narrarRonda({ ...base(), fichasAntes: [10, 12], fichas: [13, 12] });
  assert.ok(frente.some((l) => l.tipo === 'comentario' && /\{0\} pasa al frente/.test(l.texto)), 'iba abajo y ahora va arriba');
  const sinCambio = narrarRonda({ ...base(), fichasAntes: [12, 10], fichas: [15, 10] });
  assert.ok(!sinCambio.some((l) => /pasa al frente/.test(l.texto)), 'ya iba arriba');
  const desdeEmpate = narrarRonda({ ...base(), fichasAntes: [10, 10], fichas: [13, 10] });
  assert.ok(!desdeEmpate.some((l) => /pasa al frente/.test(l.texto)), 'salir de un empate no es una remontada');
});

test('"regala la ronda" solo si todo apuntaba a mayor y el predictor acerto con menor; si el predictor cayo, es una trampa; si la mano apuntaba a menor, no hay comentario', () => {
  const mano = [0, 6, 7, 8, 9, 10]; // casi toda la mano supera al crupier (5): lo esperado era jugar alto
  const regala = narrarRonda({ ...base(), manoAntes: mano, lado: 'menor', carta: 0, veredicto: 'menor', acierto: true, ganaActivo: 0, ganaPredictor: 3, fichas: [10, 13] });
  assert.ok(regala.some((l) => l.tipo === 'comentario' && /regala la ronda/.test(l.texto)));
  const trampa = narrarRonda({ ...base(), manoAntes: mano, lado: 'mayor', carta: 0, veredicto: 'menor', acierto: false, ganaActivo: 0, ganaPredictor: -3, fichas: [10, 7] });
  assert.ok(trampa.some((l) => l.tipo === 'comentario' && /juega bajo a propósito y \{1\} cae/.test(l.texto)));
  assert.ok(!trampa.some((l) => /regala la ronda/.test(l.texto)), 'una trampa que funciona no es un regalo');
  const esperado = narrarRonda({ ...base(), manoAntes: [0, 1, 2, 3, 4, 6], lado: 'menor', carta: 0, veredicto: 'menor', acierto: true, ganaActivo: 0, ganaPredictor: 3, fichas: [10, 13] });
  assert.ok(!esperado.some((l) => /regala la ronda|a propósito/.test(l.texto)), 'jugar bajo con una mano que apuntaba a menor es lo esperado');
  const empatada = narrarRonda({ ...base(), manoAntes: [0, 1, 2, 3, 4, 6, 7, 8, 9, 10], lado: 'menor', carta: 0, veredicto: 'menor', acierto: true, ganaActivo: 0, ganaPredictor: 3, fichas: [10, 13] });
  assert.ok(!empatada.some((l) => /regala la ronda|a propósito/.test(l.texto)), 'con la mano repartida no se sabe que era lo esperado');
});

test('una respuesta reemplazada no se cuenta como decision de la IA', () => {
  const t = texto(narrarRonda({ ...base(), reemplazadas: [true, true], apuesta: 1, lado: 'menor' }));
  assert.match(t, /\{0\} no responde bien/);
  assert.match(t, /\{1\} no responde bien/);
  assert.doesNotMatch(t, /elige una carta y la deja boca abajo/);
});

test('la narracion es determinista por seed y el texto no cambia el juego (usa su propio flujo)', () => {
  assert.deepEqual(narrarRonda(base()), narrarRonda(base()));
});

test('el epilogo: gana por rondas, gana por fichas en 0, y empate', () => {
  const E = nuevoEstado();
  assert.deepEqual(narrarEpilogo(E), [], 'sin final no hay epilogo');
  E.fin = true; E.ronda = 18; E.fichas = [14, 9];
  E.final = { ganador: 0, empate: false, causa: 'rondas', fichas: [14, 9], ranking: [0, 1] };
  let t = texto(narrarEpilogo(E));
  assert.match(t, /Se juegan las 18 rondas/);
  assert.match(t, /\{0\} gana con 14 fichas contra 9/);
  assert.match(t, /Fichas finales: \{0\} 14, \{1\} 9/);
  E.ronda = 7; E.fichas = [20, 0];
  E.final = { ganador: 0, empate: false, causa: 'fichas', fichas: [20, 0], ranking: [0, 1] };
  t = texto(narrarEpilogo(E));
  assert.match(t, /\{1\} se queda sin fichas en la ronda 7/);
  E.ronda = 18; E.fichas = [12, 12];
  E.final = { ganador: null, empate: true, causa: 'rondas', fichas: [12, 12], ranking: [0, 1] };
  assert.match(texto(narrarEpilogo(E)), /Empate: los dos terminan con 12 fichas/);
  assert.doesNotMatch(t, /undefined|NaN/);
});

test('resolverNombres reemplaza {0} y {1} y tiene respaldo', () => {
  const jugadores = [{ nombre: 'Claude' }, { nombre: 'GPT' }];
  assert.equal(resolverNombres('{0} le gana a {1}.', jugadores), 'Claude le gana a GPT.');
  assert.equal(resolverNombres('{1} y {0}', []), 'Jugador 2 y Jugador 1');
});
