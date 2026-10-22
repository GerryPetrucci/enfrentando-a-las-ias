// Unidades de la Guerra de territorios: funciones PURAS sobre pilas [Lanceros, Arqueros, Jinetes, Ingenios]. Aqui no hay estado de partida.

import { UNIDADES, DOMINA, DOMINIO, MEJORAS, N_TIPOS } from './constantes.js';

export const pilaVacia = () => Array(N_TIPOS).fill(0);
export const sumaPila = (p) => p[0] + p[1] + p[2] + p[3];
export const pilaDeTipo = (tipo, n) => { const p = pilaVacia(); p[tipo] = n; return p; };
export function sumarPilas(pilas) { const out = pilaVacia(); for (const p of pilas) for (let t = 0; t < N_TIPOS; t++) out[t] += p[t]; return out; }

// Una sola unidad, la del tipo mas numeroso (empate: el de menor indice). Es lo que resiste en un empate.
export function dejarUna(pila) {
  let mejor = 0;
  for (let t = 1; t < N_TIPOS; t++) if (pila[t] > pila[mejor]) mejor = t;
  return pilaDeTipo(mejor, pila[mejor] > 0 ? 1 : 0);
}

// Cuanto rinde un tipo contra la mezcla del rival: el doble contra los tipos que domina, en proporcion a las unidades de cada tipo.
export function multiplicadorDominio(tipo, mezcla) {
  const total = sumaPila(mezcla);
  if (total <= 0) return 1;
  let dominadas = 0;
  for (const v of DOMINA[tipo]) dominadas += mezcla[v];
  return 1 + (DOMINIO - 1) * dominadas / total;
}

// Fuerza de la pila de UN reino contra la mezcla rival. `ataca` elige la fuerza de ataque o de defensa de cada tipo; `mod` es el modificador del reino (tierra ajena, Reconquista...).
export function fuerzaDeMiembro(pila, mejoras, mezcla, ataca, mod = 1) {
  let f = 0;
  for (let t = 0; t < N_TIPOS; t++) {
    const n = pila[t];
    if (!n) continue;
    const base = ataca ? UNIDADES[t].fuerzaAtaca : UNIDADES[t].fuerzaDefiende;
    f += n * base * (1 + MEJORAS.bono * (mejoras?.[t] ?? 0)) * multiplicadorDominio(t, mezcla);
  }
  return f * mod;
}

export function racionesDe(pila) { let n = 0; for (let t = 0; t < N_TIPOS; t++) n += pila[t] * UNIDADES[t].racion; return n; }

// Costo de reclutar una pila: suma por recurso y redondea hacia arriba UNA vez por recurso (factor 0.5 en un cuartel).
export function costoDePila(pila, factor = 1) {
  const suma = {};
  for (let t = 0; t < N_TIPOS; t++) if (pila[t]) for (const [rec, c] of Object.entries(UNIDADES[t].costo)) suma[rec] = (suma[rec] ?? 0) + pila[t] * c;
  const out = {};
  for (const [rec, v] of Object.entries(suma)) out[rec] = Math.ceil(v * factor - 1e-9);
  return out;
}

// "L", "lancero", "Lanceros"... -> indice del tipo, o null.
const TEXTOS = new Map();
UNIDADES.forEach((u, t) => { TEXTOS.set(u.id.toLowerCase(), t); TEXTOS.set(u.nombre.toLowerCase(), t); TEXTOS.set(u.nombre.toLowerCase() + 's', t); });
export function unidadDeTexto(texto) {
  if (typeof texto !== 'string') return null;
  const limpio = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return TEXTOS.get(limpio) ?? null;
}
