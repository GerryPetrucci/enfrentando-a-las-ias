#!/usr/bin/env node
// Genera la voz narradora de una partida guardada: un audio por momento (beat) que se dice en voz alta y un voz.json con lo que dura cada uno.
// La escena (web/escena.html) lo usa con ?voz=RUTA: cada momento dura lo que dure su audio y el audio suena al empezar. La voz se genera ANTES de grabar,
// en local: ningun texto sale del equipo. El texto es la narracion que el codigo guardo en la partida; aqui no se inventa nada.
//
//   node herramientas/narrar.mjs --archivo=pruebas/NOMBRE.json [--partida=1]
//   opciones: --pronunciaciones=ARCHIVO.json  ([["GPT", "ge pe te"], ...])   --velocidad=1.1 (mas lento)   --piper=RUTA   --modelo=RUTA.onnx   --ffmpeg=RUTA
//
// Deja los audios y voz.json en data/voz/NOMBRE-pN/ (no se versiona: son binarios) y dice como abrir la escena con esa voz.
// Voz elegida el 16 de octubre de 2026: Piper (MIT) con es_MX-claude-high (Apache-2.0); terminos y cuidados en privado/terminos/voz-narradora.md.
// El programa y el modelo viven en grabaciones/voz/ (git los ignora); si estan en otro lado, --piper y --modelo.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { lineaDe } from '../web/casino/lineas.js';
import { marcarTiempos } from '../web/casino/escena-config.js';

export const VOZ = {
  motor: 'Piper (MIT)',
  modelo: 'es_MX-claude-high',
  piper: 'grabaciones/voz/motores/piper/piper/piper.exe',
  archivoModelo: 'grabaciones/voz/voces-piper/es_MX-claude-high.onnx',
  lengthScale: 1, // 1 = velocidad normal del modelo; mas de 1 habla mas lento
  pausaMs: 350, // lo que se deja respirar despues de cada frase, antes del siguiente momento
};

const escaparRegex = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// El texto tal como lo lee la voz: sin saltos de linea ni espacios de mas, y con el diccionario de pronunciacion ([[palabra, como se lee], ...]) aplicado
// a palabras completas (GPT cambia, GPTX no).
export function textoParaVoz(texto, pronunciaciones = []) {
  let t = String(texto ?? '').replace(/\s+/g, ' ').trim();
  for (const [palabra, lectura] of pronunciaciones) {
    t = t.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escaparRegex(palabra)}(?![\\p{L}\\p{N}])`, 'gu'), lectura);
  }
  return t;
}

// Un audio por beat que tiene algo que decir (los momentos mudos, como el reparto, no llevan).
export function planDeNarracion(beats, pronunciaciones = []) {
  if (!Array.isArray(beats)) return [];
  return beats
    .map((b) => ({ id: b.id, texto: textoParaVoz(b.texto, pronunciaciones) }))
    .filter((p) => p.texto)
    .map((p) => ({ ...p, archivo: `${p.id}.ogg` }));
}

// data/voz/NOMBRE-pN: ruta de este sitio (la escena la pide con ?voz=data/voz/NOMBRE-pN/voz.json).
export function carpetaDeVoz(archivo, partida = 1) {
  const nombre = String(archivo).replace(/\.json$/i, '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `data/voz/${nombre}-p${partida}`;
}

// resultados = [{ id, duracionS }] -> voz.json: { "<id del beat>": { ms, archivo } }. Un audio sin duracion valida no entra (el beat dura su minimo).
export function armarVoz(resultados, { carpeta, pausaMs = VOZ.pausaMs } = {}) {
  const voz = {};
  for (const r of Array.isArray(resultados) ? resultados : []) {
    if (Number.isFinite(r?.duracionS) && r.duracionS > 0) voz[r.id] = { ms: Math.round(r.duracionS * 1000) + pausaMs, archivo: `${carpeta}/${r.id}.ogg` };
  }
  return voz;
}

export const argumentosDePiper = ({ modelo, salida, lengthScale = VOZ.lengthScale }) => ['--model', modelo, '--output_file', salida, '--length_scale', String(lengthScale)];

// Nivel comun de voz: -18 LUFS (los efectos de sonido.js van unos 12 dB debajo). OGG Vorbis: lo reproducen Chrome y la fuente Navegador de OBS.
export const argumentosDeFfmpeg = (entrada, salida) => ['-y', '-hide_banner', '-loglevel', 'error', '-i', entrada, '-af', 'loudnorm=I=-18:TP=-1.5:LRA=7', '-ar', '44100', '-c:a', 'libvorbis', '-q:a', '4', salida];

function duracionDe(archivo) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', archivo], { encoding: 'utf8' });
  return Number(String(r.stdout).trim());
}

function principal() {
  const a = Object.fromEntries(process.argv.slice(2).map((x) => { const [k, ...v] = x.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : 'true']; }));
  const salir = (m) => { console.error(m); process.exit(1); };
  if (!a.archivo) salir('Falta --archivo=NOMBRE.json (una partida guardada en data/, por ejemplo pruebas/NOMBRE.json).');
  const piper = resolve(a.piper ?? VOZ.piper), modelo = resolve(a.modelo ?? VOZ.archivoModelo), ffmpeg = a.ffmpeg ?? 'ffmpeg';
  if (!existsSync(piper)) salir(`No encuentro Piper en ${piper}. Pasa --piper=RUTA (ver privado/terminos/voz-narradora.md).`);
  if (!existsSync(modelo)) salir(`No encuentro la voz en ${modelo}. Pasa --modelo=RUTA.onnx.`);

  const numero = Number(a.partida ?? 1);
  const datos = JSON.parse(readFileSync(resolve('data', a.archivo), 'utf8'));
  const partida = datos.partidas?.[numero - 1];
  if (!partida) salir(`El archivo no tiene la partida ${numero}.`);
  const pronunciaciones = a.pronunciaciones ? JSON.parse(readFileSync(resolve(a.pronunciaciones), 'utf8')) : [];

  return lineaDe(partida.juego?.id ?? datos.juego?.id).then((construir) => {
    const beats = construir(partida);
    const plan = planDeNarracion(beats, pronunciaciones);
    const carpeta = carpetaDeVoz(a.archivo, numero);
    mkdirSync(resolve(carpeta), { recursive: true });
    const temporal = mkdtempSync(join(tmpdir(), 'narrar-'));
    const resultados = [];
    for (const [i, p] of plan.entries()) {
      const wav = join(temporal, `${p.id}.wav`);
      const salida = resolve(carpeta, p.archivo);
      const v = spawnSync(piper, argumentosDePiper({ modelo, salida: wav, lengthScale: Number(a.velocidad ?? VOZ.lengthScale) }), { input: p.texto, encoding: 'utf8' });
      if (v.status !== 0) salir(`Piper fallo en ${p.id}: ${String(v.stderr).slice(-300)}`);
      const f = spawnSync(ffmpeg, argumentosDeFfmpeg(wav, salida), { encoding: 'utf8' });
      if (f.status !== 0) salir(`ffmpeg fallo en ${p.id}: ${f.stderr}`);
      resultados.push({ id: p.id, duracionS: duracionDe(salida) });
      process.stdout.write(`\r  ${i + 1} de ${plan.length} audios`);
    }
    const voz = armarVoz(resultados, { carpeta });
    writeFileSync(resolve(carpeta, 'voz.json'), JSON.stringify(voz, null, 2));
    const sinVoz = marcarTiempos(beats, null, 1).at(-1).finMs / 1000, conVoz = marcarTiempos(beats, voz, 1).at(-1).finMs / 1000;
    console.log(`\n  Listo: ${resultados.length} audios en ${carpeta}/ (${resultados.reduce((s, r) => s + r.duracionS, 0).toFixed(0)} s de voz).`);
    console.log(`  La partida dura ${sinVoz.toFixed(0)} s sin voz y ${conVoz.toFixed(0)} s con ella.`);
    console.log(`  Abrela con: escena.html?archivo=${a.archivo}&partida=${numero}&voz=${carpeta}/voz.json&auto=1`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal();
