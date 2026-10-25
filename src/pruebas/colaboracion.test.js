import { test } from 'node:test';
import assert from 'node:assert/strict';
import { argumentosClaude, entornoSuscripcion } from '../../herramientas/revisar-con-claude.mjs';

test('las revisiones externas tienen un turno sin herramientas, hooks, skills o proveedores adicionales', () => {
  const a = argumentosClaude();
  assert.equal(a[a.indexOf('--max-turns') + 1], '1');
  assert.equal(a[a.indexOf('--tools') + 1], '');
  assert.ok(a.includes('--strict-mcp-config'));
  assert.ok(a.includes('--disable-slash-commands'));
  assert.ok(a.includes('--no-session-persistence'));
  assert.equal(JSON.parse(a[a.indexOf('--settings') + 1]).disableAllHooks, true);
  assert.equal(a.includes('--bare'), false, 'bare no usa la suscripcion');
  assert.equal(a.includes('--fallback-model'), false);
});

test('el entorno hijo evita credenciales de API y proveedores sin alterar el entorno del coordinador', () => {
  const original = { PATH: 'ruta-de-prueba', ANTHROPIC_API_KEY: 'ejemplo-no-real', ANTHROPIC_AUTH_TOKEN: 'ejemplo-no-real', CLAUDE_CODE_USE_BEDROCK: '1', CLAUDE_CODE_OAUTH_TOKEN: 'ejemplo-no-real' };
  assert.deepEqual(entornoSuscripcion(original), { PATH: 'ruta-de-prueba' });
  assert.equal(original.ANTHROPIC_API_KEY, 'ejemplo-no-real');
});
