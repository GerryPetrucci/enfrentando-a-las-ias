import { COMERCIO, RECURSOS_ALMACEN } from '../constantes.js';

export const nuevoComercio = (E, t) => ({ E, t, regalos: [], nuevas: [[], []], aceptaciones: [], liquidado: false });
const desactivado = (ctx) => ctx.E.capas?.comercio === false;

export function regalar(ctx, civ, recurso, n) {
  if (desactivado(ctx)) return 'el comercio esta desactivado';
  if (civ.stock[recurso] < n) return 'no alcanzan los recursos';
  civ.stock[recurso] -= n;
  ctx.regalos.push({ de: civ.s, a: 1 - civ.s, recurso, n });
  return null;
}

export function ofrecer(ctx, civ, o) {
  if (desactivado(ctx)) return 'el comercio esta desactivado';
  if (o.da === o.pide) return 'los recursos deben ser distintos';
  if (o.nDa > COMERCIO.maxPorLado || o.nPide > COMERCIO.maxPorLado) return `maximo ${COMERCIO.maxPorLado} por lado`;
  const nuevas = ctx.nuevas[civ.s];
  if (nuevas.length >= COMERCIO.ofertasPorTurno) return `maximo ${COMERCIO.ofertasPorTurno} ofertas por turno`;
  nuevas.push({ n: nuevas.length + 1, da: o.da, nDa: o.nDa, pide: o.pide, nPide: o.nPide, vence: ctx.t + 1 });
  return null;
}

export function aceptar(ctx, civ, o, fila) {
  if (desactivado(ctx)) return 'el comercio esta desactivado';
  const vigentes = ctx.E.civs[1 - civ.s].ofertas.filter((x) => x.vence === ctx.t);
  if (o.n === null && vigentes.length > 1) return 'indica el numero de oferta (1 o 2)';
  const oferta = o.n === null ? vigentes[0] : vigentes.find((x) => x.n === o.n);
  if (!oferta) return 'la oferta caduco o no existe';
  ctx.aceptaciones.push({ de: 1 - civ.s, a: civ.s, oferta, fila });
  return null;
}

// Todas las aceptaciones leen los saldos al acabar las ordenes propias:
// ni regalos entrantes ni otro trato financian pagos. Si la suma de pagos
// excede un saldo, todos los tratos que lo usan se descartan, sin prioridad.
export function liquidarComercio(ctx, rc) {
  if (ctx.liquidado) return;
  ctx.liquidado = true;
  const { E } = ctx;
  const fondos = E.civs.map((c) => ({ ...c.stock }));
  const descartada = (x, motivo) => { x.fila.estado = 'descartada'; x.fila.motivo = motivo; };
  const candidatas = [];
  for (const x of ctx.aceptaciones) {
    const o = x.oferta;
    if (fondos[x.de][o.da] < o.nDa || fondos[x.a][o.pide] < o.nPide) { descartada(x, 'sin fondos al liquidar'); continue; }
    x.pagos = [{ s: x.de, r: o.da, n: o.nDa }, { s: x.a, r: o.pide, n: o.nPide }];
    candidatas.push(x);
  }
  const sumas = new Map(), repeticiones = new Map();
  for (const x of candidatas) {
    const claveOferta = `${x.de}:${x.oferta.n}`;
    repeticiones.set(claveOferta, (repeticiones.get(claveOferta) ?? 0) + 1);
    for (const p of x.pagos) { const k = `${p.s}:${p.r}`; sumas.set(k, (sumas.get(k) ?? 0) + p.n); }
  }
  const delta = E.civs.map(() => Object.fromEntries(RECURSOS_ALMACEN.map((r) => [r, 0])));
  for (const x of candidatas) {
    const colision = repeticiones.get(`${x.de}:${x.oferta.n}`) > 1
      || x.pagos.some((p) => sumas.get(`${p.s}:${p.r}`) > fondos[p.s][p.r]);
    if (colision) { descartada(x, 'conflicto entre aceptaciones simultaneas'); continue; }
    for (const p of x.pagos) { delta[p.s][p.r] -= p.n; delta[1 - p.s][p.r] += p.n; }
    x.fila.estado = 'aplicada';
    rc.eventos.push({ tipo: 'comercio', de: x.de, a: x.a, ...x.oferta });
  }
  E.civs.forEach((c, s) => { for (const r of RECURSOS_ALMACEN) c.stock[r] += delta[s][r]; });
  for (const g of ctx.regalos) { E.civs[g.a].stock[g.recurso] += g.n; rc.eventos.push({ tipo: 'regalo', ...g }); }
  E.civs.forEach((c) => {
    c.ofertas = ctx.nuevas[c.s];
    for (const o of c.ofertas) rc.eventos.push({ tipo: 'oferta', de: c.s, ...o });
  });
}
