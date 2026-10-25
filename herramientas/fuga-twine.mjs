#!/usr/bin/env node
// Intercambio con el editor Twine 2. Solo datos declarativos, nunca eval/JS.
// node herramientas/fuga-twine.mjs [--salida=privado/historias/fuga.html] [--forzar]
// node herramientas/fuga-twine.mjs --importar=HISTORIA.html --salida=HISTORIA.json [--version=fuga-2.1.0] [--forzar]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { HISTORIA } from '../src/juegos/fuga/historia.js';
import { validarHistoria } from '../src/juegos/fuga/historia-datos.js';

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const desesc = (t) => t.replace(/&(#(?:x[0-9a-f]+|\d+)|amp|lt|gt|quot|apos);/gi, (todo, c) => {
  if (c.startsWith('#')) { const n = c[1].toLowerCase() === 'x' ? parseInt(c.slice(2), 16) : Number(c.slice(1)); return n >= 0 && n <= 0x10FFFF ? String.fromCodePoint(n) : todo; }
  return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[c.toLowerCase()];
});
const atributos = (s) => Object.fromEntries([...s.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((m) => [m[1], desesc(m[2] ?? m[3])]));
const hash = (h) => createHash('sha256').update(JSON.stringify(h)).digest('hex');

export function exportarTwine(historia = HISTORIA) {
  validarHistoria(historia);
  const pasaje = (id, nombre, cuerpo, x, y) => `<tw-passagedata pid="${id}" name="${nombre}" tags="fuga" position="${x},${y}" size="160,100">${esc(cuerpo)}</tw-passagedata>`;
  const meta = { nombre: historia.nombre, version: historia.version, ifid: historia.ifid };
  const pasajes = [pasaje(1, 'Inicio', `${JSON.stringify(meta, null, 2)}\n\n[[inicio->${historia.inicio}]]`, 100, 100)];
  const columnas = new Map();
  historia.nodos.forEach((n, i) => {
    const { id, salidas, ...datos } = n, columna = columnas.get(n.ronda) ?? 0;
    columnas.set(n.ronda, columna + 1);
    const cuerpo = JSON.stringify({ ...datos, salidas: salidas.map(({ a, ...s }) => s) }, null, 2)
      + '\n\n' + salidas.map((s, j) => `[[salida-${j + 1}->${s.a}]]`).join('\n');
    pasajes.push(pasaje(i + 2, id, cuerpo, 100 + columna * 200, 280 + n.ronda * 160));
  });
  return `<!doctype html><html lang="es"><meta charset="utf-8"><title>${esc(historia.nombre)}</title><body><p>Archivo de autoría: importar en Twine 2. La simulación oficial se ejecuta en el motor del repositorio.</p><tw-storydata name="${esc(historia.nombre)}" startnode="1" creator="Enfrentando a las IAs" creator-version="2.0.0" format="Harlowe" format-version="3.3.9" ifid="${historia.ifid}" zoom="0.5" hidden><style role="stylesheet" type="text/twine-css"></style><script role="script" type="text/twine-javascript"></script>${pasajes.join('\n')}</tw-storydata></body></html>\n`;
}

export function importarTwine(html) {
  if (typeof html !== 'string' || html.length > 2000000) throw new Error('Archivo Twine demasiado grande o invalido.');
  const historias = [...html.matchAll(/<tw-storydata\b[^>]*>([\s\S]*?)<\/tw-storydata>/gi)];
  if (historias.length !== 1) throw new Error('Importa un archivo con una sola historia Twine 2.');
  const pasajes = [...historias[0][1].matchAll(/<tw-passagedata\b([^>]*)>([\s\S]*?)<\/tw-passagedata>/gi)].map((m) => ({ nombre: atributos(m[1]).name, cuerpo: desesc(m[2]) }));
  if (!pasajes.length || pasajes.length > 301 || new Set(pasajes.map((p) => p.nombre)).size !== pasajes.length) throw new Error('Pasajes ausentes, duplicados o excesivos.');
  const inicio = pasajes.find((p) => p.nombre === 'Inicio');
  if (!inicio) throw new Error('Falta el pasaje Inicio.');
  const enlace = /\[\[inicio->([a-z0-9-]+)\]\]/g;
  const enlaces = [...inicio.cuerpo.matchAll(enlace)];
  if (enlaces.length !== 1) throw new Error('Inicio requiere un unico enlace inicio->nodo.');
  const h = { ...JSON.parse(inicio.cuerpo.replace(enlace, '').trim()), inicio: enlaces[0][1], nodos: [] };
  for (const p of pasajes.filter((p) => p !== inicio)) {
    const re = /\[\[salida-(\d+)->([a-z0-9-]+)\]\]/g;
    const enlaces = [...p.cuerpo.matchAll(re)];
    const datos = JSON.parse(p.cuerpo.replace(re, '').trim());
    if (Object.hasOwn(datos, 'id')) throw new Error(`${p.nombre}: el id lo define el nombre del pasaje.`);
    if (!Array.isArray(datos.salidas) || enlaces.length !== datos.salidas.length || new Set(enlaces.map((m) => Number(m[1]))).size !== enlaces.length) throw new Error(`${p.nombre}: enlaces y salidas no coinciden.`);
    const salidas = datos.salidas.map((s, i) => {
      const e = enlaces.find((m) => Number(m[1]) === i + 1);
      if (!e) throw new Error(`${p.nombre}: falta salida-${i + 1}.`);
      if (Object.hasOwn(s, 'a')) throw new Error(`${p.nombre}: el destino se edita en su enlace Twine.`);
      return { a: e[2], ...s };
    });
    h.nodos.push({ id: p.nombre, ...datos, salidas });
  }
  return validarHistoria(h);
}

function principal() {
  const a = Object.fromEntries(process.argv.slice(2).map((x) => { const [k, ...v] = x.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
  try {
    let contenido, salida;
    if (a.importar) {
      const h = importarTwine(readFileSync(resolve(a.importar), 'utf8'));
      if (a.version) h.version = a.version;
      validarHistoria(h);
      if (h.version === HISTORIA.version && hash(h) !== hash(HISTORIA)) throw new Error('El contenido cambio: indica una nueva --version=fuga-X.Y.Z.');
      contenido = JSON.stringify(h, null, 2) + '\n'; salida = a.salida ?? `privado/historias/${h.version}.json`;
    } else { contenido = exportarTwine(); salida = a.salida ?? `privado/historias/${HISTORIA.version}.html`; }
    if (existsSync(resolve(salida)) && !a.forzar) throw new Error(`Ya existe ${salida}; usa --forzar para reemplazarlo.`);
    mkdirSync(dirname(resolve(salida)), { recursive: true }); writeFileSync(resolve(salida), contenido, 'utf8');
    console.log(`Listo: ${salida}`);
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) principal();
