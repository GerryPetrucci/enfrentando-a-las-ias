// Las herramientas de herramientas/ son programas chicos que se corren a mano. Aqui se comprueba que corren, sin API.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { estadoPeorCaso, tokensDelPrompt, TOPE_TOKENS_ENTRADA } from './conquista/ayudas.js';

const RAIZ = fileURLToPath(new URL('../..', import.meta.url));

test('medir-prompt imprime el tamano del prompt real de 2 a 5 reinos y el peor caso, contra el tope aprobado', () => {
  const r = spawnSync(process.execPath, ['herramientas/medir-prompt.mjs'], { cwd: RAIZ, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  for (const k of [2, 3, 4, 5]) assert.match(r.stdout, new RegExp(`^ *${k} reinos`, 'm'));
  const peor = tokensDelPrompt(estadoPeorCaso());
  assert.ok(r.stdout.includes(`${peor} tokens`), `no imprime el peor caso (${peor} tokens):\n${r.stdout}`);
  assert.ok(r.stdout.includes(`tope ${TOPE_TOKENS_ENTRADA}`));
});
