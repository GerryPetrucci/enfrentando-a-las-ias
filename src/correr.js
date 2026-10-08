#!/usr/bin/env node
// CLI para correr un duelo y guardar el resultado en data/.
//
//   node src/correr.js --juego=dilema --a=claude --b=gpt --partidas=4
//   node src/correr.js --a=tomaydaca --b=siempre-t --partidas=2   (gratis, sin API)
//
// Por defecto alterna asientos entre partidas: si la partida 1 la empieza A en
// la posicion 0, la 2 la empieza B. Esto mata el argumento de "le tocaba mejor
// lugar" antes de que aparezca en los comentarios.

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { obtenerJuego } from './juegos/index.js';
import { resolverAgente } from './agentes.js';
import { correrPartida } from './arena.js';
import { seedDesdeTexto } from './rng.js';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function args() {
  const o = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=?(.*)$/);
    if (m) o[m[1]] = m[2] === '' ? true : m[2];
  }
  return o;
}

const o = args();
const idJuego = o.juego || 'dilema';
const claveA = o.a || 'tomaydaca';
const claveB = o.b || 'siempre-t';
const partidas = Number(o.partidas || 2);
const alternar = o.alternar !== 'no';

const juego = obtenerJuego(idJuego);
const agenteA = resolverAgente(claveA);
const agenteB = resolverAgente(claveB);

const fecha = new Date().toISOString().slice(0, 10);
const etiqueta = `${fecha}-${idJuego}-${claveA}-vs-${claveB}`;
const seedBase = o.seed ? Number(o.seed) : seedDesdeTexto(etiqueta);

console.log(`\n  ${juego.nombre}`);
console.log(`  ${agenteA.nombre}  vs  ${agenteB.nombre}`);
console.log(`  ${partidas} partida(s) · seed base ${seedBase}\n`);

const resultados = [];

for (let n = 0; n < partidas; n++) {
  const invertido = alternar && n % 2 === 1;
  const agentes = invertido ? [agenteB, agenteA] : [agenteA, agenteB];
  const seed = (seedBase + n * 7919) >>> 0;

  process.stdout.write(`  Partida ${n + 1}/${partidas} `);

  const r = await correrPartida({
    juego,
    agentes,
    seed,
    alRegistrar: () => process.stdout.write('.'),
  });

  const nombres = r.jugadores.map((j) => j.nombre);
  const texto =
    r.empate
      ? `empate ${r.puntos.join('-')}`
      : `gana ${nombres[r.ganador]} ${r.puntos.join('-')}`;
  console.log(`  ${texto}`);

  const fallos = r.rondas.flatMap((x) => x.errores.filter(Boolean));
  if (fallos.length) console.log(`     ! ${fallos.length} error(es) de API: ${fallos[0].slice(0, 90)}`);

  resultados.push({ ...r, invertido });
}

const salida = {
  etiqueta,
  fecha: new Date().toISOString(),
  juego: { id: juego.id, nombre: juego.nombre, categoria: juego.categoria },
  seedBase,
  partidas: resultados,
};

mkdirSync(resolve(RAIZ, 'data'), { recursive: true });
const ruta = resolve(RAIZ, 'data', `${etiqueta}.json`);
writeFileSync(ruta, JSON.stringify(salida, null, 2));

const tokens = resultados.reduce((s, r) => s + r.tokensUsados, 0);
console.log(`\n  Guardado: data/${etiqueta}.json`);
if (tokens) console.log(`  Tokens usados: ${tokens.toLocaleString('es-MX')}`);
console.log(`  Siguiente: node src/marcador.js  ·  luego abre web/replay.html\n`);
