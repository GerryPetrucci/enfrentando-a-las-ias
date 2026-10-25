#!/usr/bin/env node
// Recorta la hoja de sprites del elenco de Lobo en la aldea (6 personajes x 6 fotogramas) en una tira por rol, lista para animarse con
// CSS (steps) en la escena: web/arte/lobo/animacion-<rol>.png. Es la fuente unica de esas tiras: no se editan a mano.
//
//   node herramientas/recortar-elenco-lobo.mjs --hoja="C:\ruta\Hoja de sprites.png"
//   --salida=web/arte/lobo   carpeta de las tiras y de recortes-personajes.json (por defecto esa)
//   --js=web/casino/lobo-personajes-animados.js   modulo con los tamanos que lee la escena (por defecto ese)
//
// La hoja es una cuadricula de 6 filas (una por rol, en el orden de ROLES_HOJA) y 6 columnas. Los personajes no caen exactos en la
// cuadricula: cada corte entre fotogramas se busca como la columna vacia mas cercana a la frontera nominal, y cada fotograma solo
// conserva lo que cae entre sus dos cortes (los destellos y auras de un cuadro no manchan al vecino). Dentro de un rol todos los
// cuadros comparten la misma ventana (la union de lo dibujado + 2 px) y su posicion respecto de la cuadricula original: el
// personaje no salta de un cuadro a otro y los movimientos que dibujo el autor se conservan. No se redibuja ni se reescala nada.
// El original trae un velo casi invisible (alfa 1-9) en todo el fondo: se descarta (alfa < UMBRAL_ALFA), sin tocar el resto.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync, deflateSync } from 'node:zlib';
import { parsearArgumentos } from '../src/serie.js';

export const ROLES_HOJA = ['lobo', 'aldeano', 'bruja', 'cazador', 'vidente', 'cupido'];
export const CUADROS = 6;
export const UMBRAL_ALFA = 16; // por debajo es el velo del fondo: transparente
const UMBRAL_CONTENIDO = 40; // para hallar filas y cortes se ignoran los bordes suaves
const BUSQUEDA = 30; // px a cada lado de la frontera nominal donde se busca el hueco entre cuadros
const MARGEN = 2;

// ---------- PNG minimo: RGBA de 8 bits, sin entrelazado (lo que trae la hoja). Cero dependencias, como el resto del proyecto. ----------

const FIRMA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };

export function decodificarPNG(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(FIRMA)) throw new Error('No es un PNG.');
  let pos = 8, ihdr = null;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const largo = buf.readUInt32BE(pos), tipo = buf.toString('latin1', pos + 4, pos + 8), cuerpo = buf.subarray(pos + 8, pos + 8 + largo);
    if (tipo === 'IHDR') ihdr = { ancho: cuerpo.readUInt32BE(0), alto: cuerpo.readUInt32BE(4), profundidad: cuerpo[8], tipoColor: cuerpo[9], entrelazado: cuerpo[12] };
    else if (tipo === 'IDAT') idat.push(cuerpo);
    else if (tipo === 'IEND') break;
    pos += 12 + largo;
  }
  if (!ihdr || ihdr.profundidad !== 8 || ihdr.tipoColor !== 6 || ihdr.entrelazado !== 0) throw new Error('Solo se admite PNG RGBA de 8 bits sin entrelazado.');
  const { ancho, alto } = ihdr, bpp = 4, fila = ancho * bpp;
  const crudo = inflateSync(Buffer.concat(idat));
  if (crudo.length !== alto * (fila + 1)) throw new Error('Los datos del PNG no coinciden con su tamaño.');
  const datos = new Uint8Array(alto * fila);
  for (let y = 0; y < alto; y++) {
    const filtro = crudo[y * (fila + 1)], ini = y * (fila + 1) + 1;
    if (filtro > 4) throw new Error(`Filtro PNG desconocido: ${filtro}.`);
    for (let i = 0; i < fila; i++) {
      const a = i >= bpp ? datos[y * fila + i - bpp] : 0, b = y > 0 ? datos[(y - 1) * fila + i] : 0, c = i >= bpp && y > 0 ? datos[(y - 1) * fila + i - bpp] : 0;
      const previo = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filtro];
      datos[y * fila + i] = (crudo[ini + i] + previo) & 255;
    }
  }
  return { ancho, alto, datos };
}

const TABLA_CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const x of buf) c = TABLA_CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function trozo(tipo, cuerpo) {
  const t = Buffer.from(tipo, 'latin1'), largo = Buffer.alloc(4), crc = Buffer.alloc(4);
  largo.writeUInt32BE(cuerpo.length); crc.writeUInt32BE(crc32(Buffer.concat([t, cuerpo])));
  return Buffer.concat([largo, t, cuerpo, crc]);
}

export function codificarPNG({ ancho, alto, datos }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0); ihdr.writeUInt32BE(alto, 4); ihdr[8] = 8; ihdr[9] = 6;
  const fila = ancho * 4, crudo = Buffer.alloc(alto * (fila + 1));
  for (let y = 0; y < alto; y++) { crudo[y * (fila + 1)] = 0; Buffer.from(datos.buffer, datos.byteOffset + y * fila, fila).copy(crudo, y * (fila + 1) + 1); }
  return Buffer.concat([FIRMA, trozo('IHDR', ihdr), trozo('IDAT', deflateSync(crudo, { level: 9 })), trozo('IEND', Buffer.alloc(0))]);
}

// ---------- el recorte ----------

function rangos(ocupado, hueco) {
  const salida = [];
  let ini = null, ultimo = null;
  ocupado.forEach((o, i) => {
    if (o) { if (ini === null) ini = i; ultimo = i; } else if (ini !== null && i - ultimo > hueco) { salida.push([ini, ultimo]); ini = null; }
  });
  if (ini !== null) salida.push([ini, ultimo]);
  return salida;
}

// `hoja` = { ancho, alto, datos RGBA }. Devuelve, por rol, la tira ya armada y de donde salio cada cuadro.
export function cortarHoja(hoja) {
  const { ancho, alto, datos } = hoja, alfa = (x, y) => datos[(y * ancho + x) * 4 + 3];
  const filasOcupadas = Array.from({ length: alto }, (_, y) => { for (let x = 0; x < ancho; x++) if (alfa(x, y) > UMBRAL_CONTENIDO) return true; return false; });
  const bandas = rangos(filasOcupadas, 6);
  if (bandas.length !== ROLES_HOJA.length) throw new Error(`La hoja debe traer ${ROLES_HOJA.length} filas de personajes y se hallaron ${bandas.length}.`);

  const avisos = [];
  const personajes = ROLES_HOJA.map((rol, fila) => {
    const [y0, y1] = bandas[fila];
    const ocupacion = Array.from({ length: ancho }, (_, x) => { let n = 0; for (let y = y0; y <= y1; y++) if (alfa(x, y) > UMBRAL_CONTENIDO) n++; return n; });
    const nominal = (k) => Math.round((k * ancho) / CUADROS);
    const cortes = [0];
    for (let k = 1; k < CUADROS; k++) {
      let mejor = nominal(k);
      for (let d = 0; d <= BUSQUEDA; d++) for (const x of [nominal(k) - d, nominal(k) + d]) if (ocupacion[x] < ocupacion[mejor]) mejor = x;
      if (ocupacion[mejor] > 0) avisos.push(`${rol}: el corte ${k} (x=${mejor}) atraviesa ${ocupacion[mejor]} px de contenido`);
      cortes.push(mejor);
    }
    cortes.push(ancho);

    // Lo dibujado de cada cuadro, entre sus dos cortes.
    const cajas = Array.from({ length: CUADROS }, (_, i) => {
      let x0 = Infinity, x1 = -1, ya = Infinity, yb = -1;
      for (let y = y0; y <= y1; y++) for (let x = cortes[i]; x < cortes[i + 1]; x++) if (alfa(x, y) >= UMBRAL_ALFA) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); ya = Math.min(ya, y); yb = Math.max(yb, y); }
      if (x1 < 0) throw new Error(`${rol}: el cuadro ${i + 1} está vacío.`);
      return { x0, x1, y0: ya, y1: yb };
    });
    // Ventana comun, en coordenadas relativas a la frontera nominal de cada columna (asi se conserva donde puso el autor a cada personaje).
    const rx0 = Math.min(...cajas.map((c, i) => c.x0 - nominal(i))) - MARGEN, rx1 = Math.max(...cajas.map((c, i) => c.x1 - nominal(i))) + MARGEN;
    const vy0 = Math.min(...cajas.map((c) => c.y0)) - MARGEN, vy1 = Math.max(...cajas.map((c) => c.y1)) + MARGEN;
    const w = rx1 - rx0 + 1, h = vy1 - vy0 + 1;

    const tira = { ancho: w * CUADROS, alto: h, datos: new Uint8Array(w * CUADROS * h * 4) };
    const origenes = [];
    for (let i = 0; i < CUADROS; i++) {
      const sx = nominal(i) + rx0, sy = vy0;
      origenes.push({ n: i + 1, x: sx, y: sy, corteX0: cortes[i], corteX1: cortes[i + 1] });
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
        const x = sx + dx, y = sy + dy;
        if (x < cortes[i] || x >= cortes[i + 1] || x < 0 || x >= ancho || y < 0 || y >= alto || alfa(x, y) < UMBRAL_ALFA) continue;
        const d = (y * ancho + x) * 4, t = (dy * tira.ancho + i * w + dx) * 4;
        tira.datos.set(datos.subarray(d, d + 4), t);
      }
    }
    return { rol, fila: { y0, y1 }, cuadros: CUADROS, ancho: w, alto: h, cuadrosOrigen: origenes, tira };
  });
  return { personajes, avisos };
}

export function modulo(personajes) {
  const datos = Object.fromEntries(personajes.map((p) => [p.rol, { cuadros: p.cuadros, ancho: p.ancho, alto: p.alto, archivo: `arte/lobo/animacion-${p.rol}.png` }]));
  return `// Generado por herramientas/recortar-elenco-lobo.mjs desde la hoja de sprites; no editar a mano. Tamaño de un cuadro en px (la tira trae ${CUADROS} de izquierda a derecha).\nexport const PERSONAJES_ANIMADOS = ${JSON.stringify(datos)};\n`;
}

// Solo corre como programa, no al importarlo desde las pruebas.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = parsearArgumentos(process.argv.slice(2));
  if (typeof o.hoja !== 'string') { console.error('\n  Falta --hoja="ruta de la hoja de sprites .png"\n'); process.exit(1); }
  const salida = resolve(typeof o.salida === 'string' ? o.salida : 'web/arte/lobo'), rutaJs = resolve(typeof o.js === 'string' ? o.js : 'web/casino/lobo-personajes-animados.js');
  const hoja = decodificarPNG(readFileSync(resolve(o.hoja)));
  const { personajes, avisos } = cortarHoja(hoja);
  mkdirSync(salida, { recursive: true });
  for (const p of personajes) {
    writeFileSync(join(salida, `animacion-${p.rol}.png`), codificarPNG(p.tira));
    console.log(`  ${p.rol.padEnd(8)} ${p.cuadros} cuadros de ${p.ancho}x${p.alto} -> animacion-${p.rol}.png`);
  }
  for (const a of avisos) console.log(`  AVISO: ${a}`);
  writeFileSync(join(salida, 'recortes-personajes.json'), JSON.stringify({
    origen: basename(o.hoja), hoja: { ancho: hoja.ancho, alto: hoja.alto, filas: ROLES_HOJA, columnas: CUADROS }, umbralAlfa: UMBRAL_ALFA,
    personajes: personajes.map(({ tira, ...resto }) => resto),
  }, null, 2) + '\n');
  writeFileSync(rutaJs, modulo(personajes));
  console.log(`\n  Escrito: ${personajes.length} tiras, recortes-personajes.json y ${basename(rutaJs)}.\n`);
}
