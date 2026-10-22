// Estrategias de control de la Guerra de territorios. No son IAs: son bots simples que sirven para probar el motor
// y para calibrar. Leen el estado completo y NUNCA lo modifican; devuelven una respuesta como la de una IA.

import { nombreRegion as nr, regionesDe, totalTropas, tropasDe } from './conquista/estado.js';
import { RECURSOS, MARAVILLA } from './conquista/constantes.js';
import { nombresDeLaPartida } from './conquista/ordenes.js';

const vecinas = (E, r) => E.mapa.regs[r].vecinos;
const base = (extra) => ({ pacto_con: null, mensaje: '', privados: [], nota: '', razon: 'bot de control', ...extra });

function reclutarSobrante(E, s, o) {
  const r = E.reinos[s], libre = r.stock.Comida - Math.ceil(totalTropas(E, s) / 4) - 2;
  if (libre >= 1) o.push(`reclutar ${nr(r.capital)} ${Math.min(libre, 8)}`);
}
function expandir(E, s, o, usado, n = 2) {
  for (const r of regionesDe(E, s)) {
    const disp = tropasDe(E, r) - 1 - (usado.get(r) ?? 0);
    if (disp < n) continue;
    const v = vecinas(E, r).find((x) => E.dueno[x] === -1);
    if (v !== undefined) { o.push(`mover ${nr(r)} ${nr(v)} ${n}`); usado.set(r, (usado.get(r) ?? 0) + n); }
  }
}

// Ataca siempre al vecino mas debil con todo lo que le sobra; nunca propone pactos.
export function agresivo(E, s) {
  const o = [], usado = new Map();
  reclutarSobrante(E, s, o);
  if (E.reinos[s].stock.Oro >= 6) o.push(`mercenarios ${nr(E.reinos[s].capital)} 3`);
  for (const r of regionesDe(E, s)) {
    const disp = tropasDe(E, r) - 1 - (usado.get(r) ?? 0);
    if (disp < 3) continue;
    const enemigos = vecinas(E, r).filter((v) => E.dueno[v] >= 0 && E.dueno[v] !== s).sort((a, b) => tropasDe(E, a) - tropasDe(E, b));
    const objetivo = enemigos[0] ?? vecinas(E, r).find((v) => E.dueno[v] === -1);
    if (objetivo === undefined) continue;
    o.push(`mover ${nr(r)} ${nr(objetivo)} ${disp}`);
    usado.set(r, disp);
  }
  return base({ ordenes: o.slice(0, 12), mensaje: 'Voy por todo.', nota: 'Plan: atacar al mas debil.' });
}

// Crece sin pelear, fortifica la capital y propone paz a todos.
export function pacifico(E, s) {
  const o = [], usado = new Map(), r = E.reinos[s];
  reclutarSobrante(E, s, o);
  if (r.stock.Madera >= 4 && r.stock.Roca >= 4 && E.fort[r.capital] < 2) o.push(`fortificar ${nr(r.capital)}`);
  expandir(E, s, o, usado);
  const otro = E.reinos.find((x) => x.vivo && x.s !== s);
  return base({ ordenes: o.slice(0, 12), pacto_con: otro ? otro.nombre : null, mensaje: 'Busco la paz.', nota: 'Plan: crecer sin pelear.' });
}

// Construye, comercia lo que le sobra y levanta la Maravilla en cuanto puede.
export function economico(E, s) {
  const o = [], usado = new Map(), r = E.reinos[s], st = r.stock;
  reclutarSobrante(E, s, o);
  const libre = regionesDe(E, s).find((x) => !E.edif[x] && x !== r.capital);
  if (libre !== undefined && st.Madera >= 4) o.push(`construir ${nr(libre)} granja`);
  else if (libre !== undefined && st.Madera >= 3 && st.Roca >= 3) o.push(`construir ${nr(libre)} mercado`);
  if (!E.maravilla && Object.entries(MARAVILLA.costo).every(([rec, n]) => st[rec] >= n)) o.push(`construir ${nr(r.capital)} maravilla`);
  const oferta = r.ofertasIn[0];
  if (oferta) o.push(`aceptar ${E.reinos[oferta.de].nombre}`);
  else {
    const sobra = Object.entries(st).find(([rec, v]) => rec !== 'Caballos' && v >= 12), falta = Object.entries(st).find(([rec, v]) => rec !== 'Caballos' && v <= 2);
    const otro = E.reinos.find((x) => x.vivo && x.s !== s);
    if (sobra && falta && sobra[0] !== falta[0] && otro) o.push(`ofrecer ${otro.nombre} ${sobra[0]} 4 ${falta[0]} 4`);
  }
  expandir(E, s, o, usado);
  return base({ ordenes: o.slice(0, 12), nota: 'Plan: construir y comerciar.' });
}

// Manda ordenes al azar, muchas invalidas a proposito, para probar que el motor las descarta sin romperse.
export function azar(E, s, rng) {
  const NR = E.mapa.regs.length, entero = (n) => Math.floor(rng() * n), reg = () => nr(entero(NR + 2)), n = () => 1 + entero(6);
  const nombres = nombresDeLaPartida(E), nombre = () => nombres[entero(5)], rec = () => RECURSOS[entero(6)]; // los de la partida primero: con los de siempre sale lo mismo que antes
  const plantillas = [
    () => `reclutar ${reg()} ${n()}`, () => `mover ${reg()} ${reg()} ${n()}`, () => `fortificar ${reg()}`, () => `mejorar ${['L', 'A', 'J', 'I', 'X'][entero(5)]}`, () => `mercenarios ${reg()} ${n()}`,
    () => `reclutar ${reg()} ${['L', 'A', 'J', 'I'][entero(4)]}${n()}`, () => `mover ${reg()} ${reg()} ${['L', 'A', 'J', 'I'][entero(4)]}${n()}`, () => `mover ${reg()} ${reg()} todo`,
    () => `regalar ${rec()} ${n()} ${nombre()}`, () => `ofrecer ${nombre()} ${rec()} ${n()} ${rec()} ${n()}`, () => `aceptar ${nombre()}`,
    () => `construir ${reg()} ${['granja', 'mercado', 'cuartel', 'maravilla'][entero(4)]}`, () => `romper ${nombre()}`, () => 'basura sin sentido',
  ];
  const o = Array.from({ length: entero(8) }, () => plantillas[entero(plantillas.length)]());
  const propias = regionesDe(E, s);
  if (propias.length && rng() < 0.7) o.push(`mover ${nr(propias[0])} ${nr(entero(NR))} 1`);
  return base({
    ordenes: o, pacto_con: rng() < 0.3 ? nombre() : null, mensaje: rng() < 0.5 ? 'hola' : '',
    privados: rng() < 0.4 ? [{ a: nombre(), texto: 'secreto' }] : [], nota: rng() < 0.5 ? 'plan al azar' : undefined,
  });
}

export const BOTS = { agresivo, pacifico, economico, azar };

// Como se muestran en el marcador y el video (texto publico: lleva acentos). Los colores son de control, no de una IA.
export const INFO_BOTS = {
  agresivo: { nombre: 'Agresivo', color: '#B8544A' },
  pacifico: { nombre: 'Pacífico', color: '#6FA86F' },
  economico: { nombre: 'Económico', color: '#C9A24B' },
  azar: { nombre: 'Al azar', color: '#9C8FB8' },
};
