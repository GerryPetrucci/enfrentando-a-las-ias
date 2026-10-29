#!/usr/bin/env node
// Genera el gancho de IMAGEN FIJA de una parte (regla del 25 de octubre de 2026: un juego que no puede tener gancho en video —Lobo, o uno muy corto— tiene uno de imagen): «PRÓXIMAMENTE», el nombre del juego,
// su numero de juego (jN) y el de la parte, con el arte del juego si lo tiene (web/casino/gancho-imagen.js). Abre web/gancho-imagen.html con Chrome o Edge sin cabeza, captura la imagen de cada formato (9x16 y
// 16x9) y, desde el 28 de octubre de 2026, la vuelve un VIDEO CORTO que repite esa misma imagen en cada cuadro (con ffmpeg), para poder compartirlo como short de YouTube: j1_hk1_9x16_fb-ig-tk-yt.mp4. Ya no deja
// el PNG junto a los videos que se suben (con --imagen se queda el PNG, para verlo). No llama a ningun modelo, no sube nada y no gasta saldo. herramientas/paquete.mjs lo llama solo cuando una parte no tiene gancho en video.
//
//   node herramientas/gancho-imagen.mjs --juego=lobo --numero=1 --parte=1 [--de=2] --salida=grabaciones/listos/lobo-en-la-aldea/2026-10-25_seed-3441676158/por-subir/j1 [--formato=9x16,16x9] [--chrome=RUTA]
//
// --juego   id del juego (el del archivo guardado: lobo, conquista...)   --numero   su numero de juego jN   --parte   la parte que anuncia   --de   cuantas partes tiene (2 por omision)
// --duracion   segundos del video (6 por omision)   --ffmpeg   ruta de ffmpeg (el del PATH por omision)   --imagen   deja el PNG en vez del video
// Para verla en el navegador sin generar nada: node src/servidor.js y abrir http://localhost:4321/gancho-imagen.html?juego=lobo&numero=1&parte=1&de=2&formato=9x16

import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdirSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, extname, dirname, basename, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buscarChrome } from './capturar-escena.mjs';
import { direccionDeGanchoImagen, modeloDeGanchoImagen, FORMATOS_IMAGEN } from '../web/casino/gancho-imagen.js';
import { nombreDePieza, nombreDeVideo } from './nombres.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const COMO_ROOT = typeof process.getuid === 'function' && process.getuid() === 0; // como root Chrome se niega a abrir sin --no-sandbox

// Un servidor de archivos de web/ en un puerto libre, solo para esta captura (los modulos de la pagina no cargan desde file://). Solo sirve lo que esta dentro de web/.
export function servirWeb(carpeta = resolve(RAIZ, 'web')) {
  const base = resolve(carpeta) + sep;
  const servidor = createServer(async (peticion, respuesta) => {
    try {
      const ruta = resolve(carpeta, `.${decodeURIComponent(new URL(peticion.url, 'http://local').pathname)}`);
      if (!ruta.startsWith(base)) { respuesta.writeHead(403).end(); return; }
      const contenido = await readFile(ruta); // primero se lee: si el archivo no existe (el navegador pide favicon.ico) se responde 404 una sola vez
      respuesta.writeHead(200, { 'Content-Type': TIPOS[extname(ruta)] ?? 'application/octet-stream' }).end(contenido);
    } catch { if (!respuesta.headersSent) respuesta.writeHead(404).end(); }
  });
  return new Promise((ok, no) => servidor.once('error', no).listen(0, '127.0.0.1', () => ok({ puerto: servidor.address().port, cerrar: () => new Promise((fin) => servidor.close(fin)) })));
}

// El navegador se lanza ASINCRONO: el servidor de arriba vive en este mismo proceso, y un spawnSync lo congelaria mientras el navegador le pide la pagina (se quedarian esperandose).
function ejecutar(programa, argumentos, limiteMs = 120000) {
  return new Promise((ok) => {
    const p = spawn(programa, argumentos, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    p.stderr.on('data', (d) => { stderr = (stderr + d).slice(-2000); });
    const reloj = setTimeout(() => p.kill(), limiteMs);
    p.on('error', (e) => { clearTimeout(reloj); ok({ estado: null, stderr: e.message }); });
    p.on('close', (estado) => { clearTimeout(reloj); ok({ estado, stderr }); });
  });
}

// Ancho y alto de un PNG, de su cabecera.
export function medidasDePng(ruta) {
  const b = readFileSync(ruta);
  return { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20) };
}

// El nombre del archivo de una imagen de gancho: el de los videos (j1_hk1_9x16_fb-ig-tk-yt) con extension png.
export const nombreDeImagen = ({ juegoNumero, parte, formato }) => `${nombreDeVideo(nombreDePieza({ juego: juegoNumero, pieza: `gancho-${parte}` }), formato)}.png`;

// El nombre del video de un gancho de imagen fija: el mismo que el de la imagen, con extension mp4.
export const nombreDeVideoDeGancho = ({ juegoNumero, parte, formato }) => nombreDeImagen({ juegoNumero, parte, formato }).replace(/\.png$/, '.mp4');

export const DURACION_GANCHO_IMAGEN_S = 6; // un video corto, apto para un short, que repite la imagen

// Los argumentos de ffmpeg que vuelven UNA imagen un video: la misma imagen en cada cuadro (30 por segundo), H.264 listo para subir a cualquier red (yuv420p, faststart) y una pista de audio en silencio
// (la musica la pone quien lo sube, como en el gancho en video). La salida va al final.
export function argumentosDeFfmpeg({ imagen, salida, duracionS = DURACION_GANCHO_IMAGEN_S, fps = 30 }) {
  return ['-y', '-hide_banner', '-loglevel', 'error', '-loop', '1', '-framerate', String(fps), '-i', imagen, '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', String(duracionS),
    '-c:v', 'libx264', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-r', String(fps), '-c:a', 'aac', '-b:a', '64k', '-shortest', '-movflags', '+faststart', salida];
}

// Corre ffmpeg: una imagen -> su video. Lanza si ffmpeg no esta o falla (con lo que dijo).
export function convertirImagenEnVideo({ imagen, salida, duracionS = DURACION_GANCHO_IMAGEN_S, ffmpeg = 'ffmpeg' }) {
  mkdirSync(dirname(resolve(salida)), { recursive: true });
  const r = spawnSync(ffmpeg, argumentosDeFfmpeg({ imagen, salida, duracionS }), { encoding: 'utf8' });
  if (r.error || r.status !== 0) throw new Error(`ffmpeg no pudo hacer el video: ${r.error?.message ?? String(r.stderr).trim().slice(-300)}`);
  return { destino: salida };
}

// Captura una imagen. `servidor` (opcional) reutiliza un servidor ya abierto (varias imagenes seguidas). Lanza si no hay navegador o si la imagen no sale del tamano del formato.
export async function renderizarGanchoImagen({ juegoId, juegoNumero = 1, parte = 1, de = 2, formato = '9x16', destino, chrome = buscarChrome(), servidor = null, raiz = RAIZ }) {
  const m = modeloDeGanchoImagen({ juegoId, juegoNumero, parte, de, formato }); // valida antes de abrir nada
  if (!chrome) throw new Error('No encontré Chrome ni Edge. Pasa --chrome=RUTA o define CHROME_PATH.');
  const propio = servidor ?? await servirWeb(resolve(raiz, 'web'));
  try {
    mkdirSync(dirname(resolve(destino)), { recursive: true });
    const url = `http://127.0.0.1:${propio.puerto}/${direccionDeGanchoImagen({ juegoId, juegoNumero, parte, de, formato })}`;
    const r = await ejecutar(chrome, ['--headless=new', ...(COMO_ROOT ? ['--no-sandbox'] : []), '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${m.ancho},${m.alto}`,
      '--virtual-time-budget=8000', `--screenshot=${resolve(destino)}`, url]);
    if (!existsSync(destino)) throw new Error(`El navegador no dejó la imagen (${String(r.stderr).trim().slice(-300) || `estado ${r.estado}`}).`);
    const { ancho, alto } = medidasDePng(destino);
    if (ancho !== m.ancho || alto !== m.alto) throw new Error(`La imagen salió de ${ancho}x${alto} y el formato ${formato} es de ${m.ancho}x${m.alto}.`);
    return { destino, ancho, alto, formato };
  } finally {
    if (!servidor) await propio.cerrar();
  }
}

// Las imagenes de gancho de un paquete: una por formato para cada pieza `gancho-imagen`. Con un solo servidor. `render` se puede cambiar (las pruebas no abren un navegador).
export async function generarImagenesDeGancho({ piezas, juegoId, juegoNumero, de = 2, carpeta, chrome = buscarChrome(), render = renderizarGanchoImagen, formatos = FORMATOS_IMAGEN }) {
  const hechas = [], pendientes = (piezas ?? []).filter((p) => p.tipo === 'gancho-imagen');
  if (!pendientes.length) return { hechas, error: null };
  if (!chrome) return { hechas, error: 'No encontré Chrome ni Edge: las imágenes de gancho no se generaron. Instala uno o pasa CHROME_PATH y corre node herramientas/gancho-imagen.mjs (el LEEME dice el comando).' };
  const servidor = await servirWeb();
  try {
    for (const p of pendientes) for (const formato of formatos) {
      hechas.push(await render({ juegoId, juegoNumero, parte: p.parte, de, formato, chrome, servidor, destino: join(carpeta, nombreDeImagen({ juegoNumero, parte: p.parte, formato })) }));
    }
    return { hechas, error: null };
  } catch (err) {
    return { hechas, error: `No pude generar las imágenes de gancho: ${err.message}` };
  } finally {
    await servidor.cerrar();
  }
}

// Los VIDEOS de gancho de un paquete: uno por formato para cada pieza `gancho-imagen`. Cada imagen se captura en una carpeta temporal (que se borra) y se vuelve un mp4 en `carpeta`: junto a los videos que se
// suben solo quedan los mp4. `render` y `convertir` se pueden cambiar (las pruebas no abren un navegador ni ffmpeg). Sin navegador o sin ffmpeg devuelve el motivo y lo que ya hizo.
export async function generarVideosDeGancho({ piezas, juegoId, juegoNumero, de = 2, carpeta, chrome = buscarChrome(), render = renderizarGanchoImagen, convertir = convertirImagenEnVideo, ffmpeg = 'ffmpeg', duracionS = DURACION_GANCHO_IMAGEN_S, formatos = FORMATOS_IMAGEN }) {
  const hechas = [];
  if (!(piezas ?? []).some((p) => p.tipo === 'gancho-imagen')) return { hechas, error: null };
  const tmp = mkdtempSync(join(tmpdir(), 'gancho-video-'));
  try {
    const imagenes = await generarImagenesDeGancho({ piezas, juegoId, juegoNumero, de, carpeta: tmp, chrome, render, formatos });
    if (imagenes.error) return { hechas, error: imagenes.error };
    for (const h of imagenes.hechas) {
      const salida = join(carpeta, basename(h.destino).replace(/\.png$/, '.mp4'));
      convertir({ imagen: h.destino, salida, duracionS, ffmpeg });
      hechas.push({ ...h, destino: salida, duracionS });
    }
    return { hechas, error: null };
  } catch (err) {
    return { hechas, error: `No pude hacer los videos de gancho de imagen fija: ${err.message}. Con ffmpeg instalado, corre node herramientas/gancho-imagen.mjs (el LEEME dice el comando).` };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function principal() {
  const a = Object.fromEntries(process.argv.slice(2).map((x) => { const [k, ...v] = x.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : 'true']; }));
  const salir = (m) => { console.error(`\n  ${m}\n`); process.exit(1); };
  if (!a.juego || !a.salida) salir('Faltan --juego=ID y --salida=CARPETA (por ejemplo --juego=lobo --numero=1 --parte=1 --salida=grabaciones/listos/lobo-en-la-aldea/2026-10-25_seed-3441676158/por-subir/j1).');
  if (String(a.salida).split(/[\\/]/).includes('..')) salir('La salida no puede contener «..».');
  const formatos = String(a.formato ?? FORMATOS_IMAGEN.join(',')).split(',');
  const parte = Number(a.parte ?? 1), juegoNumero = Number(a.numero ?? 1), de = Number(a.de ?? 2);
  if (a.imagen) { // --imagen: solo el PNG de cada formato (para verlo)
    for (const formato of formatos) {
      try {
        const r = await renderizarGanchoImagen({ juegoId: a.juego, juegoNumero, parte, de, formato, chrome: a.chrome ?? buscarChrome(), destino: join(resolve(a.salida), nombreDeImagen({ juegoNumero, parte, formato })) });
        console.log(`  ${r.formato.padEnd(5)} ${r.ancho}x${r.alto}  ${r.destino}`);
      } catch (err) { salir(err.message); }
    }
    return;
  }
  const r = await generarVideosDeGancho({ piezas: [{ tipo: 'gancho-imagen', parte }], juegoId: a.juego, juegoNumero, de, formatos, carpeta: resolve(a.salida), chrome: a.chrome ?? buscarChrome(), ffmpeg: a.ffmpeg || 'ffmpeg', duracionS: Number(a.duracion ?? DURACION_GANCHO_IMAGEN_S) });
  for (const h of r.hechas) console.log(`  ${h.formato.padEnd(5)} ${h.ancho}x${h.alto}  ${h.duracionS} s  ${h.destino}`);
  if (r.error) salir(r.error);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal();
