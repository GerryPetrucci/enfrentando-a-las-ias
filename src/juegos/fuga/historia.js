import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validarHistoria, cumpleCondicion } from './historia-datos.js';

export const HISTORIA = validarHistoria(JSON.parse(readFileSync(new URL('./historia.json', import.meta.url), 'utf8')));
export const HUELLA_HISTORIA = createHash('sha256').update(JSON.stringify(HISTORIA)).digest('hex');

function entrar(E, id) {
  const h = E.historia, nodo = h.definicion.nodos.find((n) => n.id === id);
  const visitados = new Set(E.historial.map((r) => r.situacion.id));
  const candidato = h.candidatos[id].find((s) => !visitados.has(s.id));
  if (!candidato) throw new Error(`Sin escena disponible en ${id}`);
  const v = h.elecciones[nodo.ronda - 1][1];
  E.situaciones[nodo.ronda - 1] = { ...candidato, rama: id, contexto: nodo.contexto[Math.floor(v * nodo.contexto.length)], ...(nodo.lugar ? { lugar: nodo.lugar } : {}) };
  h.actual = id;
}

export function prepararHistoria(E, rng, instanciar, definicion = HISTORIA) {
  validarHistoria(definicion);
  const candidatos = Object.fromEntries(definicion.nodos.map((n) => [n.id, instanciar(n)]));
  E.historia = { definicion, version: definicion.version, huella: createHash('sha256').update(JSON.stringify(definicion)).digest('hex'), candidatos,
    elecciones: Array.from({ length: 9 }, () => [rng(), rng()]), actual: null, memoria: [] };
  entrar(E, definicion.inicio);
}

export function avanzarHistoria(E) {
  if (!E.historia || E.fin) return;
  const h = E.historia, nodo = h.definicion.nodos.find((n) => n.id === h.actual);
  const elegibles = nodo.salidas.filter((s) => cumpleCondicion(s.si, E));
  const prioridad = Math.max(...elegibles.map((s) => s.prioridad));
  const candidatas = elegibles.filter((s) => s.prioridad === prioridad);
  const total = candidatas.reduce((s, c) => s + c.peso, 0);
  let dado = h.elecciones[E.ronda][0] * total, elegida = candidatas.at(-1);
  for (const c of candidatas) { dado -= c.peso; if (dado < 0) { elegida = c; break; } }
  if (!elegida) throw new Error(`Sin ruta desde ${nodo.id}`);
  entrar(E, elegida.a);
}
