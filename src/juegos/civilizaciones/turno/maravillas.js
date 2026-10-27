import { MARAVILLA, MARAVILLAS, MARAVILLA_DEVUELTA } from '../constantes.js';
import { rngDe } from '../rng.js';

const total = (xs) => Object.values(xs).reduce((a, n) => a + n, 0);
export const construida = (E, id) => E.civs.some((c) => c.maravillas.some((m) => m.id === id));
export function avanceMaravilla(civ, id) {
  return Math.floor(100 * total(civ.proyectosMaravillas[id]?.invertido ?? {}) / total(MARAVILLA[id].costo));
}

export function invertir(E, civ, id, recurso, n, t) {
  if (E.capas?.carrera === false) return 'la carrera esta desactivada';
  const m = MARAVILLA[id];
  if (!m) return 'Maravilla desconocida';
  if (construida(E, id)) return 'la Maravilla ya esta construida';
  if (!civ.tecnologias.includes(m.tec)) return `falta la tecnologia ${m.tec}`;
  if (!m.costo[recurso]) return 'ese recurso no es parte del costo';
  const proyecto = civ.proyectosMaravillas[id];
  const falta = m.costo[recurso] - (proyecto?.invertido[recurso] ?? 0);
  if (falta <= 0) return 'ese recurso ya esta cubierto';
  if (civ.stock[recurso] < n) return 'no alcanzan los recursos';
  const gasto = Math.min(n, falta);
  const p = proyecto ?? { inicio: t, invertido: {} };
  p.invertido[recurso] = (p.invertido[recurso] ?? 0) + gasto;
  civ.stock[recurso] -= gasto;
  civ.proyectosMaravillas[id] = p;
  return null;
}

// Fase 9: todas las inversiones ya estan hechas; Estabilidad aun es la
// del cierre anterior. Se ordenan asientos solo para asignar el dado comun.
export function resolverMaravillas(E, t, rc) {
  if (E.capas?.carrera === false) return;
  const civs = [...E.civs].sort((a, b) => a.s - b.s);
  for (const m of MARAVILLAS) {
    if (construida(E, m.id)) continue;
    const listas = civs.filter((c) => Object.entries(m.costo).every(([r, n]) => (c.proyectosMaravillas[m.id]?.invertido[r] ?? 0) >= n));
    if (!listas.length) continue;
    let ganador = listas[0];
    if (listas.length === 2) {
      if (listas[0].estabilidad !== listas[1].estabilidad) ganador = listas[0].estabilidad > listas[1].estabilidad ? listas[0] : listas[1];
      else ganador = listas[rngDe(E.seedMundo, t, `maravilla-${m.id}`)() < 0.5 ? 0 : 1];
    }
    const inicios = civs.map((c) => c.proyectosMaravillas[m.id]?.inicio ?? null);
    const reembolsos = civs.map((c) => {
      const p = c.proyectosMaravillas[m.id];
      const oro = c.s === ganador.s || !p ? 0 : total(p.invertido) * MARAVILLA_DEVUELTA;
      c.stock.Oro += oro; delete c.proyectosMaravillas[m.id];
      return oro;
    });
    ganador.maravillas.push({ id: m.id, desde: t + 1 });
    rc.eventos.push({ tipo: 'maravilla', id: m.id, ganador: ganador.s, inicios, reembolsos,
      disputada: inicios.every((x) => x !== null), simultanea: inicios.every((x) => x !== null) && inicios[0] === inicios[1] });
  }
}
