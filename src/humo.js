#!/usr/bin/env node
// Prueba de humo GRATUITA de la Guerra de territorios: una serie corta con modelos gratis para medir, antes de gastar
// credito, cuantas respuestas traen JSON y cuantas ordenes valen. No corre en `npm test` porque llama a la API de verdad.
//
//   node src/humo.js                                  (laguna y ling, 10 turnos, 2 partidas: ~40 llamadas)
//   node src/humo.js --modelos=nemotron-ultra,ling --turnos=10 --partidas=2 --ritmo=18
//
// Siempre en modo gratis: se niega a llamar a un modelo que gaste credito. Las llamadas salen a 18 por minuto (el tope de
// OpenRouter es 20) y sin comprar creditos el tope diario es de 50 llamadas. El resultado completo va a data/pruebas/.

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import conquista from './juegos/conquista.js';
import { resolverAgente } from './agentes.js';
import { CONTENDIENTES, fijarModo } from './modelos.js';
import { correrPartida } from './arena.js';
import { crearLimitador } from './limitador.js';
import { seedDesdeTexto } from './rng.js';
import { parsearArgumentos, errorDeCantidad, errorDeModo, planDeSerie, rutaLibre } from './serie.js';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Resume una serie de partidas por modelo (se juntan las partidas aunque el modelo cambie de asiento).
export function resumirHumo(partidas) {
  const por = new Map();
  for (const p of partidas) {
    p.jugadores.forEach((j, i) => {
      const f = por.get(j.id) ?? {
        id: j.id, nombre: j.nombre, llamadas: 0, conError: 0, respuestasInvalidas: 0, ordenesValidas: 0, ordenesTotal: 0,
        tokensEntrada: 0, tokensSalida: 0, ejemplosDeError: [],
      };
      por.set(j.id, f);
      f.llamadas += p.usoPorJugador[i].llamadas;
      f.tokensEntrada += p.usoPorJugador[i].tokensEntrada;
      f.tokensSalida += p.usoPorJugador[i].tokensSalida;
      f.ordenesValidas += p.metricas[i].ordenesValidas ?? 0;
      f.ordenesTotal += p.metricas[i].ordenesTotal ?? 0;
      for (const r of p.rondas) {
        const error = r.errores?.[i];
        if (error) {
          f.conError++;
          if (f.ejemplosDeError.length < 3 && !f.ejemplosDeError.includes(error)) f.ejemplosDeError.push(error);
        } else if (r.respuestas?.[i]?.invalida) {
          f.respuestasInvalidas++;
        }
      }
    });
  }
  return [...por.values()].map((f) => ({
    ...f,
    jsonValido: f.llamadas ? (f.llamadas - f.conError - f.respuestasInvalidas) / f.llamadas : null,
    obediencia: f.ordenesTotal ? f.ordenesValidas / f.ordenesTotal : null,
  }));
}

const pct = (x) => (x === null ? '--' : `${Math.round(x * 100)}%`);
const porLlamada = (n, f) => (f.llamadas ? Math.round(n / f.llamadas) : 0);

function salir(msg) {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
}

async function principal() {
  const o = parsearArgumentos(process.argv.slice(2));
  const claves = String(o.modelos === undefined || o.modelos === true ? 'laguna,ling' : o.modelos).split(',').map((s) => s.trim()).filter(Boolean);
  const turnos = Number(o.turnos ?? 10);
  const partidas = Number(o.partidas ?? claves.length);
  const ritmo = Number(o.ritmo ?? 18);

  const errCantidad = errorDeCantidad(conquista, claves.length);
  if (errCantidad) salir(errCantidad);
  if (!Number.isInteger(turnos) || turnos < 1 || turnos > conquista.rondas) salir(`--turnos debe ser un entero de 1 a ${conquista.rondas}.`);
  if (!Number.isInteger(partidas) || partidas < 1) salir('--partidas debe ser un entero de 1 o mas.');
  if (!(ritmo > 0)) salir('--ritmo debe ser un numero mayor que 0 (llamadas por minuto).');

  let agentesPorClave;
  try {
    agentesPorClave = new Map(claves.map((c) => [c, resolverAgente(c, conquista)]));
  } catch (err) {
    salir(err.message);
  }
  const todos = claves.map((c) => agentesPorClave.get(c));
  if (todos.some((a) => a.tipo !== 'modelo')) salir('La prueba de humo es solo con modelos gratis: usa --modelos=laguna,ling (los bots de control no usan la API).');
  const errModo = errorDeModo({ modo: 'gratis', agentes: todos, contendientes: CONTENDIENTES });
  if (errModo) salir(errModo);
  fijarModo('gratis');

  const limitador = crearLimitador({ porMinuto: ritmo });
  const fecha = new Date().toISOString().slice(0, 10);
  const etiquetaBase = `${fecha}-humo-${claves.join('-vs-')}`;
  const ruta = rutaLibre(resolve(RAIZ, 'data', 'pruebas', `${etiquetaBase}.json`));
  const plan = planDeSerie({ claves, partidas, seedBase: seedDesdeTexto(etiquetaBase), rotar: true, mismoSeed: true });

  console.log(`\n  Prueba de humo (modo gratis): ${todos.map((a) => a.nombre).join(' vs ')} · ${turnos} turnos · ${partidas} partida(s)`);
  console.log(`  Hasta ${partidas * turnos * claves.length} llamadas a ${ritmo} por minuto: tarda unos ${Math.ceil((partidas * turnos * claves.length) / ritmo)} min.\n`);

  const resultados = [];
  for (const p of plan) {
    process.stdout.write(`  Partida ${p.n + 1}/${partidas} `);
    const r = await correrPartida({
      juego: conquista, agentes: p.claves.map((c) => agentesPorClave.get(c)), seed: p.seed, maxRondas: turnos, limitador,
      alRegistrar: () => process.stdout.write('.'),
    });
    console.log(` ${r.llamadas} llamadas`);
    resultados.push(r);
  }

  const resumen = resumirHumo(resultados);
  console.log(`\n  ${'modelo'.padEnd(16)} ${'llamadas'.padStart(8)} ${'con JSON'.padStart(9)} ${'ordenes validas'.padStart(16)} ${'errores'.padStart(8)}  tokens por llamada (entrada/salida)`);
  for (const f of resumen) {
    console.log(
      `  ${f.nombre.padEnd(16)} ${String(f.llamadas).padStart(8)} ${pct(f.jsonValido).padStart(9)} ${pct(f.obediencia).padStart(16)} ${String(f.conError).padStart(8)}` +
        `  ${porLlamada(f.tokensEntrada, f)}/${porLlamada(f.tokensSalida, f)}`
    );
    for (const e of f.ejemplosDeError) console.log(`      ! ${e.slice(0, 110)}`);
  }

  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, JSON.stringify({
    etiqueta: basename(ruta, '.json'), fecha: new Date().toISOString(), tipo: 'humo', modo: 'gratis', destino: 'pruebas',
    juego: { id: conquista.id, nombre: conquista.nombre, categoria: conquista.categoria },
    turnos, jugadores: claves, resumen, partidas: resultados,
  }, null, 2));
  console.log(`\n  Guardado: data/pruebas/${basename(ruta)}\n`);
}

// Solo corre como programa, no al importarlo desde las pruebas.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await principal();
