// El prompt de Mayor o menor es EL CONTRATO: sin acentos, dentro del presupuesto de tokens, sin palabras duras y verdadero frente al motor.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGLAS, FORMATO } from '../../juegos/mayormenor/reglas-texto.js';
import { vistaTexto } from '../../juegos/mayormenor/vista.js';
import { construirSistema, construirUsuario } from '../../prompt.js';
import { PUNTOS, RONDAS, FICHAS } from '../../juegos/mayormenor/constantes.js';
import { nuevoEstado, jugarConBots, politicaMinima } from './ayudas.js';

const ASCII = /^[\x00-\x7F]*$/;
const CARACTERES_POR_TOKEN = 1.97; // Claude en espanol (los demas modelos cuentan menos tokens)
const TOPE_TOKENS_ENTRADA = 3500; // presupuesto del proyecto (CLAUDE.md)
const JUEGO = { nombre: 'Mayor o menor', reglas: REGLAS, formatoRespuesta: FORMATO };
const PALABRAS_DURAS = /delat|abandon|traici|traidor|culpa|rompi/i;

test('las reglas, el formato y el nombre no tienen acentos ni caracteres no ASCII', () => {
  assert.match(REGLAS, ASCII);
  assert.match(FORMATO, ASCII);
  assert.match(JUEGO.nombre, ASCII);
  assert.match(vistaTexto(nuevoEstado(), 0), ASCII);
  assert.match(vistaTexto(nuevoEstado(), 1), ASCII);
});

test('las reglas dicen lo que deben: jugadores, cartas, fichas, mazos del crupier, papeles, a la vez, pagos, banca, apuesta, lo oculto, final y puntaje', () => {
  assert.match(REGLAS, /2 jugadores/);
  assert.match(REGLAS, new RegExp(`Se juegan ${RONDAS} rondas`));
  assert.match(REGLAS, new RegExp(`empieza con ${FICHAS} fichas`));
  assert.match(REGLAS, /11 cartas.*del 0 al 10/s);
  assert.match(REGLAS, /dos mazos de 9 cartas \(del 1 al 9\).*uno para cada jugador/s);
  assert.match(REGLAS, /JUGADOR ACTIVO/);
  assert.match(REGLAS, /PREDICTOR/);
  assert.match(REGLAS, /rondas impares el Jugador 1 es el jugador activo/);
  assert.match(REGLAS, /todo a la vez y en secreto|deciden a la vez/);
  assert.match(REGLAS, /gana tantas fichas como la diferencia/);
  assert.match(REGLAS, /crupier 5 y carta 8: gana 3 fichas/);
  assert.match(REGLAS, /recupera su apuesta y gana otras tantas fichas/);
  assert.match(REGLAS, /Si la carta del activo es igual a la del crupier, la apuesta se devuelve/);
  assert.match(REGLAS, /salen de la banca/);
  assert.match(REGLAS, /No puedes apostar 0/);
  assert.match(REGLAS, /apuestas todas/);
  assert.match(REGLAS, /SI TU RESPUESTA NO SIRVE/);
  assert.match(REGLAS, /una carta que no tienes, una apuesta de 0 o con decimales, un lado que no sea "mayor" o "menor"/);
  assert.match(REGLAS, /el juego juega por ti/);
  assert.match(REGLAS, /una carta tuya al azar/);
  assert.match(REGLAS, /apuesta de 1 ficha a un lado sorteado/);
  assert.match(REGLAS, /\[reemplazo\]/);
  assert.match(REGLAS, /No ves lo que tu rival decide en la misma ronda/);
  assert.match(REGLAS, /ni el orden en que saldran las cartas del crupier/);
  assert.match(REGLAS, /o antes, si alguien se queda sin fichas/);
  assert.match(REGLAS, /Gana quien tenga mas fichas.*empate/s);
  assert.ok(REGLAS.includes(`Ganar ${PUNTOS.gana}`));
  assert.ok(REGLAS.includes(`empatar ${PUNTOS.empata}`));
  assert.ok(REGLAS.includes(`perder ${PUNTOS.pierde}`));
  for (const k of ['carta', 'lado', 'fichas', 'razon']) assert.ok(FORMATO.includes(`"${k}"`), `falta ${k} en el formato`);
  assert.ok(construirSistema(JUEGO).includes(REGLAS));
});

test('ni el prompt ni la vista usan palabras duras (decision del 11 de octubre de 2026)', () => {
  assert.doesNotMatch(REGLAS, PALABRAS_DURAS);
  assert.doesNotMatch(FORMATO, PALABRAS_DURAS);
  assert.doesNotMatch(vistaTexto(nuevoEstado(), 0), PALABRAS_DURAS);
});

test('el prompt completo en el peor caso (ronda 18 con 17 de historial) cabe en el tope de tokens de Claude', () => {
  const { E } = jugarConBots(5, [politicaMinima, politicaMinima], { hasta: RONDAS - 1 });
  assert.equal(E.ronda, RONDAS);
  const total = construirSistema(JUEGO).length + construirUsuario(vistaTexto(E, 0)).length;
  const tokens = total / CARACTERES_POR_TOKEN;
  assert.ok(tokens > 400, `sospechosamente corto: ${tokens}`);
  assert.ok(tokens <= TOPE_TOKENS_ENTRADA, `entrada de ${Math.round(tokens)} tokens (tope ${TOPE_TOKENS_ENTRADA})`);
});
