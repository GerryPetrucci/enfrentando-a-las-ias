#!/usr/bin/env node
// Medicion sin API: variedad real de recorridos y ramas, sin confundir bots
// con modelos. Solo imprime un resumen y opcionalmente lo guarda en privado.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { correrPartida } from '../src/arena.js';
import { resolverAgente } from '../src/agentes.js';
import fuga from '../src/juegos/fuga.js';

const args = Object.fromEntries(process.argv.slice(2).map((s) => { const [k, ...v] = s.replace(/^--/, '').split('='); return [k, v.join('=')]; }));
const n = Number(args.partidas ?? 400);
if (!Number.isInteger(n) || n < 1 || n > 10000) throw new Error('--partidas requiere un entero entre 1 y 10000');
const mezclas = [['leal', 'leal'], ['leal', 'traidor'], ['tomaydaca', 'traidor'], ['azar', 'azar']];
const rutas = new Set(), rutasDeLugares = new Set(), nodos = new Set(), ramas = {}, finales = {}, hechos = {}, consecuencias = {};
let rondas = 0, invalidas = 0;
for (let i = 0; i < n; i++) {
  const par = [...mezclas[i % mezclas.length]];
  if (Math.floor(i / mezclas.length) % 2) par.reverse();
  const p = await correrPartida({ juego: fuga, agentes: par.map((id) => resolverAgente(id, fuga)), seed: Math.floor(i / mezclas.length) + 1 });
  rutas.add(p.rondas.map((r) => `${r.situacion.rama}:${r.situacion.id}`).join('/'));
  rutasDeLugares.add(p.rondas.map((r) => r.situacion.rama).join('/'));
  for (const r of p.rondas) {
    nodos.add(r.situacion.rama); rondas++;
    const rama = r.situacion.rama.replace(/^r\d+-/, ''); ramas[rama] = (ramas[rama] ?? 0) + 1;
    for (const e of r.trama?.eventos ?? []) {
      const cuenta = e.tipo === 'consecuencia' ? consecuencias : hechos, clave = e.causa ?? e.tipo;
      cuenta[clave] = (cuenta[clave] ?? 0) + 1;
    }
  }
  for (const m of p.metricas) { finales[m.final] = (finales[m.final] ?? 0) + 1; invalidas += m.jugadasInvalidas; }
}
const salida = { reglas: fuga.versionReglas, partidas: n, controles: mezclas, recorridosDistintos: rutas.size, rutasDeLugares: rutasDeLugares.size, nodosVisitados: nodos.size, rondasPorPartida: +(rondas / n).toFixed(2), ramas, hechos, consecuencias, finales, jugadasInvalidas: invalidas, llamadasAPI: 0 };
const texto = JSON.stringify(salida, null, 2) + '\n';
if (args.salida) {
  const ruta = resolve(args.salida), privado = resolve('privado');
  if (!ruta.startsWith(privado + sep)) throw new Error('Guarda esta medicion en privado/.');
  mkdirSync(dirname(ruta), { recursive: true }); writeFileSync(ruta, texto, 'utf8');
}
console.log(texto);
