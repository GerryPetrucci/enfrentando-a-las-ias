#!/usr/bin/env node
// Revisión PREVIA de las respuestas que pegaste de tus chats (formato «era»): lee la carpeta, extrae el JSON de cada archivo y lo pasa por el MISMO
// validador del motor, sin abrir el juego. Si algo falla, imprime el error EXACTO (qué campo, qué opciones son válidas) para que se lo pidas
// corregido a tu modelo y guardes su respuesta en <letra>/<etapa>.correccion.txt.
//
//   node herramientas/worldbox-era-verificar.mjs --respuestas=mis-respuestas
//   node herramientas/worldbox-era-verificar.mjs --respuestas=data/era/partidas/<id>/conversacion.json     (repetir una partida)
//   Opcional: --json (salida para máquina), --intervenciones=150,300,450 --intervenciones-guerra=1,3 (si cambiaste el calendario)
// Sale con código 1 si hay respuestas inválidas o que faltan. No usa el juego, ni API, ni el token.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cargarAlmacen, LETRA } from '../src/worldbox/era/respuestas/almacen.js';
import { informeTexto, verificarRespuestas } from '../src/worldbox/era/respuestas/verificar.js';
import { partidaDesdeCli } from '../src/worldbox/era/correr-era.js';

export function leerArgumentos(args) {
  const o = {};
  for (const a of args) { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); if (!m) throw new Error(`Argumento no reconocido: ${a}`); o[m[1]] = m[2] ?? true; }
  return o;
}
export async function main(args = process.argv.slice(2), salida = t => console.log(t)) {
  const o = leerArgumentos(args);
  if (!o.respuestas || o.respuestas === true) { salida('Uso: node herramientas/worldbox-era-verificar.mjs --respuestas=<carpeta o conversacion.json> [--json]'); return 2; }
  const partida = partidaDesdeCli({ ...o, respuestas: undefined, json: undefined });
  const almacen = await cargarAlmacen(resolve(o.respuestas));
  const informe = verificarRespuestas({ almacen, partida });
  const nombre = id => o[id === 'f1' ? 'nombre-a' : 'nombre-b'] ?? almacen.participantes[id]?.nombre ?? almacen.participantes[id]?.modelo ?? '';
  salida(o.json === true ? JSON.stringify(informe, null, 2) : informeTexto(informe, { etiqueta: id => LETRA[id], nombre }));
  return informe.ok ? 0 : 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then(c => { process.exitCode = c; }).catch(e => { console.error(`worldbox-era-verificar: ${e.message}`); process.exitCode = 2; });
}
