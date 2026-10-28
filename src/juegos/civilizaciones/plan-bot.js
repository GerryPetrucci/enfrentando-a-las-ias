// Planificador de los bots de control. Solo lee el catalogo y los hitos propios.
import { TEC, EDIFICIO, COSTO_TECNOLOGIA } from './constantes.js';
import { hitosDe } from './temporada.js';

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
  const costo = (ids) => [...ids].reduce((s, id) => s + peso(id), 0);
  const unir = (xs) => new Set(xs.flatMap((x) => [...x]));
  const requisito = (r) => {
    if (typeof r === 'string') return nodo(r);
    return unir(r.opciones.map(requisito).sort((a, b) => costo(a) - costo(b)).slice(0, r.minimo));
  };
  const nodo = (id) => {
    if (hechos.has(id)) return new Set();
    if (memoria.has(id)) return memoria.get(id);
    const n = porId.get(id), ids = requisito(n.requiere);
    ids.add(id);
    memoria.set(id, ids);
    return ids;
  };
  // Completar la siguiente edad; al llegar a la ultima, las tecnologias faltantes.
  const objetivos = c.era < 6 ? [nodo(`A${c.era + 1}`)]
    : c.temporada.nodos.filter((n) => n.tipo === 'tecnologia' && !hechos.has(n.id)).map((n) => nodo(n.id));
  // Sin Fundicion algunos mapas no producen Hierro: evita planear edificios
  // avanzados sin preparar antes su fuente de recurso.
  if (c.era >= 2 && !hechos.has('M2') && c.stock.Hierro < 4) objetivos.unshift(nodo('M2'));
  return [...unir(objetivos)].map((id) => porId.get(id));
}
