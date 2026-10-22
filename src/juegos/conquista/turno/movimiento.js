// Movimientos simultaneos, batallas, herencia de edificios, traspaso de la Maravilla y caida de reinos.

import { aliado, contarEdificios, regionesDe, tropasDe, pila as pilaDe, ponerPila, sumarUni, limpiarRegion } from '../estado.js';
import { RECURSOS, MAX_EDIFICIOS_POR_TIPO, N_TIPOS } from '../constantes.js';
import { resolverBatalla } from '../batalla.js';
import { sumaPila, sumarPilas, dejarUna, pilaVacia } from '../unidades.js';

// Lo que pide una orden `mover`: su pila, o con `todo` todo lo que hay menos 1 unidad (la mas barata).
function pedida(E, s, o) {
  if (!o.todo) return o.pila;
  const pide = [...pilaDe(E, o.de, s)];
  for (let t = 0; t < N_TIPOS; t++) if (pide[t] > 0) { pide[t]--; break; }
  return pide;
}

// Devuelve un texto (motivo) si el movimiento no vale, o { pila, n } si vale (ya resuelve la palabra `todo`).
function validar(ctx, s, o) {
  const { E, regs, NR } = ctx;
  if (!ctx.propia(s, o.de)) return 'la region de origen no es tuya';
  if (o.a >= NR) return 'la region de destino no existe';
  if (o.de === o.a) return 'origen y destino son la misma region';
  const hay = pilaDe(E, o.de, s), pila = pedida(E, s, o), n = sumaPila(pila);
  if (n < 1) return 'no hay tropas de sobra: debe quedar al menos 1 en la region de origen';
  if (pila.some((x, t) => x > hay[t])) return 'no tienes esas unidades en la region de origen';
  if (sumaPila(hay) - n < 1) return 'debe quedar al menos 1 tropa en la region de origen';
  if (!regs[o.de].vecinos.includes(o.a)) {
    // A 2 regiones llegan solo los Jinetes; la region del medio (vecina de las dos) debe ser tuya, libre o de un aliado con pacto vigente; nunca de otro reino (22 de octubre de 2026).
    if (pila.some((x, t) => t !== 2 && x > 0)) return 'solo los Jinetes llegan a 2 regiones';
    const medios = regs[o.de].vecinos.filter((w) => regs[w].vecinos.includes(o.a));
    if (!medios.length) return 'la region de destino no es vecina';
    if (!medios.some((w) => E.dueno[w] < 0 || E.dueno[w] === s || aliado(E, s, E.dueno[w], ctx.t))) return 'no puedes cruzar territorio de otro reino';
  }
  const duenoDestino = E.dueno[o.a];
  if (duenoDestino >= 0 && duenoDestino !== s && aliado(E, s, duenoDestino, ctx.t)) return 'esa region es de un aliado (usa romper antes)';
  return { pila, n };
}

// El edificio pasa al conquistador danado (50% de su efecto); si ya tiene 3 de ese tipo, se destruye.
function heredarEdificio(ctx, d, nuevo) {
  const { E } = ctx, e = E.edif[d];
  if (!e) return;
  if (contarEdificios(E, nuevo, e, d) >= MAX_EDIFICIOS_POR_TIPO) { E.edif[d] = null; E.dan[d] = 0; return; }
  E.dan[d] = 1;
}

function capturar(ctx, d, nuevo, pila, viejo, huboCombate) {
  const { E, R } = ctx;
  limpiarRegion(E, d); E.dueno[d] = nuevo; ponerPila(E, d, nuevo, pila);
  if (huboCombate) E.fort[d] = Math.max(0, E.fort[d] - 1);
  heredarEdificio(ctx, d, nuevo);
  if (viejo < 0) return;
  ctx.evt({ tipo: 'conquista', k: nuevo, contra: viejo, r: d });
  if (E.maravilla && E.maravilla.r === d) { // la Maravilla pasa intacta y su cuenta de turnos empieza de cero
    E.maravilla.k = nuevo; E.maravilla.n = 0; E.maravilla.t0 = ctx.t;
    ctx.evt({ tipo: 'maravilla_cae', k: nuevo, de: viejo });
  }
  if (d === R[viejo].capital && R[viejo].vivo) ctx.caidas.push({ k: viejo, por: nuevo });
}

// Nivel de mejora mas alto entre los tipos que de verdad pelean (lo que la escena muestra como «armas»).
const nivelMaximo = (ctx, k, uni) => uni.reduce((m, n, t) => (n > 0 ? Math.max(m, ctx.R[k].mejoras[t]) : m), 0);

// Todo lo que llega a la region `d` este turno (`grupos`: { k, pila }): los refuerzos del dueno se suman a su guarnicion y los demas reinos atacan.
function resolverRegion(ctx, d, grupos) {
  const { E, R, regs } = ctx, duenoViejo = E.dueno[d];
  for (const g of grupos) if (g.k === duenoViejo) for (let t = 0; t < N_TIPOS; t++) sumarUni(E, d, duenoViejo, t, g.pila[t]); // refuerzo propio
  const atacantes = new Map();
  for (const g of grupos) if (g.k !== duenoViejo) atacantes.set(g.k, sumarPilas([atacantes.get(g.k) ?? pilaVacia(), g.pila]));
  if (!atacantes.size) return;
  const miembro = (k, pila) => ({ k, pila, mejoras: R[k].mejoras, mod: 1 });
  const bandos = [];
  if (duenoViejo >= 0 && tropasDe(E, d) > 0) bandos.push({ miembros: [miembro(duenoViejo, pilaDe(E, d, duenoViejo))], defensor: true, ataca: false });
  for (const [k, pila] of atacantes) bandos.push({ miembros: [miembro(k, pila)], defensor: false, ataca: true });
  if (bandos.length === 1) { const m = bandos[0].miembros[0]; capturar(ctx, d, m.k, m.pila, duenoViejo, false); return; }
  const res = resolverBatalla(bandos, { terr: regs[d].terr, fort: E.fort[d] });
  // Lo que el combate le deja a la escena del video (solo datos): el terreno y la fortaleza de ANTES de la batalla (la conquista la baja despues), cada bando con su fuerza, sus unidades por tipo y su
  // nivel de mejoras («armas»). Los campos de siempre ({ d, k, perdidas }) no cambian.
  const datos = { terr: regs[d].terr, fort: E.fort[d], bandos: res.fichas.map((x) => ({ k: x.k, n: x.n, f: x.f, defensor: x.defensor, armas: nivelMaximo(ctx, x.k, x.uni), uni: x.uni })) };
  const [, segundo] = res.fichas;
  if (res.empate) { // empate: el defensor resiste con 1 unidad; sin defensor, la region queda sin dueno
    const def = res.fichas.find((x) => x.defensor);
    if (def) {
      ponerPila(E, d, def.k, dejarUna(pilaDe(E, d, def.k)));
      ctx.combates.push({ d, k: def.k, perdidas: res.todos - 1, ...datos, resultado: 'empate', quedan: 1 });
      ctx.evt({ tipo: 'repelido', k: segundo.k, contra: def.k, r: d });
    } else {
      limpiarRegion(E, d); E.dueno[d] = -1; E.fort[d] = 0; E.edif[d] = null; E.dan[d] = 0;
      ctx.combates.push({ d, k: -1, perdidas: res.todos, ...datos, resultado: 'empate', quedan: 0 });
    }
    return;
  }
  const ganador = res.ganador, quedan = res.supervivientes.reduce((s, x) => s + sumaPila(x.pila), 0), pila = res.supervivientes[0].pila;
  ctx.combates.push({ d, k: ganador.k, perdidas: res.perdidas, ...datos, resultado: ganador.defensor ? 'repelido' : 'captura', quedan });
  if (ganador.defensor) { ponerPila(E, d, ganador.k, pila); ctx.evt({ tipo: 'repelido', k: segundo.k, contra: ganador.k, r: d }); }
  else capturar(ctx, d, ganador.k, pila, duenoViejo, true);
}

function procesarCaidas(ctx) {
  const { E, R, NR } = ctx;
  for (const c of ctx.caidas) {
    const reino = R[c.k];
    if (!reino.vivo) continue;
    reino.regsAlCaer = regionesDe(E, c.k).length; reino.vivo = false; reino.cayoEn = ctx.t;
    for (const rec of RECURSOS) { R[c.por].stock[rec] += reino.stock[rec]; reino.stock[rec] = 0; }
    for (let i = 0; i < NR; i++) if (E.dueno[i] === c.k) { limpiarRegion(E, i); E.dueno[i] = -1; E.fort[i] = 0; E.edif[i] = null; E.dan[i] = 0; }
    for (const o of R) { o.pactos[c.k] = 0; o.pactoOk[c.k] = false; }
    reino.pactos.fill(0); reino.pactoOk.fill(false); reino.ofertasIn = []; reino.privIn = [];
    ctx.evt({ tipo: 'caida', k: c.k, por: c.por });
  }
}

// Fase 7 del turno: los movimientos validos salen todos a la vez (quien sale deja menos defensa) y luego se resuelve
// cada region disputada en orden de id.
export function movimientos(ctx) {
  const { E } = ctx, llegan = new Map();
  for (const { s, o } of ctx.pend.movimientos) {
    const v = validar(ctx, s, o);
    if (typeof v === 'string') { ctx.mal(s, o.texto, v); continue; }
    for (let t = 0; t < N_TIPOS; t++) if (v.pila[t]) sumarUni(E, o.de, s, t, -v.pila[t]);
    ctx.movs.push({ f: o.de, d: o.a, n: v.n, k: s, uni: v.pila });
    if (!llegan.has(o.a)) llegan.set(o.a, []);
    llegan.get(o.a).push({ k: s, pila: v.pila });
    ctx.bien(s);
  }
  for (const d of [...llegan.keys()].sort((a, b) => a - b)) resolverRegion(ctx, d, llegan.get(d));
  procesarCaidas(ctx);
}
