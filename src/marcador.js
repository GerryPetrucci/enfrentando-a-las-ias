#!/usr/bin/env node
// Lee los archivos publicos de data/publicas/*.json y arma lo que muestra el sitio -> web/marcador.json
//
//   node src/marcador.js
//   node src/marcador.js --data=data/pruebas --salida=marcador-pruebas.json   (revisar la practica sin tocar el marcador)
//
// Solo lee los .json de la carpeta, sin entrar a subcarpetas: data/pruebas/ (practica y liga gratuita) no cuenta. Cada juego es independiente: hay una tabla POR JUEGO (no un ranking general).
// Solo cuentan las partidas ya publicadas (su parte final esta subida): una serie «por publicarse» aparece en la lista con su seed y hasta donde se ha subido, sin resultados ni puntos.
// El marcador no sabe de que juego se trata: lee las claves que cada juego pone en `metricas`
// (traiciones, promesasHechas, promesasRotas, jugadasInvalidas y, si el juego las tiene, ordenesValidas y ordenesTotal).

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsearArgumentos } from './serie.js';
import { POR_PUBLICARSE, PUBLICADA } from './publicacion.js';

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

// Una partida cuenta en las tablas si esta publicada (o si es de un archivo viejo, sin estado de publicacion) y trae sus puntos.
const cuenta = (p) => p?.estadoPublicacion !== POR_PUBLICARSE && !p?.parcial && Array.isArray(p?.puntos) && Array.isArray(p?.jugadores);

function acumular(tabla, p) {
  p.jugadores.forEach((j, i) => {
    tabla[j.id] ??= filaVacia(j);
    const f = tabla[j.id];
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

const ordenada = (tabla) => Object.values(tabla)
  .map((f) => ({
    ...f,
    puntosPorPartida: f.partidas ? +(f.puntos / f.partidas).toFixed(2) : 0,
    fiabilidad: f.promesasHechas ? +(1 - f.promesasRotas / f.promesasHechas).toFixed(3) : null,
    // Ordenes validas / ordenes enviadas, sumadas de todas las partidas (null si el juego no las mide).
    obediencia: f.ordenesTotal ? +(f.ordenesValidas / f.ordenesTotal).toFixed(3) : null,
  }))
  .sort((a, b) => b.puntosPorPartida - a.puntosPorPartida || b.victorias - a.victorias);

// El resumen de una partida para la lista del sitio: su seed y su estado siempre; el resultado solo si esta publicada.
function detalleDe(dato, n) {
  const p = dato && typeof dato === 'object' ? dato : {}; // una partida rota se lista como por publicarse, sin nada
  const publicada = cuenta(p), nombres = (Array.isArray(p.jugadores) ? p.jugadores : []).map((j) => j?.nombre);
  return {
    n, seed: p.seed ?? null, estado: publicada ? PUBLICADA : POR_PUBLICARSE,
    hastaTurno: publicada ? null : p.parcial?.hastaTurno ?? 0,
    turnos: publicada ? p.turnos ?? p.rondas?.length ?? null : null,
    asientos: (Array.isArray(p.jugadores) ? p.jugadores : []).map((j) => j?.id),
    ganador: publicada && !p.empate && Number.isInteger(p.ganador) ? nombres[p.ganador] ?? null : null,
    puntos: publicada ? p.puntos : null,
    ganoPorMaravilla: publicada ? p.ganoPorMaravilla === true : null,
  };
}

export function armarMarcador(episodiosLeidos, generado = new Date().toISOString()) {
  const categorias = {};
  const juegos = {};
  const episodios = [];
  const grupos = []; // las partidas de cada archivo, para la lista plana del sitio

  for (const { archivo, ep } of episodiosLeidos) {
    if (!ep.partidas) continue;

    const cat = ep.juego.categoria;
    juegos[ep.juego.id] ??= { id: ep.juego.id, nombre: ep.juego.nombre, categoria: cat, versionReglas: null, sistema: null, tabla: {} };
    const J = juegos[ep.juego.id];
    if (ep.prompt?.reglas) { J.versionReglas = ep.prompt.reglas; J.sistema = ep.prompt.sistema ?? J.sistema; }

    for (const p of ep.partidas) {
      if (!cuenta(p)) continue;
      categorias[cat] ??= { nombre: cat, juegos: new Set(), tabla: {} };
      categorias[cat].juegos.add(ep.juego.nombre);
      acumular(categorias[cat].tabla, p);
      acumular(J.tabla, p);
    }

    const detalle = ep.partidas.map((p, i) => detalleDe(p, i + 1));
    const infoJugadores = (p) => (Array.isArray(p?.jugadores) ? p.jugadores : []).map((j) => ({ id: j?.id, nombre: j?.nombre, color: j?.color, inicial: j?.inicial }));
    grupos.push({ fecha: ep.fecha, items: detalle.map((d, i) => ({
      juego: { id: ep.juego.id, nombre: ep.juego.nombre, categoria: cat },
      serie: ep.etiqueta, n: d.n, fecha: ep.fecha, seed: d.seed, estado: d.estado, hastaTurno: d.hastaTurno, turnos: d.turnos,
      jugadores: infoJugadores(ep.partidas[i]), ganador: d.ganador, puntos: d.puntos, ganoPorMaravilla: d.ganoPorMaravilla,
      versionReglas: ep.prompt?.reglas ?? null, modo: ep.modo ?? null,
    })) });
    const todas = detalle.length > 0 && detalle.every((d) => d.estado === PUBLICADA);
    const primera = ep.partidas[0];
    episodios.push({
      etiqueta: ep.etiqueta,
      archivo,
      fecha: ep.fecha,
      juego: ep.juego,
      seedBase: ep.seedBase,
      serie: ep.serie ?? null,
      enfrentamiento: (primera?.jugadores ?? []).map((j) => j.nombre).join(' vs '),
      partidas: ep.partidas.length,
      estado: todas ? PUBLICADA : POR_PUBLICARSE,
      modo: ep.modo ?? null,
      versionReglas: ep.prompt?.reglas ?? null,
      jugadores: (primera?.jugadores ?? []).map((j) => ({ id: j.id, nombre: j.nombre, color: j.color, inicial: j.inicial, tipo: j.tipo, modelo: j.modelo ?? null })),
      detalle,
      evaluacion: todas && ep.evaluacion ? ep.evaluacion : null,
    });
  }

  return {
    generado,
    // Una tabla por juego (cada juego es independiente): `categorias` se queda para quien ya la leia.
    juegos: Object.values(juegos).map((j) => ({ ...j, tabla: ordenada(j.tabla) })).filter((j) => j.tabla.length || episodios.some((e) => e.juego.id === j.id)),
    categorias: Object.values(categorias).map((c) => ({
      nombre: c.nombre,
      juegos: [...c.juegos],
      tabla: ordenada(c.tabla),
    })),
    episodios: episodios.sort((a, b) => b.fecha.localeCompare(a.fecha)),
    // Lo que muestra el sitio: partidas sueltas, de la mas reciente a la mas vieja (sin series; cada juego se mira por si mismo).
    partidas: grupos.sort((a, b) => b.fecha.localeCompare(a.fecha)).flatMap((g) => g.items),
  };
}

function imprimir(salida, nArchivos, rutaSalida) {
  console.log(`\n  Marcador generado desde ${nArchivos} archivo(s).\n`);
  for (const j of salida.juegos) {
    console.log(`  ${j.nombre}`);
    console.log(`  ${'-'.repeat(j.nombre.length)}`);
    for (const f of j.tabla) {
      const fia = f.fiabilidad === null ? '  --' : `${Math.round(f.fiabilidad * 100)}%`.padStart(4);
      const obe = f.obediencia === null ? '' : `   obediencia ${Math.round(f.obediencia * 100)}%`;
      console.log(
        `   ${f.nombre.padEnd(18)} ${String(f.puntosPorPartida).padStart(6)} pts/part` +
          `  ${String(f.victorias).padStart(2)}V-${String(f.empates)}E-${String(f.derrotas)}D` +
          `   fiabilidad ${fia}${obe}`
      );
    }
    if (!j.tabla.length) console.log('   (sin partidas publicadas todavia)');
    console.log('');
  }
  const pendientes = salida.episodios.filter((e) => e.estado === POR_PUBLICARSE);
  if (pendientes.length) console.log(`  Por publicarse: ${pendientes.map((e) => `${e.etiqueta} (seed ${e.seedBase})`).join(', ')}\n`);
  console.log(`  ${rutaSalida} actualizado.\n`);
}

// Solo corre como programa, no al importarlo desde las pruebas.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = parsearArgumentos(process.argv.slice(2));
  const dir = resolve(RAIZ, typeof o.data === 'string' ? o.data : 'data/publicas');
  const rutaSalida = resolve(RAIZ, typeof o.salida === 'string' ? o.salida : 'web/marcador.json');
  const leidos = leerEpisodios(dir);
  const salida = armarMarcador(leidos);
  writeFileSync(rutaSalida, JSON.stringify(salida, null, 2));
  imprimir(salida, leidos.length, typeof o.salida === 'string' ? o.salida : 'web/marcador.json');
}
