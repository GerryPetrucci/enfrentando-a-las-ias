// Medicion de balance de la Carrera de civilizaciones con bots de control (spec 9): sin API ni dinero. Round-robin de los bots activos con los dos asientos en mundos con
// seeds consecutivos, mas cada bot contra el pasivo (control) y espejos para vigilar que el asiento no importe. La usan herramientas/medir-civilizaciones.mjs y las pruebas.
// Toda proporcion se informa con su denominador y su IC95 AGRUPADO POR MUNDO (seed): las dos partidas de un mundo no son independientes.

import { crearRng } from '../../rng.js';
import { crearMapa, biomaDeSeed, BIOMAS } from '../../mapa.js';
import civilizaciones from '../civilizaciones.js';
import { indiceDe } from './indice.js';
import { INDICE, TECNOLOGIAS, TURNOS } from './constantes.js';
import { comprobarInvariantes } from './estado.js';

export const BOTS_ACTIVOS = ['cientifico', 'expansionista', 'equilibrado', 'maravillero', 'comerciante'];
const PILARES = ['tecnologia', 'cultura', 'poblacion', 'economia', 'maravillas', 'estabilidad'];
const TOPES = { tecnologia: INDICE.tecnologia.puntos, cultura: INDICE.cultura.puntos, poblacion: INDICE.poblacion.puntos, economia: INDICE.economia.puntos, maravillas: INDICE.maravillas.puntos, estabilidad: INDICE.estabilidad.puntos };

const cacheMapas = new Map();
const mapaDe = (seed, bioma) => { const k = `${seed}|${bioma}`; if (!cacheMapas.has(k)) cacheMapas.set(k, crearMapa(seed, 2, { bioma })); return cacheMapas.get(k); };

// Juega UNA partida entre dos bots (claves de civilizaciones.bots) en el mundo `seed`. Devuelve lo que las metricas necesitan.
export function jugarPartida(asientos, seed, { bioma, invariantes = false, sin = [] } = {}) {
  const J = civilizaciones;
  const mundoBioma = bioma ?? biomaDeSeed(seed, 2);
  const E = J.crear(crearRng(seed * 7919 + 13), { jugadores: 2, mapa: mapaDe(seed, mundoBioma), sin });
  const rngs = asientos.map((_, i) => crearRng((seed * 31 + i * 977) >>> 0));
  let lider = -1, cambios = 0;
  const malos = [], carreras = [];
  let comercios = 0, ofertas = 0;
  while (!J.terminado(E)) {
    const jugadas = asientos.map((id, s) => J.normalizar(J.bots[id].fn(E, s, rngs[s]), E));
    const registro = J.aplicar(E, jugadas, null);
    carreras.push(...registro.eventos.filter((e) => e.tipo === 'maravilla'));
    comercios += registro.eventos.filter((e) => e.tipo === 'comercio').length;
    ofertas += registro.eventos.filter((e) => e.tipo === 'oferta').length;
    if (invariantes) malos.push(...comprobarInvariantes(E));
    const [a, b] = E.civs.map((c) => indiceDe(c).total), d = a - b;
    if (Math.abs(d) > 1) { const q = d > 0 ? 0 : 1; if (lider !== -1 && q !== lider) cambios++; lider = q; }
  }
  const ind = E.civs.map((c) => indiceDe(c));
  const lideresEn = (t) => { const x = E.indices.find((i) => i.turno === t); if (!x) return null; const d = x.publicado[0] - x.publicado[1]; return Math.abs(d) > 1 ? (d > 0 ? 0 : 1) : null; };
  return {
    seed, bioma: mundoBioma, asientos, ganador: E.ganador, desempate: E.desempate, cambios, lider10: lideresEn(10), lider20: lideresEn(20), malos,
    ventaja10: Math.abs(E.indices.find((i) => i.turno === 10).publicado[0] - E.indices.find((i) => i.turno === 10).publicado[1]),
    carreras, comercios, ofertas, carrerasPendientes: Object.keys(E.civs[0].proyectosMaravillas).filter((id) => E.civs[1].proyectosMaravillas[id]).length,
    civs: E.civs.map((c, s) => ({
      indice: ind[s].total, pilares: ind[s].pilares, tecnologias: c.tecnologias.length, era: c.era, poblacion: c.poblacion, regiones: c.regiones.length, hambres: c.hambres,
      colapsos: c.colapsos, validas: c.stats.validas, total: c.stats.total, edificios: c.construidos.length,
    })),
  };
}

const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
// IC95 de una media de valores POR MUNDO (cada mundo aporta un valor): media +- 1.96 * sd / raiz(n).
export function ic95(valoresPorMundo) {
  const n = valoresPorMundo.length;
  if (n < 2) return { media: media(valoresPorMundo), bajo: null, alto: null, n };
  const m = media(valoresPorMundo), sd = Math.sqrt(valoresPorMundo.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1)), h = 1.96 * sd / Math.sqrt(n);
  return { media: m, bajo: m - h, alto: m + h, n };
}

// opciones: { mundos = 200, semilla = 1, bots = BOTS_ACTIVOS, bioma, espejos = false, invariantes = false }
export function medir({ mundos = 200, semilla = 1, bots = BOTS_ACTIVOS, bioma, espejos = false, invariantes = false, sin = [] } = {}) {
  const parejas = [];
  for (let i = 0; i < bots.length; i++) for (let j = i + 1; j < bots.length; j++) parejas.push([bots[i], bots[j]]);
  const porBot = Object.fromEntries(bots.map((id) => [id, { victoriasPorMundo: [], vsPasivoPorMundo: [], partidas: [], pasivo: [] }]));
  const planas = [], espejoPartidas = [];
  for (let g = 0; g < mundos; g++) {
    const seed = semilla + g;
    const pm = Object.fromEntries(bots.map((id) => [id, { v: 0, n: 0, vp: 0, np: 0 }]));
    for (const [a, b] of parejas) for (const orden of [[a, b], [b, a]]) {
      const p = jugarPartida(orden, seed, { bioma, invariantes, sin });
      planas.push(p);
      orden.forEach((id, s) => { pm[id].n++; if (p.ganador === s) pm[id].v++; porBot[id].partidas.push({ ...p.civs[s], seed }); });
    }
    for (const id of bots) for (const orden of [[id, 'pasivo'], ['pasivo', id]]) {
      const p = jugarPartida(orden, seed, { bioma, invariantes, sin });
      planas.push(p);
      const s = orden.indexOf(id);
      pm[id].np++; if (p.ganador === s) pm[id].vp++;
      porBot[id].pasivo.push(p.civs[1 - s]);
    }
    for (const id of bots) { porBot[id].victoriasPorMundo.push(pm[id].v / pm[id].n); porBot[id].vsPasivoPorMundo.push(pm[id].vp / pm[id].np); }
    // Un espejo por mundo (cada vez otro bot): con mundos gemelos y el mismo bot en los dos asientos solo decide el sorteo del desempate, que depende del mundo; repetir el
    // espejo con otro bot en el mismo mundo daria el mismo resultado y haria creer que hay mas muestras de las que hay.
    if (espejos) espejoPartidas.push(jugarPartida([bots[g % bots.length], bots[g % bots.length]], seed, { bioma, invariantes, sin }));
  }
  const entreActivos = planas.filter((p) => p.asientos.every((x) => x !== 'pasivo'));
  const proporcion = (ps, condicion) => {
    const grupos = new Map();
    for (const p of ps) { const g = grupos.get(p.seed) ?? { n:0, v:0 }; g.n++; if (condicion(p)) g.v++; grupos.set(p.seed,g); }
    return { partidas: ps.length, gana: ps.length ? ps.filter(condicion).length / ps.length : null, ic: ic95([...grupos.values()].map((g) => g.v/g.n)) };
  };
  const lideres = (campo) => proporcion(entreActivos.filter((p) => p[campo] !== null), (p) => p.ganador === p[campo]);
  const sat = (partidas) => Object.fromEntries(PILARES.map((k) => [k, partidas.length ? partidas.filter((c) => c.pilares[k] >= 0.98 * TOPES[k]).length / partidas.length : null]));
  const resumenBot = (id) => {
    const ps = porBot[id].partidas;
    return {
      victorias: ic95(porBot[id].victoriasPorMundo), contraPasivo: ic95(porBot[id].vsPasivoPorMundo),
      tecnologias: { media: media(ps.map((c) => c.tecnologias)), min: Math.min(...ps.map((c) => c.tecnologias)), max: Math.max(...ps.map((c) => c.tecnologias)) },
      era: media(ps.map((c) => c.era)), poblacion: media(ps.map((c) => c.poblacion)), regiones: media(ps.map((c) => c.regiones)), indice: media(ps.map((c) => c.indice)),
      pilares: Object.fromEntries(PILARES.map((k) => [k, media(ps.map((c) => c.pilares[k]))])), saturados: sat(ps),
      arbolAgotado: ps.filter((c) => c.tecnologias === TECNOLOGIAS.length).length / ps.length, hambres: media(ps.map((c) => c.hambres)), colapsos: media(ps.map((c) => c.colapsos)),
      tasaColapso: ps.filter((c) => c.colapsos > 0).length / ps.length,
      colapsosIC: proporcion(ps, (c) => c.colapsos > 0),
      ordenesValidas: ps.reduce((s, c) => s + c.validas, 0) / Math.max(1, ps.reduce((s, c) => s + c.total, 0)),
    };
  };
  const asiento0 = entreActivos.filter((p) => p.ganador === 0).length / Math.max(1, entreActivos.length);
  const carreras = entreActivos.flatMap((p) => p.carreras.map((c) => ({ ...c, seed: p.seed })));
  const disputadas = carreras.filter((c) => c.disputada), desfasadas = disputadas.filter((c) => !c.simultanea);
  const primero = (c) => c.ganador === (c.inicios[0] < c.inicios[1] ? 0 : 1);
  const mundosCarrera = [...new Set(desfasadas.map((c) => c.seed))];
  return {
    mundos, semilla, bots, sin, bioma: bioma ?? 'segun el seed', partidas: planas.length, turnos: TURNOS,
    comercio: { ofertas: entreActivos.reduce((n,p) => n + p.ofertas,0), tratos: entreActivos.reduce((n,p) => n + p.comercios,0) },
    porBioma: Object.fromEntries(BIOMAS.map((bioma) => [bioma, Object.fromEntries(bots.map((a) => [a, Object.fromEntries(bots.filter((b) => b !== a).map((b) => {
      const ps = entreActivos.filter((p) => p.bioma === bioma && p.asientos.includes(a) && p.asientos.includes(b));
      return [b, proporcion(ps, (p) => p.asientos[p.ganador] === a)];
    }))]))])),
    carreras: { resueltas: carreras.length, disputadas: disputadas.length, inicioSimultaneo: disputadas.length - desfasadas.length,
      desfasadas: desfasadas.length, primeroGana: desfasadas.filter(primero).length,
      icPrimero: ic95(mundosCarrera.map((seed) => { const cs = desfasadas.filter((c) => c.seed === seed); return cs.filter(primero).length / cs.length; })),
      pendientes: entreActivos.reduce((n, p) => n + p.carrerasPendientes, 0) },
    porBot: Object.fromEntries(bots.map((id) => [id, resumenBot(id)])),
    liderT10: lideres('lider10'), liderT20: lideres('lider20'), cambiosDeLider: media(entreActivos.map((p) => p.cambios)),
    remontadasT10: [{ min: 1, max: 5 }, { min: 5, max: 10 }, { min: 10, max: null }].map(({ min, max }) => {
      const ps = entreActivos.filter((p) => p.lider10 !== null && p.ventaja10 > min && (max === null || p.ventaja10 <= max));
      const semillas = [...new Set(ps.map((p) => p.seed))];
      const tasas = semillas.map((seed) => { const xs = ps.filter((p) => p.seed === seed); return xs.filter((p) => p.ganador !== p.lider10).length / xs.length; });
      return { minExclusivo: min, maxInclusivo: max, partidas: ps.length, remontadas: ps.filter((p) => p.ganador !== p.lider10).length, ic: ic95(tasas) };
    }),
    asiento0: { partidas: entreActivos.length, gana: asiento0 },
    empatesAntesDelDesempate: planas.filter((p) => p.desempate !== null).length / Math.max(1, planas.length),
    espejos: espejos ? (() => { const g0 = espejoPartidas.filter((p) => p.ganador === 0).length / espejoPartidas.length; return { partidas: espejoPartidas.length, asiento0: g0, mitad: 1.96 * Math.sqrt(0.25 / espejoPartidas.length), porSorteo: espejoPartidas.filter((p) => p.desempate === 'sorteo').length / espejoPartidas.length }; })() : null,
    invariantesRotos: invariantes ? [...planas, ...espejoPartidas].reduce((s, p) => s + p.malos.length, 0) : null,
    biomas: BIOMAS,
  };
}
