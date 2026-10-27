// Fase 10 (spec 3.8): recalcular, resolver UNA crisis y guardar el cierre.
import { ESTABILIDAD } from '../constantes.js';
import { estabilidadDe } from '../economia.js';
import { rngDe } from '../rng.js';

// Regla comun a secesion, colapso e invasion: sin edificio primero,
// menor id despues; la capital nunca se pierde. Sin candidata no hay perdida.
export function perderRegion(civ) {
  const candidatas = civ.regiones.filter((r) => r !== civ.capital)
    .sort((a, b) => Number(Boolean(civ.edificios[a])) - Number(Boolean(civ.edificios[b])) || a - b);
  const region = candidatas[0];
  if (region === undefined) return null;
  civ.regiones = civ.regiones.filter((r) => r !== region);
  delete civ.edificios[region];
  return region;
}

export function resolverEstabilidad(E, civ, t, rc) {
  civ.estabilidad = estabilidadDe(civ, t);
  if (civ.estabilidad === 0) {
    const genteAntes = civ.poblacion, regiones = [];
    civ.poblacion = Math.max(1, civ.poblacion - Math.ceil(civ.poblacion * ESTABILIDAD.colapsoGente));
    for (let i = 0; i < ESTABILIDAD.colapsoRegiones; i++) {
      const region = perderRegion(civ);
      if (region !== null) regiones.push(region);
    }
    civ.colapsos++;
    civ.estabilidad = ESTABILIDAD.colapsoTras;
    rc.eventos.push({ tipo: 'colapso', s: civ.s, regiones, gentePerdida: genteAntes - civ.poblacion });
  } else if (civ.estabilidad < ESTABILIDAD.critica && rngDe(E.seedMundo, t, 'secesion')() < ESTABILIDAD.probSecesion) {
    const region = perderRegion(civ);
    if (region !== null) rc.eventos.push({ tipo: 'secesion', s: civ.s, region });
  }
  civ.sumaEstabilidad += civ.estabilidad;
  civ.cierres++;
  civ.tecnologiasCierre = [...civ.tecnologias];
}
