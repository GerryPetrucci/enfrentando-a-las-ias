import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevoEstado, estadoPeorCaso, tokensDelPrompt, TOPE_TOKENS_ENTRADA } from './ayudas.js';
import { construirSistema, construirUsuario } from '../../prompt.js';
import conquista from '../../juegos/conquista.js';
import dilema from '../../juegos/dilema.js';
import { obtenerJuego, JUEGOS } from '../../juegos/index.js';
import { vistaTexto } from '../../juegos/conquista/vista.js';
import { BIOMAS } from '../../mapa.js';

const ASCII = /^[\x00-\x7F]*$/;

test('el texto de reglas, el formato y la vista de un estado nuevo no tienen acentos ni caracteres no ASCII', () => {
  assert.match(conquista.reglas, ASCII);
  assert.match(conquista.formatoRespuesta, ASCII);
  assert.match(vistaTexto(nuevoEstado(4), 0), ASCII);
});

test('el prompt completo de 5 reinos en el peor caso cabe en el tope de tokens de Claude (caracteres / 1.97)', () => {
  const tokens = tokensDelPrompt(estadoPeorCaso());
  assert.ok(tokens <= TOPE_TOKENS_ENTRADA, `el prompt mide ${tokens} tokens y el tope aprobado es ${TOPE_TOKENS_ENTRADA}: hay que recortar texto de las reglas; subir el tope requiere aprobacion expresa (CLAUDE.md)`);
});

test('el peor caso de 5 reinos cabe en el tope con los cuatro biomas y 100 seeds (el arido, con su tierra compacta, tiene mas vecinas por region)', () => {
  for (const bioma of BIOMAS) {
    let peor = 0, peorSeed = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const tokens = tokensDelPrompt(estadoPeorCaso(seed, bioma));
      if (tokens > peor) { peor = tokens; peorSeed = seed; }
    }
    assert.ok(peor <= TOPE_TOKENS_ENTRADA, `${bioma}: el peor caso mide ${peor} tokens (seed ${peorSeed}) y el tope aprobado es ${TOPE_TOKENS_ENTRADA}: afinar el bioma; subir el tope requiere aprobacion expresa`);
  }
});

test('el prompt escribe las reglas de movimiento que el motor aplica: quedar 1 tropa, la palabra todo y no cruzar territorio de otro reino', () => {
  // 22 de octubre de 2026: el 78 % de las ordenes descartadas de la partida publicada (112 de 144) eran "debe quedar al menos 1 tropa", una regla que el motor aplicaba y el prompt no decia.
  assert.match(conquista.reglas, /Siempre debe quedar 1 unidad en la region de origen/);
  assert.match(conquista.reglas, /"todo"/);
  assert.match(conquista.reglas, /nunca de otro reino/);
});

test('construirUsuario no cambia para el Dilema (vista como objeto) y acepta una vista en texto', () => {
  const vista = { ronda: 1, rondasTotales: 10 };
  assert.equal(construirUsuario(vista), `Estado actual de la partida:\n\n${JSON.stringify(vista, null, 2)}\n\nTu turno. Responde solo con el JSON.`);
  assert.equal(construirUsuario('hola'), 'Estado actual de la partida:\n\nhola\n\nTu turno. Responde solo con el JSON.');
  assert.ok(construirSistema(dilema).includes(dilema.reglas));
});

test('el juego esta registrado junto al Dilema', () => {
  assert.equal(obtenerJuego('conquista'), conquista);
  assert.ok(Object.keys(JUEGOS).includes('dilema'));
});
