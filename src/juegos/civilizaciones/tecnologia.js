// Tecnologias, eras y difusion (spec 3.4b y 5, fase 5). Las dos civilizaciones leen la MISMA instantanea de difusion (las tecnologias que cada una conocia al cerrar
// el turno anterior): ni la que se resuelve primero ni la segunda ganan descuento por el orden. El costo con descuento es aritmetica entera (C09).

import { TEC, TECNOLOGIAS, COSTO_TECNOLOGIA, DIFUSION, TECNOLOGIAS_PARA_ERA, ERAS, DILEMAS } from './constantes.js';
import { ceilDiv } from './economia.js';
import { cumpleNodo } from './temporada.js';

// Costo vigente de una tecnologia para `civ`: el de su era, o (costo x 7 + 9) div 10 si el rival YA la conocia al cierre del turno anterior.
export function costoVigente(id, rival) {
  const base = COSTO_TECNOLOGIA[TEC[id].era - 1];
  return rival.tecnologiasCierre.includes(id) ? ceilDiv(base * DIFUSION.num, DIFUSION.den) : base;
}

export const previaDe = (id) => {
  const t = TEC[id];
  return t.era === 1 ? null : TECNOLOGIAS.find((x) => x.rama === t.rama && x.era === t.era - 1).id;
};

// Se puede investigar: no la conoces, es de tu era o anterior y conoces la previa de su rama.
export function disponible(civ, id) {
  const t = TEC[id];
  return Boolean(t) && !civ.tecnologias.includes(id) && t.era <= civ.era
    && (civ.temporada ? cumpleNodo(civ, id) : t.era === 1 || civ.tecnologias.includes(previaDe(id)));
}

export const disponibles = (civ) => TECNOLOGIAS.filter((t) => disponible(civ, t.id)).map((t) => t.id);

// `investigar TEC` (fase 3). Devuelve null si se aplico o el motivo. Una tecnologia que ya es un proyecto no hace nada; si ya hay `cupo` proyectos, reemplaza al mas
// nuevo y su progreso vuelve a la reserva de Ciencia (nada se pierde en silencio).
export function investigar(civ, id, cupo) {
  if (!TEC[id]) return 'tecnologia desconocida';
  if (civ.tecnologias.includes(id)) return 'ya la conoces';
  if (civ.temporada && !disponible(civ, id)) return `faltan requisitos de temporada para ${id}`;
  if (!disponible(civ, id)) return TEC[id].era > civ.era ? `es de la era ${TEC[id].era} y estas en la ${civ.era}` : `te falta ${TEC[previaDe(id)].nombre}`;
  if (civ.proyectos.some((p) => p.tec === id)) return null;
  if (civ.proyectos.length >= cupo) civ.reservaCiencia += civ.proyectos.pop().progreso;
  civ.proyectos.push({ tec: id, progreso: 0 });
  return null;
}

// Fase 5: la Ciencia del turno (ya sumada a la reserva) se reparte en los proyectos en el orden de la lista; el primero hasta completarse, el resto despues.
// Si el progreso supera el costo vigente (porque el rival la aprendio y bajo), el exceso vuelve a la reserva. Devuelve las tecnologias que se completaron.
export function resolverInvestigacion(civ, rival) {
  const hechas = [];
  for (const p of civ.proyectos) {
    const costo = costoVigente(p.tec, rival);
    const gasto = Math.min(civ.reservaCiencia, Math.max(0, costo - p.progreso));
    civ.reservaCiencia -= gasto;
    p.progreso += gasto;
    if (p.progreso >= costo) { civ.reservaCiencia += p.progreso - costo; p.progreso = costo; hechas.push(p.tec); }
  }
  civ.proyectos = civ.proyectos.filter((p) => !hechas.includes(p.tec));
  civ.tecnologias.push(...hechas);
  return hechas;
}

// Se pasa a la era E+1 al conocer 4 de las 6 tecnologias de la era E. Devuelve las eras nuevas; entrar a una era con dilema deja `dilemaPendiente`.
export function actualizarEra(civ) {
  const nuevas = [];
  while (civ.era < ERAS && (civ.temporada ? cumpleNodo(civ, `A${civ.era + 1}`)
    : civ.tecnologias.filter((id) => TEC[id].era === civ.era).length >= TECNOLOGIAS_PARA_ERA)) {
    civ.era++;
    nuevas.push(civ.era);
    if (DILEMAS[civ.era]) civ.dilemaPendiente = civ.era;
  }
  return nuevas;
}
