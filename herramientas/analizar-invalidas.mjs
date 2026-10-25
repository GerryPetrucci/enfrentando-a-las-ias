#!/usr/bin/env node
// Por que fallaron las llamadas de una partida guardada: cada llamada invalida con su modelo, turno, motivo, error de la API y el principio del texto crudo.
// No llama a ningun modelo ni gasta nada. Sirve para cualquier juego (Lobo, Guerra de territorios, La Fuga, Duda y apuesta...); src/invalidas.js sabe donde guarda cada uno.
//
//   node herramientas/analizar-invalidas.mjs --archivo=pruebas/NOMBRE.json [--partida=1] [--crudo=400] [--json]
//
// --crudo=N   cuantos caracteres del texto crudo se muestran por llamada (por defecto 160; 0 = no mostrarlo)    --json   salida en JSON, para otro programa
// Las partidas guardadas ANTES del 25 de octubre de 2026 no traen el texto crudo de Lobo ni el motivo: solo se sabe cuales fueron invalidas y, si la API fallo, el error.

import { readFileSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { llamadasInvalidasDe, resumenPorModelo, causaDe } from '../src/invalidas.js';
import { parsearArgumentos } from '../src/serie.js';

const RAIZ = resolve(fileURLToPath(import.meta.url), '..', '..');

export function analizar(serie, { partida = 1 } = {}) {
  const p = serie.partidas?.[partida - 1];
  if (!p) throw new Error(`La serie no tiene la partida ${partida} (tiene ${serie.partidas?.length ?? 0}).`);
  return { p, llamadas: llamadasInvalidasDe(p), resumen: resumenPorModelo(p) };
}

// Solo corre como programa, no al importarlo desde las pruebas.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = parsearArgumentos(process.argv.slice(2));
  if (typeof o.archivo !== 'string') { console.error('\n  Falta --archivo=pruebas/NOMBRE.json (relativo a data/) o una ruta completa.\n'); process.exit(1); }
  const ruta = isAbsolute(o.archivo) ? o.archivo : resolve(RAIZ, 'data', o.archivo);
  let resultado;
  try { resultado = analizar(JSON.parse(readFileSync(ruta, 'utf8').replace(/^﻿/, '')), { partida: Number(o.partida ?? 1) }); } catch (err) { console.error(`\n  ${err.message}\n`); process.exit(1); }
  const { p, llamadas, resumen } = resultado;
  if (o.json) { console.log(JSON.stringify({ llamadas, resumen }, null, 2)); process.exit(0); }
  const largo = o.crudo === undefined ? 160 : Number(o.crudo);
  const total = p.llamadas ?? p.usoPorJugador?.reduce((n, u) => n + u.llamadas, 0) ?? null;
  console.log(`\n  ${p.juego?.nombre ?? 'Partida'} · ${llamadas.length} llamada(s) inválida(s)${total ? ` de ${total}` : ''}\n`);
  for (const f of resumen) {
    console.log(`  ${f.nombre.padEnd(14)} ${f.invalidas}${f.llamadas ? ` de ${f.llamadas}` : ''} inválida(s)`);
    for (const c of f.causas) console.log(`      ${c.veces}× ${c.causa}`);
  }
  console.log('');
  for (const c of llamadas) {
    console.log(`  turno ${String(c.turno).padStart(2)}${c.ronda ? ` · ronda ${c.ronda}` : ''}${c.fase ? ` · ${c.fase}` : ''} · ${c.nombre} (asiento ${c.asiento})`);
    console.log(`      causa:  ${causaDe(c)}`);
    if (c.motivo && c.error) console.log(`      error:  ${c.error}`);
    if (largo > 0) console.log(`      crudo:  ${c.crudo ? JSON.stringify(c.crudo.slice(0, largo)) + (c.crudo.length > largo ? '…' : '') : '(no quedó texto: la respuesta llegó vacía o esta partida es anterior al registro del crudo)'}`);
  }
  console.log('');
}
