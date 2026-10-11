// El prompt de El numero solitario es EL CONTRATO: sin acentos, dentro del presupuesto de tokens y sin palabras duras.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGLAS, FORMATO } from '../../juegos/solitario/reglas-texto.js';
import { vistaTexto } from '../../juegos/solitario/vista.js';
import { aplicarTurno } from '../../juegos/solitario/turno.js';
import { normalizarRespuesta } from '../../juegos/solitario/ordenes.js';
import { disponibles } from '../../juegos/solitario/estado.js';
import { construirSistema, construirUsuario } from '../../prompt.js';
import { crearRng } from '../../rng.js';
import { RONDAS, PUESTO_PUNTOS } from '../../juegos/solitario/constantes.js';
import { nuevoEstado } from './ayudas.js';

const ASCII = /^[\x00-\x7F]*$/;
const CARACTERES_POR_TOKEN = 1.97; // Claude en espanol (los demas modelos cuentan menos tokens)
const TOPE_TOKENS_ENTRADA = 3500; // presupuesto del proyecto (CLAUDE.md)
const JUEGO = { nombre: 'El numero solitario', reglas: REGLAS, formatoRespuesta: FORMATO };
const PALABRAS_DURAS = /delat|abandon|traici|traidor|culpa|rompi/i;

test('las reglas, el formato y el nombre no tienen acentos ni caracteres no ASCII', () => {
  assert.match(REGLAS, ASCII);
  assert.match(FORMATO, ASCII);
  assert.match(JUEGO.nombre, ASCII);
  assert.match(vistaTexto(nuevoEstado(), 0), ASCII);
});

test('las reglas dicen lo que deben: cartas, fases, anulacion, premio, cortes, final, desempates y puntaje', () => {
  assert.match(REGLAS, /5 jugadores/);
  assert.match(REGLAS, /mazo de 8 cartas/);
  assert.match(REGLAS, new RegExp(`${RONDAS} rondas`));
  assert.match(REGLAS, /Fase 1, elegir pareja/);
  assert.match(REGLAS, /Fase 2, marcar/);
  assert.match(REGLAS, /todas esas cartas se anulan/);
  assert.match(REGLAS, /numero mas bajo que aparece una sola vez/);
  assert.match(REGLAS, /ficha de victoria/);
  assert.match(REGLAS, /queda bloqueada en la ronda siguiente/);
  assert.match(REGLAS, /Al final de las rondas 3 y 6/);
  assert.match(REGLAS, /mas fichas de victoria.*gano una ronda mas tarde.*sorteo/s);
  assert.ok(REGLAS.includes(`ganar la pieza ${PUESTO_PUNTOS.pieza}`));
  assert.ok(REGLAS.includes(`a salvo en un corte ${PUESTO_PUNTOS.salvo}`));
  assert.ok(REGLAS.includes(`en el medio ${PUESTO_PUNTOS.medio}`));
  assert.ok(REGLAS.includes(`eliminado ${PUESTO_PUNTOS.eliminado}`));
  for (const k of ['cartas', 'juega', 'razon']) assert.ok(FORMATO.includes(`"${k}"`), `falta ${k} en el formato`);
  assert.ok(construirSistema(JUEGO).includes(REGLAS));
});

test('ni el prompt ni la vista usan palabras duras (decision del 11 de octubre de 2026)', () => {
  assert.doesNotMatch(REGLAS, PALABRAS_DURAS);
  assert.doesNotMatch(FORMATO, PALABRAS_DURAS);
  assert.doesNotMatch(vistaTexto(nuevoEstado(), 0), PALABRAS_DURAS);
});

// El peor caso: la ronda 12, fase 2, con 11 rondas de historial. Se juega al azar con cinco jugadores hasta el corte y tres despues.
function estadoPeorCaso() {
  const E = nuevoEstado(5);
  const rng = crearRng(99);
  const pick = (xs) => xs[Math.floor(rng() * xs.length)];
  while (E.ronda < RONDAS || E.fase === 1) {
    if (E.fase === 1) {
      aplicarTurno(E, [0, 1, 2, 3, 4].map((s) => {
        if (!E.jugando[s]) return null;
        const d = disponibles(E, s), a = pick(d);
        return normalizarRespuesta({ cartas: [a, pick(d.filter((c) => c !== a))] });
      }));
    } else {
      aplicarTurno(E, [0, 1, 2, 3, 4].map((s) => (E.jugando[s] ? normalizarRespuesta({ juega: pick(E.parejas[s]) }) : null)));
    }
  }
  // el bucle sale en cuanto la ronda 12 pasa a la fase 2 (ya se hizo la fase 1 de la ronda 12)
  return E;
}

test('el prompt completo en el peor caso cabe en el tope de tokens de Claude (caracteres / 1.97)', () => {
  const E = estadoPeorCaso();
  assert.equal(E.ronda, RONDAS);
  assert.equal(E.fase, 2);
  const s = [0, 1, 2, 3, 4].find((x) => E.jugando[x]);
  const total = construirSistema(JUEGO).length + construirUsuario(vistaTexto(E, s)).length;
  const tokens = total / CARACTERES_POR_TOKEN;
  assert.ok(tokens > 500, `sospechosamente corto: ${tokens}`);
  assert.ok(tokens <= TOPE_TOKENS_ENTRADA, `entrada de ${Math.round(tokens)} tokens (tope ${TOPE_TOKENS_ENTRADA})`);
});
