// El prompt de Subasta de tiempo es EL CONTRATO: sin acentos, dentro del presupuesto de tokens, sin palabras duras y verdadero frente al motor.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGLAS, FORMATO } from '../../juegos/subasta/reglas-texto.js';
import { vistaTexto } from '../../juegos/subasta/vista.js';
import { construirSistema, construirUsuario } from '../../prompt.js';
import { PUESTO_PUNTOS, SUBASTAS } from '../../juegos/subasta/constantes.js';
import { nuevoEstado, subasta } from './ayudas.js';

const ASCII = /^[\x00-\x7F]*$/;
const CARACTERES_POR_TOKEN = 1.97; // Claude en espanol (los demas modelos cuentan menos tokens)
const TOPE_TOKENS_ENTRADA = 3500; // presupuesto del proyecto (CLAUDE.md)
const JUEGO = { nombre: 'Subasta de tiempo', reglas: REGLAS, formatoRespuesta: FORMATO };
const PALABRAS_DURAS = /delat|abandon|traici|traidor|culpa|rompi/i;

test('las reglas, el formato y el nombre no tienen acentos ni caracteres no ASCII', () => {
  assert.match(REGLAS, ASCII);
  assert.match(FORMATO, ASCII);
  assert.match(JUEGO.nombre, ASCII);
  assert.match(vistaTexto(nuevoEstado(), 0), ASCII);
});

test('las reglas dicen lo que deben: banco, subastas, retirarse, todas pagan, empate, banco agotado, lo oculto, final y puntaje', () => {
  assert.match(REGLAS, /5 jugadores/);
  assert.match(REGLAS, /banco de 600\.0 segundos \(10 minutos\)/);
  assert.match(REGLAS, new RegExp(`Se juegan ${SUBASTAS} subastas`));
  assert.match(REGLAS, /Responder 0 es retirarte: no gastas nada/);
  assert.match(REGLAS, /TODAS las apuestas se pagan/);
  assert.match(REGLAS, /Gana la subasta quien apuesta mas segundos y recibe una ficha de victoria/);
  assert.match(REGLAS, /empatan exactamente en la apuesta mas alta, la subasta se anula/);
  assert.match(REGLAS, /Si todos se retiran, nadie gana/);
  assert.match(REGLAS, /apuestas todo tu banco/);
  assert.match(REGLAS, /No ves el banco de los demas, ni cuanto apostaron/);
  assert.match(REGLAS, /mas fichas gana la pieza.*menos fichas es eliminado/s);
  assert.match(REGLAS, /conserve mas tiempo.*nadie la obtiene/s);
  assert.match(REGLAS, /conserve menos tiempo.*nadie es eliminado/s);
  assert.ok(REGLAS.includes(`ganar la pieza ${PUESTO_PUNTOS.pieza}`));
  assert.ok(REGLAS.includes(`sobrevivir ${PUESTO_PUNTOS.medio}`));
  assert.ok(REGLAS.includes(`ser eliminado ${PUESTO_PUNTOS.eliminado}`));
  for (const k of ['apuesta', 'razon']) assert.ok(FORMATO.includes(`"${k}"`), `falta ${k} en el formato`);
  assert.ok(construirSistema(JUEGO).includes(REGLAS));
});

test('ni el prompt ni la vista usan palabras duras (decision del 11 de octubre de 2026)', () => {
  assert.doesNotMatch(REGLAS, PALABRAS_DURAS);
  assert.doesNotMatch(FORMATO, PALABRAS_DURAS);
  assert.doesNotMatch(vistaTexto(nuevoEstado(), 0), PALABRAS_DURAS);
});

test('el prompt completo en el peor caso (subasta 19 con 18 de historial) cabe en el tope de tokens de Claude', () => {
  const E = nuevoEstado(5);
  for (let n = 1; n < SUBASTAS; n++) subasta(E, [0, 0.1 * n, 12.5, 0, 1].map((x, s) => (E.bancos[s] > 0 ? x : null)));
  assert.equal(E.subasta, SUBASTAS);
  const total = construirSistema(JUEGO).length + construirUsuario(vistaTexto(E, 0)).length;
  const tokens = total / CARACTERES_POR_TOKEN;
  assert.ok(tokens > 400, `sospechosamente corto: ${tokens}`);
  assert.ok(tokens <= TOPE_TOKENS_ENTRADA, `entrada de ${Math.round(tokens)} tokens (tope ${TOPE_TOKENS_ENTRADA})`);
});
