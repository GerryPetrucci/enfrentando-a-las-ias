// Fase 1 (solo el turno 1): cada IA funda su civilizacion (spec 6 y 11.16). Una fundacion invalida o ausente no detiene la partida: nombre «Civilizacion A/B», lema vacio,
// rasgos 1 y 2 y primer sitio, y la civilizacion queda marcada `invalida` (el motor mide tambien si la IA supo fundar).

import { NOMBRE_FALLBACK, REGIONES_INICIALES, RASGOS_FALLBACK } from '../constantes.js';
import { nuevosModificadores, acumular } from '../efectos.js';
import { RASGO } from '../constantes.js';
import { regionesIniciales } from '../mundo.js';
import { estabilidadDe, modificadores } from '../economia.js';

export function fundar(E, civ, fundacion) {
  const f = fundacion ?? { valida: false, nombre: '', lema: '', sitio: 0, rasgos: [...RASGOS_FALLBACK] };
  civ.nombre = f.nombre || NOMBRE_FALLBACK[civ.s];
  civ.lema = f.lema;
  civ.rasgos = [...f.rasgos];
  civ.sitio = f.sitio;
  civ.capital = E.mundo.sitios[f.sitio];
  const m = nuevosModificadores();
  for (const id of civ.rasgos) acumular(m, RASGO[id].efectos);
  civ.regiones = regionesIniciales(E.mundo, civ.capital, REGIONES_INICIALES + m.regionInicial);
  civ.fundada = true;
  civ.invalida = !f.valida;
  civ.stats.fundacionValida = f.valida;
  civ.estabilidad = estabilidadDe(civ, 1, modificadores(civ, 1));       // 50 mas lo que traigan los rasgos (devotos +5, pioneros -5)
  return { s: civ.s, nombre: civ.nombre, lema: civ.lema, rasgos: civ.rasgos, sitio: f.sitio, capital: civ.capital, regiones: [...civ.regiones], valida: f.valida, ajustes: f.ajustes ?? [] };
}
