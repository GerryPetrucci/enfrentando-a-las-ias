// El turno de la Carrera de civilizaciones (spec 5): una cronologia unica de 10 fases. Las dos civilizaciones responden a la vez y NINGUNA regla depende del orden de
// asiento: cada fase se calcula para las dos con las mismas reglas y los mismos dados, y lo unico compartido (la difusion, y mas adelante las Maravillas, los regalos y las
// ofertas) tiene una regla simetrica. Cada efecto se aplica una sola vez y en un solo lugar.
//
//   0 aviso   1 fundacion   2 respuestas, eventos y dilemas   3 ordenes economicas   4 produccion   5 investigacion y difusion   6 crecimiento
//   7 invasion   8 mantenimiento   9 Maravillas   10 cierre (Estabilidad, secesion y colapso, Indice, registro)
// Capas 1 a 4 activas: nucleo, crisis, Maravillas y comercio.

import { RECURSOS_ALMACEN, TURNOS, INDICE, HAMBRE } from '../constantes.js';
import { fundar } from './fundacion.js';
import { ejecutarOrdenes, contarOrdenes } from './ordenes.js';
import { modificadores, desgloseProduccion, espacioDe } from '../economia.js';
import { resumenOrdenes } from '../informacion.js';
import { resolverEstabilidad } from './estabilidad.js';
import { resolverInvestigacion, actualizarEra } from '../tecnologia.js';
import { indiceDe } from '../indice.js';
import { instantanea } from '../estado.js';
import { rngDe } from '../rng.js';
import { avisosDe } from '../avisos.js';
import { resolverRespuestas } from './respuestas.js';
import { resolverInvasion } from './invasion.js';
import { resolverMaravillas } from './maravillas.js';
import { nuevoComercio, liquidarComercio } from './comercio.js';

const jugadaVacia = () => ({ invalida: true, motivo: 'sin respuesta', fundacion: null, ordenes: [], descartadas: [], mensaje: '', nota: '', razon: '' });
const sumaProducida = (prod) => RECURSOS_ALMACEN.reduce((a, r) => a + prod[r], 0);

// Fase 4: produccion y comida. Comen todos; si no alcanza, Comida = 0 y la gente baja 10 % (redondeo hacia arriba, sin bajar de 1).
function producir(E, civ, t, rc) {
  const m = modificadores(civ, t);
  const detalle = desgloseProduccion(civ, E.mundo, t, m);
  const prod = detalle.total;
  civ.produccion = prod;
  for (const r of RECURSOS_ALMACEN) civ.stock[r] += prod[r];
  civ.reservaCiencia += prod.Ciencia;
  civ.cultura = prod.Cultura;
  civ.culturaAcumulada += prod.Cultura;
  civ.produccionTotal += sumaProducida(prod);
  const consumo = civ.poblacion + civ.guardias;
  civ.hambre = civ.stock.Comida < consumo;
  if (civ.hambre) {
    civ.stock.Comida = 0;
    civ.poblacion = Math.max(1, civ.poblacion - Math.ceil(civ.poblacion * HAMBRE.perdida));
    civ.hambres++;
    rc.eventos.push({ tipo: 'hambre', s: civ.s });
  } else civ.stock.Comida -= consumo;
  civ.ultimaProduccion = { ...detalle, consumo, hambre: civ.hambre, comidaTrasConsumo: civ.stock.Comida };
}

// Fase 5: investigacion. Las dos civilizaciones leen la MISMA instantanea de difusion (lo que cada una conocia al cierre anterior), asi que el orden no importa.
function investigarFase(E, rc) {
  for (const civ of E.civs) {
    const hechas = resolverInvestigacion(civ, E.civs[1 - civ.s]);
    for (const tec of hechas) rc.eventos.push({ tipo: 'tecnologia', s: civ.s, tec });
    for (const era of actualizarEra(civ)) rc.eventos.push({ tipo: 'era', s: civ.s, era });
  }
}

// Fase 6: crecimiento. Si sobra Comida despues de comer y hay espacio, la gente crece 1 (mas los bonos).
function crecer(civ, t, rc) {
  const m = modificadores(civ, t), espacio = espacioDe(civ, m);
  if (civ.stock.Comida > 0 && civ.poblacion < espacio) {
    civ.poblacion = Math.min(espacio, civ.poblacion + 1 + m.crecimiento);
    rc.eventos.push({ tipo: 'crece', s: civ.s });
  }
}

// Al terminar el turno 30 gana el mayor Indice (a la precision publicada, un decimal); si empatan, mas tecnologias y, despues, un sorteo con el seed del mundo.
function decidirGanador(E) {
  const [a, b] = E.civs.map((c) => indiceDe(c).publicado);
  if (a !== b) { E.ganador = a > b ? 0 : 1; E.desempate = null; return; }
  const [ta, tb] = E.civs.map((c) => c.tecnologias.length);
  if (ta !== tb) { E.ganador = ta > tb ? 0 : 1; E.desempate = 'tecnologias'; return; }
  E.ganador = rngDe(E.seedMundo, TURNOS, 'desempate')() < 0.5 ? 0 : 1;
  E.desempate = 'sorteo';
}

// jugadas[s] = respuesta normalizada por normalizarRespuesta (con `error` y `crudo` si las puso la arena); una jugada ausente cuenta como respuesta vacia.
export function aplicarTurno(E, jugadas) {
  const t = E.turno + 1;
  const js = E.civs.map((_, s) => jugadas?.[s] ?? jugadaVacia());
  const rc = { turno: t, civs: E.civs.map((c) => ({ s: c.s, ordenes: [], descartadas: js[c.s].descartadas, invalida: js[c.s].invalida, motivo: js[c.s].motivo ?? null })), eventos: [] };

  if (t === 1) E.civs.forEach((c) => { rc.civs[c.s].fundacion = fundar(E, c, js[c.s].fundacion); rc.eventos.push({ tipo: 'fundacion', s: c.s }); });
  E.civs.forEach((c) => resolverRespuestas(E, c, js[c.s], t, rc));
  const comercio = nuevoComercio(E, t);
  E.civs.forEach((c) => ejecutarOrdenes(E, c, js[c.s], rc.civs[c.s], t, comercio));
  liquidarComercio(comercio, rc);
  E.civs.forEach((c) => { contarOrdenes(c, js[c.s], rc.civs[c.s]); c.nota = js[c.s].nota; c.mensaje = js[c.s].mensaje; });
  E.civs.forEach((c) => producir(E, c, t, rc));
  investigarFase(E, rc);
  E.civs.forEach((c) => crecer(c, t, rc));
  const invasion = avisosDe(E, t).invasion;
  if (invasion?.turno === t) E.civs.forEach((c) => {
    const n = c.respuestasInvasiones[t];
    resolverInvasion(E, c, invasion, n ?? 1, n !== undefined, rc);
    delete c.respuestasInvasiones[t];
  });
  resolverMaravillas(E, t, rc);
  // Los temporales vencen tras el cierre para
  // que su Estabilidad tambien rija en el ultimo turno inclusivo.
  E.civs.forEach((c) => resolverEstabilidad(E, c, t, rc));
  E.civs.forEach((c) => { c.temporales = c.temporales.filter((x) => x.hasta > t); });

  E.turno = t;
  if (INDICE.publicado.includes(t)) {
    E.indices.push({ turno: t, publicado: E.civs.map((c) => indiceDe(c).publicado) });
    rc.eventos.push({ tipo: 'indice', publicado: E.indices.at(-1).publicado });
  }
  if (t >= TURNOS) decidirGanador(E);
  E.civs.forEach((c) => { c.ultimasOrdenes = resumenOrdenes(rc.civs[c.s], t); });
  rc.instantanea = instantanea(E);
  return rc;
}
