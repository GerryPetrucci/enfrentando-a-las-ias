#!/usr/bin/env node
// Lee todo data/*.json y arma el marcador por categoria -> web/marcador.json
//
//   node src/marcador.js

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR_DATA = resolve(RAIZ, 'data');

const archivos = readdirSync(DIR_DATA).filter((f) => f.endsWith('.json'));
const categorias = {};
const episodios = [];

function filaVacia(j) {
  return {
    id: j.id,
    nombre: j.nombre,
    color: j.color,
    tipo: j.tipo,
    modelo: j.modelo,
    partidas: 0,
    victorias: 0,
    empates: 0,
    derrotas: 0,
    puntos: 0,
    traiciones: 0,
    promesasHechas: 0,
    promesasRotas: 0,
    jugadasInvalidas: 0,
  };
}

for (const archivo of archivos) {
  const ep = JSON.parse(readFileSync(resolve(DIR_DATA, archivo), 'utf8'));
  if (!ep.partidas) continue;

  const cat = ep.juego.categoria;
  categorias[cat] ??= { nombre: cat, juegos: new Set(), tabla: {} };
  categorias[cat].juegos.add(ep.juego.nombre);

  for (const p of ep.partidas) {
    p.jugadores.forEach((j, i) => {
      const t = categorias[cat].tabla;
      t[j.id] ??= filaVacia(j);
      const f = t[j.id];
      f.partidas++;
      f.puntos += p.puntos[i];
      if (p.empate) f.empates++;
      else if (p.ganador === i) f.victorias++;
      else f.derrotas++;
      const m = p.metricas?.[i];
      if (m) {
        f.traiciones += m.traiciones ?? 0;
        f.promesasHechas += m.promesasHechas ?? 0;
        f.promesasRotas += m.promesasRotas ?? 0;
        f.jugadasInvalidas += m.jugadasInvalidas ?? 0;
      }
    });
  }

  episodios.push({
    etiqueta: ep.etiqueta,
    archivo,
    fecha: ep.fecha,
    juego: ep.juego,
    seedBase: ep.seedBase,
    enfrentamiento: ep.partidas[0].jugadores.map((j) => j.nombre).join(' vs '),
    partidas: ep.partidas.length,
  });
}

const salida = {
  generado: new Date().toISOString(),
  categorias: Object.values(categorias).map((c) => ({
    nombre: c.nombre,
    juegos: [...c.juegos],
    tabla: Object.values(c.tabla)
      .map((f) => ({
        ...f,
        puntosPorPartida: f.partidas ? +(f.puntos / f.partidas).toFixed(2) : 0,
        fiabilidad: f.promesasHechas
          ? +(1 - f.promesasRotas / f.promesasHechas).toFixed(3)
          : null,
      }))
      .sort((a, b) => b.puntosPorPartida - a.puntosPorPartida || b.victorias - a.victorias),
  })),
  episodios: episodios.sort((a, b) => b.fecha.localeCompare(a.fecha)),
};

writeFileSync(resolve(RAIZ, 'web', 'marcador.json'), JSON.stringify(salida, null, 2));

console.log(`\n  Marcador generado desde ${archivos.length} archivo(s).\n`);
for (const c of salida.categorias) {
  console.log(`  ${c.nombre}`);
  console.log(`  ${'-'.repeat(c.nombre.length)}`);
  for (const f of c.tabla) {
    const fia = f.fiabilidad === null ? '  --' : `${Math.round(f.fiabilidad * 100)}%`.padStart(4);
    console.log(
      `   ${f.nombre.padEnd(18)} ${String(f.puntosPorPartida).padStart(6)} pts/part` +
        `  ${String(f.victorias).padStart(2)}V-${String(f.empates)}E-${String(f.derrotas)}D` +
        `   fiabilidad ${fia}`
    );
  }
  console.log('');
}
console.log('  web/marcador.json actualizado.\n');
