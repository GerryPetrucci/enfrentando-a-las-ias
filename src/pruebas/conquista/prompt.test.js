import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevoEstado, estadoPeorCaso, tokensDelPrompt, TOPE_TOKENS_ENTRADA } from './ayudas.js';
import { construirSistema, construirUsuario } from '../../prompt.js';
import conquista from '../../juegos/conquista.js';
import dilema from '../../juegos/dilema.js';
import { obtenerJuego, JUEGOS } from '../../juegos/index.js';
import { vistaTexto } from '../../juegos/conquista/vista.js';

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
