// Contrastes pareados: mismo estado, mismas ordenes economicas y mismos dados.
// Solo cambia responder invasion 1/2; se compara el Indice al acabar T30.
import civilizaciones from '../civilizaciones.js';
import { crearRng } from '../../rng.js';
import { crearMapa, biomaDeSeed } from '../../mapa.js';
import { INVASIONES } from './constantes.js';
import { indiceDe } from './indice.js';
import { rngDe } from './rng.js';
import { comprobarInvariantes } from './estado.js';
import { ic95, BOTS_ACTIVOS } from './medicion.js';

const respuestasDe = (E, asientos) => asientos.map((id, s) => civilizaciones.bots[id].fn(E, s, rngDe(E.seedMundo, E.turno + 1, `bot-${s}`)));
const aplicar = (E, respuestas) => civilizaciones.aplicar(E, respuestas.map((r) => civilizaciones.normalizar(r, E)));

export function compararInvasion(E, asientos, s) {
  const t = E.turno + 1;
  if (!INVASIONES.some((i) => i.turno === t)) throw new Error('el contraste debe empezar justo antes de un turno de invasion');
  const base = respuestasDe(E, asientos);
  const finales = [1, 2].map((n) => {
    const copia = structuredClone(E), respuestas = structuredClone(base);
    respuestas[s].ordenes = [`responder invasion ${n}`, ...respuestas[s].ordenes.filter((o) => !/^responder invasion /.test(o))];
    const primerRegistro = aplicar(copia, respuestas), malos = comprobarInvariantes(copia);
    while (!civilizaciones.terminado(copia)) {
      aplicar(copia, respuestasDe(copia, asientos));
      malos.push(...comprobarInvariantes(copia));
    }
    return { indice: indiceDe(copia.civs[s]).publicado, malos, resultado: primerRegistro.eventos.find((e) => e.tipo === 'invasion' && e.s === s).resultado };
  });
  return { turno: t, diferencia: finales[1].indice - finales[0].indice, resistir: finales[0], tributo: finales[1] };
}

export function medirCrisis({ mundos = 200, semilla = 1, bots = BOTS_ACTIVOS } = {}) {
  const pares = [];
  for (let k = 0; k < mundos; k++) {
    const seed = semilla + k, mapa = crearMapa(seed, 2, { bioma: biomaDeSeed(seed, 2) });
    for (const bot of bots) for (const s of [0, 1]) {
      const asientos = s === 0 ? [bot, 'equilibrado'] : ['equilibrado', bot];
      const E = civilizaciones.crear(crearRng(seed * 7919 + 13), { mapa });
      while (!civilizaciones.terminado(E)) {
        if (INVASIONES.some((i) => i.turno === E.turno + 1)) pares.push({ seed, bot, s, ...compararInvasion(E, asientos, s) });
        aplicar(E, respuestasDe(E, asientos));
      }
    }
  }
  const resumir = (ps) => {
    const porMundo = new Map();
    for (const p of ps) {
      if (!porMundo.has(p.seed)) porMundo.set(p.seed, []);
      porMundo.get(p.seed).push(p.diferencia === 0 ? 0.5 : p.diferencia > 0 ? 1 : 0);
    }
    return { pares: ps.length, tributoMejor: ps.filter((p) => p.diferencia > 0).length,
      resistirMejor: ps.filter((p) => p.diferencia < 0).length, empates: ps.filter((p) => p.diferencia === 0).length,
      tributoConMediasTablas: ic95([...porMundo.values()].map((xs) => xs.reduce((a, b) => a + b, 0) / xs.length)),
      diferenciaMedia: ps.reduce((a, p) => a + p.diferencia, 0) / Math.max(1, ps.length) };
  };
  return { mundos, semilla, resumen: resumir(pares), porTurno: Object.fromEntries(INVASIONES.map(({ turno }) => [turno, resumir(pares.filter((p) => p.turno === turno))])),
    porBot: Object.fromEntries(bots.map((b) => [b, resumir(pares.filter((p) => p.bot === b))])),
    invariantesRotos: pares.reduce((a, p) => a + p.resistir.malos.length + p.tributo.malos.length, 0) };
}
