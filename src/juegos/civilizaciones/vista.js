// Lo que ve cada civilizacion (spec 7). `vistaTexto(E, i)` es el UNICO lugar donde se decide que sabe cada una: del rival solo lo publico (nombre, lema, rasgos, era,
// tecnologias, Estabilidad, edificios, Indice del cierre anterior y su ultimo mensaje). PROVISIONAL de la capa 0/1: la vista compacta y medida (capa 5) la reemplaza.

import { TURNOS, RECURSOS_ALMACEN, OFICIOS, TEC, EDIFICIOS } from './constantes.js';
import { nombreRegion } from './mundo.js';
import { indiceDe } from './indice.js';
import { disponibles } from './tecnologia.js';
import { fronteraDe } from './mundo.js';
import { costoColonizar, costoEdificio } from './edificios.js';
import { modificadores } from './economia.js';

const costoTexto = (c) => Object.entries(c).map(([r, n]) => `${n} ${r}`).join(' + ');

export function vistaTexto(E, i) {
  const c = E.civs[i], rival = E.civs[1 - i], t = E.turno + 1;
  const lineas = [`MAPA: ${E.mundo.regs.length} regiones`];
  if (!c.fundada) {
    lineas.push(`Turno 1 de ${TURNOS}. Funda tu civilizacion. Sitios para tu capital:`);
    E.mundo.sitios.forEach((id, k) => { const r = E.mundo.regs[id]; lineas.push(`${k + 1}: ${r.nombre} (${r.terr}${r.rec ? `, ${r.rec}` : ''})`); });
    return lineas.join('\n');
  }
  const m = modificadores(c, t);
  const ind = indiceDe(c).publicado, indRival = indiceDe(rival).publicado;
  lineas.push(`Turno ${t} de ${TURNOS}. Eres ${c.nombre}. Era ${c.era}. Indice: tu ${ind} / rival ${indRival}.`);
  lineas.push(`Almacen: ${RECURSOS_ALMACEN.map((r) => `${r} ${c.stock[r]}`).join(' ')} | Poblacion ${c.poblacion} | Ciencia (reserva ${c.reservaCiencia}) | Cultura ${c.culturaAcumulada} | Estabilidad ${c.estabilidad}`);
  lineas.push(`Reparto: ${OFICIOS.map((o, k) => `${o} ${c.reparto[k]}`).join(' ')}`);
  lineas.push(`Regiones: ${c.regiones.map((r) => `${nombreRegion(r)}${c.edificios[r] ? ` ${c.edificios[r].tipo}` : ''}`).join(', ')}`);
  const libres = fronteraDe(E.mundo, c.regiones);
  if (libres.length) lineas.push(`Puedes colonizar: ${libres.map(nombreRegion).join(', ')} (${costoTexto(costoColonizar(c, m))} cada una)`);
  if (c.proyectos.length) lineas.push(`Investigas: ${c.proyectos.map((p) => `${TEC[p.tec].nombre} ${p.progreso}`).join(', ')}`);
  lineas.push(`Puedes investigar: ${disponibles(c).map((id) => TEC[id].nombre).join(', ')}`);
  const construibles = EDIFICIOS.filter((e) => c.tecnologias.includes(e.tec));
  if (construibles.length) lineas.push(`Puedes construir: ${construibles.map((e) => `${e.id} (${costoTexto(costoEdificio(e.id, m))})`).join(', ')}`);
  lineas.push(`Rival: ${rival.nombre} (${rival.lema}). Era ${rival.era}. Tecnologias ${rival.tecnologias.length} de 36. Estabilidad ${rival.estabilidad}.${rival.mensaje ? ` Ultimo mensaje: ${rival.mensaje}` : ''}`);
  if (c.nota) lineas.push(`Tu nota del turno anterior: ${c.nota}`);
  return lineas.join('\n');
}
