// Resumen publico del turno: lo que todos los reinos saben de lo ocurrido. Sin acentos (es parte del prompt).
// Nunca incluye cantidades de comercio, regalos, almacenes, ordenes ni notas.

import { NOMBRES_REINOS } from './constantes.js';
import { nombreRegion } from './estado.js';

// `nombres`: el nombre de reino de cada asiento en esta partida (nombres.js); sin ellos, los de siempre.
export function resumenPublico(eventos, nombres = NOMBRES_REINOS) {
  const N = (s) => nombres[s];
  const l = [];
  for (const e of eventos) {
    if (e.tipo === 'conquista') l.push(`${N(e.k)} conquisto ${nombreRegion(e.r)} de ${N(e.contra)}`);
    else if (e.tipo === 'repelido') l.push(`${N(e.k)} ataco ${nombreRegion(e.r)} de ${N(e.contra)} y fue repelido`);
    else if (e.tipo === 'duelo') l.push(`${N(e.k)} derroto a ${N(e.contra)} dentro de ${nombreRegion(e.r)}`); // dos reinos de visita pelean en la region de un tercero
    else if (e.tipo === 'pacto') l.push(`${N(e.k)} y ${N(e.con)} firmaron un pacto`);
    else if (e.tipo === 'ruptura') l.push(`${N(e.k)} rompio su pacto con ${N(e.contra)}`);
    else if (e.tipo === 'caida') l.push(`${N(e.k)} cayo (su capital fue tomada por ${N(e.por)})`);
    else if (e.tipo === 'comercio') l.push(`${N(e.k)} y ${N(e.con)} comerciaron`);
    else if (e.tipo === 'maravilla') l.push(`${N(e.k)} construyo la Maravilla en ${nombreRegion(e.r)}`);
    else if (e.tipo === 'maravilla_cae') l.push(`${N(e.k)} conquisto la Maravilla de ${N(e.de)}`);
    else if (e.tipo === 'deshonra') l.push(`${N(e.k)} quedo deshonrado`);
  }
  return l;
}
