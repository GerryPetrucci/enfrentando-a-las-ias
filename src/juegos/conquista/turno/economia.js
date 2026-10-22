// Fases economicas del turno: recoleccion, honor, hambre, ordenes de gasto, regalos y comercio.

import { regionesDe, contarEdificios, sumarUni, uniDe, pila as pilaDe, totalPila } from '../estado.js';
import { COMIDA, HONOR, TURNOS, FORTALEZA, MEJORAS, MERCENARIOS, MAX_EDIFICIOS_POR_TIPO, MARAVILLA, EDIFICIOS, CUARTEL, N_TIPOS } from '../constantes.js';
import { costoDePila, racionesDe } from '../unidades.js';

// 1. Recoleccion: nodos de recurso, cosecha base, granjas y mercados (la mitad si estan danados). Las regiones aisladas (sin camino a la capital) no producen ni cuentan para la cosecha base.
export function recoleccion(ctx) {
  const { E, R, regs, NR } = ctx;
  for (let r = 0; r < NR; r++) {
    const s = E.dueno[r];
    if (s < 0 || ctx.aisladas[r]) continue;
    if (regs[r].rec) R[s].stock[regs[r].rec] += 2;
    const ed = E.edif[r];
    if (ed === 'granja') R[s].stock.Comida += E.dan[r] ? 1 : 2;
    else if (ed === 'mercado') R[s].stock.Oro += E.dan[r] ? 1 : 2;
  }
  const sequia = ctx.t <= E.sequiaHasta, cosecha = ctx.mundo?.tipo === 'cosecha'; // eventos del mundo: la sequia baja la cosecha base a la mitad; la cosecha da +1 Comida por region
  for (const reino of R) {
    if (!reino.vivo) continue;
    const n = regionesDe(E, reino.s).filter((r) => !ctx.aisladas[r]).length, base = Math.floor(n / COMIDA.regionesPorCosecha);
    reino.stock.Comida += (sequia ? Math.floor(base / 2) : base) + (cosecha ? n : 0);
  }
}

// 2. Honor (+1 cada 3 turnos, +1 a cada parte de un pacto cumplido) y fin de los pactos en la muerte subita.
export function honorYPactos(ctx) {
  const { E, R, t, k } = ctx;
  if (t % HONOR.cadaTurnos === 0) for (const r of R) if (r.vivo) r.honor = Math.min(HONOR.maximo, r.honor + HONOR.cumplido);
  for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) {
    if (R[a].pactos[b] === t - 1 && R[a].pactoOk[b] && R[a].vivo && R[b].vivo) { // el pacto termino cumplido
      R[a].pactoOk[b] = R[b].pactoOk[a] = false;
      R[a].honor = Math.min(HONOR.maximo, R[a].honor + HONOR.cumplido);
      R[b].honor = Math.min(HONOR.maximo, R[b].honor + HONOR.cumplido);
      E.stats[a].cumplidos++; E.stats[b].cumplidos++;
      ctx.evt({ tipo: 'pacto_cumplido', k: a, con: b }); // lo lee la escena del video; resumenPublico lo ignora (el texto de las IAs no cambia)
    }
  }
  if (t >= TURNOS - 1) for (const r of R) { r.pactos.fill(0); r.pactoOk.fill(false); } // muerte subita: turnos 29 y 30
  for (const r of R) if (r.deshonrado && r.honor > HONOR.deshonrado) r.deshonrado = false;
}

// 3. Hambre: cada 4 raciones comen 1 Comida (Jinetes e Ingenios pesan 2); si falta, desertan el 10% de cada pila (minimo 1; en una region propia nunca la ultima unidad), primero los Lanceros.
export function hambre(ctx) {
  const { E, R, NR } = ctx;
  for (const reino of R) {
    if (!reino.vivo) continue;
    let raciones = 0;
    for (let r = 0; r < NR; r++) raciones += racionesDe(pilaDe(E, r, reino.s));
    const necesita = Math.ceil(raciones / COMIDA.tropasPorRacion);
    if (reino.stock.Comida >= necesita) { reino.stock.Comida -= necesita; continue; }
    reino.stock.Comida = 0;
    let perdidas = 0;
    for (let r = 0; r < NR; r++) {
      const total = totalPila(E, r, reino.s), minimo = E.dueno[r] === reino.s ? 1 : 0;
      if (total <= minimo) continue;
      let d = Math.min(total - minimo, Math.max(1, Math.round(total * COMIDA.deserta)));
      perdidas += d;
      for (let t = 0; t < N_TIPOS && d > 0; t++) { const q = Math.min(d, uniDe(E, r, reino.s, t)); sumarUni(E, r, reino.s, t, -q); d -= q; }
    }
    if (perdidas) ctx.evt({ tipo: 'hambre', k: reino.s, n: perdidas });
  }
}

// Reclutar una pila de unidades en una region propia: se paga lo que suman sus tipos (cuartel: la mitad; danado: tres cuartos). Los Ingenios solo se reclutan donde hay cuartel.
const AISLADA = 'la region esta aislada de tu capital';

function reclutar(ctx, s, o) {
  const { E, R } = ctx;
  if (!ctx.propia(s, o.region)) return 'la region no es tuya';
  if (ctx.aisladas[o.region]) return AISLADA;
  const cuartel = E.edif[o.region] === 'cuartel';
  if (o.pila[3] > 0 && !cuartel) return 'los Ingenios solo se reclutan en una region con cuartel';
  const costo = costoDePila(o.pila, cuartel ? (E.dan[o.region] ? CUARTEL.danado : CUARTEL.entero) : 1);
  const falta = Object.entries(costo).find(([rec, v]) => R[s].stock[rec] < v);
  if (falta) return `${falta[0]} insuficiente`;
  ctx.pagar(s, costo);
  for (let t = 0; t < N_TIPOS; t++) if (o.pila[t]) sumarUni(E, o.region, s, t, o.pila[t]);
  return null;
}
function contratar(ctx, s, o, usados) {
  const { E, R } = ctx;
  if (!ctx.propia(s, o.region)) return 'la region no es tuya';
  if (ctx.aisladas[o.region]) return AISLADA;
  if (usados + o.n > MERCENARIOS.maximoPorTurno) return `maximo ${MERCENARIOS.maximoPorTurno} mercenarios por turno`;
  const costo = (R[s].honor <= HONOR.deshonrado ? MERCENARIOS.costoDeshonrado : MERCENARIOS.costo) * o.n;
  if (R[s].stock.Oro < costo) return 'Oro insuficiente';
  R[s].stock.Oro -= costo; sumarUni(E, o.region, s, 0, o.n);
  return null;
}
function fortificar(ctx, s, o) {
  const { E } = ctx;
  if (!ctx.propia(s, o.region)) return 'la region no es tuya';
  if (ctx.aisladas[o.region]) return AISLADA;
  const nivel = E.fort[o.region];
  if (nivel >= 3) return 'la fortaleza ya esta al maximo';
  const costo = FORTALEZA[nivel + 1];
  if (!ctx.puede(s, costo)) return 'recursos insuficientes para la fortaleza';
  ctx.pagar(s, costo); E.fort[o.region] = nivel + 1;
  return null;
}
// Mejora de un tipo de unidad (+25 % de fuerza a todas las de ese tipo, 2 niveles): hace falta un cuartel propio.
function mejorar(ctx, s, o) {
  const { E, R } = ctx, nivel = R[s].mejoras[o.unidad];
  if (nivel >= MEJORAS.maximo) return 'esa mejora ya esta al maximo';
  if (!regionesDe(E, s).some((r) => E.edif[r] === 'cuartel' && !ctx.aisladas[r])) return 'hace falta un cuartel para mejorar'; // un cuartel aislado no sirve
  const costo = MEJORAS.costo[nivel];
  if (!ctx.puede(s, costo)) return 'recursos insuficientes para mejorar';
  ctx.pagar(s, costo); R[s].mejoras[o.unidad] = nivel + 1;
  return null;
}
function construir(ctx, s, o) {
  const { E } = ctx;
  if (o.edificio === 'maravilla') {
    if (o.region !== ctx.R[s].capital) return 'la maravilla solo se construye en tu capital';
    if (E.maravilla) return 'ya existe una maravilla';
    if (!ctx.puede(s, MARAVILLA.costo)) return 'recursos insuficientes para la maravilla';
    ctx.pagar(s, MARAVILLA.costo);
    E.maravilla = { r: o.region, k: s, n: 0, t0: ctx.t };
    ctx.evt({ tipo: 'maravilla', k: s, r: o.region });
    return null;
  }
  if (!ctx.propia(s, o.region)) return 'la region no es tuya';
  if (ctx.aisladas[o.region]) return AISLADA;
  if (E.edif[o.region]) return 'ya hay un edificio en esa region';
  if (contarEdificios(E, s, o.edificio) >= MAX_EDIFICIOS_POR_TIPO) return `maximo ${MAX_EDIFICIOS_POR_TIPO} edificios de ese tipo`;
  const costo = EDIFICIOS[o.edificio].costo;
  if (!ctx.puede(s, costo)) return 'recursos insuficientes para construir';
  ctx.pagar(s, costo); E.edif[o.region] = o.edificio; E.dan[o.region] = 0; E.stats[s].edificios++;
  return null;
}
function regalar(ctx, s, o) {
  if (!ctx.activa(o.reino) || o.reino === s) return 'el reino no existe, ya cayo o eres tu';
  if (ctx.R[s].stock[o.recurso] < o.n) return 'no tienes lo que regalas';
  ctx.R[s].stock[o.recurso] -= o.n; // se descuenta ya; llega al destinatario al final de la fase
  ctx.pend.regalos.push({ de: s, a: o.reino, recurso: o.recurso, n: o.n });
  return null;
}
function ofrecer(ctx, s, o, hechas) {
  if (!ctx.activa(o.reino) || o.reino === s) return 'el reino no existe, ya cayo o eres tu';
  if (o.doy === o.pido) return 'los dos recursos son iguales';
  if (o.dc > 10 || o.pc > 10) return 'maximo 10 por lado';
  if (hechas >= 2) return 'maximo 2 ofertas por turno';
  if (ctx.R[s].stock[o.doy] < o.dc) return 'no tienes lo que ofreces';
  const lista = (ctx.pend.ofertas[o.reino] ??= []).filter((x) => x.de !== s); // una pendiente por destinatario
  lista.push({ de: s, doy: o.doy, dc: o.dc, pido: o.pido, pc: o.pc });
  ctx.pend.ofertas[o.reino] = lista;
  return null;
}

// 4 y 5. Ordenes de cada reino, en el orden dado y una respuesta tras otra. Gastan, regalan u ofrecen; mover, romper y
// aceptar se dejan para sus fases. Todo o nada: una orden sin recursos suficientes se descarta con su motivo.
export function ordenesEconomicas(ctx) {
  const { E, k } = ctx;
  for (let s = 0; s < k; s++) {
    const j = ctx.jugadas[s];
    if (!ctx.activa(s) || !j) continue;
    if (j.invalida) {
      E.stats[s].invalidas++; ctx.obed[s].total += 1;
      ctx.mal(s, '(respuesta completa)', j.motivo ?? 'respuesta invalida');
      continue;
    }
    ctx.obed[s].total += j.ordenes.length + j.descartadas.length + j.privados.length;
    for (const d of j.descartadas) ctx.mal(s, d.texto, d.motivo);
    let mercenarios = 0, ofertas = 0;
    for (const o of j.ordenes) {
      let motivo = null;
      switch (o.tipo) {
        case 'reclutar': motivo = reclutar(ctx, s, o); break;
        case 'mercenarios': motivo = contratar(ctx, s, o, mercenarios); if (!motivo) mercenarios += o.n; break;
        case 'fortificar': motivo = fortificar(ctx, s, o); break;
        case 'mejorar': motivo = mejorar(ctx, s, o); break;
        case 'construir': motivo = construir(ctx, s, o); break;
        case 'regalar': motivo = regalar(ctx, s, o); break;
        case 'ofrecer': motivo = ofrecer(ctx, s, o, ofertas); if (!motivo) ofertas++; break;
        case 'aceptar': ctx.pend.aceptaciones.push({ s, o }); continue;
        case 'romper': ctx.pend.rupturas.push({ s, o }); continue;
        case 'mover': ctx.pend.movimientos.push({ s, o }); continue;
        case 'atacar': ctx.pend.ataques.push({ s, o }); continue;
        default: motivo = 'orden no soportada';
      }
      if (motivo) ctx.mal(s, o.texto, motivo); else ctx.bien(s);
    }
  }
}

// Al final de la economia: llegan los regalos y se ejecutan las aceptaciones de ofertas (todo o nada).
export function entregas(ctx) {
  const { E, R } = ctx;
  for (const g of ctx.pend.regalos) { R[g.a].stock[g.recurso] += g.n; ctx.regalos.push(g); }
  for (const { s, o } of ctx.pend.aceptaciones) {
    const oferta = R[s].ofertasIn.find((x) => x.de === o.reino), G = oferta ? R[oferta.de] : null;
    if (!oferta || !G.vivo) { ctx.mal(s, o.texto, 'no tienes una oferta de ese reino'); continue; }
    if (G.stock[oferta.doy] < oferta.dc || R[s].stock[oferta.pido] < oferta.pc) { ctx.mal(s, o.texto, 'la oferta no se cumple: alguno ya no tiene lo ofrecido'); continue; }
    G.stock[oferta.doy] -= oferta.dc; R[s].stock[oferta.doy] += oferta.dc;
    R[s].stock[oferta.pido] -= oferta.pc; G.stock[oferta.pido] += oferta.pc;
    R[s].ofertasIn = R[s].ofertasIn.filter((x) => x !== oferta);
    E.stats[s].comercios++; E.stats[oferta.de].comercios++;
    ctx.evt({ tipo: 'comercio', k: oferta.de, con: s, doy: oferta.doy, dc: oferta.dc, pido: oferta.pido, pc: oferta.pc });
    ctx.bien(s);
  }
}
