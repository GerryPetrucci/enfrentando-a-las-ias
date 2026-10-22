// Resolutor de batallas de la Guerra de territorios: PURO (no toca el estado de la partida). movimiento.js junta quien pelea en una region y aplica lo que sale de aqui.
//
// Un BANDO es un grupo de reinos que pelean juntos: { miembros: [{ k, pila, mejoras, mod }], defensor, ataca }.
//   pila: [Lanceros, Arqueros, Jinetes, Ingenios] que ese reino mete en la pelea · mejoras: sus niveles por tipo · mod: su modificador (tierra ajena, Reconquista...)
//   defensor: el bando del dueno de la region (recibe fortaleza y terreno) · ataca: si usa la fuerza de ataque de sus unidades (el Ingenio ataca con 3.5 y defiende con 1)
// El contexto { terr, fort, dueno } es de la region (`dueno`: el reino dueno, si lo hay; en su bando es el lider y siempre conserva al menos 1 unidad si el bando gana).

import { TERRENO, FORT_INGENIO } from './constantes.js';
import { sumaPila, sumarPilas, fuerzaDeMiembro } from './unidades.js';

// Fortaleza que cuenta contra esta mezcla atacante: con 1/4 de Ingenios la mitad, con 1/2 ninguna.
function fortalezaEfectiva(fort, atacantes) {
  const total = sumaPila(atacantes);
  if (!total) return fort;
  const parte = atacantes[3] / total;
  return parte >= FORT_INGENIO.anula ? 0 : parte >= FORT_INGENIO.mitad ? fort * 0.5 : fort;
}

export function fuerzasDeBandos(bandos, { terr, fort }) {
  return bandos.map((b, i) => {
    const otros = sumarPilas(bandos.filter((_, j) => j !== i).flatMap((x) => x.miembros.map((m) => m.pila)));
    let f = 0;
    for (const m of b.miembros) f += fuerzaDeMiembro(m.pila, m.mejoras, otros, b.ataca, m.mod ?? 1);
    if (b.defensor) f *= (1 + 0.5 * fortalezaEfectiva(fort, otros)) * TERRENO[terr] * (b.defensaMod ?? 1);
    return f;
  });
}

// El lider de un bando: el dueno de la region si pelea en el, y si no el miembro con mas unidades (empate: el de menor numero).
function lider(b, dueno) {
  if (b.defensor && dueno !== undefined && b.miembros.some((m) => m.k === dueno)) return dueno;
  return b.miembros.reduce((m, x) => {
    const a = sumaPila(x.pila), c = sumaPila(m.pila);
    return a > c || (a === c && x.k < m.k) ? x : m;
  }).k;
}

const masNumeroso = (pila) => { let t = 0; for (let u = 1; u < pila.length; u++) if (pila[u] > pila[t]) t = u; return t; };

// -> { fichas (de mayor a menor fuerza: { i, k, n, f, defensor, ataca, miembros, uni }), empate, ganador (ficha o null), fraccion, supervivientes ([{ k, pila }] del ganador), perdidas, todos }
// Gana el bando de mayor fuerza y conserva `unidades x (1 - fuerza del segundo / la suya)` de cada pila (al menos 1 unidad en total, y 1 del dueno si el bando es el suyo); los demas bandos se eliminan.
// Si llegan 3 o mas pelean los dos mas fuertes. Un empate de los dos primeros no tiene ganador: lo resuelve quien llama (el defensor resiste con 1 unidad o la region queda libre).
export function resolverBatalla(bandos, contexto) {
  const f = fuerzasDeBandos(bandos, contexto);
  const fichas = bandos.map((b, i) => ({ i, k: lider(b, contexto.dueno), n: b.miembros.reduce((s, m) => s + sumaPila(m.pila), 0), f: f[i], defensor: !!b.defensor, ataca: !!b.ataca, miembros: b.miembros, uni: sumarPilas(b.miembros.map((m) => m.pila)) }));
  fichas.sort((a, c) => c.f - a.f || Number(c.defensor) - Number(a.defensor) || a.k - c.k);
  const todos = fichas.reduce((s, x) => s + x.n, 0);
  const [a, b] = fichas;
  if (!b || a.f === b.f) return { fichas, empate: true, ganador: null, fraccion: 0, supervivientes: [], perdidas: todos, todos };
  const fraccion = 1 - b.f / a.f;
  // El 1e-9 evita perder una unidad por el redondeo de los decimales (12 x (1 - 4.25 / 10.2) da 6.999999999999999 en vez de 7).
  const supervivientes = a.miembros.map((m) => ({ k: m.k, pila: m.pila.map((n) => Math.floor(n * fraccion + 1e-9)) }));
  const dejaUna = (miembro) => { // 1 unidad del tipo mas numeroso de ese miembro
    const sup = supervivientes.find((x) => x.k === miembro.k);
    sup.pila[masNumeroso(miembro.pila)] = 1;
  };
  if (supervivientes.reduce((s, x) => s + sumaPila(x.pila), 0) === 0) dejaUna(a.miembros.reduce((m, x) => (sumaPila(x.pila) > sumaPila(m.pila) ? x : m))); // al menos 1 unidad en total
  const dueno = a.defensor ? a.miembros.find((m) => m.k === contexto.dueno) : null;
  if (dueno && sumaPila(dueno.pila) > 0 && sumaPila(supervivientes.find((x) => x.k === dueno.k).pila) === 0) dejaUna(dueno); // el dueno que gana no se queda sin guarnicion
  const quedan = supervivientes.reduce((s, x) => s + sumaPila(x.pila), 0);
  return { fichas, empate: false, ganador: a, fraccion, supervivientes, perdidas: a.n - quedan + b.n, todos };
}
