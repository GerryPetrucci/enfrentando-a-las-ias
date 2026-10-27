// Economia de la Carrera de civilizaciones (spec 3.2, 3.3, 3.8, 3.9): modificadores, gente y oficios, produccion, espacio y Estabilidad.
// Todo son funciones de la civilizacion y del turno: ninguna cifra se escribe aqui, vienen de constantes.js.

import {
  RECURSOS, OFICIOS, PRODUCE_OFICIO, ESPACIO, ESTABILIDAD, HAMBRE, TEC, EDIFICIO, RASGO, MARAVILLA, DILEMAS, ESPIRITU_RAMA, CRISIS,
} from './constantes.js';
import { nuevosModificadores, acumular } from './efectos.js';

// Todo lo que modifica la produccion de `civ` en el turno `t`, sumado en un acumulador: rasgos, edificios (un tipo cuenta una vez y solo si ya esta activo),
// tecnologias, Maravillas ya activas, dilemas elegidos y modificadores temporales vigentes.
export function modificadores(civ, t) {
  const m = nuevosModificadores();
  if (civ.descuentoIngeniero) m.edificiosCosto += CRISIS.genio.descuento;
  for (const id of civ.rasgos) acumular(m, RASGO[id].efectos);
  for (const tipo of new Set(Object.values(civ.edificios).filter((b) => b.desde <= t).map((b) => b.tipo))) acumular(m, EDIFICIO[tipo].efectos);
  for (const id of civ.tecnologias) acumular(m, TEC[id].efectos);
  for (const w of civ.maravillas) if (w.desde <= t) acumular(m, MARAVILLA[w.id].efectos);
  for (const [era, n] of Object.entries(civ.dilemas)) acumular(m, DILEMAS[era].opciones[n - 1].efectos);
  for (const x of civ.temporales) if (t >= (x.desde ?? 0) && t <= x.hasta) acumular(m, x.efectos);
  return m;
}

// ---- gente y oficios (3.2) ----
// Personas de cada oficio: floor(Poblacion x pct / 100); las que sobran por redondeo van a los granjeros (nadie queda sin oficio).
export function personasPorOficio(poblacion, reparto) {
  const gente = reparto.map((p) => Math.floor(poblacion * p / 100));
  gente[0] += poblacion - gente.reduce((a, b) => a + b, 0);
  return gente;
}

// Normaliza un `asignar`: `parcial` = { oficio: porcentaje } con los oficios nombrados (los demas quedan como estaban). Cada valor se acota a 0..100 y se redondea al
// multiplo de 10 mas cercano (empate hacia arriba); la diferencia con 100 se ajusta quitando o sumando 10 al oficio mas grande (empate: el primero en el orden de los
// oficios) hasta cerrar. Cada paso mueve 10 puntos y la suma maxima es 600, asi que son a lo sumo 50 pasos. Nunca se descarta.
export function normalizarReparto(actual, parcial) {
  const r = OFICIOS.map((o, i) => (parcial[o] === undefined ? actual[i] : Math.round(Math.min(100, Math.max(0, parcial[o])) / 10) * 10));
  const mayor = () => r.reduce((mejor, x, i) => (x > r[mejor] ? i : mejor), 0);
  for (let paso = 0; paso < 60; paso++) {
    const suma = r.reduce((a, b) => a + b, 0);
    if (suma === 100) break;
    if (suma > 100) r[mayor()] -= 10; else r[mayor()] += 10;
  }
  return r;
}

// ---- produccion (3.9) ----
// produccion = redondear(base x (1 + S - penalizacion)) por recurso, con S la SUMA de los bonos de ese recurso; los bonos planos se suman a la base antes del
// multiplicador; piso 0; redondeo al entero mas cercano (empate hacia arriba). La penalizacion (-20 %) rige con la Estabilidad DEL CIERRE DEL TURNO ANTERIOR.
export function produccion(civ, mundo, t, m = modificadores(civ, t)) {
  const gente = personasPorOficio(civ.poblacion, civ.reparto);
  const base = Object.fromEntries(RECURSOS.map((r) => [r, 0]));
  for (const id of civ.regiones) for (const r of RECURSOS) base[r] += mundo.regs[id].flujo[r];
  OFICIOS.forEach((o, i) => { const [rec, tasa] = PRODUCE_OFICIO[o]; base[rec] += gente[i] * tasa; });
  base.Hierro += gente[OFICIOS.indexOf('mineros')] * m.mineroHierro;
  const hayMina = Object.values(civ.edificios).some((b) => b.tipo === 'mina' && b.desde <= t);
  if (hayMina) base.Hierro += m.hierroMina;
  const penal = civ.estabilidad < ESTABILIDAD.bajo ? ESTABILIDAD.penalizacionProduccion : 0;
  return Object.fromEntries(RECURSOS.map((r) => {
    const plano = base[r] + m.plano[r] + m.planoRegion[r] * civ.regiones.length;
    return [r, Math.max(0, Math.round(plano * (1 + m.pct[r] - penal)))];
  }));
}

// Espacio para la gente: 6 + 3 por region + bonos de edificios y Maravillas.
export const espacioDe = (civ, m) => ESPACIO.base + ESPACIO.porRegion * civ.regiones.length + m.espacio;

// ---- Estabilidad (3.8), la parte que no depende de eventos: 50 + bonos (edificios de Espiritu, tecnologias, Maravillas, rasgos, dilemas, eventos vigentes)
// + floor(Cultura de este turno / 5) - 2 por cada region sobre 6 - 10 si hubo hambre; limitada a 0..100.
export function estabilidadDe(civ, t, m = modificadores(civ, t)) {
  const v = ESTABILIDAD.base + m.estabilidad + Math.floor(civ.cultura / ESTABILIDAD.culturaPorPunto)
    - ESTABILIDAD.porRegionDeMas * Math.max(0, civ.regiones.length - ESTABILIDAD.regionesLibres) + (civ.hambre ? HAMBRE.estabilidad : 0);
  return Math.max(0, Math.min(100, v));
}

export const ceilDiv = (a, b) => Math.floor((a + b - 1) / b);

// Cuantos tipos de edificio de Espiritu hay activos (para mostrar las causas de la Estabilidad).
export const edificiosDeEspiritu = (civ, t) => new Set(Object.values(civ.edificios).filter((b) => b.desde <= t && EDIFICIO[b.tipo].rama === ESPIRITU_RAMA).map((b) => b.tipo)).size;
