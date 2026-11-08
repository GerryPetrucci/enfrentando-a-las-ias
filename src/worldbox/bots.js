import { crearRng, seedDesdeTexto } from '../rng.js';
import { exigir } from './util.js';
import { restriccionIncumplida, registrarUso } from './contrato-acciones.js';

// Participantes sin API para probar el orquestador. No llaman modelos, no leen .env y no usan la red.
//   bot-aleatorio     : acciones al azar entre las habilitadas, con parametros validos (RNG con semilla).
//   bot-pasivo        : siempre esperar.
//   bot-voraz         : en el simulador acumula y funda; en el juego real es AGRESIVO (guerra en cuanto el reglamento la permite, luego poderes).
//   bot-expansionista : en el juego real crece sin atacar (unidades, donaciones, bendiciones).
//   bot-roto          : falla de cuatro maneras para probar los descartes.
export const BOTS = ['bot-aleatorio', 'bot-pasivo', 'bot-voraz', 'bot-roto', 'bot-expansionista'];
const BASE = Number.MAX_SAFE_INTEGER;
// Un valor valido (dentro del esquema) para cada parametro: sirve para acciones que anuncie cualquier adaptador.
function parametrosAleatorios(esquema, rng, rivales) {
  const p = {};
  for (const [k, s] of Object.entries(esquema)) {
    if (s.valores) p[k] = s.valores[Math.floor(rng() * s.valores.length)];
    else if (s.tipo === 'entero') { const min = Math.max(s.minimo ?? 0, -BASE), max = Math.min(s.maximo ?? min + 10, BASE); p[k] = min + Math.floor(rng() * (max - min + 1)); }
    else if (s.tipo === 'numero') { const min = s.minimo ?? 0, max = s.maximo ?? min + 10; p[k] = min + rng() * (max - min); }
    else if (s.tipo === 'booleano') p[k] = rng() < 0.5;
    else p[k] = (rivales.length ? rivales[Math.floor(rng() * rivales.length)].id : 'x').padEnd(s.minimo ?? 0, 'x').slice(0, s.maximo ?? 200);
  }
  return p;
}
// Arma un turno respetando lo que el bot PUEDE saber: cooldowns, puntos, topes y limite de acciones. Es lo mismo que el
// orquestador revalida; un bot bien hecho no deberia ganar infracciones.
function planificar(candidatas, { acciones, turno, usos, cooldowns, puntos, maxAcciones }) {
  const usosLocal = structuredClone(usos ?? {}), cd = { ...(cooldowns ?? {}) }, plan = [];
  let restante = puntos;
  for (const c of candidatas) {
    if (plan.length >= maxAcciones) break;
    const regla = acciones.find(a => a.nombre === c.action);
    if (!regla || (cd[c.action] ?? 0) > turno || regla.puntos > restante || restriccionIncumplida(regla, c.parameters, turno, usosLocal)) continue;
    plan.push(c); restante -= regla.puntos;
    if (regla.cooldown) cd[c.action] = turno + regla.cooldown + 1;
    registrarUso(usosLocal, regla, c.parameters);
  }
  return plan.length ? plan : [{ action: 'esperar', parameters: {} }];
}
export function crearBot(nombre, semilla = 1) {
  exigir(BOTS.includes(nombre), 'bot_desconocido');
  const rng = crearRng(seedDesdeTexto(`${semilla}:${nombre}`));
  let llamadas = 0;
  return async ({ observation, acciones, turno, usos, cooldowns, puntosTurno = 3, maxAcciones = 3 }) => {
    llamadas++;
    if (nombre === 'bot-roto') {
      // Cuatro maneras de fallar, todas deben costar exactamente una decision perdida: JSON roto, accion fuera de lista,
      // tipo equivocado y demasiadas acciones.
      const modo = llamadas % 4;
      if (modo === 1) return '{invalido';
      if (modo === 2) return JSON.stringify({ actions: [{ action: 'ejecutar_codigo', parameters: {} }], reasoning_summary: '' });
      if (modo === 3) return JSON.stringify({ actions: [{ action: 'expandir', parameters: { cantidad: '1' } }], reasoning_summary: '' });
      return JSON.stringify({ actions: Array(11).fill({ action: 'esperar', parameters: {} }), reasoning_summary: '' });
    }
    const responder = actions => JSON.stringify({ actions, reasoning_summary: 'Decision del participante simulado.' });
    const habilitada = n => acciones.some(a => a.nombre === n);
    const f = observation.faccion, t = turno ?? observation.turno_juego + 1;
    const contexto = { acciones, turno: t, usos, cooldowns: cooldowns ?? f.cooldowns, puntos: puntosTurno, maxAcciones };
    const rivales = observation.rivales.filter(r => r.vivo);
    const objetivo = rivales[0]?.id;
    const maxParam = (n, k) => acciones.find(a => a.nombre === n)?.parametros[k]?.maximo;
    if (nombre === 'bot-expansionista' && habilitada('crear_unidades')) {
      // Crecer sin atacar: unidades hasta el tope del reglamento, donar al almacen y bendecir.
      const restante = Math.max(0, (acciones.find(a => a.nombre === 'crear_unidades').acumulado?.maximo ?? 5) - (usos?.crear_unidades?.acumulado ?? 0));
      const candidatas = [];
      if (restante > 0) candidatas.push({ action: 'crear_unidades', parameters: { cantidad: Math.min(restante, maxParam('crear_unidades', 'cantidad') ?? 1) } });
      if (habilitada('donar_recursos')) candidatas.push({ action: 'donar_recursos', parameters: { recurso: 'wood', cantidad: maxParam('donar_recursos', 'cantidad') ?? 1 } });
      if (habilitada('bendecir')) candidatas.push({ action: 'bendecir', parameters: { gotas: maxParam('bendecir', 'gotas') ?? 1 } });
      return responder(planificar(candidatas, contexto));
    }
    if (nombre === 'bot-voraz' && habilitada('declarar_guerra')) {
      // Agresivo: guerra en cuanto el reglamento la permite, luego fuego y maldiciones sobre el rival; unidades con lo que sobre.
      if (!objetivo) return responder([{ action: 'esperar', parameters: {} }]);
      const candidatas = [{ action: 'declarar_guerra', parameters: { objetivo } }];
      if (habilitada('incendiar')) candidatas.push({ action: 'incendiar', parameters: { objetivo, gotas: maxParam('incendiar', 'gotas') ?? 1 } });
      if (habilitada('maldecir')) candidatas.push({ action: 'maldecir', parameters: { objetivo, gotas: maxParam('maldecir', 'gotas') ?? 1 } });
      if (habilitada('crear_unidades')) candidatas.push({ action: 'crear_unidades', parameters: { cantidad: 1 } });
      return responder(planificar(candidatas, contexto));
    }
    let action = 'esperar', parameters = {};
    const turnoSim = observation.turno_juego + 1, disponible = n => habilitada(n) && (f.cooldowns[n] ?? 0) <= turnoSim;
    if (nombre === 'bot-voraz') {
      if (disponible('fundar') && f.recursos >= 15 && f.ciudades < f.territorio) action = 'fundar';
      else if (disponible('expandir') && f.recursos >= 6 && observation.mundo.libres) { action = 'expandir'; parameters = { cantidad: 1 }; }
      else if (disponible('recolectar')) action = 'recolectar';
    }
    if (nombre === 'bot-aleatorio') {
      // Cualquier accion habilitada cuyo cooldown y restricciones lo permitan, con parametros validos al azar.
      const cd = cooldowns ?? f.cooldowns;
      const lista = acciones.filter(a => (cd[a.nombre] ?? 0) <= t);
      const elegida = lista[Math.floor(rng() * lista.length)];
      action = elegida.nombre; parameters = parametrosAleatorios(elegida.parametros, rng, observation.rivales);
      if (usos && restriccionIncumplida(elegida, parameters, t, usos)) { action = 'esperar'; parameters = {}; }
    }
    return responder([{ action, parameters }]);
  };
}
