// Edificios y territorio (spec 3.5 y 3.6): `construir REGION EDIFICIO` y `colonizar REGION`. Devuelven null si se aplico o el motivo por el que se descarta.

import { EDIFICIO, COSTO_EDIFICIO, COLONIZAR } from './constantes.js';
import { ceilDiv } from './economia.js';
import { tieneTipo } from './estado.js';
import { fronteraDe } from './mundo.js';
import { edificioDisponible } from './temporada.js';

const alcanza = (civ, costo) => Object.entries(costo).every(([r, n]) => civ.stock[r] >= n);
const pagar = (civ, costo) => { for (const [r, n] of Object.entries(costo)) civ.stock[r] -= n; };

// Porcentaje entero de un factor fraccionario (-0.2 -> 80): aritmetica entera para que 2.4 sea 3 y no un error de coma flotante.
const factor100 = (pct) => 100 + Math.round(pct * 100);

// (3 Madera + 2 Roca) x era del edificio y, desde la era 3, ademas (era - 2) Hierro; el rasgo constructores lo baja 20 % (redondeo hacia arriba).
export function costoEdificio(tipo, m) {
  const era = EDIFICIO[tipo].era, f = factor100(m.edificiosCosto);
  const costo = { Madera: ceilDiv(COSTO_EDIFICIO.Madera * era * f, 100), Roca: ceilDiv(COSTO_EDIFICIO.Roca * era * f, 100) };
  if (era >= COSTO_EDIFICIO.hierroDesdeEra) costo.Hierro = ceilDiv((era - COSTO_EDIFICIO.hierroDesdeEra + 1) * f, 100);
  return costo;
}

// Un edificio por region: construir sobre una region con edificio lo demuele sin devolver nada. Cada tipo existe una sola vez (construir uno que ya tienes se descarta).
export function construir(civ, region, tipo, t, m) {
  if (!civ.regiones.includes(region)) return 'la region no es tuya';
  const e = EDIFICIO[tipo];
  if (!e) return 'edificio desconocido';
  if (civ.temporada && !edificioDisponible(civ, tipo)) return `faltan requisitos para ${tipo}`;
  if (!civ.temporada && !civ.tecnologias.includes(e.tec)) return `te falta la tecnologia ${e.tec}`;
  if (tieneTipo(civ, tipo)) return civ.edificios[region]?.tipo === tipo ? 'ya esta construido en esa region' : 'ya tienes ese tipo de edificio';
  const costo = costoEdificio(tipo, m);
  if (!alcanza(civ, costo)) return 'no alcanzan los recursos';
  pagar(civ, costo);
  civ.descuentoIngeniero = false;
  civ.edificios[region] = { tipo, desde: t + 1 };               // el bono rige desde el turno siguiente
  if (!civ.construidos.includes(tipo)) civ.construidos.push(tipo);
  return null;
}

// 2 Comida + 2 Madera por cada region que ya tienes (pioneros -30 %), hasta COLONIZAR.porTurno por turno; la region es una vecina libre de las tuyas.
export function costoColonizar(civ, m) {
  const f = factor100(m.colonizarCosto);
  return { Comida: ceilDiv(COLONIZAR.Comida * civ.regiones.length * f, 100), Madera: ceilDiv(COLONIZAR.Madera * civ.regiones.length * f, 100) };
}

export function colonizar(civ, mundo, region, m, hechasEsteTurno) {
  if (hechasEsteTurno >= COLONIZAR.porTurno) return `maximo ${COLONIZAR.porTurno} colonizaciones por turno`;
  if (civ.regiones.includes(region)) return 'la region ya es tuya';
  if (!fronteraDe(mundo, civ.regiones).includes(region)) return 'la region no es una vecina libre de las tuyas';
  const costo = costoColonizar(civ, m);
  if (!alcanza(civ, costo)) return 'no alcanzan los recursos';
  pagar(civ, costo);
  civ.regiones.push(region);
  return null;
}
