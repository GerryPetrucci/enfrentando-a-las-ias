// La "liga economica" de practica: la gama baja de cada proveedor, por lote, a centavos por partida (decidido el 9 oct 2026:
// la practica ya no usa los modelos gratis, que dieron 1 respuesta util de 40 llamadas).
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTENDIENTES } from '../modelos.js';
import { PALETA } from '../../web/paleta.js';

const ECONOMICOS = { haiku: 'claude', luna: 'gpt', 'flash-lite': 'gemini' };

test('los tres modelos economicos estan registrados como practica, con lote y razonamiento medio', () => {
  for (const clave of Object.keys(ECONOMICOS)) {
    const c = CONTENDIENTES[clave];
    assert.ok(c, `falta ${clave}`);
    assert.equal(c.practica, true, clave);
    assert.equal(c.lote, true, clave);
    assert.equal(c.razonamiento, 'medium', clave);
    assert.ok(!c.gratis, `${clave} gasta credito`);
  }
  assert.equal(CONTENDIENTES.haiku.modelo, 'anthropic/claude-haiku-5.5');
  assert.equal(CONTENDIENTES.luna.modelo, 'openai/gpt-6-luna');
  assert.equal(CONTENDIENTES['flash-lite'].modelo, 'google/gemini-3.5-flash-lite');
});

test('los contendientes oficiales no se marcan como practica', () => {
  for (const clave of ['claude', 'gpt', 'gemini', 'llama', 'deepseek']) assert.ok(!CONTENDIENTES[clave].practica, clave);
});

test('cada economico usa el color de la familia de su proveedor, con su propio nombre', () => {
  for (const [clave, familia] of Object.entries(ECONOMICOS)) {
    const p = PALETA[clave];
    assert.equal(p.familia, familia, clave);
    assert.equal(p.color, PALETA[familia].color, clave);
    assert.deepEqual(p.multi ?? null, PALETA[familia].multi ?? null, clave);
    assert.notEqual(p.nombre, PALETA[familia].nombre, clave);
  }
});

test('las iniciales y los nombres de todos los contendientes son unicos', () => {
  const iniciales = Object.values(CONTENDIENTES).map((c) => c.inicial);
  const nombres = Object.values(CONTENDIENTES).map((c) => c.nombre);
  assert.equal(new Set(iniciales).size, iniciales.length);
  assert.equal(new Set(nombres).size, nombres.length);
});
