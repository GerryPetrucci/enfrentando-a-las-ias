#!/usr/bin/env node
// Recorta las hojas de entrada a casa de Lobo en la aldea (una hoja por rol, 6 cuadros de izquierda a derecha: de dia, atardecer, anochecer, el personaje entra,
// ya dentro y la puerta cerrada) en un PNG por cuadro, listo para la apertura de la escena: web/arte/lobo/entrada-<rol>-01..06.png. En cada casa entra EL personaje
// de ese rol (el de la insignia), no un figurante: la hoja la dibujo el usuario con ChatGPT el 24 de octubre de 2026 (privado/prototipos/lobo-assets/entrada-<rol>.png).
//
//   node herramientas/recortar-entradas-lobo.mjs
//   --origen=privado/prototipos/lobo-assets   carpeta de las hojas entrada-<rol>.png (por defecto esa)
//   --salida=web/arte/lobo                    carpeta de los cuadros y de recortes-entradas.json (por defecto esa)
//
// Los cuadros no caen exactos en la cuadricula: cada corte entre cuadros se busca como la columna con menos dibujo mas cercana a la frontera nominal, y cada cuadro solo
// conserva lo que cae entre sus dos cortes. Dentro de un rol todos los cuadros comparten la misma ventana (la union de lo dibujado + 2 px) y su posicion respecto de la
// cuadricula original: la casa no salta de un cuadro a otro mas de lo que dibujo el autor. No se redibuja ni se reescala nada. El original trae un velo casi invisible
// (alfa 1-15) en todo el fondo: se descarta (alfa < UMBRAL_ALFA), sin tocar el resto. La hoja pone las casas pegadas: donde un corte atraviesa dibujo (la hierba y la
// cerca de una casa tocan las de la vecina) se difumina el alfa en FUNDIDO px junto al corte, para que la orilla no quede recta; los colores no se tocan. Es la fuente
// unica de esos PNG: no se editan a mano.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodificarPNG, codificarPNG, CUADROS, UMBRAL_ALFA } from './recortar-elenco-lobo.mjs';
import { parsearArgumentos } from '../src/serie.js';

export const ROLES_ENTRADA = ['lobo', 'vidente', 'bruja', 'cazador', 'cupido', 'aldeano'];
const UMBRAL_CONTENIDO = 40; // para hallar los cortes se ignoran los bordes suaves
const BUSQUEDA = 30; // px a cada lado de la frontera nominal donde se busca el hueco entre cuadros
const MARGEN = 2;
export const FUNDIDO = 10; // px de degradado de alfa junto a un corte que atraviesa dibujo: la hoja pone las casas pegadas y sin el degradado el borde quedaria recto
export const archivoDeEntrada = (rol, n) => `entrada-${rol}-${String(n).padStart(2, '0')}.png`;

// `hoja` = { ancho, alto, datos RGBA }: la hoja de un rol. Devuelve sus 6 cuadros (cada uno con su imagen RGBA) y de donde salio cada uno.
export function cortarEntrada(hoja, rol = 'hoja') {
  const { ancho, alto, datos } = hoja, alfa = (x, y) => datos[(y * ancho + x) * 4 + 3];
  const ocupacion = Array.from({ length: ancho }, (_, x) => { let n = 0; for (let y = 0; y < alto; y++) if (alfa(x, y) > UMBRAL_CONTENIDO) n++; return n; });
  const nominal = (k) => Math.round((k * ancho) / CUADROS);
  const avisos = [], cortes = [0];
  for (let k = 1; k < CUADROS; k++) {
    let mejor = nominal(k);
    for (let d = 0; d <= BUSQUEDA; d++) for (const x of [nominal(k) - d, nominal(k) + d]) if (ocupacion[x] < ocupacion[mejor]) mejor = x;
    if (ocupacion[mejor] > 0) avisos.push(`${rol}: el corte ${k} (x=${mejor}) atraviesa ${ocupacion[mejor]} px de dibujo (se difuman ${FUNDIDO} px a cada lado)`);
    cortes.push(mejor);
  }
  cortes.push(ancho);

  const cajas = Array.from({ length: CUADROS }, (_, i) => {
    let x0 = Infinity, x1 = -1, y0 = Infinity, y1 = -1;
    for (let y = 0; y < alto; y++) for (let x = cortes[i]; x < cortes[i + 1]; x++) if (alfa(x, y) >= UMBRAL_ALFA) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (x1 < 0) throw new Error(`${rol}: el cuadro ${i + 1} está vacío.`);
    return { x0, x1, y0, y1 };
  });
  // Ventana comun, en coordenadas relativas a la frontera nominal de cada columna (asi se conserva donde puso el autor cada cuadro).
  const rx0 = Math.min(...cajas.map((c, i) => c.x0 - nominal(i))) - MARGEN, rx1 = Math.max(...cajas.map((c, i) => c.x1 - nominal(i))) + MARGEN;
  const vy0 = Math.max(0, Math.min(...cajas.map((c) => c.y0)) - MARGEN), vy1 = Math.min(alto - 1, Math.max(...cajas.map((c) => c.y1)) + MARGEN);
  const w = rx1 - rx0 + 1, h = vy1 - vy0 + 1;

  const cuadros = Array.from({ length: CUADROS }, (_, i) => {
    const sx = nominal(i) + rx0, sy = vy0, imagen = { ancho: w, alto: h, datos: new Uint8Array(w * h * 4) };
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
      const x = sx + dx, y = sy + dy;
      if (x < cortes[i] || x >= cortes[i + 1] || x < 0 || x >= ancho || y < 0 || y >= alto || alfa(x, y) < UMBRAL_ALFA) continue;
      imagen.datos.set(datos.subarray((y * ancho + x) * 4, (y * ancho + x) * 4 + 4), (dy * w + dx) * 4);
    }
    // El degradado solo en los cortes que atraviesan dibujo (no en los bordes de la hoja ni donde el corte cae en una columna vacia) y suave (smoothstep); lo que queda por debajo del velo se apaga.
    const cruza = (k) => k > 0 && k < CUADROS && ocupacion[cortes[k]] > 0;
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
      const x = sx + dx, aCorte = Math.min(cruza(i) ? x - cortes[i] : Infinity, cruza(i + 1) ? cortes[i + 1] - 1 - x : Infinity);
      if (aCorte >= FUNDIDO) continue;
      const t = (aCorte + 0.5) / FUNDIDO, a = Math.round(imagen.datos[(dy * w + dx) * 4 + 3] * t * t * (3 - 2 * t));
      imagen.datos[(dy * w + dx) * 4 + 3] = a < UMBRAL_ALFA ? 0 : a;
    }
    return { n: i + 1, x: sx, y: sy, corteX0: cortes[i], corteX1: cortes[i + 1], imagen };
  });
  return { rol, ancho: w, alto: h, cuadros, avisos };
}

// Todas las hojas de una carpeta: { rol -> cuadros }. `leer(rol)` devuelve la hoja ya decodificada.
export function cortarTodas(leer) {
  const entradas = ROLES_ENTRADA.map((rol) => cortarEntrada(leer(rol), rol));
  return { entradas, avisos: entradas.flatMap((e) => e.avisos) };
}

export function descripcion(entradas, hojas) {
  return {
    origen: 'privado/prototipos/lobo-assets/entrada-<rol>.png (ChatGPT, 24 de octubre de 2026)', umbralAlfa: UMBRAL_ALFA, cuadros: CUADROS,
    entradas: entradas.map((e) => ({
      rol: e.rol, hoja: `entrada-${e.rol}.png`, hojaAncho: hojas[e.rol].ancho, hojaAlto: hojas[e.rol].alto, ancho: e.ancho, alto: e.alto,
      cuadrosOrigen: e.cuadros.map(({ imagen, ...resto }) => ({ archivo: archivoDeEntrada(e.rol, resto.n), ...resto })),
    })),
  };
}

// Solo corre como programa, no al importarlo desde las pruebas.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = parsearArgumentos(process.argv.slice(2));
  const origen = resolve(typeof o.origen === 'string' ? o.origen : 'privado/prototipos/lobo-assets'), salida = resolve(typeof o.salida === 'string' ? o.salida : 'web/arte/lobo');
  const hojas = {};
  const { entradas, avisos } = cortarTodas((rol) => (hojas[rol] = decodificarPNG(readFileSync(join(origen, `entrada-${rol}.png`)))));
  mkdirSync(salida, { recursive: true });
  for (const e of entradas) {
    for (const c of e.cuadros) writeFileSync(join(salida, archivoDeEntrada(e.rol, c.n)), codificarPNG(c.imagen));
    console.log(`  ${e.rol.padEnd(8)} ${CUADROS} cuadros de ${e.ancho}x${e.alto} -> entrada-${e.rol}-01..0${CUADROS}.png`);
  }
  for (const a of avisos) console.log(`  AVISO: ${a}`);
  writeFileSync(join(salida, 'recortes-entradas.json'), JSON.stringify(descripcion(entradas, hojas), null, 2) + '\n');
  console.log(`\n  Escrito: ${entradas.length * CUADROS} cuadros y recortes-entradas.json.\n`);
}
