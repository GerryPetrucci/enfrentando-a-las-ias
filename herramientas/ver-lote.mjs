#!/usr/bin/env node
// Consulta un lote ya enviado a la Batch API de OpenRouter: estado, conteo, tokens, costo y (con --resultados) lo que contesto cada
// peticion. Es de solo lectura y no gasta. Sirve cuando una corrida con --lote se interrumpe a media espera: el lote sigue su curso
// en OpenRouter (y se cobra), y la consola imprimio su id al enviarlo. OpenRouter guarda los datos 30 dias.
//
//   node herramientas/ver-lote.mjs batch-1791567337-lkyPbFy1YI6inW4QQLWq
//   node herramientas/ver-lote.mjs ID --resultados
//
// No retoma la serie interrumpida: solo muestra en que quedo el lote.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearClienteLote, leerResultados } from '../src/lote.js';
import { parsearArgumentos } from '../src/serie.js';

export function resumirLote(lote, { resultados = false } = {}) {
  const n = lote?.request_counts ?? {};
  const u = lote?.usage;
  const lineas = [
    `Lote ${lote?.id ?? '?'}${lote?.model ? ` · ${lote.model}` : ''}`,
    `Estado: ${lote?.status ?? '?'}`,
    `Peticiones: ${n.total ?? '?'} en total, ${n.completed ?? 0} listas, ${n.failed ?? 0} fallidas`,
    u ? `Uso: ${(u.total_tokens ?? 0).toLocaleString('en-US')} tokens (${u.prompt_tokens ?? 0} de entrada, ${u.completion_tokens ?? 0} de salida)` : 'Uso: aun no informado',
    u?.cost != null ? `Costo: $${u.cost}` : 'Costo: aun no informado',
  ];
  if (resultados) {
    for (const [id, r] of leerResultados(lote)) {
      lineas.push(r.error ? `  ${id}  ERROR  ${r.error}` : `  ${id}  ok  ${String(r.texto).replace(/\s+/g, ' ').slice(0, 80)}`);
    }
  }
  return lineas.join('\n');
}

// Solo corre como programa, no al importarlo desde las pruebas.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = parsearArgumentos(process.argv.slice(2));
  const id = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!id) {
    console.error('\n  Falta el id del lote: node herramientas/ver-lote.mjs batch-... [--resultados]\n');
    process.exit(1);
  }
  try {
    const lote = await crearClienteLote().consultar(id);
    console.log(`\n${resumirLote(lote, { resultados: o.resultados === true })}\n`);
  } catch (err) {
    console.error(`\n  No pude consultar el lote: ${err.message}\n`);
    process.exit(1);
  }
}
