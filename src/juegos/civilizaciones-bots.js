// Bots de control de la Carrera de civilizaciones (spec 9.1). No son IAs: son politicas con parametros que sirven para probar el motor y calibrar el balance.
// Un solo `jugar(E, s, perfil, rng)` escribe las ordenes COMO LAS ESCRIBIRIA UNA IA (texto que pasa por el parser). Leen solo SU civilizacion y el mundo (nunca la nota ni el
// mensaje del rival: no hay modelo de lenguaje) y no modifican el estado. Todo lo aleatorio sale del rng que reciben.

import { OFICIOS, TEC, TECNOLOGIAS, EDIFICIO, RECURSOS_ALMACEN } from './civilizaciones/constantes.js';
import { nombreRegion, fronteraDe } from './civilizaciones/mundo.js';
import { modificadores } from './civilizaciones/economia.js';
import { costoColonizar, costoEdificio } from './civilizaciones/edificios.js';
import { disponibles } from './civilizaciones/tecnologia.js';
import { tieneTipo } from './civilizaciones/estado.js';

const COMUNES = ['granero', 'templo', 'biblioteca', 'acueducto', 'academia', 'mercado', 'aserradero', 'cantera', 'universidad', 'anfiteatro', 'hospital', 'imprenta', 'laboratorio', 'museo', 'parlamento'];

export const PERFILES = {
  cientifico: { reparto: [30, 10, 10, 0, 40, 10], ramas: ['S', 'E', 'T', 'C', 'M', 'D'], edificios: ['biblioteca', 'templo', 'academia', 'granero', 'universidad', 'imprenta', 'laboratorio', 'acueducto'], hasta: 8, rasgos: ['eruditos', 'constructores'] },
  expansionista: { reparto: [40, 20, 10, 10, 10, 10], ramas: ['T', 'C', 'E', 'S', 'M', 'D'], edificios: ['granero', 'acueducto', 'templo', 'mercado', 'hospital'], hasta: 12, rasgos: ['agricultores', 'pioneros'] },
  equilibrado: { reparto: [30, 10, 10, 20, 20, 10], ramas: ['S', 'E', 'T', 'C', 'M', 'D'], edificios: COMUNES, hasta: 8, minEstabilidad: 60, rotar: true, rasgos: ['eruditos', 'constructores'] },
  pasivo: { pasivo: true, rasgos: ['agricultores', 'constructores'] },
};

export const INFO_BOTS = {
  cientifico: { nombre: 'Científico', color: '#5A8FB8' },
  expansionista: { nombre: 'Expansionista', color: '#6FA86F' },
  equilibrado: { nombre: 'Equilibrado', color: '#C9A24B' },
  pasivo: { nombre: 'Pasivo', color: '#9C8FB8' },
  azar: { nombre: 'Al azar', color: '#B8544A' },
};

const base = (extra) => ({ mensaje: '', nota: '', razon: 'bot de control', ...extra });
const textoReparto = (r) => `asignar ${OFICIOS.map((o, i) => `${o} ${r[i]}`).join(' ')}`;
const valor = (E, c, r) => { const f = E.mundo.regs[r].flujo; return f.Comida * 2 + f.Madera * 1.5 + f.Hierro + (c.tecnologias.includes('S1') ? 1 : 0); };

export function jugar(E, s, perfil, rng) {
  const c = E.civs[s];
  if (!c.fundada) {
    const fundacion = { nombre: perfil.pasivo ? 'Pasiva' : `Bot ${perfil.id}`, lema: 'Control del experimento', sitio: 1, rasgos: perfil.rasgos };
    return base({ fundacion, ordenes: perfil.pasivo ? [] : [textoReparto(perfil.reparto)] });
  }
  if (perfil.pasivo) return base({ ordenes: [] });
  const t = E.turno + 1, m = modificadores(c, t), o = [];
  const stock = { ...c.stock };
  const pagar = (costo) => { for (const [r, n] of Object.entries(costo)) stock[r] -= n; };
  const alcanza = (costo) => Object.entries(costo).every(([r, n]) => stock[r] >= n);

  // El reparto de la politica en el turno 1; despues, si el turno anterior hubo hambre, 10 puntos de sabios, artistas o mercaderes pasan a granjeros.
  const reparto = t === 1 ? [...perfil.reparto] : [...c.reparto];
  if (c.hambre) { const j = [4, 5, 3].find((k) => reparto[k] >= 10); if (j !== undefined) { reparto[j] -= 10; reparto[0] += 10; } }
  if (t === 1 || c.hambre) o.push(textoReparto(reparto));

  // Expansion: coloniza la vecina mas rica mientras haya con que, hasta `hasta` regiones y sin pasar de 2 por turno.
  const regiones = [...c.regiones];
  for (let n = 0; n < 2 && regiones.length < perfil.hasta && c.estabilidad >= (perfil.minEstabilidad ?? 0); n++) {
    const costo = costoColonizar({ ...c, regiones }, m);
    if (!alcanza(costo)) break;
    const r = fronteraDe(E.mundo, regiones).sort((a, b) => valor(E, c, b) - valor(E, c, a) || a - b)[0];
    if (r === undefined) break;
    pagar(costo); regiones.push(r); o.push(`colonizar ${nombreRegion(r)}`);
  }

  // Un edificio por turno: el primero de su lista desbloqueado, que no tenga y que alcance, en una region sin edificio.
  const libre = regiones.find((r) => !c.edificios[r]);
  if (libre !== undefined) {
    const tipo = perfil.edificios.find((e) => c.tecnologias.includes(EDIFICIO[e].tec) && !tieneTipo(c, e) && alcanza(costoEdificio(e, m)));
    if (tipo) { pagar(costoEdificio(tipo, m)); o.push(`construir ${nombreRegion(libre)} ${tipo}`); }
  }

  // Investigacion: llena los proyectos libres con la tecnologia mas barata de su rama preferida (rotando ramas si `rotar`).
  const enCurso = new Set(c.proyectos.map((p) => p.tec));
  const orden = (a, b) => (perfil.rotar ? TEC[a].era - TEC[b].era || perfil.ramas.indexOf(TEC[a].rama) - perfil.ramas.indexOf(TEC[b].rama)
    : perfil.ramas.indexOf(TEC[a].rama) - perfil.ramas.indexOf(TEC[b].rama) || TEC[a].era - TEC[b].era);
  const quedan = disponibles(c).filter((id) => !enCurso.has(id)).sort(orden);
  for (let libres = m.proyectos - c.proyectos.length; libres > 0 && quedan.length; libres--) o.push(`investigar ${TEC[quedan.shift()].nombre}`);
  return base({ ordenes: o.slice(0, 12), nota: `Plan: ${perfil.id}.` });
}

// Al azar: de 1 a 12 ordenes tomadas de la gramatica, algunas con basura. Solo prueba el motor y el parser; no entra a la tabla de balance.
const BASURA = ['', 'hola', 'asignar', 'construir', 'colonizar R99', 'investigar nada', 'invertir x', 'responder 9', 'aceptar 9', 'reclutar -3', 'regalar Oro 1.5', 'ofrecer Oro', 'dilema'];
export function azar(E, s, rng) {
  const c = E.civs[s], elige = (xs) => xs[Math.floor(rng() * xs.length)];
  const fundacion = c.fundada ? undefined : { nombre: elige(['Azar', '', 'N'.repeat(40)]), lema: elige(['', 'lema']), sitio: elige([1, 2, 3, 9, 'R07']), rasgos: [elige(TECNOLOGIAS).nombre, elige(['eruditos', 'pioneros', 'devotos'])] };
  const plantillas = [
    () => `asignar ${OFICIOS.map((of) => `${of} ${Math.floor(rng() * 12) * 10 - 10}`).join(' ')}`,
    () => `colonizar R${1 + Math.floor(rng() * 30)}`,
    () => `construir R${1 + Math.floor(rng() * 30)} ${elige(Object.keys(EDIFICIO))}`,
    () => `investigar ${elige(TECNOLOGIAS).nombre}`,
    () => `reclutar ${Math.floor(rng() * 50)}`,
    () => `invertir piramide ${elige(RECURSOS_ALMACEN)} ${1 + Math.floor(rng() * 20)}`,
    () => elige(BASURA),
  ];
  const n = 1 + Math.floor(rng() * 12);
  return { ...(fundacion ? { fundacion } : {}), ordenes: Array.from({ length: n }, () => elige(plantillas)()), mensaje: 'x', nota: 'azar', razon: 'azar' };
}

export const BOTS = {
  ...Object.fromEntries(Object.entries(PERFILES).map(([id, perfil]) => [id, (E, s, rng) => jugar(E, s, { ...perfil, id }, rng)])),
  azar,
};
