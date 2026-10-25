// Consecuencias declarativas: hechos públicos con autor y duración, sin RNG.
export const HECHOS = ['puerta_forzada', 'credencial', 'credencial_detectada', 'rastro_borrado', 'cuerda', 'cuerda_gastada'];
const PORTABLES = new Set(['credencial', 'cuerda']);
export function hechosActivos(E, tipo, actor = null, ronda = E.ronda + 1) {
  return (E.historia?.memoria ?? []).filter((h) => h.tipo === tipo && h.hasta >= ronda && (actor === null || h.actor === actor)
    && (!PORTABLES.has(tipo) || E.libres[h.actor])
    && !(tipo === 'credencial' && (E.historia.memoria.some((x) => x.tipo === 'credencial_detectada' && x.actor === h.actor)))
    && !(tipo === 'cuerda' && (E.historia.memoria.some((x) => x.tipo === 'cuerda_gastada' && x.actor === h.actor))));
}
export function cumpleHechos(si, E, actor = null, ronda = E.ronda + 1) {
  // Los objetos pertenecen al portador; una puerta y su rastro pertenecen al
  // mundo y cualquiera puede responder a ellos, aunque los causara el otro.
  return (!si.hecho || hechosActivos(E, si.hecho, PORTABLES.has(si.hecho) ? actor : null, ronda).length > 0)
    && (!si.sinHecho || hechosActivos(E, si.sinHecho, PORTABLES.has(si.sinHecho) ? actor : null, ronda).length === 0);
}
export function modificadoresTrama(E, i, jugada) {
  const nodo = E.historia?.definicion.nodos.find((n) => n.id === E.historia.actual);
  return (nodo?.modificadores ?? []).filter((m) => cumpleHechos(m.si, E, m.alcance === 'actor' ? i : null)
    && (!m.metodos || m.metodos.includes(jugada.metodo)));
}
export function resolverTrama(E, registro, modificadores) {
  if (!E.historia) return [];
  const nodo = E.historia.definicion.nodos.find((n) => n.id === E.historia.actual);
  const eventos = [];
  E.historia.memoria ??= [];
  const agregar = (id, tipo, actor, hasta, texto) => {
    if (E.historia.memoria.some((h) => h.id === id)) return;
    const hecho = { id, tipo, actor, ronda: registro.ronda, hasta, lugar: nodo.id, visibilidad: 'publica', texto };
    E.historia.memoria.push(hecho); eventos.push({ ...hecho });
  };
  // Evaluación simultánea: una recompensa de esta ronda no habilita otra regla
  // de esa misma ronda. Los modificadores ya se calcularon antes de las tiradas.
  const pendientes = [];
  for (const regla of nodo.reglas ?? []) for (let i = 0; i < 2; i++) {
    const j = registro.jugadas[i], si = regla.si;
    if (!j || registro.invalidas[i] || !E.libres[i] || !cumpleHechos(si, E, i, registro.ronda)) continue;
    if (si.metodo && j.metodo !== si.metodo || si.postura && j.postura !== si.postura) continue;
    if (['ayudar', 'sacrificarse'].includes(si.postura) && !registro.jugadas[1 - i]) continue;
    if (si.resultado === 'limpio' && registro.resultados[i] !== 'limpio' || si.resultado === 'fallo' && !['tropezo', 'cayo'].includes(registro.resultados[i])) continue;
    pendientes.push([`${nodo.id}:${regla.id}:${i}`, regla.efecto, i, Math.min(9, registro.ronda + regla.duracion), regla.texto]);
  }
  for (let i = 0; i < 2; i++) for (const m of modificadores[i] ?? []) {
    eventos.push({ id: `${nodo.id}:${m.id}:${i}`, tipo: 'consecuencia', actor: i, ronda: registro.ronda, lugar: nodo.id, causa: m.si.hecho, alcance: m.alcance, texto: m.texto });
    if (m.si.hecho === 'cuerda') pendientes.push([`cuerda-gastada:${i}`, 'cuerda_gastada', i, 9, 'La cuerda se queda atrás después de usarla.']);
  }
  pendientes.forEach((p) => agregar(...p));
  return eventos;
}
