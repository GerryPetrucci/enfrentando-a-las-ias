import { avisosDe, opcionesEvento } from '../avisos.js';
import { resolverEvento } from './eventos.js';
import { resolverDilema } from './dilemas.js';

export function resolverRespuestas(E, civ, jugada, t, rc) {
  const { evento, invasion } = avisosDe(E, t);
  let dilema = null;
  for (const o of jugada.ordenes.filter((o) => o.tipo === 'responder' || o.tipo === 'dilema')) {
    let motivo = null;
    if (o.tipo === 'dilema') {
      if (civ.dilemaPendiente === null) motivo = 'no hay un dilema pendiente';
      else dilema = o.n;
    } else if (o.clave === 'invasion') {
      if (!invasion) motivo = 'no hay una invasion vigente';
      else if (o.n > 2) motivo = 'la invasion solo tiene opciones 1 y 2';
      else civ.respuestasInvasiones[invasion.turno] = o.n;
    } else if (!evento || (o.clave !== null && o.clave !== evento.id)) motivo = 'no hay un evento ni presagio vigente con esa clave';
    else if (!opcionesEvento(civ, evento.id).some((op) => op.n === o.n)) motivo = 'esa opcion no existe para el evento';
    else civ.respuestasEventos[evento.turno] = o.n;
    rc.civs[civ.s].ordenes.push({ texto: o.texto, tipo: o.tipo, estado: motivo ? 'descartada' : 'aplicada', ...(motivo ? { motivo } : {}) });
  }
  if (evento?.turno === t) {
    const n = civ.respuestasEventos[t];
    resolverEvento(E, civ, evento, n ?? 1, n !== undefined, rc);
    delete civ.respuestasEventos[t];
  }
  if (E.capas?.crisis !== false) resolverDilema(E, civ, dilema ?? 1, dilema !== null, rc);
}
