// Lo que ve cada IA al empezar su turno. Es la UNICA puerta por la que sale informacion del estado hacia un modelo:
// aqui se decide que sabe cada reino. Solo entran los datos propios del reino i y los publicos. Nunca almacenes,
// armas, notas, privados ni ofertas de otros reinos.

import { RECURSOS, MARAVILLA, TURNOS, EDIFICIOS, UNIDADES, HEGEMON } from './constantes.js';
import { nombreRegion, pila as pilaDe, presentes, regionesDe } from './estado.js';
import { eventoDe, NOMBRE_EVENTO } from './equilibrio.js';
import { lineasDeFrentes, lineasDeCapacidad } from './frentes.js';
import { sumaPila } from './unidades.js';
import { regionesAisladas } from './suministro.js';

const SEP = ' | ';

// Las vecinas van como numero de region (5 = R05): es lo que mas pesa del prompt y asi ocupa menos.
function mapaFijo(E) {
  return E.mapa.regs.map((r) => `${r.nombre} ${r.terr}${r.rec ? '+' + r.rec : ''}: ${r.vecinos.map((v) => v + 1).join(' ')}`).join('\n');
}

// Una pila de unidades como "L5A3" (letra del tipo y cantidad, sin los tipos que no hay); "0" si no hay ninguna.
export const pilaTexto = (p) => (sumaPila(p) ? UNIDADES.map((u, t) => (p[t] ? u.id + p[t] : '')).join('') : '0');

// region(unidades, fN, edificio +Reino unidades): L5A3 = 5 Lanceros y 3 Arqueros; g = granja, m = mercado, c = cuartel; el guion marca el edificio danado;
// +Ambar L2 = 2 Lanceros de Ambar de visita en esa region (tropas de otro reino, con pacto o ya hostiles)
function ocupacion(E) {
  return E.reinos.map((reino) => {
    const lista = [];
    for (let i = 0; i < E.dueno.length; i++) {
      if (E.dueno[i] !== reino.s) continue;
      const ed = E.edif[i] ? ',' + EDIFICIOS[E.edif[i]].letra + (E.dan[i] ? '-' : '') : '';
      const visitas = presentes(E, i).filter((k) => k !== reino.s).map((k) => ` +${E.reinos[k].nombre} ${pilaTexto(pilaDe(E, i, k))}`).join('');
      lista.push(`${nombreRegion(i)}(${pilaTexto(pilaDe(E, i, reino.s))}${E.fort[i] ? ',f' + E.fort[i] : ''}${ed}${visitas})`);
    }
    return `${reino.nombre}${reino.vivo ? '' : ' (cayo)'}: ${lista.join(' ')}`;
  });
}

export function vistaTexto(E, i) {
  const R = E.reinos, yo = R[i], t = E.turno + 1, L = [];
  // Lo fijo de la partida va primero: el mapa no cambia en toda la partida ni de un reino a otro, asi que el comienzo del prompt es identico en todas las llamadas y los proveedores que lo guardan en cache lo reutilizan.
  L.push('MAPA (terreno, recurso y vecinas por numero: 5 = R05):', mapaFijo(E), '');
  L.push(`Turno ${t} de ${TURNOS}. Eres ${yo.nombre}. Hay ${E.k} reinos y ${E.mapa.regs.length} regiones. Reinos vivos: ${R.filter((r) => r.vivo).map((r) => r.nombre).join(', ')}.`);
  L.push('Capitales: ' + R.map((r) => `${r.nombre} ${nombreRegion(r.capital)}`).join(SEP));
  L.push('Honor: ' + R.map((r) => `${r.nombre} ${r.honor}`).join(SEP));
  L.push(E.maravilla ? `Maravilla de ${R[E.maravilla.k].nombre} en ${nombreRegion(E.maravilla.r)} (faltan ${Math.max(0, MARAVILLA.turnos - E.maravilla.n)} turnos)` : 'Maravilla: ninguna');
  L.push(`Tu almacen: ${RECURSOS.map((r) => `${r} ${yo.stock[r]}`).join(SEP)}${SEP}mejoras ${UNIDADES.map((u, t) => u.id + yo.mejoras[t]).join(' ')}`);
  L.push(...lineasDeCapacidad(E, i));
  const pactos = R.filter((r) => r.s !== i && yo.pactos[r.s] >= t).map((r) => `${r.nombre} (hasta el turno ${yo.pactos[r.s]})`);
  const abierta = yo.propuestaPrevia !== null && !(yo.pactos[yo.propuestaPrevia] >= t) ? ` Tu propuesta abierta: ${R[yo.propuestaPrevia].nombre}.` : '';
  L.push(`Pactos vigentes: ${pactos.length ? pactos.join(', ') : 'ninguno'}.${abierta}`);
  // Tus tropas en regiones de otro reino (de visita); sin pacto vigente con el dueno ya son hostiles: pueden irse (mover) o atacar (atacar REGION).
  const visitas = [];
  for (let r = 0; r < E.dueno.length; r++) {
    const dueno = E.dueno[r];
    if (dueno >= 0 && dueno !== i && sumaPila(pilaDe(E, r, i)) > 0) visitas.push(`${nombreRegion(r)} de ${R[dueno].nombre} (${pilaTexto(pilaDe(E, r, i))}${yo.pactos[dueno] >= t ? '' : ', hostiles'})`);
  }
  if (visitas.length) L.push('Tus tropas de visita: ' + visitas.join(SEP));
  const aisladas = regionesAisladas(E, i, t);
  if (aisladas.length) L.push(`Tus regiones aisladas (sin camino a tu capital: no producen y ahi no se recluta, fortifica ni construye): ${aisladas.map(nombreRegion).join(' ')}`);
  // Paquete de equilibrio: el Hegemon, el evento de este turno y el Presagio del siguiente.
  if (E.hegemon >= 0) L.push(`Hegemon: ${R[E.hegemon].nombre} (${regionesDe(E, E.hegemon).length} de ${E.dueno.filter((d) => d >= 0).length} regiones con dueno): los demas lo atacan con +${Math.round((HEGEMON.bonoAtaque - 1) * 100)}%`);
  const hoy = eventoDe(E, t), manana = eventoDe(E, t + 1);
  if (hoy) L.push(`Evento de este turno: ${NOMBRE_EVENTO[hoy.tipo]}.`);
  if (manana) L.push(`Presagio: en el turno ${t + 1} habra ${NOMBRE_EVENTO[manana.tipo]}.`);
  L.push(`Tu nota del turno anterior: ${yo.nota ? `"${yo.nota}"` : '(ninguna)'}`);
  if (yo.ofertasIn.length) L.push('Ofertas recibidas: ' + yo.ofertasIn.map((o) => `${R[o.de].nombre} te da ${o.dc} ${o.doy} por ${o.pc} ${o.pido}`).join(SEP));
  if (yo.privIn.length) L.push('Privados recibidos: ' + yo.privIn.map((p) => `${R[p.de].nombre}: "${p.texto}"`).join(SEP));
  if (E.mensajesPrevios.length) L.push('Mensajes publicos: ' + E.mensajesPrevios.map((m) => `${R[m.k].nombre}: "${m.texto}"`).join(SEP));
  if (E.regalosPrevios[i].length) L.push('Regalos recibidos: ' + E.regalosPrevios[i].map((g) => `${R[g.de].nombre} te regalo ${g.n} ${g.recurso}`).join(SEP));
  L.push('', 'OCUPACION (region(unidades, fN, edificio; - = danado); +Reino L2 = tropas de visita):', ...ocupacion(E).map((l, s) => (s === i ? l.replace(':', ' (tu):') : l)), 'Sin dueno: el resto.', '');
  const frentes = lineasDeFrentes(E, i);
  if (frentes.length) L.push('FRENTES (tu ataque con lo que puedes mover contra la defensa visible, sin mejoras ajenas):', ...frentes, '');
  L.push('Sucedio el turno anterior: ' + (E.resumenPrevio.length ? E.resumenPrevio.join('. ') + '.' : 'nada notable.'));
  return L.join('\n');
}
