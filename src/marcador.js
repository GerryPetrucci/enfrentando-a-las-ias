#!/usr/bin/env node
// Lee todo data/*.json y arma el marcador por categoria -> web/marcador.json
//
//   node src/marcador.js
//   node src/marcador.js --data=data/pruebas --salida=marcador-pruebas.json   (revisar la practica sin tocar el marcador)
//
// Solo lee los .json de la carpeta, sin entrar a subcarpetas: data/pruebas/ (practica y liga gratuita) no cuenta.
// El marcador no sabe de que juego se trata: lee las claves que cada juego pone en `metricas`
// (traiciones, promesasHechas, promesasRotas, jugadasInvalidas y, si el juego las tiene, ordenesValidas y ordenesTotal).

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsearArgumentos } from './serie.js';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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
    ordenesValidas: 0,
    ordenesTotal: 0,
  };
}

// [{ archivo, ep }] de los .json de una carpeta (sin entrar a subcarpetas).
export function leerEpisodios(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((archivo) => ({ archivo, ep: JSON.parse(readFileSync(resolve(dir, archivo), 'utf8')) }));
}

export function armarMarcador(episodiosLeidos, generado = new Date().toISOString()) {
  const categorias = {};
  const episodios = [];

  for (const { archivo, ep } of episodiosLeidos) {
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
          f.ordenesValidas += m.ordenesValidas ?? 0;
          f.ordenesTotal += m.ordenesTotal ?? 0;
        }
      });
    }

    episodios.push({
      etiqueta: ep.etiqueta,
      archivo,
      fecha: ep.fecha,
      juego: ep.juego,
      seedBase: ep.seedBase,
      serie: ep.serie ?? null,
      enfrentamiento: ep.partidas[0].jugadores.map((j) => j.nombre).join(' vs '),
      partidas: ep.partidas.length,
    });
  }

  return {
    generado,
    categorias: Object.values(categorias).map((c) => ({
      nombre: c.nombre,
      juegos: [...c.juegos],
      tabla: Object.values(c.tabla)
        .map((f) => ({
          ...f,
          puntosPorPartida: f.partidas ? +(f.puntos / f.partidas).toFixed(2) : 0,
          fiabilidad: f.promesasHechas ? +(1 - f.promesasRotas / f.promesasHechas).toFixed(3) : null,
          // Ordenes validas / ordenes enviadas, sumadas de todas las partidas (null si el juego no las mide).
          obediencia: f.ordenesTotal ? +(f.ordenesValidas / f.ordenesTotal).toFixed(3) : null,
        }))
        .sort((a, b) => b.puntosPorPartida - a.puntosPorPartida || b.victorias - a.victorias),
    })),
    episodios: episodios.sort((a, b) => b.fecha.localeCompare(a.fecha)),
  };
}

function imprimir(salida, nArchivos, rutaSalida) {
  console.log(`\n  Marcador generado desde ${nArchivos} archivo(s).\n`);
  for (const c of salida.categorias) {
    console.log(`  ${c.nombre}`);
    console.log(`  ${'-'.repeat(c.nombre.length)}`);
    for (const f of c.tabla) {
      const fia = f.fiabilidad === null ? '  --' : `${Math.round(f.fiabilidad * 100)}%`.padStart(4);
      const obe = f.obediencia === null ? '' : `   obediencia ${Math.round(f.obediencia * 100)}%`;
      console.log(
        `   ${f.nombre.padEnd(18)} ${String(f.puntosPorPartida).padStart(6)} pts/part` +
          `  ${String(f.victorias).padStart(2)}V-${String(f.empates)}E-${String(f.derrotas)}D` +
          `   fiabilidad ${fia}${obe}`
      );
    }
    console.log('');
  }
  console.log(`  ${rutaSalida} actualizado.\n`);
}

// Solo corre como programa, no al importarlo desde las pruebas.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = parsearArgumentos(process.argv.slice(2));
  const dir = resolve(RAIZ, typeof o.data === 'string' ? o.data : 'data');
  const rutaSalida = resolve(RAIZ, typeof o.salida === 'string' ? o.salida : 'web/marcador.json');
  const leidos = leerEpisodios(dir);
  const salida = armarMarcador(leidos);
  writeFileSync(rutaSalida, JSON.stringify(salida, null, 2));
  imprimir(salida, leidos.length, typeof o.salida === 'string' ? o.salida : 'web/marcador.json');
}
