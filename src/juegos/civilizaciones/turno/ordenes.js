// Fase 3: las ordenes economicas de cada civilizacion, con sus propias reglas y en un orden fijo (spec 5): asignar, colonizar, construir, reclutar, invertir, investigar,
// regalar, ofrecer y, al final, aceptar. Cada orden se aplica o se descarta CON MOTIVO (queda en el registro: seguir el formato es parte de lo que se mide) y el resto se aplica.
// Las dos civilizaciones se resuelven con las mismas reglas y ninguna orden se financia con lo que el rival transfiera en este turno.

import { normalizarReparto, modificadores } from '../economia.js';
import { investigar } from '../tecnologia.js';
import { construir, colonizar } from '../edificios.js';

const ORDEN_DE_FASE = ['asignar', 'colonizar', 'construir', 'reclutar', 'invertir', 'investigar', 'regalar', 'ofrecer', 'aceptar'];

// Ordenes que existen en el parser pero cuyo motor llega en una capa posterior (spec 12): se descartan con ese motivo en vez de fingir que se aplicaron.
const POR_CAPA = { reclutar: 2, invertir: 3, regalar: 4, ofrecer: 4, aceptar: 4 };

export function ejecutarOrdenes(E, civ, jugada, rc, t) {
  const ordenes = jugada.ordenes.map((o, i) => ({ o, i })).sort((a, b) => ORDEN_DE_FASE.indexOf(a.o.tipo) - ORDEN_DE_FASE.indexOf(b.o.tipo) || a.i - b.i).map((x) => x.o);
  let colonizadas = 0;
  const m = modificadores(civ, t);
  for (const o of ordenes) {
    let motivo = null;
    switch (o.tipo) {
      case 'asignar': civ.reparto = normalizarReparto(civ.reparto, o.reparto); break;
      case 'colonizar': motivo = colonizar(civ, E.mundo, o.region, m, colonizadas); if (!motivo) colonizadas++; break;
      case 'construir': motivo = construir(civ, o.region, o.edificio, t, m); break;
      case 'investigar': motivo = investigar(civ, o.tec, m.proyectos); break;
      case 'dilema': motivo = 'no hay un dilema pendiente'; break;
      case 'responder': motivo = 'no hay un evento ni una invasion a los que responder'; break;
      default: motivo = POR_CAPA[o.tipo] ? `la orden ${o.tipo} todavia no esta disponible (capa ${POR_CAPA[o.tipo]})` : 'orden desconocida';
    }
    rc.ordenes.push({ texto: o.texto, tipo: o.tipo, estado: motivo ? 'descartada' : 'aplicada', ...(motivo ? { motivo } : {}) });
  }
}

// Cuenta lo leido: cada orden (aplicada o descartada, incluidas las que el parser no pudo leer) suma al total y las aplicadas a las validas.
export function contarOrdenes(civ, jugada, rc) {
  const leidas = rc.ordenes.length, aplicadas = rc.ordenes.filter((o) => o.estado === 'aplicada').length;
  civ.stats.total += leidas + jugada.descartadas.length;
  civ.stats.validas += aplicadas;
  civ.stats.descartadas += leidas - aplicadas + jugada.descartadas.length;
  if (jugada.invalida) civ.stats.invalidas++;
}
