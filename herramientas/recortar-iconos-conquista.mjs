#!/usr/bin/env node
// Recorta la hoja de iconos de Guerra de territorios (9 dibujos en cuadricula de 3 x 3, fondo transparente) en un PNG por icono: web/arte/conquista/<nombre>.png.
// La hoja la entrego el usuario el 25 de octubre de 2026 (privado/prototipos/conquista-iconos/hoja-iconos.png). Orden de lectura: comida, madera, oro / hierro, caballos, arco /
// espada, maza (las tropas), maravilla. Roca llego aparte, en su propio archivo (privado/prototipos/conquista-iconos/roca.png).
//
//   node herramientas/recortar-iconos-conquista.mjs
//   --origen=privado/prototipos/conquista-iconos/hoja-iconos.png   la hoja
//   --roca=privado/prototipos/conquista-iconos/roca.png            el icono de Roca
//   --salida=web/arte/conquista                                     carpeta de los PNG
//   --todos                                                         escribe tambien arco y espada (sin uso todavia en la escena)
//
// Cada icono se encuentra como un bloque de dibujo separado de los demas (no por cuadricula fija: los dibujos no caen centrados), se recorta a su caja con 2 px de margen, se descarta el
// velo casi invisible del fondo (alfa < UMBRAL_ALFA) y, si pasa del tamano que se dibuja en pantalla, se reduce promediando el area (sin tocar los colores ni inventar pixeles). Es la
// fuente unica de esos PNG: no se editan a mano.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodificarPNG, codificarPNG, UMBRAL_ALFA } from './recortar-elenco-lobo.mjs';
import { parsearArgumentos } from '../src/serie.js';

// En el orden en que se leen en la hoja. `lado` = el lado mayor del PNG que se escribe (la Maravilla se acerca mucho en el zoom y por eso es mas grande).
export const ICONOS = [
  { nombre: 'comida', tipo: 'Comida', lado: 128 }, { nombre: 'madera', tipo: 'Madera', lado: 128 }, { nombre: 'oro', tipo: 'Oro', lado: 128 },
  { nombre: 'hierro', tipo: 'Hierro', lado: 128 }, { nombre: 'caballos', tipo: 'Caballos', lado: 128 }, { nombre: 'arco', tipo: null, lado: 128 },
  { nombre: 'espada', tipo: null, lado: 128, uso: 'batalla' }, { nombre: 'tropas', tipo: 'Tropas', lado: 128 }, { nombre: 'maravilla', tipo: 'Maravilla', lado: 256 },
];
// Los iconos que llegaron en su propio archivo (un solo dibujo, fondo transparente): Roca, que la hoja no traia (el usuario la entrego el 26 de octubre de 2026).
export const SUELTOS = [{ nombre: 'roca', tipo: 'Roca', lado: 128, origen: 'privado/prototipos/conquista-iconos/roca.png' }];
export const cajaDelDibujo = ({ ancho, alto }) => ({ x0: 0, y0: 0, x1: ancho - 1, y1: alto - 1 });
const CELDA = 8, VECINDAD = 3, UMBRAL_BLOQUE = 40, MARGEN = 2; // un bloque = celdas de 8 px con dibujo, unidas si estan a 3 celdas (24 px) o menos

// Los bloques de dibujo de la hoja, de arriba abajo y de izquierda a derecha en cada fila: [{ x0, y0, x1, y1 }] (px, inclusive).
export function bloquesDeLaHoja({ ancho, alto, datos }, esperados = ICONOS.length) {
  const cw = Math.ceil(ancho / CELDA), ch = Math.ceil(alto / CELDA), ocupada = new Uint8Array(cw * ch);
  for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) if (datos[(y * ancho + x) * 4 + 3] > UMBRAL_BLOQUE) ocupada[Math.floor(y / CELDA) * cw + Math.floor(x / CELDA)] = 1;
  const visto = new Uint8Array(cw * ch), bloques = [];
  for (let inicio = 0; inicio < cw * ch; inicio++) {
    if (!ocupada[inicio] || visto[inicio]) continue;
    const pila = [inicio], caja = { x0: Infinity, y0: Infinity, x1: -1, y1: -1 };
    visto[inicio] = 1;
    while (pila.length) {
      const c = pila.pop(), cx = c % cw, cy = Math.floor(c / cw);
      caja.x0 = Math.min(caja.x0, cx); caja.x1 = Math.max(caja.x1, cx); caja.y0 = Math.min(caja.y0, cy); caja.y1 = Math.max(caja.y1, cy);
      for (let dy = -VECINDAD; dy <= VECINDAD; dy++) for (let dx = -VECINDAD; dx <= VECINDAD; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cw || ny >= ch || !ocupada[ny * cw + nx] || visto[ny * cw + nx]) continue;
        visto[ny * cw + nx] = 1; pila.push(ny * cw + nx);
      }
    }
    bloques.push({ x0: caja.x0 * CELDA, y0: caja.y0 * CELDA, x1: Math.min(ancho, (caja.x1 + 1) * CELDA) - 1, y1: Math.min(alto, (caja.y1 + 1) * CELDA) - 1 });
  }
  if (bloques.length !== esperados) throw new Error(`La hoja trae ${bloques.length} dibujos separados y se esperaban ${esperados}.`);
  // filas por el centro vertical: tres filas de tres, cada una de izquierda a derecha
  const porAlto = [...bloques].sort((a, b) => a.y0 + a.y1 - (b.y0 + b.y1)), filas = [];
  for (let i = 0; i < porAlto.length; i += 3) filas.push(porAlto.slice(i, i + 3).sort((a, b) => a.x0 - b.x0));
  return filas.flat();
}

// La imagen recortada a la caja del dibujo (con margen), sin el velo del fondo.
export function recortarBloque({ ancho, alto, datos }, caja) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = caja.y0; y <= caja.y1; y++) for (let x = caja.x0; x <= caja.x1; x++) if (datos[(y * ancho + x) * 4 + 3] >= UMBRAL_ALFA) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 < 0) throw new Error('El bloque no tiene dibujo.');
  x0 -= MARGEN; y0 -= MARGEN; x1 += MARGEN; y1 += MARGEN;
  const w = x1 - x0 + 1, h = y1 - y0 + 1, salida = { ancho: w, alto: h, datos: new Uint8Array(w * h * 4) };
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
    const x = x0 + dx, y = y0 + dy;
    if (x < 0 || y < 0 || x >= ancho || y >= alto || x < caja.x0 - MARGEN || x > caja.x1 + MARGEN || y < caja.y0 - MARGEN || y > caja.y1 + MARGEN) continue;
    const o = (y * ancho + x) * 4;
    if (datos[o + 3] >= UMBRAL_ALFA) salida.datos.set(datos.subarray(o, o + 4), (dy * w + dx) * 4);
  }
  return salida;
}

// Reduce la imagen para que su lado mayor sea `lado`, promediando el area de cada pixel de origen que cae en el de destino (con el alfa premultiplicado: un borde no se tine de negro).
// Una imagen que ya cabe se devuelve tal cual.
export function reducir(imagen, lado) {
  const { ancho, alto, datos } = imagen, k = Math.max(ancho, alto) / lado;
  if (k <= 1) return imagen;
  const w = Math.max(1, Math.round(ancho / k)), h = Math.max(1, Math.round(alto / k)), salida = { ancho: w, alto: h, datos: new Uint8Array(w * h * 4) };
  const sx = ancho / w, sy = alto / h;
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
    let r = 0, g = 0, b = 0, a = 0, peso = 0;
    const x0 = dx * sx, x1 = (dx + 1) * sx, y0 = dy * sy, y1 = (dy + 1) * sy;
    for (let y = Math.floor(y0); y < Math.min(alto, Math.ceil(y1)); y++) {
      const py = Math.min(y + 1, y1) - Math.max(y, y0);
      for (let x = Math.floor(x0); x < Math.min(ancho, Math.ceil(x1)); x++) {
        const p = py * (Math.min(x + 1, x1) - Math.max(x, x0)), o = (y * ancho + x) * 4, alfa = datos[o + 3] / 255;
        r += datos[o] * alfa * p; g += datos[o + 1] * alfa * p; b += datos[o + 2] * alfa * p; a += alfa * p; peso += p;
      }
    }
    const i = (dy * w + dx) * 4;
    if (a > 0) { salida.datos[i] = Math.round(r / a); salida.datos[i + 1] = Math.round(g / a); salida.datos[i + 2] = Math.round(b / a); }
    salida.datos[i + 3] = Math.round((a / peso) * 255);
  }
  return salida;
}

function principal() {
  const o = parsearArgumentos(process.argv.slice(2));
  const origen = resolve(typeof o.origen === 'string' ? o.origen : 'privado/prototipos/conquista-iconos/hoja-iconos.png'), salida = resolve(typeof o.salida === 'string' ? o.salida : 'web/arte/conquista');
  const hoja = decodificarPNG(readFileSync(origen)), bloques = bloquesDeLaHoja(hoja);
  mkdirSync(salida, { recursive: true });
  ICONOS.forEach((icono, i) => {
    if (icono.tipo === null && !icono.uso && !o.todos) return; // sin tipo de recurso solo se escribe si tiene uso (la espada del choque de las batallas) o con --todos
    const png = reducir(recortarBloque(hoja, bloques[i]), icono.lado);
    writeFileSync(join(salida, `${icono.nombre}.png`), codificarPNG(png));
    console.log(`  ${icono.nombre}.png  ${png.ancho} x ${png.alto}${icono.tipo ? `  (${icono.tipo})` : ''}`);
  });
  for (const suelto of SUELTOS) {
    const archivo = resolve(typeof o[suelto.nombre] === 'string' ? o[suelto.nombre] : suelto.origen);
    const imagen = decodificarPNG(readFileSync(archivo)), png = reducir(recortarBloque(imagen, cajaDelDibujo(imagen)), suelto.lado);
    writeFileSync(join(salida, `${suelto.nombre}.png`), codificarPNG(png));
    console.log(`  ${suelto.nombre}.png  ${png.ancho} x ${png.alto}  (${suelto.tipo})`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal();
