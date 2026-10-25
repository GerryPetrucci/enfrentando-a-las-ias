// Contrajuego publico: ocupar una region vecina con tropas puede cercar la
// Maravilla sin conquistar la capital. Los pactos vigentes impiden el cerco.
import { MARAVILLA } from './constantes.js';
import { totalPila, aliado } from './estado.js';

export function cercosDeMaravilla(E, t = E.turno + 1) {
  const m = E.maravilla;
  const umbral = E.cercoMaravilla ?? MARAVILLA.cerco;
  if (!m || !(umbral > 0)) return [];
  const cercos = [];
  for (const r of E.mapa.regs[m.r].vecinos) for (let k = 0; k < E.k; k++) {
    if (k !== m.k && E.reinos[k].vivo && !aliado(E, k, m.k, t) && totalPila(E, r, k) >= umbral) cercos.push({ r, k });
  }
  return cercos;
}
