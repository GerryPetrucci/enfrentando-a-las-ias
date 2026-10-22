// Fase 0 del turno: el evento del mundo (si toca). Es igual para todos los reinos y sale del calendario del seed, no de lo que hagan los reinos; los reinos lo vieron anunciado (Presagio).
//   sequia: la cosecha base baja a la mitad (lo aplica `recoleccion` mientras ctx.t <= E.sequiaHasta) · cosecha: +1 Comida por region no aislada (lo aplica `recoleccion`, solo este turno)
//   peste: el reino con mas unidades pierde EVENTOS.peste de ellas · caravana: el reino con menos regiones recibe EVENTOS.caravana.

import { EVENTOS, N_TIPOS } from '../constantes.js';
import { eventoDe } from '../equilibrio.js';
import { regionesDe, totalUnidades, pila as pilaDe, sumarUni } from '../estado.js';

// Reparte `perdida` unidades entre las pilas del reino k por el metodo del mayor resto (cada pila pierde el piso de su 15 % y las que faltan van a los mayores restos), sin vaciar una region propia.
// Devuelve cuantas unidades perdio de verdad.
function perderUnidades(ctx, k, perdida) {
  const { E, NR } = ctx, pilas = [];
  for (let r = 0; r < NR; r++) {
    const hay = pilaDe(E, r, k);
    for (let t = 0; t < N_TIPOS; t++) if (hay[t] > 0) pilas.push({ r, t, n: hay[t], cuota: hay[t] * EVENTOS.peste });
  }
  for (const p of pilas) { p.pierde = Math.floor(p.cuota + 1e-9); p.resto = p.cuota - p.pierde; }
  let faltan = perdida - pilas.reduce((s, p) => s + p.pierde, 0);
  for (const p of [...pilas].sort((a, b) => b.resto - a.resto || a.r - b.r || a.t - b.t)) { if (faltan <= 0) break; p.pierde++; faltan--; }
  let total = 0;
  for (let r = 0; r < NR; r++) {
    const delRegion = pilas.filter((p) => p.r === r);
    if (!delRegion.length) continue;
    let sale = delRegion.reduce((s, p) => s + Math.min(p.pierde, p.n), 0);
    if (E.dueno[r] === k) sale = Math.min(sale, delRegion.reduce((s, p) => s + p.n, 0) - 1); // el dueno conserva al menos 1 unidad
    for (const p of [...delRegion].sort((a, b) => b.pierde - a.pierde || a.t - b.t)) {
      const q = Math.min(p.pierde, p.n, sale);
      if (q > 0) { sumarUni(E, r, k, p.t, -q); sale -= q; total += q; }
    }
  }
  return total;
}

export function eventosDelMundo(ctx) {
  const { E, R } = ctx, ev = eventoDe(E, ctx.t);
  if (!ev) return;
  ctx.mundo = ev;
  const vivos = R.filter((r) => r.vivo);
  const afectados = [];
  if (ev.tipo === 'sequia') E.sequiaHasta = ctx.t + EVENTOS.sequiaTurnos - 1;
  else if (ev.tipo === 'peste') {
    const mas = Math.max(...vivos.map((r) => totalUnidades(E, r.s)));
    for (const r of vivos) {
      const total = totalUnidades(E, r.s);
      if (total !== mas) continue;
      const n = perderUnidades(ctx, r.s, Math.round(total * EVENTOS.peste + 1e-9));
      afectados.push({ k: r.s, n });
    }
  } else if (ev.tipo === 'caravana') {
    const menos = Math.min(...vivos.map((r) => regionesDe(E, r.s).length));
    for (const r of vivos) {
      if (regionesDe(E, r.s).length !== menos) continue;
      for (const [rec, n] of Object.entries(EVENTOS.caravana)) r.stock[rec] += n;
      afectados.push({ k: r.s });
    }
  }
  ctx.evt({ tipo: 'evento', evento: ev.tipo, afectados });
}
