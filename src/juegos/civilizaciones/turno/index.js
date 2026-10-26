// El turno de la Carrera de civilizaciones (spec 5): una cronologia unica de 10 fases. Las dos civilizaciones responden a la vez y NINGUNA regla depende del orden de
// asiento: cada fase se calcula para las dos con las mismas reglas y los mismos dados, y lo unico compartido (la difusion, y mas adelante las Maravillas, los regalos y las
// ofertas) tiene una regla simetrica. Cada efecto se aplica una sola vez y en un solo lugar.
//
//   0 aviso   1 fundacion   2 respuestas, eventos y dilemas   3 ordenes economicas   4 produccion   5 investigacion y difusion   6 crecimiento
//   7 invasion   8 mantenimiento   9 Maravillas   10 cierre (Estabilidad, secesion y colapso, Indice, registro)
// Capa 1 (nucleo): fases 1, 3 (asignar, colonizar, construir, investigar), 4, 5, 6 y 10. Las demas llegan con sus capas (las ordenes de esas fases se descartan con su motivo).

import { RECURSOS_ALMACEN, TURNOS, INDICE, HAMBRE } from '../constantes.js';
import { fundar } from './fundacion.js';
import { ejecutarOrdenes, contarOrdenes } from './ordenes.js';
import { modificadores, produccion, espacioDe, estabilidadDe } from '../economia.js';
import { resolverInvestigacion, actualizarEra } from '../tecnologia.js';
import { indiceDe } from '../indice.js';
import { instantanea } from '../estado.js';
import { rngDe } from '../rng.js';

const jugadaVacia = () => ({ invalida: true, motivo: 'sin respuesta', fundacion: null, ordenes: [], descartadas: [], mensaje: '', nota: '', razon: '' });
const sumaProducida = (prod) => RECURSOS_ALMACEN.reduce((a, r) => a + prod[r], 0);

// Fase 4: produccion y comida. Comen todos; si no alcanza, Comida = 0 y la gente baja 10 % (redondeo hacia arriba, sin bajar de 1).
function producir(E, civ, t, rc) {
  const m = modificadores(civ, t);
  const prod = produccion(civ, E.mundo, t, m);
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

// Fase 10: cierre. La Estabilidad se recalcula (no se acumula) y es la que usa la produccion del turno siguiente; las tecnologias conocidas pasan a ser la instantanea de difusion.
function cerrar(E, civ, t, rc) {
  const m = modificadores(civ, t);
  civ.estabilidad = estabilidadDe(civ, t, m);
  civ.sumaEstabilidad += civ.estabilidad;
  civ.cierres++;
  civ.tecnologiasCierre = [...civ.tecnologias];
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
  // Fase 2 (capa 2): respuestas, eventos y dilemas.
  E.civs.forEach((c) => { ejecutarOrdenes(E, c, js[c.s], rc.civs[c.s], t); contarOrdenes(c, js[c.s], rc.civs[c.s]); c.nota = js[c.s].nota; c.mensaje = js[c.s].mensaje; });
  E.civs.forEach((c) => producir(E, c, t, rc));
  investigarFase(E, rc);
  E.civs.forEach((c) => crecer(c, t, rc));
  // Fases 7 (invasion), 8 (mantenimiento) y 9 (Maravillas): capas 2 y 3.
  E.civs.forEach((c) => cerrar(E, c, t, rc));

  E.turno = t;
  if (INDICE.publicado.includes(t)) {
    E.indices.push({ turno: t, publicado: E.civs.map((c) => indiceDe(c).publicado) });
    rc.eventos.push({ tipo: 'indice', publicado: E.indices.at(-1).publicado });
  }
  if (t >= TURNOS) decidirGanador(E);
  rc.instantanea = instantanea(E);
  return rc;
}
