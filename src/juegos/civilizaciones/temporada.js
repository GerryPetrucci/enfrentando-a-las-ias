// Catalogo arbol-2: el seed de temporada es independiente del mapa y eventos.
import { EDIFICIOS, TECNOLOGIAS, ERAS } from './constantes.js';
import { rngDe } from './rng.js';
import { validarArbol, progreso } from './arbol.js';

export const SEED_TEMPORADA = 1;
export const VERSION_TEMPORADA = 'arbol-2';
const todos = (...opciones) => ({ minimo: opciones.length, opciones });
const grupo = (minimo, opciones) => ({ minimo, opciones });
const edificioId = (id) => `B${EDIFICIOS.findIndex((e) => e.id === id) + 1}`;
const congelar = (x) => {
  if (x && typeof x === 'object') { Object.values(x).forEach(congelar); Object.freeze(x); }
  return x;
};

export function crearTemporada(seed = SEED_TEMPORADA) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('seed de temporada invalido');
  const rng = rngDe(seed, 0, VERSION_TEMPORADA);
  const mezclar = (xs) => {
    const copia = [...xs];
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
  };
  const nodos = [], centros = {};
  const bases = mezclar(EDIFICIOS.filter((e) => e.era === 1));
  const par = (t) => todos(centros[t.id], t.id);
  for (let era = 1; era <= ERAS; era++) {
    const previas = TECNOLOGIAS.filter((t) => t.era === era - 1);
    nodos.push({ id: `A${era}`, tipo: 'era', era,
      requiere: era === 1 ? todos() : todos(`A${era - 1}`, grupo(3, mezclar(previas).slice(0, 5).map(par))) });
    for (const e of EDIFICIOS.filter((e) => e.era === era)) {
      nodos.push({ id: edificioId(e.id), tipo: 'edificio', nombre: e.id, era,
        requiere: era === 1 ? 'A1' : todos(`A${era}`, grupo(2, mezclar(previas).slice(0, 3).map(par))) });
    }
    const actuales = EDIFICIOS.filter((e) => e.era === era);
    const tecnologias = TECNOLOGIAS.filter((t) => t.era === era);
    const usados = new Set();
    tecnologias.forEach((t, i) => {
      // Las bases siguen sirviendo; parte de la investigacion exige centros nuevos.
      const libres = actuales.filter((e) => !usados.has(e.id));
      const centro = era === 1 || !libres.length || rng() < 0.5
        ? bases[i % bases.length] : libres[Math.floor(rng() * libres.length)];
      usados.add(centro.id);
      centros[t.id] = edificioId(centro.id);
      const req = [`A${era}`, centros[t.id]];
      if (era > 1) req.push(grupo(1, mezclar(previas).slice(0, 2).map((x) => x.id)));
      nodos.push({ id: t.id, tipo: 'tecnologia', nombre: t.nombre, era, requiere: todos(...req) });
    });
  }
  validarArbol(nodos);
  return congelar({ version: VERSION_TEMPORADA, seed, nodos, centros });
}

export function hitosDe(civ) {
  return new Set([...civ.tecnologias, ...civ.construidos.map(edificioId),
    ...Array.from({ length: civ.era }, (_, i) => `A${i + 1}`)]);
}

export function cumpleNodo(civ, id) {
  const nodo = civ.temporada?.nodos.find((n) => n.id === id);
  return Boolean(nodo) && progreso(nodo.requiere, hitosDe(civ)).cumple;
}

export function edificioDisponible(civ, id) {
  return cumpleNodo(civ, edificioId(id));
}

export function requisitoTexto(r) {
  if (typeof r === 'string') return r;
  if (!r.opciones.length) return 'inicio';
  const xs = r.opciones.map(requisitoTexto);
  return r.minimo === xs.length ? `(${xs.join('+')})` : `${r.minimo}/${xs.length}[${xs.join(',')}]`;
}

export function textoTemporada(civ) {
  const hitos = hitosDe(civ);
  const siguiente = civ.temporada.nodos.find((n) => n.id === `A${civ.era + 1}`);
  const avance = siguiente ? progreso(siguiente.requiere.opciones[1], hitos) : null;
  return [`TEMPORADA ${civ.temporada.seed} (${civ.temporada.version}). Requisitos:`,
    ...civ.temporada.nodos.filter((n) => !hitos.has(n.id)).map((n) => {
      return `${n.id}:${requisitoTexto(n.requiere)}`;
    }), `Hitos: ${[...hitos].join(',')}.`,
    ...(avance ? [`Para A${civ.era + 1}: ${avance.completadas}/${avance.necesarias} ramas completas.`] : [])].join('\n');
}
