import { crearRng, seedDesdeTexto } from '../../rng.js';
import { exigir } from '../util.js';
import { CATALOGO_ERA, NINGUNO, biomasValidosPara, evaluarEleccion, evaluarRasgoExtra, rasgoPorId, razasOfrecidas, slotsDeEtapa } from './reglas-era.js';

// Participantes sin API del formato «era» (pruebas, ensayos y bots). No llaman modelos, no leen .env y no usan la red.
//   bot-era-militar   : orcos con mythril; rasgos de combate (clan, idioma y religion incluidos); en la guerra maldice, incendia y crea unidades.
//   bot-era-economico : humanos con oro; rasgos de crecimiento (idioma incluido); dona recursos y crea unidades.
//   bot-era-aleatorio : elecciones al azar (RNG con semilla) que cumplen el reglamento.
//   bot-era-roto      : la primera respuesta de cada llamada es JSON roto y la corrección sale bien (prueba la corrección).
//   bot-era-terco     : siempre JSON roto (prueba la jugada por defecto y las infracciones).
export const BOTS_ERA = ['bot-era-militar', 'bot-era-economico', 'bot-era-aleatorio', 'bot-era-roto', 'bot-era-terco'];
const PRIORIDAD = {
  // Cada bot cubre cultura (etapa 3), clan y subespecie, y al menos uno de idioma o religion (los rasgos que el puente mantiene). A lo sumo UN rasgo fuerte.
  'bot-era-militar': ['stonefists', 'strict_spelling', 'cast_shield', 'gift_of_air', 'roads', 'city_layout_rings', 'tower_lovers', 'expansionists', 'warriors_ascension'],
  'bot-era-economico': ['high_fecundity', 'elegant_words', 'telepathic_link', 'gift_of_life', 'roads', 'city_layout_parallels', 'statue_lovers', 'tiny_legends', 'golden_rule'],
};
const respuesta = (actions, frase) => JSON.stringify({ actions, reasoning_summary: frase });
const esperar = frase => respuesta([{ action: 'esperar', parameters: {} }], frase);

// Elige, por prioridad, un rasgo por casilla mientras quepa en el presupuesto de la etapa.
function rasgosPorPrioridad(etapa, prioridad, limite) {
  const eleccion = Object.fromEntries(slotsDeEtapa(etapa).map(s => [s.id, NINGUNO]));
  let gastado = 0;
  for (const id of prioridad) {
    const r = rasgoPorId(id);
    if (!r || !(r.slot in eleccion) || eleccion[r.slot] !== NINGUNO || gastado + r.costo > limite) continue;
    eleccion[r.slot] = id; gastado += r.costo;
  }
  return eleccion;
}
function porDefecto(llamada) {
  if (llamada.tipo === 'etapa1') return { raza: 'human', mineral: 'mineral_stone', bioma: NINGUNO };
  if (llamada.tipo === 'intervencion') return null;
  return Object.fromEntries(slotsDeEtapa(llamada.etapa).map(s => [s.id, NINGUNO]));
}
export function crearBotEra(nombre, semilla = 1) {
  exigir(BOTS_ERA.includes(nombre), 'bot_desconocido');
  const rng = crearRng(seedDesdeTexto(`${semilla}:${nombre}`));
  return async ctx => {
    const { llamada, presupuesto: pr, correccion } = ctx;
    if (nombre === 'bot-era-terco' || (nombre === 'bot-era-roto' && !correccion)) return '{invalido';
    const accionEtapa = llamada.tipo === 'etapa1' ? 'elegir_inicio' : `elegir_rasgos_etapa${llamada.etapa}`;
    if (llamada.tipo !== 'intervencion') {
      let parametros;
      if (llamada.tipo === 'etapa1') {
        if (nombre === 'bot-era-militar') parametros = { raza: 'orc', mineral: 'mineral_mythril', bioma: NINGUNO };
        else if (nombre === 'bot-era-economico') parametros = { raza: 'human', mineral: 'mineral_gold', bioma: 'biome_grass' };
        else if (nombre === 'bot-era-aleatorio') {
          for (let i = 0; i < 200; i++) {
            const raza = razasOfrecidas()[Math.floor(rng() * razasOfrecidas().length)].id, validos = biomasValidosPara(raza), conBioma = rng() < 0.5;
            parametros = { raza, mineral: CATALOGO_ERA.minerales[Math.floor(rng() * CATALOGO_ERA.minerales.length)].id, bioma: conBioma ? validos[Math.floor(rng() * validos.length)] : NINGUNO };
            if (evaluarEleccion(1, parametros).ok) break;
          }
        } else parametros = porDefecto(llamada);
      } else if (nombre === 'bot-era-aleatorio') {
        for (let i = 0; i < 300; i++) {
          parametros = Object.fromEntries(slotsDeEtapa(llamada.etapa).map(s => { const o = CATALOGO_ERA.rasgos.filter(r => r.slot === s.id && r.ofrecible); return [s.id, rng() < 0.4 ? NINGUNO : o[Math.floor(rng() * o.length)].id]; }));
          if (evaluarEleccion(llamada.etapa, parametros).ok) break;
        }
      } else parametros = PRIORIDAD[nombre] ? rasgosPorPrioridad(llamada.etapa, PRIORIDAD[nombre], pr.puntos_etapa) : porDefecto(llamada);
      return respuesta([{ action: accionEtapa, parameters: parametros }], `Elección de ${nombre} para la etapa ${llamada.etapa ?? 1}.`);
    }
    // ---- intervenciones ----
    const guerra = llamada.fase === 'guerra', rival = ctx.rival_id;
    const orden = [];
    let puntos = pr.puntos_accion, acciones = pr.max_acciones;
    const poner = (a, costo) => { if (acciones > 0 && costo <= puntos) { orden.push(a); puntos -= costo; acciones--; return true; } return false; };
    if (nombre === 'bot-era-aleatorio') {
      const candidatas = [{ action: 'crear_unidades', parameters: { cantidad: 1 + Math.floor(rng() * 5) } }, { action: 'donar_recursos', parameters: { recurso: ['wood', 'stone', 'gold', 'common_metals'][Math.floor(rng() * 4)], cantidad: 1 + Math.floor(rng() * 10) } },
        { action: 'bendecir', parameters: { gotas: 1 + Math.floor(rng() * 3) } }, ...(guerra ? [{ action: 'maldecir', parameters: { objetivo: rival, gotas: 1 + Math.floor(rng() * 3) } }] : [])];
      const costos = { crear_unidades: 2, donar_recursos: 1, bendecir: 1, maldecir: 2 };
      for (const c of candidatas.sort(() => rng() - 0.5)) { if (rng() < 0.6) poner(c, costos[c.action]); }
    } else if (nombre === 'bot-era-militar') {
      if (guerra) { if (pr.poderes_restantes > 0) poner({ action: 'maldecir', parameters: { objetivo: rival, gotas: 3 } }, 2); if (pr.poderes_restantes > 1) poner({ action: 'incendiar', parameters: { objetivo: rival, gotas: 3 } }, 2); }
      if (pr.unidades_restantes > 0) poner({ action: 'crear_unidades', parameters: { cantidad: Math.min(5, pr.unidades_restantes) } }, 2);
      if (!guerra && pr.poderes_restantes > 0) poner({ action: 'bendecir', parameters: { gotas: 3 } }, 1);
    } else {
      if (pr.donado_restante > 0) poner({ action: 'donar_recursos', parameters: { recurso: 'wood', cantidad: Math.min(10, pr.donado_restante) } }, 1);
      if (pr.unidades_restantes > 0) poner({ action: 'crear_unidades', parameters: { cantidad: Math.min(5, pr.unidades_restantes) } }, 2);
    }
    const extra = nombre === 'bot-era-militar' ? 'gaia_shield' : nombre === 'bot-era-economico' ? 'long_lifespan' : null;
    if (extra && evaluarRasgoExtra(extra, { propios: ctx.propios, reserva: pr.reserva_rasgos_extra }) === null) orden.push({ action: 'rasgo_extra', parameters: { id: extra } });
    return orden.length ? respuesta(orden, `Intervención ${llamada.fase} de ${nombre}.`) : esperar(`${nombre} espera.`);
  };
}
