// El prompt de Duda y apuesta es EL CONTRATO: sin acentos, dentro del presupuesto de tokens, sin palabras duras y verdadero frente al motor.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGLAS, FORMATO } from '../../juegos/dudaapuesta/reglas-texto.js';
import { vistaTexto } from '../../juegos/dudaapuesta/vista.js';
import { construirSistema, construirUsuario } from '../../prompt.js';
import { PUNTOS, MANOS, FICHAS, ANUNCIOS_MAX, MAZO, ESPACIOS_MAX } from '../../juegos/dudaapuesta/constantes.js';
import { nuevoEstado, jugarConBots } from './ayudas.js';

const ASCII = /^[\x00-\x7F]*$/;
const CARACTERES_POR_TOKEN = 1.97; // Claude en espanol (los demas modelos cuentan menos tokens)
const TOPE_TOKENS_ENTRADA = 3500; // presupuesto del proyecto (CLAUDE.md)
const MARGEN_TOKENS = 100; // si el peor caso se acerca a menos que esto del tope, cualquier cambio a la vista rompe el presupuesto
const JUEGO = { nombre: 'Duda y apuesta', reglas: REGLAS, formatoRespuesta: FORMATO };
const PALABRAS_DURAS = /delat|abandon|traici|traidor|culpa|rompi|mentir|miente|mintio|engan/i;
const tokensDe = (E, i = 0) => (construirSistema(JUEGO).length + construirUsuario(vistaTexto(E, i)).length) / CARACTERES_POR_TOKEN;

test('las reglas, el formato y el nombre no tienen acentos ni caracteres no ASCII', () => {
  assert.match(REGLAS, ASCII);
  assert.match(FORMATO, ASCII);
  assert.match(JUEGO.nombre, ASCII);
  assert.match(vistaTexto(nuevoEstado(), 0), ASCII);
});

test('las reglas dicen lo que deben: mazo, arcoiris, fichas, anuncio, aceptar, dudar, enfrentamiento, limites, espacios, pago, final, reemplazo, lo oculto y puntaje', () => {
  assert.match(REGLAS, /uno de 4 jugadores/);
  assert.ok(REGLAS.includes(`Un mazo de ${MAZO.length} cartas: 10 rojas, 10 amarillas, 10 azules, 10 verdes, 10 moradas y 10 arcoiris`));
  assert.match(REGLAS, /Las arcoiris cuentan como CUALQUIER color/);
  assert.ok(REGLAS.includes(`empiezas con ${FICHAS}; con 0 quedas eliminado`));
  assert.match(REGLAS, /tantos espacios para cartas como fichas de espacio mas 1/);
  assert.match(REGLAS, /la primera, el Jugador 1; despues, quien perdio la anterior/);
  assert.match(REGLAS, /hay al menos 7 cartas rojas entre las cartas de TODOS los jugadores/);
  assert.match(REGLAS, /ACEPTAR: quien anuncio recupera su apuesta/);
  assert.match(REGLAS, /cantidad MAYOR \(al menos una carta mas; mismo color u otro\)/);
  assert.match(REGLAS, /DUDAR: empieza el enfrentamiento/);
  assert.match(REGLAS, /si no dices cuanto, igualas/);
  assert.match(REGLAS, /IGUALAR \(pone las fichas que faltan\) o RETIRARSE/);
  assert.match(REGLAS, /Retirarse: pierde lo que habia apostado \(lo gana quien duda\) y las cartas no se revelan/);
  assert.match(REGLAS, /AL MENOS lo anunciado gana quien anuncio/);
  assert.ok(REGLAS.includes(`Maximo ${ANUNCIOS_MAX} anuncios por mano`));
  assert.match(REGLAS, /ni que las que tiene quien te contesta/);
  assert.match(REGLAS, /Para igualar solo cuenta cuantas fichas pones, no de que tipo; las que faltan salen primero de las de juego/);
  assert.match(REGLAS, /Perder una ficha de espacio es perder un espacio/);
  assert.ok(REGLAS.includes(`si ya tienes ${ESPACIOS_MAX}, se vuelve una ficha de juego`));
  assert.match(REGLAS, /"comprar_espacio": true/);
  assert.match(REGLAS, /al menos 2 fichas de juego \(se comprueba al terminar la mano\)/);
  assert.match(REGLAS, /Al terminar las manos 15, 20, 25\.\.\. cada jugador paga una ficha de juego a la banca/);
  assert.ok(REGLAS.includes(`al terminar la mano ${MANOS}`));
  assert.match(REGLAS, /Gana la pieza quien termina con mas fichas de juego, si es el unico/);
  assert.match(REGLAS, /SI TU RESPUESTA NO SIRVE/);
  assert.match(REGLAS, /el historial marca esa jugada con \*/);
  assert.match(REGLAS, /No ves las cartas de los demas; de un enfrentamiento ves cuantas cartas del color anunciado tenia cada jugador/);
  assert.doesNotMatch(REGLAS, /salvo las que se revelan/, 'la vista no muestra cartas reveladas, solo el conteo');
  assert.ok(REGLAS.includes(`Ganar la pieza ${PUNTOS.pieza}, sobrevivir ${PUNTOS.medio}, ser eliminado ${PUNTOS.eliminado}`));
});

test('el formato de respuesta nombra todas las acciones y campos que el motor entiende', () => {
  for (const a of ['anunciar', 'aceptar', 'dudar', 'igualar', 'retirarse']) assert.ok(FORMATO.includes(`"${a}"`), a);
  for (const campo of ['accion', 'color', 'cantidad', 'fichas', 'espacios', 'comprar_espacio', 'razon']) assert.ok(FORMATO.includes(`"${campo}"`), campo);
});

test('ni el prompt ni la vista usan palabras duras (decision del 11 de octubre de 2026: se habla de anuncios y de dudar)', () => {
  assert.doesNotMatch(REGLAS, PALABRAS_DURAS);
  assert.doesNotMatch(FORMATO, PALABRAS_DURAS);
  const { E } = jugarConBots(3, [() => ({ accion: 'anunciar', color: 'rojo', cantidad: 4, fichas: 1, espacios: 0 }), () => ({ accion: 'dudar' }), () => ({ accion: 'dudar' }), () => ({ accion: 'dudar' })], { hasta: 3 });
  assert.doesNotMatch(vistaTexto(E, 0), PALABRAS_DURAS);
});

test('las reglas no dan estrategia: no dicen que jugada conviene', () => {
  assert.doesNotMatch(REGLAS, /te conviene|lo mejor es|siempre debes|nunca debes|recomend|estrategia/i);
});

// El peor caso del historial: 14 manos terminadas (solo se muestran las ultimas 5 y un resumen), cada una con cuatro anuncios de apuestas largas (2f+1e) marcados con *,
// una duda con subida, la igualada y el conteo; y la decision 5 de la mano 15. No es alcanzable en la practica (cada anuncio de reemplazo apuesta 1f), pero fija una cota.
function peorCasoSintetico() {
  const ap = (f, e) => ({ fichas: f, espacios: e });
  const entrada = (m) => ({
    mano: m, inicia: 0,
    cadena: [0, 1, 2, 3].map((a) => ({ asiento: a, color: 'amarillo', cantidad: 10 + a, apuesta: ap(2, 1), reemplazo: true })),
    duda: { asiento: 0, apuesta: ap(3, 1), reemplazo: true }, defensa: { accion: 'igualar', reemplazo: true },
    resolucion: { tipo: 'recuento', color: 'amarillo', cantidad: 13, cuentas: [5, 5, 5, 5], real: 20, predictor: 3, dudador: 0, ganador: 3, perdedor: 0, movidas: ap(3, 1), ganado: ap(3, 1) },
    pago: false, compras: [0, 1], comprasFallidas: [2, 3], // las lineas de compra (reales pero raras) tambien cuentan en la cota
  });
  const E = nuevoEstado(3);
  E.mano = 15;
  E.historial = Array.from({ length: 14 }, (_, k) => entrada(k + 1));
  E.cadena = [0, 1, 2, 3].map((a) => ({ asiento: a, color: 'amarillo', cantidad: 10 + a, apuesta: ap(2, 1), reemplazo: true }));
  E.fase = 'respuesta';
  E.decision = 5;
  return E;
}

test('el prompt completo en el peor caso sintetico (14 manos largas, solo se muestran 5) cabe en el tope de tokens de Claude con margen', () => {
  const tokens = tokensDe(peorCasoSintetico());
  assert.ok(tokens > 2500, `sospechosamente corto: ${tokens}`);
  assert.ok(tokens <= TOPE_TOKENS_ENTRADA - MARGEN_TOKENS, `entrada de ${Math.round(tokens)} tokens (tope ${TOPE_TOKENS_ENTRADA}, margen ${MARGEN_TOKENS}): acortar REGLAS o las lineas de historial`);
});

test('y en partidas reales largas (todas las respuestas son de reemplazo, con * en cada linea) tambien', () => {
  const basura = () => ({ accion: 'xx', color: 'violeta' });
  let peor = 0, largas = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const { E } = jugarConBots(seed, [basura, basura, basura, basura], { hasta: 36, fichas: 30 }); // con 30 fichas nadie se elimina: ~14 manos sin llegar al tope
    if (E.fin || E.historial.length < 6) continue;
    largas++;
    for (let i = 0; i < 4; i++) peor = Math.max(peor, tokensDe(E, i));
  }
  assert.ok(largas > 30, `solo ${largas} partidas largas que medir`);
  assert.ok(peor <= TOPE_TOKENS_ENTRADA - MARGEN_TOKENS, `entrada de ${Math.round(peor)} tokens`);
});
