import { escribirAtomico, identidades, recortarRazon, textoDeAccion, textoDeError, VERSION_VIVO } from '../vivo.js';
import { CATALOGO_ERA, NINGUNO, rasgoPorId } from './reglas-era.js';

// Estado EN VIVO del formato «era» para la fuente de navegador de OBS. Es el esquema v1 de worldbox.json (version, actualizado, fase, turno, turnos,
// tiempo_juego_s, activo, facciones, decision, ultimo_evento, ranking, ganador) MÁS campos aditivos de la era: formato, anio, anio_muro, anio_limite,
// fase_era, etapa, muro, guerra, velocidad, llamada, pensando y, por facción, ejercito, edificios y elegido. Una página antigua los ignora.
const nombreDe = (lista, id) => lista.find(x => x.id === id)?.nombre ?? id;
const unir = f => f.length <= 1 ? (f[0] ?? '') : `${f.slice(0, -1).join(', ')} y ${f.at(-1)}`;
const bajar = s => s.charAt(0).toLowerCase() + s.slice(1);

// Orden ya validada -> frase corta sin sujeto. `nombres(id)` traduce el objetivo al nombre del modelo.
export function textoDeAccionEra(a, nombres = () => null) {
  const p = a?.parameters ?? {};
  switch (a?.action) {
    case 'elegir_inicio': return `Elige ${nombreDe(CATALOGO_ERA.razas, p.raza)}, ${bajar(nombreDe(CATALOGO_ERA.minerales, p.mineral))} y ${p.bioma && p.bioma !== NINGUNO ? `bioma ${bajar(nombreDe(CATALOGO_ERA.biomas, p.bioma))}` : 'sin bioma'}`;
    case 'elegir_rasgos_etapa2': case 'elegir_rasgos_etapa3': {
      const ids = Object.values(p).filter(v => v !== NINGUNO);
      return ids.length ? `Elige ${unir(ids.map(id => bajar(rasgoPorId(id)?.nombre ?? id)))}` : 'No elige rasgos';
    }
    case 'rasgo_extra': return `Suma el rasgo ${bajar(rasgoPorId(p.id)?.nombre ?? String(p.id))}`;
    default: return textoDeAccion(a, { nombreDe: nombres });
  }
}
export function textoDeAccionesEra(acciones, nombres) {
  const lista = (acciones ?? []).filter(a => a?.action !== 'esperar');
  if (!lista.length) return 'Espera';
  return unir(lista.map((a, i) => { const t = textoDeAccionEra(a, nombres); return i === 0 ? t : bajar(t); }));
}
// Lo que la tarjeta de una facción muestra de su borrador.
export function resumenEleccion(e) {
  if (!e) return null;
  const rasgos = Object.entries(e.rasgos_aplicados ?? e.rasgos ?? {}).map(([slot, id]) => ({ slot, nombre: rasgoPorId(id)?.nombre ?? id }));
  return { raza: e.raza ? nombreDe(CATALOGO_ERA.razas, e.raza) : null, mineral: e.mineral ? nombreDe(CATALOGO_ERA.minerales, e.mineral) : null, bioma: e.bioma ? nombreDe(CATALOGO_ERA.biomas, e.bioma) : null, rasgos };
}

export function crearEstadoVivoEra({ ruta, participantes, partida, ahora = Date.now, escribir = escribirAtomico } = {}) {
  const ids = identidades(participantes), orden = participantes.map(p => p.id);
  let estado = null, cola = Promise.resolve(), fallos = 0, escrituras = 0, decision = null, evento = null, base = { anio: 1, fase_era: 'borrador', etapa: 'Preparando', muro: { puesto: true }, guerra: false, velocidad: null, llamada: null, tiempo_juego_s: 0, civs: [], puntos: {}, elegidos: {} };
  const guardar = valor => { estado = valor; escrituras++; cola = cola.then(() => escribir(ruta, valor)).catch(() => { fallos++; }); return cola; };
  const nombres = id => ids.get(id)?.nombre ?? null;
  const facciones = () => orden.map(id => { const c = base.civs.find(x => x.id === id) ?? {}, i = ids.get(id);
    return { id, nombre: i.nombre, ...(i.reino ? { reino: i.reino } : {}), color: i.color, poblacion: c.poblacion ?? 0, ciudades: c.ciudades ?? 0, territorio: c.territorio ?? 0, ejercito: c.ejercito ?? 0, edificios: c.edificios ?? 0, vivo: c.vivo ?? true, puntos: base.puntos[id] ?? 0, elegido: resumenEleccion(base.elegidos[id]) }; });
  const armar = (fase, extra = {}) => ({ version: VERSION_VIVO, formato: 'era', actualizado: new Date(ahora()).toISOString(), fase, turno: base.anio, turnos: partida.anioLimite, tiempo_juego_s: base.tiempo_juego_s, activo: null,
    anio: base.anio, anio_muro: partida.anioMuro, anio_limite: partida.anioLimite, fase_era: base.fase_era, etapa: base.etapa, muro: base.muro, guerra: base.guerra, velocidad: base.velocidad, llamada: base.llamada,
    pensando: [], facciones: facciones(), decision: null, ultimo_evento: evento, ranking: null, ganador: null, ...extra });
  // E10: con --colores-juego el color real lo pone el juego: el puente lo informa tras fundar y la capa lo adopta.
  const fijarColores = mapa => { for (const [id, c] of Object.entries(mapa ?? {})) if (ids.has(id) && /^#[0-9a-f]{6}$/i.test(c)) ids.get(id).color = c; };
  async function emitir(e) {
    if (e.estado) { base.civs = e.estado.civilizaciones ?? base.civs; base.anio = e.estado.anio ?? base.anio; base.tiempo_juego_s = e.estado.tiempo_juego_s ?? base.tiempo_juego_s; base.muro = e.estado.muro ?? base.muro; }
    for (const k of ['fase_era', 'etapa', 'guerra', 'velocidad', 'llamada', 'puntos', 'elegidos']) if (e[k] !== undefined) base[k] = e[k];
    if (e.evento !== undefined) evento = e.evento;
    switch (e.fase) {
      case 'preparando': decision = null; return guardar(armar('preparando'));
      case 'pensando': decision = null; return guardar(armar('pensando', { pensando: e.pensando ?? [] }));
      case 'decidio': case 'aplicando': {
        const i = ids.get(e.activo);
        decision = { participante: i?.nombre ?? 'Participante', texto: e.error && !(e.acciones ?? []).some(a => a.action !== 'esperar') ? textoDeError(e.error) : textoDeAccionesEra(e.acciones, nombres),
          razon: i?.bot ? 'Jugador automático de prueba.' : recortarRazon(e.razon ?? ''), acciones: (e.acciones ?? []).map(a => ({ accion: a.action, texto: textoDeAccionEra(a, nombres) })) };
        if (!decision.acciones.length) decision.acciones = [{ accion: 'esperar', texto: 'Espera' }];
        return guardar(armar(e.fase, { activo: e.activo, decision }));
      }
      case 'turno': decision = null; return guardar(armar('turno')); // cada año el subtítulo de la última decisión se retira
      case 'fin': {
        const ranking = (e.ranking ?? []).map(r => ({ id: r.participant_id, nombre: nombres(r.participant_id), color: ids.get(r.participant_id)?.color, puesto: r.puesto, puntos: r.puntos, poblacion: r.poblacion, territorio: r.territorio, vivo: r.vivo }));
        const g = ranking.length && ranking[0].puesto === 1 && ranking[1]?.puesto !== 1 ? ranking[0].id : null;
        evento = g ? `Gana ${nombres(g)}.` : 'La partida termina sin un ganador único.';
        decision = null;
        return guardar(armar('fin', { ranking, ganador: g, fase_era: 'fin', etapa: 'Fin' }));
      }
      default: return null;
    }
  }
  return { emitir, ids, fijarColores, cerrar: () => cola, ultimo: () => estado, fallos: () => fallos, escrituras: () => escrituras };
}
