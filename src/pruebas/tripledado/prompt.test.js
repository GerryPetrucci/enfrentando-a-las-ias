// El prompt de Triple dado es EL CONTRATO: sin acentos, dentro del presupuesto de tokens, sin palabras duras y verdadero frente al motor.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGLAS, FORMATO } from '../../juegos/tripledado/reglas-texto.js';
import { vistaTexto } from '../../juegos/tripledado/vista.js';
import { construirSistema, construirUsuario } from '../../prompt.js';
import { PUNTOS, RONDAS, PREMIO_ZERO } from '../../juegos/tripledado/constantes.js';
import { nuevoEstado, jugarConBots, politicaSimple } from './ayudas.js';

const ASCII = /^[\x00-\x7F]*$/;
const CARACTERES_POR_TOKEN = 1.97; // Claude en espanol (los demas modelos cuentan menos tokens)
const TOPE_TOKENS_ENTRADA = 3500; // presupuesto del proyecto (CLAUDE.md)
const JUEGO = { nombre: 'Triple dado', reglas: REGLAS, formatoRespuesta: FORMATO };
const PALABRAS_DURAS = /delat|abandon|traici|traidor|culpa|rompi/i;
const simples = [politicaSimple, politicaSimple, politicaSimple, politicaSimple];

test('las reglas, el formato y el nombre no tienen acentos ni caracteres no ASCII', () => {
  assert.match(REGLAS, ASCII);
  assert.match(FORMATO, ASCII);
  assert.match(JUEGO.nombre, ASCII);
  const E = nuevoEstado();
  assert.match(vistaTexto(E, 0), ASCII);
  const { E: F } = jugarConBots(2, simples, { hasta: 5 });
  assert.match(vistaTexto(F, 3), ASCII);
});

test('las reglas dicen lo que deben: dados, tarjetas de una sola vez, orden, combinaciones, desempate, puntos, tarjetas, reemplazo, lo oculto, final y puntaje', () => {
  assert.match(REGLAS, /4 jugadores/);
  assert.match(REGLAS, new RegExp(`Se juegan ${RONDAS} rondas`));
  assert.match(REGLAS, /11 dados de seis caras: 9 BLANCOS.*2 OCULTOS, uno ROJO y uno AZUL/s);
  assert.match(REGLAS, /Los dados se lanzan de nuevo en cada ronda/);
  assert.match(REGLAS, /ZERO, MIN, MORE y MAX/);
  assert.match(REGLAS, /Antes de lanzar los dados, cada jugador elige en secreto una de sus tarjetas/);
  assert.match(REGLAS, /Cada tarjeta se usa UNA sola vez en toda la partida/);
  assert.match(REGLAS, /en la ronda 4 te queda una sola y se pone sola/);
  assert.match(REGLAS, /3 ENFRENTAMIENTOS.*TRES dados distintos de los que aun no han gastado/s);
  assert.match(REGLAS, /en una ronda usas 9 de tus 11 dados/);
  assert.match(REGLAS, /Triple.*Escalera.*Doble.*Sencillo/s);
  assert.match(REGLAS, /el 6 y el 1 no son consecutivos/);
  assert.match(REGLAS, /escalera 4-5-6 supera a 3-4-5/);
  assert.match(REGLAS, /doble 5-5-3 supera a 5-5-2/);
  assert.match(REGLAS, /dado BLANCO de mayor valor entre los que le quedan sin gastar/);
  assert.match(REGLAS, /los ocultos sin usar no cuentan/);
  assert.match(REGLAS, /1\.o lugar 6, 2\.o 3, 3\.o 1, 4\.o 0/);
  assert.match(REGLAS, /\(6 \+ 3\) \/ 2 = 4\.5 cada uno/);
  assert.match(REGLAS, new RegExp(`ZERO: aciertas si sumaste exactamente 0; recibes ${PREMIO_ZERO} puntos`));
  assert.match(REGLAS, /MIN: mas de 0 y menos de 7\. MORE: de 7 a menos de 11\. MAX: 11 o mas/);
  assert.match(REGLAS, /MORE con 9 puntos da 18/);
  assert.match(REGLAS, /Si fallas, conservas los puntos que sumaste/);
  assert.match(REGLAS, /SI TU RESPUESTA NO SIRVE/);
  assert.match(REGLAS, /el juego juega por ti/);
  assert.match(REGLAS, /\[reemplazo\]/);
  assert.match(REGLAS, /No ves el valor de los dados ocultos de los demas/);
  assert.match(REGLAS, /ni las tarjetas de la ronda en curso/);
  assert.match(REGLAS, /el unico, gana la pieza.*el unico, es eliminado/s);
  assert.match(REGLAS, /empate arriba nadie recibe la pieza.*empate abajo nadie es eliminado/s);
  assert.ok(REGLAS.includes(`Ganar la pieza ${PUNTOS.pieza}, sobrevivir ${PUNTOS.medio}, ser eliminado ${PUNTOS.eliminado}`));
  for (const k of ['tarjeta', 'dados', 'razon']) assert.ok(FORMATO.includes(`"${k}"`), `falta ${k} en el formato`);
  assert.ok(construirSistema(JUEGO).includes(REGLAS));
});

test('ni el prompt ni la vista usan palabras duras (decision del 11 de octubre de 2026)', () => {
  assert.doesNotMatch(REGLAS, PALABRAS_DURAS);
  assert.doesNotMatch(FORMATO, PALABRAS_DURAS);
  const { E } = jugarConBots(2, simples, { hasta: 6 });
  assert.doesNotMatch(vistaTexto(E, 0), PALABRAS_DURAS);
});

test('el prompt completo en el peor caso (ronda 4, enfrentamiento 3, con 11 enfrentamientos y 3 cierres de historial) cabe en el tope de tokens de Claude', () => {
  const { E } = jugarConBots(5, simples, { hasta: 15 });
  assert.deepEqual([E.ronda, E.fase, E.enfrentamiento], [4, 'jugada', 3]);
  const total = construirSistema(JUEGO).length + construirUsuario(vistaTexto(E, 0)).length;
  const tokens = total / CARACTERES_POR_TOKEN;
  assert.ok(tokens > 600, `sospechosamente corto: ${tokens}`);
  assert.ok(tokens <= TOPE_TOKENS_ENTRADA, `entrada de ${Math.round(tokens)} tokens (tope ${TOPE_TOKENS_ENTRADA}): acortar REGLAS o las lineas de historial`);
});
