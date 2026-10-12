// El prompt de La Fuga es EL CONTRATO: sin acentos, sin revelar lo oculto y dentro del presupuesto de tokens.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGLAS, FORMATO } from '../../juegos/fuga/reglas-texto.js';
import { vistaTexto } from '../../juegos/fuga/vista.js';
import { aplicarTurno } from '../../juegos/fuga/turno.js';
import { construirSistema, construirUsuario } from '../../prompt.js';
import { POSTURAS, METODOS, PUNTOS, RONDAS } from '../../juegos/fuga/constantes.js';
import { nuevoEstado, jug } from './ayudas.js';

const ASCII = /^[\x00-\x7F]*$/;
const CARACTERES_POR_TOKEN = 1.97; // Claude en espanol (los demas modelos cuentan menos tokens)
const TOPE_TOKENS_ENTRADA = 3500;  // presupuesto del proyecto (CLAUDE.md)
const JUEGO = { nombre: 'La Fuga', reglas: REGLAS, formatoRespuesta: FORMATO };

test('las reglas, el formato y la vista no tienen acentos ni caracteres no ASCII', () => {
  assert.match(REGLAS, ASCII);
  assert.match(FORMATO, ASCII);
  assert.match(vistaTexto(nuevoEstado(), 0), ASCII);
});

test('las reglas dicen lo que deben y callan lo que no deben', () => {
  for (const p of POSTURAS) assert.ok(REGLAS.includes(`"${p}"`), `falta la postura ${p}`);
  for (const m of METODOS) assert.ok(REGLAS.includes(`"${m}"`), `falta el metodo ${m}`);
  assert.match(REGLAS, /escapar juntos/);
  assert.match(REGLAS, /aprovechar/);
  assert.ok(REGLAS.includes(`${PUNTOS.escapeConjunto} puntos cada uno`));
  assert.ok(REGLAS.includes(`${PUNTOS.botin} puntos`) && REGLAS.includes(`${PUNTOS.delacion} puntos`));
  // lo oculto: el valor de salir solo y la idea de que se pueda
  assert.doesNotMatch(REGLAS, new RegExp(`\\b${PUNTOS.escapeSolo}\\s+puntos`));
  assert.doesNotMatch(REGLAS, /escapar solo|salir solo|escapa solo|sale solo/i);
  for (const k of ['postura', 'metodo', 'aprovechar', 'promesa', 'mensaje', 'razon']) assert.ok(FORMATO.includes(`"${k}"`), `falta ${k} en el formato`);
  assert.ok(construirSistema(JUEGO).includes(REGLAS));
});

// El peor caso: la ultima situacion, con 8 rondas de historial y mensajes de 140 caracteres.
function estadoPeorCaso() {
  const E = nuevoEstado(7);
  const j = { postura: 'sacrificarse', metodo: 'engano', aprovechar: true, promesa: 'sacrificarse', mensaje: 'm'.repeat(140), razon: 'r' };
  for (let r = 0; r < RONDAS - 1; r++) {
    E.dados[E.ronda] = [0.99, 0.99]; // nadie falla: los dos llegan vivos a la ultima situacion
    aplicarTurno(E, [jug(j), jug(j)]);
  }
  return E;
}

test('el prompt completo en el peor caso cabe en el tope de tokens de Claude (caracteres / 1.97)', () => {
  const E = estadoPeorCaso();
  assert.equal(E.ronda, RONDAS - 1);
  assert.equal(E.fin, false);
  const tokens = Math.round((construirSistema(JUEGO).length + construirUsuario(vistaTexto(E, 0)).length) / CARACTERES_POR_TOKEN);
  assert.ok(tokens > 1000, `el prompt mide ${tokens} tokens: algo no se esta midiendo`);
  assert.ok(tokens <= TOPE_TOKENS_ENTRADA, `el prompt mide ${tokens} tokens y el tope es ${TOPE_TOKENS_ENTRADA}: hay que recortar texto de las reglas o del historial`);
});

test('las reglas dicen que capturado vale 0 en total y que la delacion solo agrava al que ya estaba herido', () => {
  assert.match(REGLAS, /Si te capturan: 0 puntos en total/);
  assert.doesNotMatch(REGLAS, /aunque te capturen/);
  assert.doesNotMatch(REGLAS, /companero queda herido/);
  assert.match(REGLAS, /si tu companero ya estaba herido/);
});

// Vocabulario (decidido el 11 de octubre de 2026): ni el prompt ni la vista cargan moralmente la decision de separarse o de hablar con
// el guardia. Los nombres internos (traidor, delataron, promesasRotas) no cambian: solo lo que leen las IAs.
const PALABRAS_DURAS = /delat|abandon|traici|traidor|culpa|dejas a tu companero|rompi/i;

test('el prompt y la vista no usan palabras moralmente duras (delatar, abandonar, traicion, romper la promesa)', () => {
  assert.doesNotMatch(REGLAS, PALABRAS_DURAS);
  assert.doesNotMatch(FORMATO, PALABRAS_DURAS);
  const E = nuevoEstado(7);
  E.situaciones[0] = { ...E.situaciones[0], id: 'ronda', tentacion: { tipo: 'oferta', valor: PUNTOS.delacion } };
  E.dados[0] = [0.99, 0.99];
  aplicarTurno(E, [jug({ aprovechar: true, promesa: 'ayudar' }), jug({ postura: 'separarse' })]);
  E.dados[1] = [0.99, 0.99];
  aplicarTurno(E, [jug({ postura: 'avanzar', promesa: 'ayudar' }), jug({ postura: 'avanzar' })]);
  const v = vistaTexto(E, 0) + vistaTexto(E, 1);
  assert.match(v, /hablo con el guardia/, 'el historial dice que hablo con el guardia');
  assert.match(v, /no cumpl/, 'el historial dice que no cumplio la promesa');
  assert.doesNotMatch(v, PALABRAS_DURAS);
});
