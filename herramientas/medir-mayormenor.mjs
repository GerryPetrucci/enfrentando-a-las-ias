#!/usr/bin/env node
// Mide Mayor o menor con los bots de control (gratis: no llama a ningun modelo) para saber que reglas lo hacen mas parejo e inesperado (decidido el 21 de octubre de 2026:
// «que cualquiera pueda ganar»). Cada cambio de reglas es una perilla de src/juegos/mayormenor/constantes.js; aqui se prueba cada uno solo y combinado.
//
//   node herramientas/medir-mayormenor.mjs [--partidas=300] [--salida=archivo.md]
//
// Metricas (todas por partida terminada; los bots son una muestra, no las IAs: sirven para COMPARAR reglas, no para predecir un modelo):
//   ventaja      cuantas veces gana quien iba arriba en la ronda 6 / 12 (50 % = el final no esta decidido; 100 % = no hay remontada)
//   remontadas   cuantas veces cambia el que va arriba durante la partida (mas = mas suspenso)
//   margen       |diferencia de fichas| / fichas totales al final (0 = parejo)
//   asiento 0    victorias del jugador que abre, en partidas entre el mismo bot (50 % = ningun asiento tiene ventaja)
//   al azar      la ventaja del que va arriba cuando AMBOS juegan al azar: es lo que da el puro azar (una caminata sin habilidad: ~70 % en la ronda 6 y ~80 % en la 12); mas que eso es habilidad o bola de nieve
//   apostando    parte de las fichas ganadas que vienen de apostar (el resto sale de jugar cartas)
//   todo         apuestas de todo lo permitido: cuantas se pierden (0 % = apostar todo no tiene riesgo)
//   fin antes    partidas que terminan antes de la ronda 18 porque alguien se queda sin fichas
//   mejor/peor   victorias del mejor bot (astuto) contra el peor (azar): que tanto cuenta jugar bien

import { crearRng } from '../src/rng.js';
import { crearEstado } from '../src/juegos/mayormenor/estado.js';
import { aplicarTurno } from '../src/juegos/mayormenor/turno.js';
import { normalizarRespuesta } from '../src/juegos/mayormenor/ordenes.js';
import { REGLAS_1_0, REGLAS_2_0, RONDAS } from '../src/juegos/mayormenor/constantes.js';
import { BOTS } from '../src/juegos/mayormenor-bots.js';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';

const regla = (nombre, extra) => ({ nombre, reglas: Object.freeze({ ...REGLAS_1_0, version: nombre, ...extra }) });
// Las variantes que se comparan: cada perilla sola, las combinaciones y las reglas 2.0.0 (tope fijo de 6 + B + C + D). La propuesta anterior (tope por el rival en lugar del tope fijo) se queda de referencia.
export const VARIANTES = [
  regla('1.0.0 (como esta)', {}),
  regla('tope por el rival (descartada)', { topeRival: true }),
  regla('tope fijo 6', { topeFijo: 6 }),
  regla('B igual cuenta como menor', { igualEsMenor: true }),
  regla('C mano oculta', { manoOculta: true }),
  regla('D rondas dobles', { dobles: 3 }),
  regla('tope 6 + B', { topeFijo: 6, igualEsMenor: true }),
  regla('tope 6 + B + C', { topeFijo: 6, igualEsMenor: true, manoOculta: true }),
  regla('tope 6 + B + D', { topeFijo: 6, igualEsMenor: true, dobles: 3 }),
  { nombre: '2.0.0 (tope 6 + B + C + D)', reglas: REGLAS_2_0 },
  regla('propuesta anterior (rival + B + C + D)', { ...REGLAS_2_0, topeFijo: 0, topeRival: true }),
  regla('2.0.0 con tope 5', { ...REGLAS_2_0, topeFijo: 5 }),
  regla('2.0.0 con tope 8', { ...REGLAS_2_0, topeFijo: 8 }),
];

// Una partida entera entre dos bots (sin la arena: es lo mismo sin llamadas). `fns[s]` es el bot del asiento s. Devuelve el estado y los registros.
export function jugarPartida(seed, reglas, fns) {
  const E = crearEstado(crearRng(seed), reglas);
  const rngs = fns.map((_, s) => crearRng((seed * 31 + s) >>> 0));
  const registros = [];
  while (!E.fin && registros.length < RONDAS + 2) {
    const respuestas = fns.map((fn, s) => normalizarRespuesta(fn(E, s, rngs[s])));
    registros.push(aplicarTurno(E, respuestas));
  }
  return { E, registros };
}

// Lo que se mide de una partida terminada.
export function medirPartida({ E, registros }) {
  const f = E.final;
  const ganador = f && !f.empate ? f.ganador : null;
  const lider = (r) => { const [x, y] = registros[Math.min(r, registros.length) - 1].fichas; return x === y ? null : x > y ? 0 : 1; };
  let remontadas = 0, previo = null, ganadasApostando = 0, ganadasCartas = 0, todos = 0, todosPerdidos = 0;
  for (const r of registros) {
    const l = r.fichas[0] === r.fichas[1] ? null : r.fichas[0] > r.fichas[1] ? 0 : 1;
    if (l !== null && previo !== null && l !== previo) remontadas++;
    if (l !== null) previo = l;
    ganadasCartas += r.ganaActivo;
    if (r.ganaPredictor > 0) ganadasApostando += r.ganaPredictor;
    if (r.apostoTodo && r.invalidas[r.predictor] !== true) { todos++; if (r.acierto === false) todosPerdidos++; }
  }
  const [x, y] = E.fichas;
  return {
    ganador, rondas: registros.length, finAntes: registros.length < RONDAS,
    lider6: lider(6), lider12: lider(12),
    remontadas, margen: x + y > 0 ? Math.abs(x - y) / (x + y) : 0,
    ganadasApostando, ganadasCartas, todos, todosPerdidos,
  };
}

const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (n, d) => (d ? n / d : null);

// Mide una variante: todos los bots contra todos (y contra si mismos), con los dos asientos, `partidas` seeds por pareja.
export function medirVariante(reglas, { partidas = 200, seed0 = 1000, bots = BOTS } = {}) {
  const ids = Object.keys(bots);
  const todas = [], espejo = [], cruces = new Map();
  for (const a of ids) {
    for (const b of ids) {
      for (let k = 0; k < partidas; k++) {
        const seed = seed0 + k;
        const m = medirPartida(jugarPartida(seed, reglas, [bots[a], bots[b]]));
        todas.push(m);
        if (a === b) espejo.push(m);
        const clave = `${a}>${b}`;
        const c = cruces.get(clave) ?? { a: 0, b: 0, n: 0 };
        c.n++;
        if (m.ganador === 0) c.a++; else if (m.ganador === 1) c.b++;
        cruces.set(clave, c);
      }
    }
  }
  // victorias de un bot contra otro, sumando los dos asientos
  const duelo = (x, y) => {
    const xy = cruces.get(`${x}>${y}`), yx = cruces.get(`${y}>${x}`);
    if (!xy || !yx) return null; // un bot que no esta en esta medicion
    const gana = xy.a + yx.b, pierde = xy.b + yx.a;
    return pct(gana, gana + pierde);
  };
  const ganadas = (m) => m.ganador !== null;
  const conLider = (campo) => todas.filter((m) => ganadas(m) && m[campo] !== null);
  const ventaja = (campo) => pct(conLider(campo).filter((m) => m[campo] === m.ganador).length, conLider(campo).length);
  const azarRef = { ventaja6: null, ventaja12: null };
  if (ids.includes('azar')) {
    const z = [];
    for (let k = 0; k < partidas * 2; k++) z.push(medirPartida(jugarPartida(seed0 + k, reglas, [bots.azar, bots.azar])));
    const v = (campo) => { const c = z.filter((m) => m.ganador !== null && m[campo] !== null); return pct(c.filter((m) => m[campo] === m.ganador).length, c.length); };
    azarRef.ventaja6 = v('lider6'); azarRef.ventaja12 = v('lider12');
  }
  const sumA = todas.reduce((s, m) => s + m.ganadasApostando, 0), sumC = todas.reduce((s, m) => s + m.ganadasCartas, 0);
  const todos = todas.reduce((s, m) => s + m.todos, 0), perdidos = todas.reduce((s, m) => s + m.todosPerdidos, 0);
  return {
    partidas: todas.length,
    ventaja6: ventaja('lider6'), ventaja12: ventaja('lider12'),
    remontadas: media(todas.map((m) => m.remontadas)),
    margen: media(todas.map((m) => m.margen)),
    asiento0: pct(espejo.filter((m) => m.ganador === 0).length, espejo.filter(ganadas).length),
    apostando: pct(sumA, sumA + sumC),
    todo: pct(perdidos, todos), todoApuestas: todos,
    finAntes: pct(todas.filter((m) => m.finAntes).length, todas.length),
    empates: pct(todas.filter((m) => !ganadas(m)).length, todas.length),
    azar6: azarRef.ventaja6, azar12: azarRef.ventaja12,
    mejorPeor: duelo('astuto', 'azar'), mejorMedio: duelo('astuto', 'prudente'), cautoTemerario: duelo('contador', 'temerario'),
  };
}

const p = (x, d = 0) => (x === null || x === undefined ? '—' : `${(x * 100).toFixed(d)} %`);
const n2 = (x) => (x === null || x === undefined ? '—' : x.toFixed(2));

export function tablaMarkdown(resultados) {
  const cab = ['Variante', 'ventaja R6', 'ventaja R12', 'al azar R6/R12', 'remontadas', 'margen', 'asiento 0', 'apostando', 'todo perdido', 'fin antes', 'mejor/peor', 'mejor/prudente'];
  const filas = resultados.map(({ nombre, m }) => [nombre, p(m.ventaja6), p(m.ventaja12), `${p(m.azar6)} / ${p(m.azar12)}`, n2(m.remontadas), p(m.margen), p(m.asiento0), p(m.apostando), `${p(m.todo)} de ${m.todoApuestas}`, p(m.finAntes), p(m.mejorPeor), p(m.mejorMedio)]);
  return [`| ${cab.join(' | ')} |`, `|${cab.map(() => '---').join('|')}|`, ...filas.map((f) => `| ${f.join(' | ')} |`)].join('\n');
}

function principal() {
  const a = Object.fromEntries(process.argv.slice(2).map((x) => { const [k, ...v] = x.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : 'true']; }));
  const partidas = Number(a.partidas ?? 300);
  const resultados = VARIANTES.map((v) => ({ nombre: v.nombre, m: medirVariante(v.reglas, { partidas }) }));
  const texto = `Mayor o menor: ${resultados[0].m.partidas} partidas por variante (${Object.keys(BOTS).length} bots, todos contra todos, los dos asientos)\n\n${tablaMarkdown(resultados)}\n`;
  console.log(texto);
  if (a.salida) writeFileSync(a.salida, texto);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal();
