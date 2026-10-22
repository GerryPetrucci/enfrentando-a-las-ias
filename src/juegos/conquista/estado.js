// Estado de una partida de Guerra de territorios y funciones para consultarlo. Aqui no hay reglas de turno.

import { crearMapa, biomaDeSeed } from '../../mapa.js';
import { ALMACEN_INICIAL, NOMBRES_REINOS, TROPAS_CAPITAL, TROPAS_VECINA, HONOR, EDIFICIOS, N_TIPOS } from './constantes.js';
import { nombresValidos } from './nombres.js';
import { listaDeAisladas } from './suministro.js';
import { sortearCalendario } from './equilibrio.js';

export const nombreRegion = (id) => 'R' + String(id + 1).padStart(2, '0');

// ---- Unidades: cada region guarda, para CADA reino presente (el dueno y a veces invitados), cuantas unidades hay de cada tipo ----
// E.uni es un Int16Array de (regiones x reinos x tipos): indice (r * k + reino) * N_TIPOS + tipo. Tipos: 0 Lancero, 1 Arquero, 2 Jinete, 3 Ingenio.
// `tropasDe(E, r)` es la guarnicion del DUENO de la region (0 si no tiene dueno): lo que antes era E.tropas[r].
export { N_TIPOS };
const idx = (E, r, k, t = 0) => (r * E.k + k) * N_TIPOS + t;
export const uniDe = (E, r, k, t) => E.uni[idx(E, r, k, t)];
export const sumarUni = (E, r, k, t, n) => { E.uni[idx(E, r, k, t)] += n; };
export function pila(E, r, k) { const i = idx(E, r, k); return [E.uni[i], E.uni[i + 1], E.uni[i + 2], E.uni[i + 3]]; }
export function totalPila(E, r, k) { const i = idx(E, r, k); return E.uni[i] + E.uni[i + 1] + E.uni[i + 2] + E.uni[i + 3]; }
export const tropasDe = (E, r) => (E.dueno[r] < 0 ? 0 : totalPila(E, r, E.dueno[r]));
// Deja en la region exactamente `n` Lanceros del reino k (por omision, el dueno) y borra sus demas tipos. Con k < 0 solo vale n = 0 (limpia la region).
export function ponerTropas(E, r, n, k = E.dueno[r]) {
  if (k < 0) { if (n !== 0) throw new Error(`ponerTropas: la region R${r + 1} no tiene dueno y se pidieron ${n} unidades`); limpiarRegion(E, r); return; }
  const i = idx(E, r, k);
  E.uni[i] = n; E.uni[i + 1] = E.uni[i + 2] = E.uni[i + 3] = 0;
}
// Deja la pila de unidades [L, A, J, I] del reino k en la region (sin tocar a los demas reinos).
export function ponerPila(E, r, k, p) { const i = idx(E, r, k); E.uni[i] = p[0]; E.uni[i + 1] = p[1]; E.uni[i + 2] = p[2]; E.uni[i + 3] = p[3]; }
// Suma una pila [L, A, J, I] a la del reino k en la region.
export function sumarPila(E, r, k, p) { const i = idx(E, r, k); E.uni[i] += p[0]; E.uni[i + 1] += p[1]; E.uni[i + 2] += p[2]; E.uni[i + 3] += p[3]; }
export function limpiarRegion(E, r) { E.uni.fill(0, idx(E, r, 0), idx(E, r, E.k)); }
export function presentes(E, r) { const out = []; for (let k = 0; k < E.k; k++) if (totalPila(E, r, k) > 0) out.push(k); return out; }
// Todas las unidades de un reino, en cualquier region (tambien las que estan de visita).
export function totalUnidades(E, k) { let n = 0; for (let r = 0; r < E.dueno.length; r++) n += totalPila(E, r, k); return n; }
export const totalTropas = totalUnidades;

// `bioma` fuerza la forma del mapa (uno de BIOMAS en src/mapa.js); sin el, sale del seed del mapa y de la cantidad de reinos (biomaDeSeed). Si viene `mapa` ya creado, manda ese y se ignora el bioma.
// `nombres`: el nombre de reino de cada asiento (nombres.js); si no sirven (otra cantidad, repetidos, desconocidos) valen los de siempre, uno por asiento.
export function crearEstado(rng, { jugadores = 4, mapa = null, bioma, nombres } = {}) {
  const k = Math.max(2, Math.min(5, Math.round(jugadores)));
  const nombreDe = (s) => (nombresValidos(nombres, k) ? nombres[s] : NOMBRES_REINOS[s]);
  if (mapa && mapa.k !== k) throw new Error(`el mapa es de ${mapa.k} reinos y se pidieron ${k}`);
  const seedMapa = Math.floor(rng() * 4294967296) >>> 0; // siempre se consume, venga o no el mapa dado
  const m = mapa ?? crearMapa(seedMapa, k, { bioma: bioma ?? biomaDeSeed(seedMapa, k) });
  const NR = m.regs.length;
  const dueno = Int8Array.from(m.inicio.dueno), uni = new Int16Array(NR * k * N_TIPOS), fort = new Int8Array(NR);
  m.inicio.capitales.forEach((c) => { fort[c] = 1; });
  const reinos = Array.from({ length: k }, (_, s) => ({
    s, nombre: nombreDe(s), vivo: true, capital: m.inicio.capitales[s], stock: { ...ALMACEN_INICIAL }, mejoras: Array(N_TIPOS).fill(0),
    honor: HONOR.inicial, deshonrado: false, pactos: Array(k).fill(0), pactoOk: Array(k).fill(false), propuestaPrevia: null,
    nota: '', privIn: [], ofertasIn: [], cayoEn: null, regsAlCaer: 0,
  }));
  const E = {
    turno: 0, k, mapa: m, dueno, uni, fort, edif: Array(NR).fill(null), dan: new Uint8Array(NR), reinos,
    maravilla: null, ganador: null, ganoPorMaravilla: false,
    // Paquete de equilibrio (2.0.0): el Hegemon (-1 = ninguno), el calendario de eventos (del seed del mapa) y hasta que turno dura la sequia
    hegemon: -1, calendario: sortearCalendario(seedMapa), sequiaHasta: 0,
    desempate: Array.from({ length: k }, () => rng()),
    stats: Array.from({ length: k }, () => ({ rupturas: 0, pactos: 0, cumplidos: 0, comercios: 0, edificios: 0, validas: 0, total: 0, invalidas: 0 })),
    resumenPrevio: [], mensajesPrevios: [], regalosPrevios: Array.from({ length: k }, () => []), historial: [],
  };
  dueno.forEach((d, r) => { if (d >= 0) ponerTropas(E, r, r === m.inicio.capitales[d] ? TROPAS_CAPITAL : TROPAS_VECINA, d); });
  return E;
}

// a y b son aliados en el turno t si el pacto entre ellos sigue vigente en ese turno
export const aliado = (E, a, b, t) => a !== b && E.reinos[a].pactos[b] >= t;
// hostil: distintos y sin pacto vigente en el turno t (los libres no son de nadie: no hay hostilidad con ellos)
export const hostil = (E, a, b, t) => a !== b && !aliado(E, a, b, t);

export function regionesDe(E, s) {
  const out = [];
  for (let r = 0; r < E.dueno.length; r++) if (E.dueno[r] === s) out.push(r);
  return out;
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
    dueno: Array.from(E.dueno), tropas: Array.from({ length: E.dueno.length }, (_, r) => tropasDe(E, r)), fort: Array.from(E.fort),
    edif: E.edif.map((e) => (e ? EDIFICIOS[e].letra : null)), dan: Array.from(E.dan),
    stock: E.reinos.map((r) => ({ ...r.stock })), armas: E.reinos.map((r) => Math.max(...r.mejoras)), mejoras: E.reinos.map((r) => [...r.mejoras]), honor: E.reinos.map((r) => r.honor),
    vivo: E.reinos.map((r) => r.vivo), pactos: E.reinos.map((r) => [...r.pactos]),
    maravilla: E.maravilla ? { ...E.maravilla } : null, notas: E.reinos.map((r) => r.nota),
    // `uni`: las pilas no vacias como [region, reino, L, A, J, I] (incluye a los invitados; `tropas` es solo la guarnicion del dueno)
    uni: pilasNoVacias(E),
    // `aisladas`: las regiones sin camino a la capital de su dueno al empezar el turno siguiente (no producen ni se recluta ahi)
    aisladas: listaDeAisladas(E, E.turno + 1),
    // `hegemon`: el reino que mas regiones tiene (-1 = ninguno) · `sequia`: si el turno siguiente es de sequia
    hegemon: E.hegemon, sequia: E.sequiaHasta >= E.turno + 1,
  };
}

function pilasNoVacias(E) {
  const out = [];
  for (let r = 0; r < E.dueno.length; r++) for (let k = 0; k < E.k; k++) if (totalPila(E, r, k) > 0) out.push([r, k, ...pila(E, r, k)]);
  return out;
}
