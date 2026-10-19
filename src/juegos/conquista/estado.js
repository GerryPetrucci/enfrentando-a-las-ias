// Estado de una partida de Guerra de territorios y funciones para consultarlo. Aqui no hay reglas de turno.

import { crearMapa, biomaDeSeed } from '../../mapa.js';
import { ALMACEN_INICIAL, NOMBRES_REINOS, TROPAS_CAPITAL, TROPAS_VECINA, HONOR, EDIFICIOS } from './constantes.js';
import { nombresValidos } from './nombres.js';

export const nombreRegion = (id) => 'R' + String(id + 1).padStart(2, '0');

// `bioma` fuerza la forma del mapa (continente, arido, mares o interior); sin el, sale del seed del mapa (biomaDeSeed). Si viene `mapa` ya creado, manda ese y se ignora el bioma.
// `nombres`: el nombre de reino de cada asiento (nombres.js); si no sirven (otra cantidad, repetidos, desconocidos) valen los de siempre, uno por asiento.
export function crearEstado(rng, { jugadores = 4, mapa = null, bioma, nombres } = {}) {
  const k = Math.max(2, Math.min(5, Math.round(jugadores)));
  const nombreDe = (s) => (nombresValidos(nombres, k) ? nombres[s] : NOMBRES_REINOS[s]);
  if (mapa && mapa.k !== k) throw new Error(`el mapa es de ${mapa.k} reinos y se pidieron ${k}`);
  const seedMapa = Math.floor(rng() * 4294967296) >>> 0; // siempre se consume, venga o no el mapa dado
  const m = mapa ?? crearMapa(seedMapa, k, { bioma: bioma ?? biomaDeSeed(seedMapa) });
  const NR = m.regs.length;
  const dueno = Int8Array.from(m.inicio.dueno), tropas = new Int16Array(NR), fort = new Int8Array(NR);
  dueno.forEach((d, r) => { if (d >= 0) tropas[r] = r === m.inicio.capitales[d] ? TROPAS_CAPITAL : TROPAS_VECINA; });
  m.inicio.capitales.forEach((c) => { fort[c] = 1; });
  const reinos = Array.from({ length: k }, (_, s) => ({
    s, nombre: nombreDe(s), vivo: true, capital: m.inicio.capitales[s], stock: { ...ALMACEN_INICIAL }, armas: 0,
    honor: HONOR.inicial, deshonrado: false, pactos: Array(k).fill(0), pactoOk: Array(k).fill(false), propuestaPrevia: null,
    nota: '', privIn: [], ofertasIn: [], cayoEn: null, regsAlCaer: 0,
  }));
  return {
    turno: 0, k, mapa: m, dueno, tropas, fort, edif: Array(NR).fill(null), dan: new Uint8Array(NR), reinos,
    maravilla: null, ganador: null, ganoPorMaravilla: false,
    desempate: Array.from({ length: k }, () => rng()),
    stats: Array.from({ length: k }, () => ({ rupturas: 0, pactos: 0, cumplidos: 0, comercios: 0, edificios: 0, validas: 0, total: 0, invalidas: 0 })),
    resumenPrevio: [], mensajesPrevios: [], regalosPrevios: Array.from({ length: k }, () => []), historial: [],
  };
}

// a y b son aliados en el turno t si el pacto entre ellos sigue vigente en ese turno
export const aliado = (E, a, b, t) => a !== b && E.reinos[a].pactos[b] >= t;

export function regionesDe(E, s) {
  const out = [];
  for (let r = 0; r < E.dueno.length; r++) if (E.dueno[r] === s) out.push(r);
  return out;
}
export function totalTropas(E, s) {
  let n = 0;
  for (let r = 0; r < E.dueno.length; r++) if (E.dueno[r] === s) n += E.tropas[r];
  return n;
}
export function contarEdificios(E, s, tipo, salvo = -1) {
  let n = 0;
  for (let r = 0; r < E.dueno.length; r++) if (r !== salvo && E.dueno[r] === s && E.edif[r] === tipo) n++;
  return n;
}
export const almacenTotal = (reino) => Object.values(reino.stock).reduce((a, b) => a + b, 0);

// Orden final: el ganador primero; luego los vivos por regiones, tropas, almacen y sorteo con seed;
// luego los caidos por quien cayo mas tarde y cuantas regiones tenia.
export function clasificar(E) {
  const filas = E.reinos.map((r) => ({
    s: r.s, vivo: r.vivo, reg: regionesDe(E, r.s).length, tr: totalTropas(E, r.s), st: almacenTotal(r),
    cayoEn: r.cayoEn ?? 0, regsAlCaer: r.regsAlCaer, sorteo: E.desempate[r.s],
  }));
  filas.sort((a, b) => (Number(b.vivo) - Number(a.vivo))
    || (a.vivo ? (b.reg - a.reg || b.tr - a.tr || b.st - a.st) : (b.cayoEn - a.cayoEn || b.regsAlCaer - a.regsAlCaer))
    || (b.sorteo - a.sorteo));
  if (E.ganador !== null) { const i = filas.findIndex((f) => f.s === E.ganador); filas.unshift(...filas.splice(i, 1)); }
  return filas;
}

// Copia simple (arreglos y objetos planos) del estado visible, para guardar en cada registro de turno y reproducir el video.
export function instantanea(E) {
  return {
    dueno: Array.from(E.dueno), tropas: Array.from(E.tropas), fort: Array.from(E.fort),
    edif: E.edif.map((e) => (e ? EDIFICIOS[e].letra : null)), dan: Array.from(E.dan),
    stock: E.reinos.map((r) => ({ ...r.stock })), armas: E.reinos.map((r) => r.armas), honor: E.reinos.map((r) => r.honor),
    vivo: E.reinos.map((r) => r.vivo), pactos: E.reinos.map((r) => [...r.pactos]),
    maravilla: E.maravilla ? { ...E.maravilla } : null, notas: E.reinos.map((r) => r.nota),
  };
}
