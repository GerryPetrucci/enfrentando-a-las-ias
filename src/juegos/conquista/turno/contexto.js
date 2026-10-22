// Contexto de un turno: lo que comparten todas las fases (estado, turno, registros del turno y ayudas chicas).

import { TERRENO, ARMAS } from '../constantes.js';
import { tropasDe } from '../estado.js';

export function nuevoContexto(E, jugadas = []) {
  const k = E.k;
  const ctx = {
    E, k, t: E.turno + 1, R: E.reinos, regs: E.mapa.regs, NR: E.mapa.regs.length, jugadas,
    vivosAlInicio: E.reinos.map((r) => r.vivo),
    eventos: [], movs: [], combates: [], mensajes: [], privados: [], regalos: [],
    descartes: Array.from({ length: k }, () => []),
    obed: Array.from({ length: k }, () => ({ validas: 0, total: 0 })),
    pend: { regalos: [], aceptaciones: [], rupturas: [], movimientos: [], ofertas: {} },
    caidas: [],
  };
  ctx.evt = (e) => { ctx.eventos.push({ ...e, t: ctx.t }); };
  ctx.bien = (s) => { ctx.obed[s].validas++; };
  ctx.mal = (s, orden, motivo) => { ctx.descartes[s].push({ orden, motivo }); };
  ctx.puede = (s, costo) => Object.entries(costo).every(([r, v]) => ctx.R[s].stock[r] >= v);
  ctx.pagar = (s, costo) => { for (const [r, v] of Object.entries(costo)) ctx.R[s].stock[r] -= v; };
  ctx.propia = (s, r) => Number.isInteger(r) && r >= 0 && r < ctx.NR && E.dueno[r] === s;
  ctx.activa = (s) => ctx.R[s]?.vivo === true;
  ctx.defensa = (r) => tropasDe(E, r) * (1 + 0.5 * E.fort[r]) * TERRENO[ctx.regs[r].terr];
  ctx.ataque = (s, n) => n * (1 + ARMAS.bono * ctx.R[s].armas);
  return ctx;
}
