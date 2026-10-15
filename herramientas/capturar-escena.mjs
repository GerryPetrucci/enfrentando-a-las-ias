#!/usr/bin/env node
// Verificacion visual de la escena de Duda y apuesta: abre web/escena.html con Chrome sin cabeza, toma capturas de los momentos clave en cada
// formato y falla si la consola de la pagina trae errores. No juzga si "se ve bien": eso lo hace quien mira las capturas.
//
//   node src/servidor.js                      (en otra terminal: sirve web/ y data/)
//   node herramientas/capturar-escena.mjs --archivo=pruebas/mi-partida.json
//   node herramientas/capturar-escena.mjs --archivo=NOMBRE.json --formato=9x16 --beats=1,6,43 --salida=grabaciones/capturas
//   node herramientas/capturar-escena.mjs --archivo=NOMBRE.json --completa      (reproduce toda la partida a velocidad 8 y comprueba que termina)
//
// --archivo   partida de Duda y apuesta dentro de data/ (obligatorio)      --partida   cual del archivo (1 = la primera)
// --formato   9x16, 16x9 o hoja, separados por coma (por defecto 9x16,16x9) --beats     auto (los momentos clave) o los numeros separados por coma
// --estado    en el reparto de cada mano desde la segunda comprueba que no queda nada de la anterior (sello, anuncio, pastillas, medallas); --manos=N cuantas
// --salida    carpeta de las capturas (por defecto grabaciones/capturas-escena; grabaciones/ no se versiona)
// --base      direccion del servidor (por defecto http://localhost:4321)   --chrome    ruta de Chrome (o la variable CHROME_PATH)
// Salida 0 si no hubo errores de consola; 1 si los hubo o algo no se pudo capturar.

import { existsSync, readFileSync, mkdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { construirLineaDeTiempo } from '../web/casino/linea-de-tiempo-duda.js';

const TAMANOS = { '9x16': '1080,1920', '16x9': '1920,1080', hoja: '3840,2160' };
export function tamanoDeFormato(formato) {
  if (!TAMANOS[formato]) throw new Error(`formato desconocido: ${formato}. Usa ${Object.keys(TAMANOS).join(', ')}.`);
  return TAMANOS[formato];
}

// La direccion de la escena lista para capturar: sin sonido ni barra, arranca sola y (con `beat`) avanza al instante hasta ese momento y se queda ahi.
export function urlDeCaptura({ base, archivo, formato, beat = null, partida = 1, vel = null }) {
  const q = new URLSearchParams({ archivo, partida: String(partida), formato, limpio: '1', auto: '1', sonido: '0', escala: '1' });
  if (beat !== null && beat !== undefined) q.set('detener', String(beat));
  if (vel) q.set('vel', String(vel));
  return `${base}/escena.html?${q}`;
}

// Los errores de la consola de la pagina que Chrome escribe en su salida de errores. Los fallos de Chrome mismo (GPU...) no cuentan, ni los 404 de las
// muestras de audio, que son opcionales (web/audio/LEEME.md).
export function erroresDeConsola(salida) {
  return String(salida ?? '').split(/\r?\n/)
    .filter((l) => /:ERROR:CONSOLE\(/.test(l))
    .filter((l) => !(/404/.test(l) && /\/audio\//.test(l)))
    .map((l) => l.replace(/^\[[^\]]*\]\s*/, ''));
}

// Los momentos que vale la pena mirar: el primero de cada tipo importante y el final.
export function beatsClave(beats) {
  if (!Array.isArray(beats)) return [];
  const indices = new Set();
  for (const tipo of ['reparto', 'anuncio', 'duda', 'revelado', 'retirada']) {
    const i = beats.findIndex((b) => b.tipo === tipo);
    if (i >= 0) indices.add(i);
  }
  // y el reparto y el primer anuncio de una mano posterior: ahi se ve lo que una mano le deja a la siguiente (se vieron fallos justo ahi)
  const manos = [...new Set(beats.map((b) => b.mano))];
  const posterior = manos[2] ?? manos[1];
  for (const tipo of ['reparto', 'anuncio']) {
    const i = beats.findIndex((b) => b.mano === posterior && b.tipo === tipo);
    if (posterior !== undefined && i >= 0) indices.add(i);
  }
  const final = beats.findLastIndex((b) => b.tipo === 'final');
  if (final >= 0) indices.add(final);
  return [...indices].sort((a, b) => a - b);
}

// El reparto de cada mano desde la segunda (hasta `max` manos): en ese momento no debe quedar nada visible de la mano anterior.
export function beatsDeEstado(beats, max = 6) {
  if (!Array.isArray(beats)) return [];
  const manos = [...new Set(beats.map((b) => b.mano))].slice(1, 1 + max);
  return manos.map((m) => beats.findIndex((b) => b.mano === m && b.tipo === 'reparto')).filter((i) => i >= 0);
}

// Lo que la escena informa de si misma al detenerse (data-estado): opacidad del sello y del anuncio, pastillas de camara y medallas puestas.
export function erroresDeEstado(estado, beat) {
  if (!estado) return ['la escena no informo su estado (data-estado)'];
  const errores = [];
  if (estado.sello > 0.01) errores.push(`sello visible (${estado.sello}) al repartir ${beat.id}: es de la mano anterior`);
  if (estado.anuncio > 0.01) errores.push(`anuncio visible (${estado.anuncio}) al repartir ${beat.id}: es de la mano anterior`);
  const camara = beat.camara?.length ?? 0;
  if (estado.pastillas !== camara) errores.push(`hay ${estado.pastillas} pastillas de camara en ${beat.id} y la camara de esa mano tiene ${camara}`);
  if (estado.medallas !== 0) errores.push(`queda ${estado.medallas} medalla de una partida anterior en ${beat.id}`);
  return errores;
}

export function leerEstado(dom) {
  const m = /data-estado="([^"]*)"/.exec(String(dom ?? ''));
  if (!m) return null;
  try { return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')); } catch { return null; }
}

// Cuanto duro la reproduccion (medida por la pagina) contra lo que dice la linea de tiempo exportada.
export function leerDesfase(dom) {
  const texto = String(dom ?? '');
  const medido = /data-duracion-ms="([\d.]+)"/.exec(texto), esperado = /data-esperada-ms="([\d.]+)"/.exec(texto);
  if (!medido || !esperado) return null;
  return { medidoMs: Number(medido[1]), esperadoMs: Number(esperado[1]), desfaseMs: Number(medido[1]) - Number(esperado[1]) };
}
export const desfaseAceptable = (d) => !!d && Math.abs(d.desfaseMs) <= Math.max(1500, 0.04 * d.esperadoMs);

const CANDIDATOS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
];
export function buscarChrome(env = process.env, existe = existsSync) {
  if (env.CHROME_PATH && existe(env.CHROME_PATH)) return env.CHROME_PATH;
  return CANDIDATOS.find((r) => existe(r)) ?? null;
}

function ejecutarChrome(chrome, argumentos) {
  const r = spawnSync(chrome, argumentos, { encoding: 'utf8', timeout: 180000, maxBuffer: 64 * 1024 * 1024 });
  return { salida: r.stdout ?? '', consola: r.stderr ?? '', estado: r.status };
}

async function principal() {
  const a = Object.fromEntries(process.argv.slice(2).map((x) => { const [k, ...v] = x.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : 'true']; }));
  if (!a.archivo) { console.error('Falta --archivo=NOMBRE.json (una partida de Duda y apuesta dentro de data/).'); process.exit(1); }
  const base = a.base ?? 'http://localhost:4321';
  const formatos = (a.formato ?? '9x16,16x9').split(',');
  formatos.forEach(tamanoDeFormato);
  const chrome = a.chrome ?? buscarChrome();
  if (!chrome) { console.error('No encontre Chrome ni Edge. Pasa --chrome=RUTA o define CHROME_PATH.'); process.exit(1); }
  try { await fetch(`${base}/escena.html`); } catch { console.error(`No hay servidor en ${base}. Abre otra terminal y corre: node src/servidor.js`); process.exit(1); }

  const datos = JSON.parse(readFileSync(resolve('data', a.archivo), 'utf8'));
  const partida = Number(a.partida ?? 1);
  const beats = construirLineaDeTiempo(datos.partidas?.[partida - 1]);
  if (!beats.length) { console.error(`El archivo no tiene la partida ${partida}.`); process.exit(1); }
  const carpeta = resolve(a.salida ?? 'grabaciones/capturas-escena');
  mkdirSync(carpeta, { recursive: true });
  const nombre = a.archivo.replace(/[^\w.-]+/g, '_').replace(/\.json$/, '');
  let fallos = 0;
  const revisar = (etiqueta, consola) => {
    const errores = erroresDeConsola(consola);
    for (const e of errores) console.error(`  ERROR en ${etiqueta}: ${e}`);
    fallos += errores.length;
  };

  if (a.completa) {
    for (const formato of formatos) {
      const vel = Number(a.vel ?? 8);
      const r = ejecutarChrome(chrome, ['--headless=new', '--disable-gpu', '--enable-logging=stderr', '--v=0', `--window-size=${tamanoDeFormato(formato)}`, '--virtual-time-budget=600000', '--dump-dom',
        urlDeCaptura({ base, archivo: a.archivo, formato, partida, vel })]);
      const termino = /data-terminada="1"/.test(r.salida);
      console.log(`  ${formato}: ${termino ? 'la partida termino de reproducirse' : 'NO termino de reproducirse'}`);
      if (!termino) fallos++;
      const d = leerDesfase(r.salida);
      if (d) {
        console.log(`  ${formato}: duro ${(d.medidoMs / 1000).toFixed(1)} s y la linea de tiempo decia ${(d.esperadoMs / 1000).toFixed(1)} s (a velocidad ${vel})`);
        if (!desfaseAceptable(d)) { console.error(`  ERROR en ${formato}: la reproduccion se desfasa ${(d.desfaseMs / 1000).toFixed(1)} s de su linea de tiempo`); fallos++; }
      }
      revisar(`${formato} (completa)`, r.consola);
    }
  } else if (a.estado) {
    for (const formato of formatos) {
      for (const beat of beatsDeEstado(beats, Number(a.manos ?? 6))) {
        const r = ejecutarChrome(chrome, ['--headless=new', '--disable-gpu', '--enable-logging=stderr', '--v=0', `--window-size=${tamanoDeFormato(formato)}`, '--virtual-time-budget=10000', '--dump-dom',
          urlDeCaptura({ base, archivo: a.archivo, formato, beat, partida })]);
        const errores = erroresDeEstado(leerEstado(r.salida), beats[beat]);
        console.log(`  ${errores.length ? 'FALLO' : 'ok   '} ${formato} ${beats[beat].id}`);
        for (const e of errores) console.error(`  ERROR: ${e}`);
        fallos += errores.length;
        revisar(`${formato} estado ${beat}`, r.consola);
      }
    }
  } else {
    const lista = !a.beats || a.beats === 'auto' ? beatsClave(beats) : a.beats.split(',').map(Number);
    for (const formato of formatos) {
      for (const beat of lista) {
        const archivo = join(carpeta, `${nombre}-${formato}-beat${String(beat).padStart(3, '0')}-${beats[beat]?.tipo ?? 'x'}.png`);
        const r = ejecutarChrome(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--enable-logging=stderr', '--v=0', `--window-size=${tamanoDeFormato(formato)}`, '--virtual-time-budget=10000',
          `--screenshot=${archivo}`, urlDeCaptura({ base, archivo: a.archivo, formato, beat, partida })]);
        const hecho = existsSync(archivo) && statSync(archivo).size > 5000;
        console.log(`  ${hecho ? 'ok ' : 'FALLO'} ${archivo}`);
        if (!hecho) fallos++;
        revisar(`${formato} beat ${beat}`, r.consola);
      }
    }
  }
  console.log(fallos ? `\n  ${fallos} problema(s).\n` : '\n  Sin errores de consola.\n');
  process.exit(fallos ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal();
