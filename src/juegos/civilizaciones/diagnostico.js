// Telemetria de bots; no forma parte de la vista ni modifica reglas/estado.
import { planDelBot } from './plan-bot.js';
import { edificioDisponible } from './temporada.js';
import { costoEdificio } from './edificios.js';
import { modificadores } from './economia.js';
import { disponibles } from './tecnologia.js';
import { validarArbol, progreso } from './arbol.js';

// Alcanzabilidad logica sin recursos ni turnos. Detecta nodos obligatorios
// incluso si la puerta final aparenta ofrecer varias alternativas.
export function analizarRutas(nodos, objetivo = 'A6') {
  validarArbol(nodos);
  if (!nodos.some((n) => n.id === objetivo)) throw new Error('objetivo desconocido');
  const alcanzar = (excluido) => {
    const hechos = new Set();
    let cambio = true;
    while (cambio) {
      cambio = false;
      for (const n of nodos) if (n.id !== excluido && !hechos.has(n.id) && progreso(n.requiere, hechos).cumple) {
        hechos.add(n.id); cambio = true;
      }
    }
    return hechos;
  };
  const todos = alcanzar(null);
  return { objetivo, alcanzable: todos.has(objetivo),
    inalcanzables: nodos.filter((n) => !todos.has(n.id)).map((n) => n.id),
    imprescindibles: nodos.filter((n) => n.id !== objetivo && n.tipo !== 'era' && !alcanzar(n.id).has(objetivo)).map((n) => n.id),
    alcance: 'logico; no demuestra viabilidad economica ni equilibrio' };
}

export function diagnosticarDecision(E, s, perfil, respuesta) {
  const c = E.civs[s], t = E.turno + 1;
  const plan = c.temporada && c.fundada && !perfil.pasivo ? planDelBot(c, perfil) : [];
  const centros = plan.filter((n) => n.tipo === 'edificio' && edificioDisponible(c, n.nombre))
    .map((n) => {
      const costo = costoEdificio(n.nombre, modificadores(c, t));
      return { id: n.id, nombre: n.nombre, costo,
        faltan: Object.fromEntries(Object.entries(costo).filter(([r, v]) => c.stock[r] < v).map(([r, v]) => [r, v - c.stock[r]])) };
    });
  const investigables = disponibles(c).filter((id) => !c.proyectos.some((p) => p.tec === id));
  const sinInvestigacion = c.fundada && !investigables.length && !c.proyectos.length && c.reservaCiencia > 0;
  return { turno: t, s, era: c.era, ciencia: c.reservaCiencia,
    proyectos: c.proyectos.map((p) => ({ ...p })), investigables,
    plan: plan.map((n) => n.id), centros,
    bloqueo: !sinInvestigacion ? null : centros.length
      ? centros.some((n) => !Object.keys(n.faltan).length) ? 'centro financiable' : 'recursos para centro'
      : c.tecnologias.length === 36 ? 'arbol completo' : 'requisitos',
    ordenes: [...(respuesta.ordenes ?? [])] };
}

export function resumirDiagnostico(decisiones) {
  const asientos = [...new Set(decisiones.map((d) => d.s))].sort((a, b) => a - b);
  return asientos.map((s) => {
    const ds = decisiones.filter((d) => d.s === s);
    let racha = 0, maxima = 0;
    const bloqueos = {};
    for (const d of ds) {
      if (d.bloqueo && d.bloqueo !== 'arbol completo') {
        bloqueos[d.bloqueo] = (bloqueos[d.bloqueo] ?? 0) + 1;
        maxima = Math.max(maxima, ++racha);
      } else racha = 0;
    }
    return { s, decisiones: ds.length, bloqueosAlInicio: bloqueos, rachaMaxima: maxima,
      cienciaMaximaAlInicio: Math.max(0, ...ds.map((d) => d.ciencia)),
      edades: ds.filter((d, i) => !i || d.era !== ds[i - 1].era).map((d) => ({ era: d.era, turno: d.turno })),
    };
  });
}
