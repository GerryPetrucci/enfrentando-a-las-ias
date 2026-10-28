// Vista activa 2.0 y variante de revision 2.1. La variante solo agrega informacion propia.

import { TURNOS, RECURSOS_ALMACEN, OFICIOS, TEC, EDIFICIOS, DILEMAS, EVENTO, TRIBUTO_POR_FUERZA } from './constantes.js';
import { avisosDe, opcionesEvento } from './avisos.js';
import { defensaDe } from './turno/invasion.js';
import { describir } from './efectos.js';
import { avanceMaravilla, construida } from './turno/maravillas.js';
import { MARAVILLAS } from './constantes.js';
import { nombreRegion } from './mundo.js';
import { indiceDe } from './indice.js';
import { disponibles } from './tecnologia.js';
import { fronteraDe } from './mundo.js';
import { costoColonizar, costoEdificio } from './edificios.js';
import { modificadores, desgloseProduccion } from './economia.js';
import { RASGO, RECURSOS } from './constantes.js';
import { textoTemporada, edificioDisponible } from './temporada.js';

const costoTexto = (c) => Object.entries(c).map(([r, n]) => `${n} ${r}`).join(' + ');

export const VERSION_VISTA_DETALLADA = 'civilizaciones-vista-2.1.0';

function lineasProduccion(d, titulo) {
  return [titulo,
    `Personas productoras: ${OFICIOS.map((o, k) => `${o} ${d.gente[k]}`).join(', ')}. Guardias ${d.guardias} fuera de los oficios.`,
    'Por recurso: (territorio + trabajo + bonos planos) x (1 + bono - penalizacion); redondeo al entero mas cercano, empate arriba, minimo 0.',
    ...RECURSOS.map((r) => {
      const x = d.recursos[r];
      return `${r}: (${x.territorio} + ${x.trabajo} + ${x.bonosPlanos}) x (1 + ${x.bono} - ${x.penalizacion}) = ${x.total}`;
    })];
}

// Opt-in para revisar el contrato completo antes de adoptarlo. Sin mutaciones,
// sin consultar saldos, decisiones ni modificadores privados del adversario.
export function vistaDetallada(E, i) {
  const base = vistaTexto(E, i), c = E.civs[i];
  if (!c.fundada) return base;
  const lineas = [base, `INFORMACION PROPIA (${VERSION_VISTA_DETALLADA})`,
    `Tus rasgos: ${c.rasgos.map((id) => `${id} (${describir(RASGO[id].efectos)})`).join('; ') || 'ninguno'}.`,
    `Tus dilemas elegidos: ${Object.entries(c.dilemas).map(([era, n]) => {
      const o = DILEMAS[era].opciones[n - 1];
      return `era ${era}, opcion ${n}: ${o.nombre} (${describir(o.efectos)})`;
    }).join('; ') || 'ninguno'}.`];
  const anterior = c.ultimaProduccion;
  if (anterior) {
    lineas.push(...lineasProduccion(anterior, `Produccion REAL bruta T${anterior.turno}, antes de comer y de investigacion/crecimiento/invasion/cierre:`));
    lineas.push(`Consumo requerido ${anterior.consumo} Comida; hambre ${anterior.hambre ? 'si' : 'no'}; Comida justo despues de comer ${anterior.comidaTrasConsumo}. No es el saldo actual ni el balance neto del turno.`);
  } else lineas.push('Produccion anterior: sin registro.');
  if (E.turno < TURNOS) {
    const proyeccion = desgloseProduccion(c, E.mundo, E.turno + 1);
    lineas.push(...lineasProduccion(proyeccion, `Proyeccion bruta T${E.turno + 1} con el estado actual: NO incluye cambios por eventos, dilemas ni ordenes de hoy. No esta disponible para gastar antes de producir.`));
    lineas.push(`Consumo proyectado ${c.poblacion + c.guardias} Comida; puede cambiar con eventos y reclutas.`);
  }
  const u = c.ultimasOrdenes;
  if (u) {
    lineas.push(`Resultado de tus ordenes T${u.turno}: ${u.aplicadas} aplicadas; ${u.descartadas.length + u.exceso} descartadas.${u.invalida ? ` Respuesta invalida: ${u.motivo}.` : ''}`);
    for (const o of u.descartadas) lineas.push(`Descarte: ${JSON.stringify(o.texto)}: ${o.motivo}.`);
    if (u.exceso) lineas.push(`Descartes por superar el limite de ordenes: ${u.exceso}; no se evaluaron, textos omitidos.`);
  } else lineas.push('Resultado de tus ordenes: sin registro.');
  return lineas.join('\n');
}

export function vistaTexto(E, i) {
  const c = E.civs[i], rival = E.civs[1 - i], t = E.turno + 1;
  const lineas = [`MAPA: ${E.mundo.regs.length} regiones`];
  if (c.temporada) lineas.push(textoTemporada(c));
  if (!c.fundada) {
    lineas.push(`Turno 1 de ${TURNOS}. Funda tu civilizacion. Sitios para tu capital:`);
    E.mundo.sitios.forEach((id, k) => { const r = E.mundo.regs[id]; lineas.push(`${k + 1}: ${r.nombre} (${r.terr}${r.rec ? `, ${r.rec}` : ''})`); });
    return lineas.join('\n');
  }
  const m = modificadores(c, t);
  if (E.capas?.carrera !== false) {
    const estado = MARAVILLAS.map((w) => `${w.id} ${construida(E, w.id) ? `construida por ${E.civs.find((q) => q.maravillas.some((x) => x.id === w.id)).nombre}` : `tu ${avanceMaravilla(c, w.id)}% / rival ${avanceMaravilla(rival, w.id)}%`}`);
    lineas.push(`Maravillas: ${estado.join('; ')}`);
    const posibles = MARAVILLAS.filter((w) => c.tecnologias.includes(w.tec) && !construida(E, w.id));
    if (posibles.length) lineas.push(`Puedes invertir: ${posibles.map((w) => `${w.id} (${costoTexto(w.costo)}; propio ${costoTexto(c.proyectosMaravillas[w.id]?.invertido ?? {}) || 'sin inversion'})`).join('; ')}`);
  }
  const ind = indiceDe(c).publicado, indRival = indiceDe(rival).publicado;
  lineas.push(`Turno ${t} de ${TURNOS}. Eres ${c.nombre}. Era ${c.era}. Indice: tu ${ind} / rival ${indRival}.`);
  lineas.push(`Almacen: ${RECURSOS_ALMACEN.map((r) => `${r} ${c.stock[r]}`).join(' ')} | Poblacion ${c.poblacion} | Ciencia (reserva ${c.reservaCiencia}) | Cultura ${c.culturaAcumulada} | Estabilidad ${c.estabilidad}`);
  lineas.push(`Reparto: ${OFICIOS.map((o, k) => `${o} ${c.reparto[k]}`).join(' ')}`);
  lineas.push(`Guardias ${c.guardias} (comen sin producir). Defensa ${defensaDe(c, t).toFixed(1)}.`);
  if (E.capas?.comercio !== false) {
    const ofertas = rival.ofertas.filter((o) => o.vence === t);
    if (ofertas.length) lineas.push(`Ofertas del rival (caducan hoy): ${ofertas.map((o) => `aceptar ${o.n}: recibes ${o.nDa} ${o.da}, entregas ${o.nPide} ${o.pide}`).join('; ')}`);
  }
  const { evento, invasion } = avisosDe(E, t);
  if (evento) {
    const e = EVENTO[evento.id];
    lineas.push(`${evento.turno === t ? 'Hoy' : 'Presagio'} T${evento.turno}: ${e.nombre}. ${opcionesEvento(c, e.id).map((op) => `responder ${e.id} ${op.n}: ${op.nombre}`).join('; ')}. Sin respuesta: 1. Si no puedes pagar: ${Object.entries(e.fallback).map(([n, f]) => `${n}->${f}`).join(', ') || 'opciones gratuitas'}.`);
    if (c.respuestasEventos[evento.turno] !== undefined) lineas.push(`Tu respuesta guardada al evento: ${c.respuestasEventos[evento.turno]}. Puedes cambiarla hasta T${evento.turno}.`);
  }
  if (invasion) {
    const tributo = invasion.fuerza * TRIBUTO_POR_FUERZA;
    lineas.push(`Invasion T${invasion.turno}, fuerza ${invasion.fuerza}: responder invasion 1 (resistir, predeterminada); responder invasion 2 (${tributo} Oro completos${c.stock.Oro < tributo ? '; no te alcanza: se resolveria como resistir' : ''}).`);
    if (c.respuestasInvasiones[invasion.turno] !== undefined) lineas.push(`Tu respuesta guardada a invasion: ${c.respuestasInvasiones[invasion.turno]}.`);
  }
  if (c.dilemaPendiente !== null) {
    const d = DILEMAS[c.dilemaPendiente];
    lineas.push(`Dilema era ${c.dilemaPendiente}: ${d.opciones.map((o) => `dilema ${o.n}: ${o.nombre} (${describir(o.efectos)})`).join('; ')}. Sin respuesta: 1.`);
  }
  lineas.push(`Regiones: ${c.regiones.map((r) => `${nombreRegion(r)}${c.edificios[r] ? ` ${c.edificios[r].tipo}` : ''}`).join(', ')}`);
  const libres = fronteraDe(E.mundo, c.regiones);
  if (libres.length) lineas.push(`Puedes colonizar: ${libres.map(nombreRegion).join(', ')} (${costoTexto(costoColonizar(c, m))} cada una)`);
  if (c.proyectos.length) lineas.push(`Investigas: ${c.proyectos.map((p) => `${TEC[p.tec].nombre} ${p.progreso}`).join(', ')}`);
  lineas.push(`Puedes investigar: ${disponibles(c).map((id) => TEC[id].nombre).join(', ')}`);
  const construibles = EDIFICIOS.filter((e) => !Object.values(c.edificios).some((b) => b.tipo === e.id)
    && (c.temporada ? edificioDisponible(c, e.id) : c.tecnologias.includes(e.tec)));
  if (construibles.length) lineas.push(`Puedes construir: ${construibles.map((e) => `${e.id} (${costoTexto(costoEdificio(e.id, m))})`).join(', ')}`);
  lineas.push(`Rival: ${rival.nombre} (${rival.lema}). Era ${rival.era}. Tecnologias ${rival.tecnologias.length} de 36. Estabilidad ${rival.estabilidad}.${rival.mensaje ? ` Ultimo mensaje: ${rival.mensaje}` : ''}`);
  if (c.nota) lineas.push(`Tu nota del turno anterior: ${c.nota}`);
  return lineas.join('\n');
}
