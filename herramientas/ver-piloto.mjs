#!/usr/bin/env node
// Revisión local de medios, con MIME y rangos para reproducción y búsqueda.
// node herramientas/ver-piloto.mjs [--carpeta=grabaciones/piloto-fuga-F2] [--puerto=4322]
// --generar --config=revision.json escribe REVISAR.html con plantilla común de
// marca y controles; --solo-generar evita abrir servidor. La configuración lleva
// {titulo, descripcion?, nota?, muestras:[{titulo,tipo:'escena',url} | {titulo,tipo:'video',archivo}]}.
// Los HTML existentes se conservan cuando no se pide --generar.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const TIPOS = { '.html': 'text/html; charset=utf-8', '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.webm': 'video/webm', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.png': 'image/png', '.md': 'text/plain; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.woff2': 'font/woff2' };
const web = fileURLToPath(new URL('../web/', import.meta.url));
const RECURSOS = new Set(['sitio.css', 'revision-piloto.css', 'revision-piloto.js', 'revision-piloto-modelo.js', 'fonts/barlow-condensed-700.woff2', 'fonts/barlow-condensed-800.woff2', 'fonts/inter-variable.woff2']);
const dentro = (base, archivo) => { const r = relative(base, archivo); return r !== '..' && !r.startsWith('..\\') && !r.startsWith('../') && !isAbsolute(r); };
const escapar = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function validarRevision(config) {
  if (!config || typeof config.titulo !== 'string' || !Array.isArray(config.muestras) || !config.muestras.length) throw new Error('La revisión necesita título y muestras.');
  for (const m of config.muestras) {
    if (typeof m.titulo !== 'string') throw new Error('Cada muestra necesita título.');
    if (m.tipo === 'escena') {
      const url = new URL(m.url);
      if (url.protocol !== 'http:' || !['localhost','127.0.0.1'].includes(url.hostname) || url.pathname !== '/escena.html') throw new Error('La escena debe pertenecer al servidor local del proyecto.');
    } else if (m.tipo !== 'video' || typeof m.archivo !== 'string' || !/\.(mp4|webm)$/i.test(m.archivo) || !dentro('/piloto', resolve('/piloto', m.archivo)) || /[:\\?#]/.test(m.archivo) || m.archivo.startsWith('/')) throw new Error('Video fuera de la carpeta de revisión.');
  }
  return config;
}

export function paginaDeRevision(config) {
  validarRevision(config);
  const datos = JSON.stringify(config).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapar(config.titulo)}</title>
<link rel="stylesheet" href="/_revision/sitio.css"><link rel="stylesheet" href="/_revision/revision-piloto.css">
<main class="revision"><header><p class="marca-revision">Enfrentando a las IAs · revisión local</p><h1>${escapar(config.titulo)}</h1><p>${escapar(config.descripcion ?? 'Muestra de revisión. No se graba ni publica desde esta página.')}</p></header>
<section class="controles-revision" aria-label="Controles de reproducción"><label>Muestra <select id="muestra"></select></label>
<label>Velocidad <select id="velocidad"><option value="0.25">0,25×</option><option value="0.5">0,5×</option><option value="0.75">0,75×</option><option value="1" selected>1×</option><option value="1.5">1,5×</option><option value="2">2×</option><option value="4">4×</option><option value="8">8×</option></select></label>
<div class="botones-revision"><button id="inicio">Inicio</button><button id="anterior">Anterior</button><button id="reproducir">Reproducir</button><button id="siguiente">Siguiente</button><button id="final">Ir al final</button></div>
<label class="avance-revision">Avance <input id="avance" type="range" min="0" max="0" value="0" aria-label="Avanzar o retroceder la muestra"></label><output id="tiempo" aria-live="polite">Cargando…</output></section>
<section class="pantalla-revision" aria-label="Muestra"><iframe id="escena" title="Reproducción de la muestra" allow="autoplay" hidden></iframe><video id="video" controls preload="metadata" hidden></video></section>
<p id="estado" role="status">Las escenas se recorren por momentos; los videos, por segundos.</p><p><a id="abrir" target="_blank" rel="noopener">Abrir muestra en otra pestaña</a></p><p class="nota">${escapar(config.nota ?? 'La valoración de imagen, voz y ritmo corresponde a la revisión humana. Grabar MP4 con OBS sigue siendo un paso manual.')}</p></main>
<script id="configuracion" type="application/json">${datos}</script><script type="module" src="/_revision/revision-piloto.js"></script></html>\n`;
}
export async function generarRevision(carpeta, config) {
  await writeFile(resolve(carpeta, 'REVISAR.html'), paginaDeRevision(config), 'utf8');
}
export async function servidorPiloto(carpeta) {
  const raiz = await realpath(resolve(carpeta));
  return createServer(async (req, res) => {
    try {
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
      let ruta;
      try { ruta = decodeURIComponent(new URL(req.url, 'http://local').pathname); } catch { res.writeHead(400).end(); return; }
      const recurso = ruta.startsWith('/_revision/') ? ruta.slice('/_revision/'.length) : null;
      if (recurso !== null && !RECURSOS.has(recurso)) { res.writeHead(404).end(); return; }
      const base = recurso !== null ? web : raiz;
      const archivo = recurso !== null ? resolve(web, recurso) : resolve(raiz, ruta === '/' ? 'REVISAR.html' : '.' + ruta);
      if (!dentro(base, archivo)) { res.writeHead(403).end(); return; }
      const tipo = TIPOS[extname(archivo).toLowerCase()];
      if (!tipo) { res.writeHead(404).end(); return; }
      const real = await realpath(archivo);
      if (!dentro(base, real)) { res.writeHead(403).end(); return; }
      const datos = await stat(real);
      if (!datos.isFile()) { res.writeHead(404).end(); return; }
      let inicio = 0, fin = datos.size - 1, estado = 200;
      const cabeceras = { 'Content-Type': tipo, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
      if (req.headers.range) {
        const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if (m && (m[1] || m[2])) {
          inicio = m[1] ? Number(m[1]) : Math.max(0, datos.size - Number(m[2]));
          fin = m[1] && m[2] ? Math.min(Number(m[2]), datos.size - 1) : datos.size - 1;
        }
        if (!m || !(m[1] || m[2]) || !Number.isSafeInteger(inicio) || !Number.isSafeInteger(fin) || inicio > fin || inicio >= datos.size || (!m[1] && Number(m[2]) === 0)) {
          res.writeHead(416, { 'Content-Range': `bytes */${datos.size}` }).end(); return;
        }
        estado = 206; cabeceras['Content-Range'] = `bytes ${inicio}-${fin}/${datos.size}`;
      }
      cabeceras['Content-Length'] = req.headers.range || datos.size ? fin - inicio + 1 : 0;
      res.writeHead(estado, cabeceras);
      if (req.method === 'HEAD' || !datos.size) { res.end(); return; }
      const flujo = createReadStream(real, { start: inicio, end: fin });
      flujo.on('error', () => res.destroy()); res.on('close', () => flujo.destroy()); flujo.pipe(res);
    } catch { if (!res.headersSent) res.writeHead(404).end('No encontrado'); else res.destroy(); }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const a = Object.fromEntries(process.argv.slice(2).map((x) => { const [k, ...v] = x.replace(/^--/, '').split('='); return [k, v.join('=')]; }));
  const puerto = Number(a.puerto ?? 4322);
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) { console.error('Puerto inválido'); process.exitCode = 1; }
  else (async () => {
    const carpeta = a.carpeta ?? 'grabaciones/piloto-fuga-F2';
    if ('generar' in a) {
      const config = a.config ?? 'revision.json';
      if (!dentro(resolve(carpeta), resolve(carpeta, config))) throw new Error('Configuración fuera del piloto.');
      await generarRevision(carpeta, JSON.parse(await readFile(resolve(carpeta, config), 'utf8')));
      console.log('REVISAR.html generado con marca y controles compartidos.');
    }
    if ('solo-generar' in a) return;
    const s = await servidorPiloto(carpeta);
    s.on('error', (e) => { console.error(`No se pudo abrir el piloto: ${e.code}`); process.exitCode = 1; });
    s.listen(puerto, '127.0.0.1', () => console.log(`Piloto: http://127.0.0.1:${puerto}/ — abrir en Chrome o Edge.`));
  })().catch((e) => { console.error(e.message); process.exitCode = 1; });
}
