#!/usr/bin/env node
// Organiza archivos existentes sin regenerar paquetes ni convertir su audio.
// Por omision solo muestra el plan. --aplicar mueve archivos, sin sobrescribir.
import { readdirSync, existsSync, mkdirSync, renameSync, realpathSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export function organizarGrabaciones(raiz, { aplicar = false } = {}) {
  const base = realpathSync(raiz), movimientos = [], cambios = [];
  const dentro = (ruta) => { if (!ruta.startsWith(`${base}${sep}`)) throw new Error('Ruta fuera de la carpeta de grabaciones.'); return ruta; };
  const directorios = (ruta) => readdirSync(ruta, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.isSymbolicLink());
  for (const juego of directorios(base)) for (const serie of directorios(join(base, juego.name))) {
    const carpeta = join(base, juego.name, serie.name);
    for (const estado of ['originales', 'por-subir', 'subidos', 'revision']) {
      const origen = join(carpeta, estado);
      if (!existsSync(origen)) continue;
      // Un estado enlazado a otro lugar no se recorre.
      if (realpathSync(origen) !== origen) throw new Error(`El estado no es una carpeta local directa: ${origen}`);
      for (const e of readdirSync(origen, { withFileTypes: true })) {
        const m = /^j([1-9]\d*)_(?:pt|clp|hk)\d+(?:[_.]|$)/.exec(e.name);
        if (!e.isFile() || !m) continue;
        const desde = dentro(join(origen, e.name)), destino = dentro(join(origen, `j${m[1]}`, e.name));
        if (existsSync(join(origen, `j${m[1]}`)) && realpathSync(join(origen, `j${m[1]}`)) !== join(origen, `j${m[1]}`)) throw new Error('Una carpeta destino es un enlace.');
        if (existsSync(destino)) throw new Error(`Ya existe el destino; no se mueve nada: ${destino}`);
        movimientos.push({ desde, destino });
      }
    }
    for (const paquete of directorios(carpeta)) {
      const m = /^paquete-j([1-9]\d*)$/.exec(paquete.name);
      const ruta = join(carpeta, paquete.name, 'LEEME.md');
      if (!m || !existsSync(ruta)) continue;
      const anterior = readFileSync(ruta, 'utf8'), j = `j${m[1]}`;
      let nuevo = anterior.replace(/(originales|por-subir|subidos|revision)\/(j\d+_(?:pt|clp|hk)\d+[^\s"`]*)/g, (_, estado, archivo) => `${estado}/${archivo.split('_')[0]}/${archivo}`);
      // En el comando de recorte el destino antes era compartido por la serie.
      nuevo = nuevo.replace(/(--carpeta=[^\s"`]*\/por-subir)(?=[\s"`]|$)/g, `$1/${j}`);
      if (nuevo !== anterior) cambios.push({ ruta, anterior, nuevo });
    }
  }
  if (aplicar) {
    const movidos = [], escritos = [];
    try {
      for (const m of movimientos) { mkdirSync(resolve(m.destino, '..'), { recursive: true }); renameSync(m.desde, m.destino); movidos.push(m); }
      for (const c of cambios) { writeFileSync(c.ruta, c.nuevo, 'utf8'); escritos.push(c); }
    } catch (e) {
      for (const c of escritos.reverse()) writeFileSync(c.ruta, c.anterior, 'utf8');
      for (const m of movidos.reverse()) renameSync(m.destino, m.desde);
      throw e;
    }
  }
  return { movimientos, leemes: cambios.map((c) => c.ruta), aplicado: aplicar };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const r = organizarGrabaciones(resolve('grabaciones/listos'), { aplicar: process.argv.includes('--aplicar') });
    console.log(`${r.aplicado ? 'Organizados' : 'Por organizar'}: ${r.movimientos.length} archivos; ${r.leemes.length} LEEME con rutas actualizadas.`);
    if (!r.aplicado) console.log('Revisa con --json; usa --aplicar para organizar sin borrar ni sobrescribir archivos.');
    if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
