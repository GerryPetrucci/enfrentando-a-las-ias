// Movimientos simultaneos, combate, herencia de edificios, traspaso de la Maravilla y caida de reinos.

import { aliado, contarEdificios, regionesDe } from '../estado.js';
import { RECURSOS, MAX_EDIFICIOS_POR_TIPO } from '../constantes.js';

// Devuelve un texto (motivo) si el movimiento no vale, o { caballos } si vale.
function validar(ctx, s, o) {
  const { E, R, regs, NR } = ctx;
  if (!ctx.propia(s, o.de)) return 'la region de origen no es tuya';
  if (o.a >= NR) return 'la region de destino no existe';
  if (o.de === o.a) return 'origen y destino son la misma region';
  if (E.tropas[o.de] - o.n < 1) return 'debe quedar al menos 1 tropa en la region de origen';
  let caballos = 0;
  if (!regs[o.de].vecinos.includes(o.a)) {
    const dosPasos = regs[o.de].vecinos.some((w) => regs[w].vecinos.includes(o.a));
    if (!dosPasos) return 'la region de destino no es vecina';
    caballos = Math.ceil(o.n / 3);
    if (R[s].stock.Caballos < caballos) return 'faltan Caballos para mover a 2 regiones';
  }
  const duenoDestino = E.dueno[o.a];
  if (duenoDestino >= 0 && duenoDestino !== s && aliado(E, s, duenoDestino, ctx.t)) return 'esa region es de un aliado (usa romper antes)';
  return { caballos };
}

// El edificio pasa al conquistador danado (50% de su efecto); si ya tiene 3 de ese tipo, se destruye.
function heredarEdificio(ctx, d, nuevo) {
  const { E } = ctx, e = E.edif[d];
  if (!e) return;
  if (contarEdificios(E, nuevo, e, d) >= MAX_EDIFICIOS_POR_TIPO) { E.edif[d] = null; E.dan[d] = 0; return; }
  E.dan[d] = 1;
}

function capturar(ctx, d, nuevo, n, viejo, huboCombate) {
  const { E, R } = ctx;
  E.dueno[d] = nuevo; E.tropas[d] = n;
  if (huboCombate) E.fort[d] = Math.max(0, E.fort[d] - 1);
  heredarEdificio(ctx, d, nuevo);
  if (viejo < 0) return;
  ctx.evt({ tipo: 'conquista', k: nuevo, contra: viejo, r: d });
  if (E.maravilla && E.maravilla.r === d) { // la Maravilla pasa intacta y su cuenta de 5 turnos empieza de cero
    E.maravilla.k = nuevo; E.maravilla.n = 0; E.maravilla.t0 = ctx.t;
    ctx.evt({ tipo: 'maravilla_cae', k: nuevo, de: viejo });
  }
  if (d === R[viejo].capital && R[viejo].vivo) ctx.caidas.push({ k: viejo, por: nuevo });
}

function resolverRegion(ctx, d, grupos) {
  const { E } = ctx, duenoViejo = E.dueno[d];
  for (const g of grupos) if (g.k === duenoViejo) E.tropas[d] += g.n; // refuerzo propio
  const atacantes = new Map();
  for (const g of grupos) if (g.k !== duenoViejo) atacantes.set(g.k, (atacantes.get(g.k) ?? 0) + g.n);
  if (!atacantes.size) return;
  const bandos = [];
  if (duenoViejo >= 0 && E.tropas[d] > 0) bandos.push({ k: duenoViejo, n: E.tropas[d], f: ctx.defensa(d), defensor: true });
  for (const [k, n] of atacantes) bandos.push({ k, n, f: ctx.ataque(k, n), defensor: false });
  bandos.sort((a, b) => b.f - a.f || Number(b.defensor) - Number(a.defensor) || a.k - b.k);
  if (bandos.length === 1) { capturar(ctx, d, bandos[0].k, bandos[0].n, duenoViejo, false); return; }
  const [a, b] = bandos, todos = bandos.reduce((s, x) => s + x.n, 0);
  // Lo que el combate le deja a la escena del video (solo datos): el terreno y la fortaleza de ANTES de la batalla (la conquista la baja despues) y cada bando con su
  // nivel de armas. Los campos de siempre ({ d, k, perdidas }) no cambian.
  const datos = { terr: ctx.regs[d].terr, fort: E.fort[d], bandos: bandos.map((x) => ({ ...x, armas: ctx.R[x.k].armas })) };
  if (a.f === b.f) { // empate: el defensor resiste con 1 tropa; sin defensor, la region queda sin dueno
    const def = bandos.find((x) => x.defensor);
    if (def) { E.tropas[d] = 1; ctx.combates.push({ d, k: def.k, perdidas: todos - 1, ...datos, resultado: 'empate', quedan: 1 }); ctx.evt({ tipo: 'repelido', k: b.k, contra: def.k, r: d }); }
    else { E.dueno[d] = -1; E.tropas[d] = 0; E.fort[d] = 0; E.edif[d] = null; E.dan[d] = 0; ctx.combates.push({ d, k: -1, perdidas: todos, ...datos, resultado: 'empate', quedan: 0 }); }
    return;
  }
  const quedan = Math.max(1, Math.floor(a.n * (1 - b.f / a.f)));
  ctx.combates.push({ d, k: a.k, perdidas: a.n - quedan + b.n, ...datos, resultado: a.defensor ? 'repelido' : 'captura', quedan });
  if (a.defensor) { E.tropas[d] = quedan; ctx.evt({ tipo: 'repelido', k: b.k, contra: a.k, r: d }); }
  else capturar(ctx, d, a.k, quedan, duenoViejo, true);
}

function procesarCaidas(ctx) {
  const { E, R, NR } = ctx;
  for (const c of ctx.caidas) {
    const reino = R[c.k];
    if (!reino.vivo) continue;
    reino.regsAlCaer = regionesDe(E, c.k).length; reino.vivo = false; reino.cayoEn = ctx.t;
    for (const rec of RECURSOS) { R[c.por].stock[rec] += reino.stock[rec]; reino.stock[rec] = 0; }
    for (let i = 0; i < NR; i++) if (E.dueno[i] === c.k) { E.dueno[i] = -1; E.tropas[i] = 0; E.fort[i] = 0; E.edif[i] = null; E.dan[i] = 0; }
    for (const o of R) { o.pactos[c.k] = 0; o.pactoOk[c.k] = false; }
    reino.pactos.fill(0); reino.pactoOk.fill(false); reino.ofertasIn = []; reino.privIn = [];
    ctx.evt({ tipo: 'caida', k: c.k, por: c.por });
  }
}

// Fase 7 del turno: los movimientos validos salen todos a la vez (quien sale deja menos defensa) y luego se resuelve
// cada region disputada en orden de id.
export function movimientos(ctx) {
  const { E, R } = ctx, llegan = new Map();
  for (const { s, o } of ctx.pend.movimientos) {
    const v = validar(ctx, s, o);
    if (typeof v === 'string') { ctx.mal(s, o.texto, v); continue; }
    E.tropas[o.de] -= o.n; R[s].stock.Caballos -= v.caballos;
    ctx.movs.push({ f: o.de, d: o.a, n: o.n, k: s });
    if (!llegan.has(o.a)) llegan.set(o.a, []);
    llegan.get(o.a).push({ k: s, n: o.n });
    ctx.bien(s);
  }
  for (const d of [...llegan.keys()].sort((a, b) => a - b)) resolverRegion(ctx, d, llegan.get(d));
  procesarCaidas(ctx);
}
