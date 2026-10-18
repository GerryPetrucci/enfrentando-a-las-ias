#!/usr/bin/env node
// Dice como partir una partida guardada en DOS videos (cada juego se publica en dos partes): las rondas de cada parte, lo que dura cada una y la direccion de la escena para grabarlas.
//
//   node herramientas/partes.mjs --archivo=pruebas/NOMBRE.json [--partida=1] [--voz=data/voz/NOMBRE-p1/voz.json] [--formato=9x16]
//
// Sin --voz mide la duracion sin voz; con la voz de herramientas/narrar.mjs, la duracion real con ella. Solo lee: no escribe nada.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { lineaDe, motivoDeNoReproducible } from '../web/casino/lineas.js';
import { dividirEnDos, formatoDeTiempo } from '../web/casino/escena-config.js';

export { formatoDeTiempo }; // sigue exportada desde aqui para quien ya la importaba de esta herramienta

export function urlDeParte({ archivo, partida, formato, parte, voz }) {
  const q = new URLSearchParams({ archivo, partida: String(partida), ronda: String(parte.mano), hasta: String(parte.hasta), formato, auto: '1' });
  if (voz) q.set('voz', voz);
  return `escena.html?${q}`;
}

async function principal() {
  const a = Object.fromEntries(process.argv.slice(2).map((x) => { const [k, ...v] = x.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : 'true']; }));
  const salir = (m) => { console.error(m); process.exit(1); };
  if (!a.archivo) salir('Falta --archivo=NOMBRE.json (una partida guardada en data/, por ejemplo pruebas/NOMBRE.json).');
  const numero = Number(a.partida ?? 1), formato = a.formato ?? '9x16';
  const datos = JSON.parse(readFileSync(resolve('data', a.archivo), 'utf8'));
  const partida = datos.partidas?.[numero - 1];
  if (!partida) salir(`El archivo no tiene la partida ${numero}.`);
  const juegoId = partida.juego?.id ?? datos.juego?.id;
  const motivo = motivoDeNoReproducible(juegoId, partida);
  if (motivo) salir(`La partida ${numero} no se puede partir: ${motivo}.`);
  const voz = a.voz ? JSON.parse(readFileSync(resolve(a.voz), 'utf8')) : null;
  const construir = await lineaDe(juegoId);
  const d = dividirEnDos(construir(partida), voz);
  if (!d) salir('Esta partida es muy corta para partirla en dos (una sola ronda).');
  for (const [n, p] of [[1, d.parte1], [2, d.parte2]]) {
    console.log(`Parte ${n}: rondas ${p.mano} a ${p.hasta} · ${formatoDeTiempo(p.ms)} ${voz ? 'con voz' : 'sin voz'}`);
    console.log(`  ${urlDeParte({ archivo: a.archivo, partida: numero, formato, parte: p, voz: a.voz })}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal();
