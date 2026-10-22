// Lo que ve cada IA al empezar su turno. Es la UNICA puerta por la que sale informacion del estado hacia un modelo:
// aqui se decide que sabe cada reino. Solo entran los datos propios del reino i y los publicos. Nunca almacenes,
// armas, notas, privados ni ofertas de otros reinos.

import { RECURSOS, MARAVILLA, TURNOS, EDIFICIOS } from './constantes.js';
import { nombreRegion, tropasDe } from './estado.js';

const SEP = ' | ';

function mapaFijo(E) {
  return E.mapa.regs.map((r) => `${r.nombre} ${r.terr}${r.rec ? '+' + r.rec : ''}: ${r.vecinos.map((v) => nombreRegion(v)).join(' ')}`).join('\n');
}

// region(tropas, fN, edificio): g = granja, m = mercado, c = cuartel; el guion marca el edificio danado
function ocupacion(E) {
  return E.reinos.map((reino) => {
    const lista = [];
    for (let i = 0; i < E.dueno.length; i++) {
      if (E.dueno[i] !== reino.s) continue;
      const ed = E.edif[i] ? ',' + EDIFICIOS[E.edif[i]].letra + (E.dan[i] ? '-' : '') : '';
      lista.push(`${nombreRegion(i)}(${tropasDe(E, i)}${E.fort[i] ? ',f' + E.fort[i] : ''}${ed})`);
    }
    return `${reino.nombre}${reino.vivo ? '' : ' (cayo)'}: ${lista.join(' ')}`;
  });
}

export function vistaTexto(E, i) {
  const R = E.reinos, yo = R[i], t = E.turno + 1, L = [];
  L.push(`Turno ${t} de ${TURNOS}. Eres ${yo.nombre}. Hay ${E.k} reinos y ${E.mapa.regs.length} regiones. Reinos vivos: ${R.filter((r) => r.vivo).map((r) => r.nombre).join(', ')}.`);
  L.push('Capitales: ' + R.map((r) => `${r.nombre} ${nombreRegion(r.capital)}`).join(SEP));
  L.push('Honor: ' + R.map((r) => `${r.nombre} ${r.honor}`).join(SEP));
  L.push(E.maravilla ? `Maravilla de ${R[E.maravilla.k].nombre} en ${nombreRegion(E.maravilla.r)} (faltan ${Math.max(0, MARAVILLA.turnos - E.maravilla.n)} turnos)` : 'Maravilla: ninguna');
  L.push(`Tu almacen: ${RECURSOS.map((r) => `${r} ${yo.stock[r]}`).join(SEP)}${SEP}armas nivel ${yo.armas}`);
  const pactos = R.filter((r) => r.s !== i && yo.pactos[r.s] >= t).map((r) => `${r.nombre} (hasta el turno ${yo.pactos[r.s]})`);
  const abierta = yo.propuestaPrevia !== null && !(yo.pactos[yo.propuestaPrevia] >= t) ? ` Tu propuesta abierta: ${R[yo.propuestaPrevia].nombre}.` : '';
  L.push(`Pactos vigentes: ${pactos.length ? pactos.join(', ') : 'ninguno'}.${abierta}`);
  L.push(`Tu nota del turno anterior: ${yo.nota ? `"${yo.nota}"` : '(ninguna)'}`);
  if (yo.ofertasIn.length) L.push('Ofertas recibidas: ' + yo.ofertasIn.map((o) => `${R[o.de].nombre} te da ${o.dc} ${o.doy} por ${o.pc} ${o.pido}`).join(SEP));
  if (yo.privIn.length) L.push('Privados recibidos: ' + yo.privIn.map((p) => `${R[p.de].nombre}: "${p.texto}"`).join(SEP));
  if (E.mensajesPrevios.length) L.push('Mensajes publicos: ' + E.mensajesPrevios.map((m) => `${R[m.k].nombre}: "${m.texto}"`).join(SEP));
  if (E.regalosPrevios[i].length) L.push('Regalos recibidos: ' + E.regalosPrevios[i].map((g) => `${R[g.de].nombre} te regalo ${g.n} ${g.recurso}`).join(SEP));
  L.push('', 'MAPA (terreno, recurso y vecinas):', mapaFijo(E), '', 'OCUPACION (region(tropas, fN, edificio; - = danado)):', ...ocupacion(E).map((l, s) => (s === i ? l.replace(':', ' (tu):') : l)), 'Sin dueno: el resto.', '');
  L.push('Sucedio el turno anterior: ' + (E.resumenPrevio.length ? E.resumenPrevio.join('. ') + '.' : 'nada notable.'));
  return L.join('\n');
}
