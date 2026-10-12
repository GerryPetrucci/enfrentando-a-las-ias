// herramientas/verificar-modelos.mjs compara el registro de contendientes (src/modelos.js) con el catalogo de OpenRouter:
// que cada modelo exista, siga siendo (o no) gratis, tenga variante de lote y admita el razonamiento que se le manda.
// Los IDs cambian cada pocos meses (CLAUDE.md): esto avisa antes de gastar. Aqui se prueba con catalogos inventados (sin red).
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { revisarContendientes } from '../../herramientas/verificar-modelos.mjs';
import { CONTENDIENTES } from '../modelos.js';

const RAIZ = fileURLToPath(new URL('../..', import.meta.url));
const fijo = (x) => String(x / 1e6);
const modelo = (id, { e = 1, s = 5, razonamiento = { mandatory: false, supported_efforts: ['high', 'medium', 'low'], default_effort: 'medium' }, parametros = ['reasoning', 'temperature', 'max_tokens'], expira = null } = {}) =>
  ({ id, pricing: { prompt: fijo(e), completion: fijo(s) }, reasoning: razonamiento, supported_parameters: parametros, expiration_date: expira });

const sano = { x: { nombre: 'X', modelo: 'p/x', razonamiento: 'medium', lote: true } };
const catalogoSano = { data: [modelo('p/x'), modelo('p/x:batch', { e: 0.5, s: 2.5 })] };

test('un registro que coincide con el catalogo no da problemas ni avisos', () => {
  const [f] = revisarContendientes(catalogoSano, sano);
  assert.deepEqual(f.problemas, []);
  assert.deepEqual(f.avisos, []);
  assert.equal(f.precio.entrada, 1);
  assert.deepEqual(f.lote, { existe: true, entrada: 0.5, salida: 2.5 });
});

test('problema: el modelo ya no esta en el catalogo', () => {
  const [f] = revisarContendientes({ data: [] }, sano);
  assert.match(f.problemas[0], /no esta en el catalogo/);
});

test('problema: se dice que tiene lote y no hay variante :batch', () => {
  const [f] = revisarContendientes({ data: [modelo('p/x')] }, sano);
  assert.ok(f.problemas.some((p) => /variante :batch/.test(p)));
});

test('aviso: no se marca lote pero el catalogo ya trae la variante :batch (ahorro posible)', () => {
  const [f] = revisarContendientes(catalogoSano, { x: { ...sano.x, lote: false } });
  assert.deepEqual(f.problemas, []);
  assert.ok(f.avisos.some((a) => /variante :batch/.test(a)));
});

test('problema: se manda razonamiento medio a un modelo que no admite ese nivel', () => {
  const sinMedio = { data: [modelo('p/x', { razonamiento: { supported_efforts: ['high', 'low'], default_effort: 'high' } }), modelo('p/x:batch')] };
  const [f] = revisarContendientes(sinMedio, sano);
  assert.ok(f.problemas.some((p) => /medium/.test(p)));
});

test('aviso: el modelo admite razonamiento medio y el registro no lo manda', () => {
  const [f] = revisarContendientes(catalogoSano, { x: { ...sano.x, razonamiento: null } });
  assert.deepEqual(f.problemas, []);
  assert.ok(f.avisos.some((a) => /admite "medium"/.test(a)));
});

test('aviso: razonamiento por defecto alto (Claude Sonnet 5.5 razona en high por defecto): se manda medio para ahorrar', () => {
  const alto = { data: [modelo('p/x', { razonamiento: { mandatory: true, supported_efforts: ['high', 'medium'], default_effort: 'high' } }), modelo('p/x:batch')] };
  const [f] = revisarContendientes(alto, sano);
  assert.deepEqual(f.problemas, []);
  assert.ok(f.avisos.some((a) => /por defecto razona en "high"/.test(a)));
});

test('aviso: el defecto del modelo es mas bajo que medio (Gemini Flash-Lite razona en minimal): mandar medio le sube el costo', () => {
  const bajo = { data: [modelo('p/x', { razonamiento: { mandatory: true, supported_efforts: ['high', 'medium', 'low', 'minimal'], default_effort: 'minimal' } }), modelo('p/x:batch')] };
  const [f] = revisarContendientes(bajo, sano);
  assert.deepEqual(f.problemas, []);
  assert.ok(f.avisos.some((a) => /defecto es "minimal"/.test(a) && /razonamiento: null/.test(a)));
  // con el defecto en medio no hay nada que avisar
  assert.deepEqual(revisarContendientes(catalogoSano, sano)[0].avisos, []);
});

test('gratis: problema si ya cuesta, aviso si cuesta y esta marcado de pago', () => {
  const [a] = revisarContendientes({ data: [modelo('p/g', { e: 0.1, s: 0.1 })] }, { g: { nombre: 'G', modelo: 'p/g', gratis: true, razonamiento: null, lote: false } });
  assert.ok(a.problemas.some((p) => /ya no es gratis/.test(p)));
  const [b] = revisarContendientes({ data: [modelo('p/g', { e: 0, s: 0 })] }, { g: { nombre: 'G', modelo: 'p/g', razonamiento: null, lote: false } });
  assert.ok(b.avisos.some((x) => /cuesta 0/.test(x)));
});

test('aviso: el modelo tiene fecha de retiro', () => {
  const [f] = revisarContendientes({ data: [modelo('p/x', { expira: '2026-12-01' }), modelo('p/x:batch')] }, sano);
  assert.ok(f.avisos.some((a) => /2026-12-01/.test(a)));
});

// la consola: con un catalogo hecho a partir del registro real, todo cuadra; con uno roto, sale con 1
function catalogoDelRegistro() {
  const data = [];
  for (const c of Object.values(CONTENDIENTES)) {
    const gratis = !!c.gratis;
    data.push(modelo(c.modelo, { e: gratis ? 0 : 1, s: gratis ? 0 : 5, razonamiento: c.razonamiento ? { supported_efforts: ['high', 'medium', 'low'], default_effort: 'medium' } : null }));
    if (c.lote) data.push(modelo(`${c.modelo}:batch`, { e: 0.5, s: 2.5 }));
  }
  return { data };
}
const correr = (catalogo) => {
  const dir = mkdtempSync(join(tmpdir(), 'verificar-'));
  try {
    const archivo = join(dir, 'catalogo.json');
    writeFileSync(archivo, JSON.stringify(catalogo));
    return spawnSync(process.execPath, ['herramientas/verificar-modelos.mjs', `--archivo=${archivo}`], { cwd: RAIZ, encoding: 'utf8' });
  } finally { rmSync(dir, { recursive: true, force: true }); }
};

test('la consola sale con 0 si el registro real cuadra con el catalogo, y lista todos los contendientes', () => {
  const r = correr(catalogoDelRegistro());
  assert.equal(r.status, 0, r.stderr + r.stdout);
  for (const clave of Object.keys(CONTENDIENTES)) assert.ok(r.stdout.includes(clave), `no lista ${clave}`);
});

test('la consola sale con 1 y dice cual es el problema si un modelo desaparecio del catalogo', () => {
  const roto = catalogoDelRegistro();
  roto.data = roto.data.filter((m) => m.id !== CONTENDIENTES.haiku.modelo && m.id !== `${CONTENDIENTES.haiku.modelo}:batch`);
  const r = correr(roto);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /haiku[\s\S]*no esta en el catalogo/);
});
