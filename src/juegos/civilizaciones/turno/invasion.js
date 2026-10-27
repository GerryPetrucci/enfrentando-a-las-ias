import { GUARDIAS, TRIBUTO_POR_FUERZA, INVASION } from '../constantes.js';
import { modificadores } from '../economia.js';
import { perderRegion } from './estabilidad.js';

export function reclutar(civ, n, m, reclutados) {
  if (reclutados + n > GUARDIAS.maxPorTurno) return `maximo ${GUARDIAS.maxPorTurno} Guardias por turno`;
  const divisor = m.baratoGuardias ? 2 : 1;
  const comida = Math.ceil(n * GUARDIAS.Comida / divisor), hierro = Math.ceil(n * GUARDIAS.Hierro / divisor);
  if (civ.stock.Comida < comida || civ.stock.Hierro < hierro) return 'no alcanzan Comida o Hierro';
  civ.stock.Comida -= comida; civ.stock.Hierro -= hierro; civ.guardias += n;
  return null;
}

export function defensaDe(civ, t, m = modificadores(civ, t)) {
  return civ.guardias * m.guardias * Math.max(0, 1 + m.muralla + m.defensa);
}

export function resolverInvasion(E, civ, invasion, n, explicita, rc) {
  const { turno, fuerza } = invasion, costo = fuerza * TRIBUTO_POR_FUERZA;
  const defensa = defensaDe(civ, turno), tributoInsuficiente = n === 2 && civ.stock.Oro < costo;
  let resultado, region = null, gentePerdida = 0;
  if (n === 2 && !tributoInsuficiente) {
    civ.stock.Oro -= costo; resultado = 'tributo';
  } else if (defensa >= fuerza) {
    resultado = 'repelida'; civ.culturaAcumulada += INVASION.repelida.cultura;
  } else {
    civ.stock.Comida -= Math.ceil(civ.stock.Comida * INVASION.saqueo.comida);
    civ.stock.Oro -= Math.ceil(civ.stock.Oro * INVASION.saqueo.oro);
    resultado = 'saqueo';
    if (defensa < fuerza / 2) {
      resultado = 'derrota'; region = perderRegion(civ);
      const antes = civ.poblacion;
      civ.poblacion = Math.max(1, antes - Math.ceil(antes * INVASION.derrota.gente));
      gentePerdida = antes - civ.poblacion;
    }
  }
  rc.eventos.push({ tipo: 'invasion', s: civ.s, fuerza, defensa, opcion: n, predeterminada: !explicita,
    tributoInsuficiente, resultado, region, gentePerdida });
}
