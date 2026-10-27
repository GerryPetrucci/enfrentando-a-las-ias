// Estado de una partida de la Carrera de civilizaciones y funciones para consultarlo. Aqui no hay reglas de turno (estan en turno/ y economia.js).
// Dos civilizaciones, cada una en su propia copia del mundo (spec 2): el mapa y los dados son iguales para las dos y lo unico compartido es lo publico.

import { crearMundo } from './mundo.js';
import {
  JUGADORES, ALMACEN_INICIAL, POBLACION_INICIAL, REPARTO_INICIAL, NOMBRE_FALLBACK, TEC, EDIFICIO, ERAS, TECNOLOGIAS_PARA_ERA, TECNOLOGIAS, RECURSOS_ALMACEN, INDICE_MAXIMO, MARAVILLA, COMERCIO,
} from './constantes.js';
import { indiceDe } from './indice.js';
import { calendarioEventos } from './avisos.js';

export function crearCivilizacion(s) {
  return {
    s, nombre: NOMBRE_FALLBACK[s], lema: '', rasgos: [], sitio: null, fundada: false, invalida: false, capital: null,
    regiones: [], edificios: {}, construidos: [],                       // edificios: { [region]: { tipo, desde } }; construidos: los tipos que se levantaron alguna vez
    poblacion: POBLACION_INICIAL, reparto: [...REPARTO_INICIAL], stock: { ...ALMACEN_INICIAL },
    reservaCiencia: 0, cultura: 0, culturaAcumulada: 0, produccionTotal: 0, produccion: null,
    tecnologias: [], tecnologiasCierre: [], proyectos: [], era: 1, dilemas: {}, dilemaPendiente: null,
    estabilidad: 50, sumaEstabilidad: 0, cierres: 0, hambre: false, hambres: 0, colapsos: 0,
    guardias: 0, temporales: [], maravillas: [], proyectosMaravillas: {}, descuentoIngeniero: false,
    respuestasEventos: {}, respuestasInvasiones: {}, ofertas: [],
    nota: '', mensaje: '',
    stats: { validas: 0, total: 0, invalidas: 0, descartadas: 0, fundacionValida: null },
  };
}

// `mapa`: un mapa ya creado (las pruebas pasan uno con copia propia); sin el sale del seed y de su bioma. El seed del mundo se consume SIEMPRE del rng de la partida
// y de el salen los gemelos: el calendario y los dados no dependen de lo que hagan las IAs.
export function crearEstado(rng, { jugadores = JUGADORES, mapa = null, bioma, sin = [] } = {}) {
  if (jugadores !== JUGADORES) throw new Error(`La Carrera de civilizaciones es de ${JUGADORES} civilizaciones (se pidieron ${jugadores}).`);
  const seedMundo = Math.floor(rng() * 4294967296) >>> 0;
  const mundo = crearMundo(seedMundo, { mapa, bioma });
  return {
    turno: 0, seedMundo, mundo, calendario: calendarioEventos(seedMundo), capas: { crisis: !sin.includes('crisis'), carrera: !sin.includes('carrera'), comercio: !sin.includes('comercio') },
    civs: Array.from({ length: JUGADORES }, (_, s) => crearCivilizacion(s)),
    ganador: null, desempate: null, indices: [],                        // indices: el Indice publicado de cada civilizacion en los turnos 10, 20 y 30
  };
}

export const conoce = (civ, tec) => civ.tecnologias.includes(tec);
export const tipoEn = (civ, region) => civ.edificios[region]?.tipo ?? null;
export const tiposActivos = (civ, t) => new Set(Object.values(civ.edificios).filter((b) => b.desde <= t).map((b) => b.tipo));
export const tieneTipo = (civ, tipo) => Object.values(civ.edificios).some((b) => b.tipo === tipo);

// Lo que guarda cada ronda para la escena y la rejugada: JSON puro, sin acceso al estado vivo.
export function instantanea(E) {
  return {
    turno: E.turno,
    civs: E.civs.map((c) => {
      const ind = indiceDe(c);
      return {
        s: c.s, nombre: c.nombre, fundada: c.fundada, poblacion: c.poblacion, reparto: [...c.reparto], stock: { ...c.stock }, reservaCiencia: c.reservaCiencia,
        cultura: c.culturaAcumulada, tecnologias: [...c.tecnologias], proyectos: c.proyectos.map((p) => ({ ...p })), era: c.era,
        regiones: [...c.regiones], edificios: Object.fromEntries(Object.entries(c.edificios).map(([r, b]) => [r, b.tipo])),
        estabilidad: c.estabilidad, guardias: c.guardias, maravillas: c.maravillas.map((w) => w.id), indice: { ...ind.pilares, total: ind.total, publicado: ind.publicado },
        proyectosMaravillas: Object.fromEntries(Object.entries(c.proyectosMaravillas).map(([id, p]) => [id, { inicio: p.inicio, invertido: { ...p.invertido } }])),
      };
    }),
  };
}

// Invariantes de la spec (seccion 4). Devuelve la lista de violaciones (vacia = todo bien): la prueba de estres las revisa tras cada turno de 100 partidas al azar.
export function comprobarInvariantes(E) {
  const mal = [];
  for (const c of E.civs) {
    const p = `civ ${c.s}: `;
    if (c.fundada && !(c.poblacion >= 1)) mal.push(p + `poblacion ${c.poblacion} < 1`);
    if (!Number.isInteger(c.poblacion)) mal.push(p + 'poblacion no entera');
    if (!Number.isInteger(c.guardias) || c.guardias < 0) mal.push(p + `Guardias invalidos: ${c.guardias}`);
    if (!Number.isInteger(c.estabilidad) || c.estabilidad < 0 || c.estabilidad > 100) mal.push(p + `Estabilidad invalida: ${c.estabilidad}`);
    if (c.ofertas.length > COMERCIO.ofertasPorTurno || new Set(c.ofertas.map((o) => o.n)).size !== c.ofertas.length) mal.push(p + 'ofertas duplicadas o excesivas');
    for (const o of c.ofertas) if (!RECURSOS_ALMACEN.includes(o.da) || !RECURSOS_ALMACEN.includes(o.pide) || o.da === o.pide
      || !Number.isInteger(o.nDa) || o.nDa < 1 || o.nDa > COMERCIO.maxPorLado || !Number.isInteger(o.nPide) || o.nPide < 1 || o.nPide > COMERCIO.maxPorLado) mal.push(p + 'oferta invalida');
    for (const [id, proyecto] of Object.entries(c.proyectosMaravillas)) {
      if (!MARAVILLA[id]) { mal.push(p + `proyecto de Maravilla desconocida ${id}`); continue; }
      for (const [r, n] of Object.entries(proyecto.invertido)) if (!Number.isInteger(n) || n <= 0 || !(n <= (MARAVILLA[id].costo[r] ?? 0))) mal.push(p + `inversion invalida ${id} ${r} ${n}`);
    }
    for (const r of RECURSOS_ALMACEN) if (!Number.isFinite(c.stock[r]) || c.stock[r] < 0) mal.push(p + `${r} = ${c.stock[r]}`);
    if (!Number.isFinite(c.reservaCiencia) || c.reservaCiencia < 0) mal.push(p + `reservaCiencia = ${c.reservaCiencia}`);
    if (c.reparto.length !== 6 || c.reparto.reduce((a, b) => a + b, 0) !== 100 || c.reparto.some((x) => x < 0 || x % 10 !== 0)) mal.push(p + `reparto ${JSON.stringify(c.reparto)}`);
    if (c.fundada) {
      if (!c.regiones.includes(c.capital)) mal.push(p + 'la capital no es propia');
      if (new Set(c.regiones).size !== c.regiones.length) mal.push(p + 'regiones repetidas');
    }
    for (const [r, b] of Object.entries(c.edificios)) {
      if (!c.regiones.includes(Number(r))) mal.push(p + `edificio ${b.tipo} en la region ${r}, que no es propia`);
      if (!EDIFICIO[b.tipo]) mal.push(p + `edificio desconocido ${b.tipo}`);
    }
    const tipos = Object.values(c.edificios).map((b) => b.tipo);
    if (new Set(tipos).size !== tipos.length) mal.push(p + 'un tipo de edificio repetido');
    if (new Set(c.tecnologias).size !== c.tecnologias.length) mal.push(p + 'tecnologias repetidas');
    for (const id of c.tecnologias) {
      const t = TEC[id];
      if (!t) { mal.push(p + `tecnologia desconocida ${id}`); continue; }
      if (t.era > c.era) mal.push(p + `${id} es de la era ${t.era} y la civilizacion esta en la ${c.era}`);
      if (t.era > 1 && !c.tecnologias.includes(TECNOLOGIAS.find((x) => x.rama === t.rama && x.era === t.era - 1).id)) mal.push(p + `${id} sin su previa`);
    }
    for (let e = 1; e < c.era; e++) {
      if (c.tecnologias.filter((id) => TEC[id].era === e).length < TECNOLOGIAS_PARA_ERA) mal.push(p + `esta en la era ${c.era} sin 4 tecnologias de la ${e}`);
    }
    if (c.era < 1 || c.era > ERAS) mal.push(p + `era ${c.era}`);
    const ind = indiceDe(c);
    if (!(ind.total >= 0 && ind.total <= INDICE_MAXIMO + 1e-9)) mal.push(p + `Indice ${ind.total} fuera de 0..${INDICE_MAXIMO}`);
  }
  const constructores = new Map();
  for (const [id, s] of E.civs.flatMap((c) => c.maravillas.map((m) => [m.id, c.s]))) {
    if (constructores.has(id)) mal.push(`la Maravilla ${id} tiene dos constructores`);
    constructores.set(id, s);
  }
  return mal;
}
