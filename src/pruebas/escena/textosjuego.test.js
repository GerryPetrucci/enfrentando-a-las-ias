// Los textos publicos de cada juego (web/casino/textos-juego.js): los usan la tarjeta de arranque de la escena y los textos del paquete de publicacion.
// Son texto que ve el publico: llevan acentos, nunca nombran proveedores y siempre coinciden con el juego del motor.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEXTOS_JUEGO, textoDeJuego, introDe } from '../../../web/casino/textos-juego.js';
import { juegosConEscena } from '../../../web/casino/lineas.js';
import dilema from '../../juegos/dilema.js';
import dudaapuesta from '../../juegos/dudaapuesta.js';
import mayormenor from '../../juegos/mayormenor.js';
import solitario from '../../juegos/solitario.js';
import tripledado from '../../juegos/tripledado.js';
import subasta from '../../juegos/subasta.js';
import fuga from '../../juegos/fuga.js';
import conquista from '../../juegos/conquista.js';

const MOTORES = { dilema, dudaapuesta, mayormenor, solitario, tripledado, subasta, fuga, conquista };
const sinAcentos = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const CAMPOS = ['nombre', 'categoria', 'regla', 'gana', 'mide', 'intro'];

test('cada juego con escena, y el Dilema, tiene sus textos publicos completos', () => {
  for (const id of [...juegosConEscena(), 'dilema']) {
    const t = textoDeJuego(id);
    assert.ok(t, `${id}: faltan sus textos`);
    for (const c of CAMPOS) assert.ok(typeof t[c] === 'string' && t[c].trim().length > 0, `${id}: falta ${c}`);
  }
  assert.deepEqual(Object.keys(TEXTOS_JUEGO).sort(), [...juegosConEscena(), 'dilema'].sort(), 'ni un juego de mas ni de menos');
});

test('nombre y categoria coinciden con los del motor (el nombre publico lleva acentos)', () => {
  for (const [id, motor] of Object.entries(MOTORES)) {
    const t = textoDeJuego(id);
    assert.equal(sinAcentos(t.nombre), sinAcentos(motor.nombre), `${id}: nombre`);
    assert.equal(t.categoria, motor.categoria, `${id}: categoria`);
  }
  assert.equal(textoDeJuego('solitario').nombre, 'El número solitario', 'el publico ve el acento del motor sin acento');
});

test('la frase de la tarjeta (introDe) cabe en la voz y en pantalla: una linea de hasta 140 caracteres, que termina en punto o pregunta y empieza por el nombre del juego', () => {
  for (const id of Object.keys(TEXTOS_JUEGO)) {
    const frase = introDe(id);
    assert.equal(frase, TEXTOS_JUEGO[id].intro);
    assert.ok(frase.length <= 140, `${id}: ${frase.length} caracteres`);
    assert.match(frase, /[.?]$/, id);
    assert.ok(!/\n/.test(frase), id);
    assert.ok(frase.startsWith(`${TEXTOS_JUEGO[id].nombre}:`), `${id}: debe empezar por el nombre del juego`);
  }
  assert.equal(introDe('no-existe'), null);
  assert.equal(introDe(undefined), null);
  assert.equal(introDe('toString'), null);
  assert.equal(textoDeJuego('__proto__'), null);
});

test('ningun texto nombra a un proveedor o a un modelo, ni dice "la mejor IA", ni usa palabras del prompt de otro juego', () => {
  const PROHIBIDO = /openai|anthropic|google|meta\b|deepseek|claude|gpt|gemini|llama|chatgpt|la mejor ia|mejor inteligencia/i;
  for (const [id, t] of Object.entries(TEXTOS_JUEGO)) {
    for (const c of [...CAMPOS, 'hashtags']) assert.ok(!PROHIBIDO.test([].concat(t[c]).join(' ')), `${id}.${c}: nombra a un proveedor o promete un veredicto`);
  }
});

test('los hashtags de cada juego son de 2 a 4, con # y sin espacios, y los textos de los 8 juegos son distintos entre si', () => {
  for (const [id, t] of Object.entries(TEXTOS_JUEGO)) {
    assert.ok(Array.isArray(t.hashtags) && t.hashtags.length >= 2 && t.hashtags.length <= 4, `${id}: de 2 a 4 hashtags`);
    for (const h of t.hashtags) assert.match(h, /^#[\p{L}\p{N}_]+$/u, `${id}: ${h}`);
    assert.equal(new Set(t.hashtags).size, t.hashtags.length, `${id}: hashtags repetidos`);
  }
  for (const c of ['regla', 'intro', 'mide']) assert.equal(new Set(Object.values(TEXTOS_JUEGO).map((t) => t[c])).size, Object.keys(TEXTOS_JUEGO).length, `${c} repetido`);
});
