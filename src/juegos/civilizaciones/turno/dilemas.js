import { fronteraDe } from '../mundo.js';

export function resolverDilema(E, civ, n, explicita, rc) {
  const era = civ.dilemaPendiente;
  if (era === null) return;
  civ.dilemas[era] = n;
  civ.dilemaPendiente = null;
  let region = null;
  if (era === 5 && n === 2) {
    region = fronteraDe(E.mundo, civ.regiones)
      .sort((a, b) => E.mundo.regs[b].flujo.Comida - E.mundo.regs[a].flujo.Comida || a - b)[0] ?? null;
    if (region !== null) civ.regiones.push(region);
  }
  rc.eventos.push({ tipo: 'dilema', s: civ.s, era, opcion: n, predeterminada: !explicita, ...(region !== null ? { region } : {}) });
}
