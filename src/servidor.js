#!/usr/bin/env node
// Servidor estatico minimo, para ver el sitio y el reproductor en local.
//   node src/servidor.js   ->  http://localhost:4321

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = Number(process.env.PUERTO || 4321);

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

createServer(async (req, res) => {
  try {
    let ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (ruta === '/') ruta = '/index.html';

    // data/ se sirve tal cual; todo lo demas sale de web/
    const base = ruta.startsWith('/data/') ? RAIZ : resolve(RAIZ, 'web');
    const archivo = resolve(base, '.' + normalize(ruta));
    if (!archivo.startsWith(RAIZ)) {
      res.writeHead(403).end('No');
      return;
    }

    await stat(archivo);
    const cuerpo = await readFile(archivo);
    res.writeHead(200, {
      'Content-Type': TIPOS[extname(archivo)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(cuerpo);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
  }
}).listen(PUERTO, () => {
  console.log(`\n  Sitio:        http://localhost:${PUERTO}/`);
  console.log(`  Reproductor:  http://localhost:${PUERTO}/replay.html\n`);
});
