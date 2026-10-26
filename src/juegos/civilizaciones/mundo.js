// El mundo de la Carrera de civilizaciones (spec 2): el mapa de 26 regiones de src/mapa.js con lo que produce cada region y los 3 sitios de capital.
// Cada civilizacion vive en su propia COPIA del mundo (mismos ids, terreno y recursos); aqui solo esta lo que es igual para las dos y no cambia en toda la partida.

import { crearMapa, biomaDeSeed, distancias } from '../../mapa.js';
import { RECURSOS, TERRENO, BONO_RECURSO_REGION, SITIOS } from './constantes.js';

export const nombreRegion = (id) => 'R' + String(id + 1).padStart(2, '0');
const suma = (xs) => xs.reduce((a, b) => a + b, 0);

// Lo que produce una region por si sola: +1 del recurso de su terreno y +2 del recurso que tenga (Caballos da Oro).
function flujoDe(reg) {
  const f = Object.fromEntries(RECURSOS.map((r) => [r, 0]));
  if (TERRENO[reg.terr]) f[TERRENO[reg.terr]] += 1;
  if (reg.rec) f[reg.rec === 'Caballos' ? 'Oro' : reg.rec] += BONO_RECURSO_REGION;
  return f;
}

// Tres sitios de capital iguales para las dos civilizaciones: la region mas fertil (mas Comida a 2 pasos), una de montana con metal (Hierro o Roca a 1 paso)
// y la mas central de bosque (menor distancia media a las demas). Cada criterio ordena TODAS las regiones (con sus preferencias primero) y toma la primera que no
// se haya tomado ya, asi siempre salen tres sitios distintos aunque a un criterio le falte candidata.
function sitiosDe(regs, ds) {
  const n = regs.length;
  const cerca = (r, pasos) => regs.filter((q) => ds[r.id][q.id] <= pasos);
  const comida2 = (r) => suma(cerca(r, 2).map((q) => q.flujo.Comida));
  const hayMetal = (r) => cerca(r, 1).some((q) => q.rec === 'Hierro' || q.rec === 'Roca');
  const distMedia = (r) => suma(Array.from(ds[r.id]).slice(0, n));
  const ordenar = (clave) => [...regs].sort((a, b) => clave(a) - clave(b) || a.id - b.id).map((r) => r.id);
  const fertil = ordenar((r) => -comida2(r));
  const metal = ordenar((r) => (r.terr === 'mo' && hayMetal(r) ? 0 : hayMetal(r) ? 1 : r.terr === 'mo' ? 2 : 3));
  const bosque = ordenar((r) => ((r.terr === 'bo' || r.rec === 'Madera') ? 0 : 1) * 1e6 + distMedia(r));
  const tomados = [];
  for (const lista of [fertil, metal, bosque]) tomados.push(lista.find((id) => !tomados.includes(id)));
  return tomados.slice(0, SITIOS);
}

// `mapa`: un mapa ya creado (las pruebas pasan uno con copia propia); sin el, sale del seed y de su bioma.
export function crearMundo(seedMundo, { mapa = null, bioma } = {}) {
  const m = mapa ?? crearMapa(seedMundo, 2, { bioma: bioma ?? biomaDeSeed(seedMundo, 2) });
  const regs = m.regs.map((r) => ({ id: r.id, nombre: nombreRegion(r.id), terr: r.terr, rec: r.rec, vecinos: [...r.vecinos], flujo: flujoDe(r) }));
  const ds = regs.map((r) => distancias(m.regs, r.id));
  return { seed: seedMundo, bioma: m.bioma, mapa: m, regs, ds, sitios: sitiosDe(regs, ds) };
}

// Las regiones con las que empieza una civilizacion en `sitio`: la capital y sus vecinas mas cercanas (distancia y despues id), `cuantas` en total.
export function regionesIniciales(mundo, sitio, cuantas) {
  return [...mundo.regs].sort((a, b) => mundo.ds[sitio][a.id] - mundo.ds[sitio][b.id] || a.id - b.id).slice(0, cuantas).map((r) => r.id);
}

// Regiones libres vecinas de alguna de `propias` (las que se pueden colonizar), por id.
export function fronteraDe(mundo, propias) {
  const mias = new Set(propias);
  return mundo.regs.filter((r) => !mias.has(r.id) && r.vecinos.some((v) => mias.has(v))).map((r) => r.id);
}
