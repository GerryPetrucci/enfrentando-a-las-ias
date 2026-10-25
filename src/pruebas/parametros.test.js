// Parametros de llamada comunes a todas las IAs (decision del 9 oct 2026): temperatura 0.7, 4000 tokens y razonamiento MEDIO,
// nunca el maximo. Se prueba con un fetch falso: no hay red ni API.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARAMETROS, cuerpoDeLlamada } from '../parametros.js';
import { CONTENDIENTES, llamarModelo, fijarModo, exigirModoPago } from '../modelos.js';
import { agenteModelo } from '../agentes.js';
import dilema from '../juegos/dilema.js';

// OJO: el modo (gratis/pago) es estado del proceso; esta prueba va primero, con el modo sin elegir.
test('exigirModoPago frena a los modelos de pago sin modo pago, y deja pasar a los gratis', () => {
  assert.throws(() => exigirModoPago(CONTENDIENTES.claude.modelo), /gasta credito/);
  assert.doesNotThrow(() => exigirModoPago(CONTENDIENTES.laguna.modelo));
  fijarModo('pago');
  assert.doesNotThrow(() => exigirModoPago(CONTENDIENTES.claude.modelo));
});

test('los parametros comunes: temperatura 0.7, 4000 tokens y razonamiento medio', () => {
  assert.deepEqual({ ...PARAMETROS }, { temperatura: 0.7, maxTokens: 4000, razonamiento: 'medium' });
  assert.throws(() => { PARAMETROS.razonamiento = 'high'; }, TypeError, 'los parametros estan congelados');
});

test('cuerpoDeLlamada arma el cuerpo de siempre y agrega el razonamiento solo si el modelo lo admite', () => {
  const con = cuerpoDeLlamada({ sistema: 'S', usuario: 'U', razonamiento: 'medium' });
  assert.deepEqual(con, {
    max_tokens: 4000, temperature: 0.7,
    messages: [{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }],
    reasoning: { effort: 'medium' },
  });
  assert.equal('reasoning' in cuerpoDeLlamada({ sistema: 'S', usuario: 'U' }), false);
});

test('ningun contendiente razona por encima del nivel medio, y todos declaran su ajuste', () => {
  for (const [id, c] of Object.entries(CONTENDIENTES)) {
    // "low" solo para quien no ofrece "medium" y arranca por encima (GLM y Kimi, ver src/parametros.js): sigue siendo "nunca mas que medium".
    assert.ok(['medium', 'low', null].includes(c.razonamiento), `${id}: razonamiento = ${c.razonamiento}`);
  }
  assert.deepEqual(Object.entries(CONTENDIENTES).filter(([, c]) => c.razonamiento === 'low').map(([id]) => id), ['glm', 'kimi', 'glm-flash']);
});

// fetch falso que anota el cuerpo enviado y contesta como OpenRouter
function conFetchFalso(contenido = '{"jugada":"C","promesa":"C","mensaje":"","razon":""}') {
  const enviados = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    enviados.push(JSON.parse(init.body));
    return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: contenido }, finish_reason: 'stop' }], usage: { total_tokens: 5 } }) };
  };
  process.env.OPENROUTER_API_KEY ||= 'llave-de-prueba';
  return { enviados, restaurar: () => { globalThis.fetch = original; } };
}

test('llamarModelo manda el razonamiento medio a los modelos que lo admiten y nada a los que no', async () => {
  const f = conFetchFalso();
  try {
    for (const clave of ['claude', 'llama']) {
      const c = CONTENDIENTES[clave];
      await llamarModelo({ modelo: c.modelo, sistema: 's', usuario: 'u', razonamiento: c.razonamiento, reintentos: 0 });
    }
  } finally { f.restaurar(); }
  assert.equal(f.enviados[0].model, CONTENDIENTES.claude.modelo);
  assert.deepEqual(f.enviados[0].reasoning, { effort: 'medium' });
  assert.equal(f.enviados[0].max_tokens, 4000);
  assert.equal(f.enviados[0].temperature, 0.7);
  assert.equal('reasoning' in f.enviados[1], false);
});

test('un agente de modelo usa el razonamiento de su contendiente', async () => {
  const f = conFetchFalso();
  try {
    await agenteModelo('gpt').jugar({ juego: dilema, vista: { ronda: 1 } });
  } finally { f.restaurar(); }
  assert.deepEqual(f.enviados[0].reasoning, { effort: 'medium' });
});
