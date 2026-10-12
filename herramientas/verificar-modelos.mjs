#!/usr/bin/env node
// Compara el registro de contendientes (src/modelos.js) con el catalogo de OpenRouter: que cada modelo exista, siga siendo (o no)
// gratis, tenga variante de lote y admita el razonamiento que se le manda. Los IDs cambian cada pocos meses (CLAUDE.md): correr
// esto ANTES de cada temporada y antes de gastar. No usa la llave ni gasta nada (el catalogo es publico).
//
//   node herramientas/verificar-modelos.mjs                    (baja el catalogo de OpenRouter)
//   node herramientas/verificar-modelos.mjs --archivo=catalogo.json   (usa un catalogo ya guardado)
//
// Sale con 1 si hay algun PROBLEMA (algo que romperia una corrida); los avisos (ahorros posibles, retiros anunciados) no la frenan.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTENDIENTES } from '../src/modelos.js';
import { parsearArgumentos } from '../src/serie.js';

const porMillon = (x) => (x == null || x === '' ? null : +(Number(x) * 1e6).toFixed(4));

export function revisarContendientes(catalogo, contendientes = CONTENDIENTES) {
  const porId = new Map(catalogo.data.map((m) => [m.id, m]));
  return Object.entries(contendientes).map(([clave, c]) => {
    const m = porId.get(c.modelo), lote = porId.get(`${c.modelo}:batch`);
    const problemas = [], avisos = [];
    const fila = { clave, nombre: c.nombre, modelo: c.modelo, precio: null, lote: { existe: !!lote, entrada: null, salida: null }, razonamiento: null, problemas, avisos };
    if (!m) { problemas.push(`${c.modelo} no esta en el catalogo`); return fila; }

    fila.precio = { entrada: porMillon(m.pricing?.prompt), salida: porMillon(m.pricing?.completion) };
    if (lote) fila.lote = { existe: true, entrada: porMillon(lote.pricing?.prompt), salida: porMillon(lote.pricing?.completion) };

    const cuesta = (fila.precio.entrada ?? 0) > 0 || (fila.precio.salida ?? 0) > 0;
    if (c.gratis && cuesta) problemas.push(`ya no es gratis (${fila.precio.entrada} / ${fila.precio.salida} por millon): quitarlo del modo gratis`);
    if (!c.gratis && !cuesta) avisos.push('cuesta 0 en el catalogo: ahora es gratis (marcar gratis: true si se quiere usar en modo gratis)');

    if (c.lote && !lote) problemas.push(`se marca lote: true pero no hay variante :batch (${c.modelo}:batch)`);
    if (!c.lote && lote && !c.gratis) avisos.push(`el catalogo ya trae la variante :batch (${fila.lote.entrada} / ${fila.lote.salida}): se puede marcar lote: true y ahorrar la mitad`);

    const r = m.reasoning ?? null;
    const niveles = r?.supported_efforts ?? [];
    fila.razonamiento = r ? { niveles, porDefecto: r.default_effort ?? null, obligatorio: !!r.mandatory } : null;
    if (c.razonamiento && !niveles.includes(c.razonamiento)) problemas.push(`se manda razonamiento "${c.razonamiento}" y el modelo no admite ese nivel (admite: ${niveles.join(', ') || 'ninguno'})`);
    if (!c.razonamiento && niveles.includes('medium')) avisos.push('el modelo admite "medium" y el registro no lo manda (razonamiento: null)');
    if (c.razonamiento === 'medium' && ['high', 'xhigh', 'max'].includes(r?.default_effort)) avisos.push(`por defecto razona en "${r.default_effort}"; se manda "medium" para ahorrar`);
    if (c.razonamiento === 'medium' && ['minimal', 'low', 'none'].includes(r?.default_effort)) {
      avisos.push(`su defecto es "${r.default_effort}" y se manda "medium": le sube el costo. La regla del proyecto tambien permite el defecto (razonamiento: null)`);
    }
    if (m.expiration_date) avisos.push(`el catalogo anuncia su retiro el ${m.expiration_date}`);
    return fila;
  });
}

function imprimir(filas) {
  console.log(`\n  ${'clave'.padEnd(16)} ${'modelo'.padEnd(42)} ${'normal (ent/sal)'.padEnd(18)} ${'lote'.padEnd(16)} razonamiento`);
  for (const f of filas) {
    const normal = f.precio ? `${f.precio.entrada}/${f.precio.salida}` : '?';
    const lote = f.lote.existe ? `${f.lote.entrada}/${f.lote.salida}` : 'no';
    const raz = f.razonamiento ? `${f.razonamiento.obligatorio ? 'obligatorio, ' : ''}defecto ${f.razonamiento.porDefecto ?? '?'}` : 'sin niveles';
    console.log(`  ${f.clave.padEnd(16)} ${f.modelo.padEnd(42)} ${normal.padEnd(18)} ${lote.padEnd(16)} ${raz}`);
    for (const p of f.problemas) console.log(`      PROBLEMA: ${p}`);
    for (const a of f.avisos) console.log(`      aviso: ${a}`);
  }
  console.log('');
}

// Solo corre como programa, no al importarlo desde las pruebas.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = parsearArgumentos(process.argv.slice(2));
  let catalogo;
  try {
    catalogo = typeof o.archivo === 'string'
      ? JSON.parse(readFileSync(resolve(o.archivo), 'utf8'))
      : await (await fetch('https://openrouter.ai/api/v1/models')).json();
    if (!Array.isArray(catalogo?.data)) throw new Error('el catalogo no trae la lista "data"');
  } catch (err) {
    console.error(`\n  No pude leer el catalogo de OpenRouter: ${err.message}\n`);
    process.exit(1);
  }
  const filas = revisarContendientes(catalogo);
  imprimir(filas);
  const problemas = filas.reduce((n, f) => n + f.problemas.length, 0);
  console.log(problemas ? `  ${problemas} problema(s): arreglar src/modelos.js antes de correr.\n` : '  Todo cuadra con el catalogo.\n');
  process.exit(problemas ? 1 : 0);
}
