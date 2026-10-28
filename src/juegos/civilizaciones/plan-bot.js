// Planificador de los bots de control. Solo lee el catalogo y los hitos propios.
import { TEC, EDIFICIO, COSTO_TECNOLOGIA } from './constantes.js';
import { hitosDe } from './temporada.js';

// Grupos pequenos (como 3 de 5): compara el costo de la UNION de hitos.
// Ordenar costos individuales cuenta dos veces un centro compartido y puede
// preferir dos ramas caras en conjunto. No pretende resolver el DAG global optimo.
export function combinarOpciones(opciones, minimo, peso, { conservarEmpates = true } = {}) {
  if (!Number.isInteger(minimo) || minimo < 0 || minimo > opciones.length) throw new Error('umbral invalido');
  const costoDe = (ids) => [...ids].reduce((s, id) => s + peso(id), 0);
  // Conserva el desempate anterior si la busqueda no reduce el costo conjunto.
  let mejor = new Set(opciones.map((ids) => ({ ids, costo: costoDe(ids) }))
    .sort((a, b) => a.costo - b.costo).slice(0, minimo).flatMap((x) => [...x.ids]));
  let costoMejor = conservarEmpates ? costoDe(mejor) : Infinity;
  const buscar = (i, faltan, ids) => {
    if (faltan === 0) {
      const costo = costoDe(ids);
      if (costo < costoMejor) { costoMejor = costo; mejor = ids; }
      return;
    }
    for (let j = i; j <= opciones.length - faltan; j++) buscar(j + 1, faltan - 1, new Set([...ids, ...opciones[j]]));
  };
  buscar(0, minimo, new Set());
  return mejor;
}

export function planDelBot(c, perfil) {
  const porId = new Map(c.temporada.nodos.map((n) => [n.id, n]));
  const hechos = hitosDe(c);
  const memoria = new Map();
  const peso = (id) => {
    const n = porId.get(id);
    if (n.tipo === 'era') return 0;
    if (n.tipo === 'tecnologia') return (1 + COSTO_TECNOLOGIA[n.era - 1] / 20)
      * (1 + perfil.ramas.indexOf(TEC[id].rama) / 3);
    const k = perfil.edificios.indexOf(n.nombre);
    return EDIFICIO[n.nombre].era * (k < 0 ? 3 : 1 + k / 10);
  };
  const unir = (xs) => new Set(xs.flatMap((x) => [...x]));
  const costo = (ids) => [...ids].reduce((s, id) => s + peso(id), 0);
  const requisito = (r) => {
    if (typeof r === 'string') return nodo(r);
    const opciones = r.opciones.map(requisito);
    return ['compartido', 'largo'].includes(perfil.plan)
      ? combinarOpciones(opciones, r.minimo, peso, { conservarEmpates: perfil.plan !== 'largo' })
      : unir(opciones.sort((a, b) => costo(a) - costo(b)).slice(0, r.minimo));
  };
  const nodo = (id) => {
    if (hechos.has(id)) return new Set();
    if (memoria.has(id)) return memoria.get(id);
    const n = porId.get(id), ids = requisito(n.requiere);
    ids.add(id);
    memoria.set(id, ids);
    return ids;
  };
  // Default: siguiente edad. 'largo' es una sonda experimental explicita.
  const objetivos = c.era < 6 ? [nodo(perfil.plan === 'largo' ? 'A6' : `A${c.era + 1}`)]
    : c.temporada.nodos.filter((n) => n.tipo === 'tecnologia' && !hechos.has(n.id)).map((n) => nodo(n.id));
  // Sin Fundicion algunos mapas no producen Hierro: evita planear edificios
  // avanzados sin preparar antes su fuente de recurso.
  if (c.era >= 2 && !hechos.has('M2') && c.stock.Hierro < 4) objetivos.unshift(nodo('M2'));
  return [...unir(objetivos)].map((id) => porId.get(id));
}
