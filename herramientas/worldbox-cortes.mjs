// Cortes y aceleración del video de una partida «era» a partir de su línea de tiempo (linea-de-tiempo.json, escrita por el orquestador).
// Genera la lista de tramos con la velocidad sugerida (rápido en calma, normal en los eventos) y el comando ffmpeg. NO toca el video: solo escribe
// tramos.json, filtro.txt y comando-ffmpeg.txt junto a la línea de tiempo. Uso:
//   node herramientas/worldbox-cortes.mjs --linea=RUTA/linea-de-tiempo.json [--video=RUTA/grabacion.mkv] [--duracion=SEGUNDOS] [--calma=8] [--calma-guerra=3]
//        [--salida=CARPETA] [--min-tramo=2]
// t_real_s de la línea de tiempo = segundos reales desde «Listo para grabar»: pulsa grabar en OBS en ese momento y el tiempo del video coincide.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Ventana alrededor de cada evento (segundos reales antes y después) según su importancia. Las llamadas de los modelos son importantes porque
// sus subtítulos necesitan tiempo de lectura (dos pausas de lectura de ~4 s).
export const VENTANAS = Object.freeze({ alta: { antes: 3, despues: 12 }, media: { antes: 1, despues: 5 }, baja: null });
const redondear = n => Math.round(n * 10) / 10;

export function calcularTramos(linea, { duracion, calma = 8, calmaGuerra = 3, minTramo = 2, intro = 20, outro = 12 } = {}) {
  const eventos = (linea.eventos ?? []).filter(e => Number.isFinite(e.t_real_s));
  const fin = duracion ?? Math.max(0, ...eventos.map(e => e.t_real_s)) + outro;
  const ventanas = [{ ini: 0, fin: Math.min(fin, intro), motivo: 'inicio' }, { ini: Math.max(0, fin - outro), fin, motivo: 'final' }];
  for (const e of eventos) {
    const v = VENTANAS[e.importancia];
    if (v) ventanas.push({ ini: Math.max(0, e.t_real_s - v.antes), fin: Math.min(fin, e.t_real_s + v.despues), motivo: e.descripcion ?? e.tipo });
  }
  ventanas.sort((a, b) => a.ini - b.ini);
  // Se funden las ventanas que se tocan.
  const unidas = [];
  for (const v of ventanas) {
    const ultima = unidas.at(-1);
    if (ultima && v.ini <= ultima.fin + 0.001) { ultima.fin = Math.max(ultima.fin, v.fin); if (!ultima.motivo.includes(v.motivo)) ultima.motivo += ` / ${v.motivo}`; }
    else unidas.push({ ...v });
  }
  const caida = eventos.find(e => e.tipo === 'muro_cae')?.t_real_s ?? Infinity;
  const tramos = [];
  let cursor = 0;
  const hueco = (ini, fin2) => {
    if (fin2 - ini < 0.05) return;
    const factor = fin2 - ini < minTramo ? 1 : (ini >= caida ? calmaGuerra : calma);
    tramos.push({ inicio: redondear(ini), fin: redondear(fin2), factor, motivo: factor === 1 ? 'tramo corto' : 'calma' });
  };
  for (const v of unidas) { hueco(cursor, v.ini); tramos.push({ inicio: redondear(v.ini), fin: redondear(v.fin), factor: 1, motivo: v.motivo }); cursor = v.fin; }
  hueco(cursor, fin);
  const salida = tramos.map((t, i) => ({ n: i + 1, ...t, duracion_origen: redondear(t.fin - t.inicio), duracion_salida: redondear((t.fin - t.inicio) / t.factor) }));
  return { duracion_origen: redondear(fin), duracion_salida: redondear(salida.reduce((s, t) => s + t.duracion_salida, 0)), tramos: salida };
}
// atempo solo admite 0,5 a 2: factores mayores se encadenan.
export function cadenaAtempo(factor) {
  const partes = [];
  let f = factor;
  while (f > 2) { partes.push('atempo=2'); f /= 2; }
  if (f !== 1) partes.push(`atempo=${redondear(f * 1000) / 1000}`);
  return partes.length ? `,${partes.join(',')}` : '';
}
export function construirFiltro(tramos) {
  const piezas = tramos.map(t => `[0:v]trim=start=${t.inicio}:end=${t.fin},setpts=(PTS-STARTPTS)/${t.factor}[v${t.n}];[0:a:0]atrim=start=${t.inicio}:end=${t.fin},asetpts=PTS-STARTPTS${cadenaAtempo(t.factor)}[a${t.n}];`);
  const union = tramos.map(t => `[v${t.n}][a${t.n}]`).join('');
  return `${piezas.join('\n')}\n${union}concat=n=${tramos.length}:v=1:a=1[v][a]\n`;
}
export const construirComando = (video, filtro, salida) => `ffmpeg -i "${video}" -filter_complex_script "${filtro}" -map "[v]" -map "[a]" -c:v libx264 -crf 18 -preset medium -c:a aac -b:a 192k "${salida}"`;

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = /^--([^=]+)=(.*)$/.exec(a); return m ? [m[1], m[2]] : [a, true]; }));
  if (!args.linea) { console.error('Uso: node herramientas/worldbox-cortes.mjs --linea=RUTA/linea-de-tiempo.json [--video=...] [--duracion=S] [--calma=8] [--calma-guerra=3] [--salida=CARPETA]'); process.exit(1); }
  const rutaLinea = resolve(args.linea), linea = JSON.parse(readFileSync(rutaLinea, 'utf8'));
  const num = (k, d) => args[k] === undefined ? d : Number(args[k]);
  const r = calcularTramos(linea, { duracion: num('duracion', undefined), calma: num('calma', 8), calmaGuerra: num('calma-guerra', 3), minTramo: num('min-tramo', 2) });
  const carpeta = resolve(args.salida ?? dirname(rutaLinea));
  mkdirSync(carpeta, { recursive: true });
  const video = args.video ?? 'RUTA/grabacion.mkv';
  writeFileSync(join(carpeta, 'tramos.json'), JSON.stringify({ origen: rutaLinea, parametros: { calma: num('calma', 8), calma_guerra: num('calma-guerra', 3) }, ...r }, null, 2) + '\n');
  writeFileSync(join(carpeta, 'filtro.txt'), construirFiltro(r.tramos));
  writeFileSync(join(carpeta, 'comando-ffmpeg.txt'), construirComando(video, join(carpeta, 'filtro.txt'), join(carpeta, 'partida-cortada.mp4')) + '\n');
  console.log(JSON.stringify({ carpeta, tramos: r.tramos.length, duracion_origen_s: r.duracion_origen, duracion_salida_s: r.duracion_salida }, null, 2));
}
