// Un agente es cualquier cosa con .jugar({ juego, vista, rng }) -> respuesta.
// La arena no sabe ni le importa si es un modelo pagado, un bot escrito por una
// IA, o una estrategia clasica. Eso es lo que hace que el motor sirva para los
// tres modos de contenido:
//
//   agenteModelo  -> la IA decide en vivo, jugada por jugada (caro, dramatico)
//   agenteBot     -> la IA escribio un bot una sola vez, corres 1000 partidas gratis
//   agenteBase    -> estrategias clasicas, para calibrar y para probar sin gastar

import { CONTENDIENTES, llamarModelo, extraerJSON } from './modelos.js';
import { construirSistema, construirUsuario, VERSION_PROMPT } from './prompt.js';

function contendiente(clave) {
  const c = CONTENDIENTES[clave];
  if (!c) {
    throw new Error(
      `Contendiente desconocido: "${clave}". Disponibles: ${Object.keys(CONTENDIENTES).join(', ')}`
    );
  }
  return c;
}

// Lo que contesto un modelo -> la respuesta del juego. La usan la llamada normal y la del lote, para que fallen igual.
function interpretar({ texto, uso, finishReason }) {
  const respuesta = extraerJSON(texto);
  // Sin jugada utilizable se lanza el motivo: la arena lo guarda en errores y el video lo muestra,
  // en vez de dejar solo "invalida" (y que parezca que el modelo eligio cooperar).
  // El error lleva lo que SI llego (texto, por que termino, tokens) para poder analizar despues por que fallo y cuanto costo: la arena lo guarda.
  if (!respuesta) {
    throw Object.assign(new Error(
      finishReason === 'length'
        ? 'Respuesta cortada por max_tokens (finish_reason=length): el modelo se quedó sin espacio antes de dar su jugada.'
        : texto
          ? 'La respuesta no traía un JSON válido.'
          : 'La respuesta llegó vacía.'
    ), { crudo: texto || null, finishReason: finishReason ?? null, uso: uso ?? null });
  }
  return { respuesta, crudo: texto, uso };
}

const datosDeModelo = (clave, c) => ({
  id: clave,
  nombre: c.nombre,
  color: c.color,
  inicial: c.inicial,
  tipo: 'modelo',
  modelo: c.modelo,
  gratis: !!c.gratis,
  versionPrompt: VERSION_PROMPT,
});

export function agenteModelo(clave, { llamar = llamarModelo } = {}) {
  const c = contendiente(clave);
  return {
    ...datosDeModelo(clave, c),
    async jugar({ juego, vista }) {
      return interpretar(await llamar({
        modelo: c.modelo,
        sistema: construirSistema(juego),
        usuario: construirUsuario(vista),
        razonamiento: c.razonamiento ?? null,
        // Una solicitud reservada por la arena equivale a un intento HTTP.
        // Los reintentos internos no pueden gastar llamadas fuera del corte.
        ...(juego.limiteLlamadasDuro !== undefined && juego.limiteLlamadasDuro !== null ? { reintentos: 0 } : {}),
      }));
    },
  };
}

// Igual que agenteModelo, pero la peticion pasa por el coordinador de lotes (src/coordinador-lote.js): a mitad de precio y
// sin prisa. Los modelos sin variante de lote (`lote: false`, entre ellos todos los gratis) el coordinador los llama normal.
export function agenteModeloEnLote(clave, coordinador) {
  const c = contendiente(clave);
  return {
    ...datosDeModelo(clave, c),
    async jugar({ juego, vista }) {
      return interpretar(await coordinador.pedir({
        modelo: c.modelo,
        usaLote: c.lote === true,
        sistema: construirSistema(juego),
        usuario: construirUsuario(vista),
        razonamiento: c.razonamiento ?? null,
      }));
    },
  };
}

export function agenteBot(clave, fn, { nombre, color } = {}) {
  return {
    id: clave,
    nombre: nombre || clave,
    color: color || '#888888',
    inicial: (nombre || clave)[0].toUpperCase(),
    tipo: 'bot',
    modelo: null,
    async jugar({ vista, rng }) {
      return { respuesta: await fn(vista, rng), crudo: null, uso: null };
    },
  };
}

// Bot de control de un juego con mapa: lee el ESTADO completo (no la vista) y juega con el rng de su asiento.
// Solo los bots piden el estado; un modelo recibe unicamente su vista (la arena respeta `necesitaEstado`).
export function agenteBotConEstado(clave, fn, { nombre, color } = {}) {
  return {
    id: clave,
    nombre: nombre || clave,
    color: color || '#888888',
    inicial: (nombre || clave)[0].toUpperCase(),
    tipo: 'bot',
    modelo: null,
    necesitaEstado: true,
    async jugar({ estado, i, rng }) {
      return { respuesta: fn(estado, i, rng), crudo: null, uso: null };
    },
  };
}

// --- Estrategias clasicas, gratis, utiles como control del experimento ---

const BASES = {
  'siempre-c': {
    nombre: 'Siempre Coopera',
    color: '#6FA86F',
    fn: () => ({ jugada: 'C', promesa: 'C', mensaje: 'Cooperemos los diez rondas.', razon: 'Coopera siempre.' }),
  },
  'siempre-t': {
    nombre: 'Siempre Traiciona',
    color: '#B8544A',
    fn: () => ({ jugada: 'T', promesa: 'C', mensaje: 'Confia en mi.', razon: 'Traiciona siempre.' }),
  },
  tomaydaca: {
    nombre: 'Toma y Daca',
    color: '#5A8FB8',
    fn: (vista) => {
      const ultima = vista.historial.at(-1);
      const jugada = !ultima ? 'C' : ultima.jugadaDelRival;
      return { jugada, promesa: jugada, mensaje: 'Te devuelvo lo que me des.', razon: 'Copia la jugada anterior del rival.' };
    },
  },
  azar: {
    nombre: 'Al Azar',
    color: '#9C8FB8',
    fn: (vista, rng) => {
      const jugada = rng() < 0.5 ? 'C' : 'T';
      return { jugada, promesa: rng() < 0.5 ? 'C' : 'T', mensaje: 'Ni yo se que voy a hacer.', razon: 'Moneda al aire.' };
    },
  },
};

export function agenteBase(clave) {
  const b = BASES[clave];
  if (!b) throw new Error(`Estrategia base desconocida: "${clave}"`);
  return agenteBot(clave, b.fn, { nombre: b.nombre, color: b.color });
}

export const CLAVES_BASE = Object.keys(BASES);

// Resuelve un nombre de la linea de comandos al agente que corresponda. Si se da el juego, sus bots de control
// (`juego.bots`) tienen prioridad, y las estrategias base (que son del Dilema) se niegan a jugar otro juego:
// asi el error sale antes de la primera ronda y no como "respuestas invalidas" a media partida.
export function resolverAgente(clave, juego = null) {
  const bot = juego?.bots?.[clave];
  if (bot) return agenteBotConEstado(clave, bot.fn, { nombre: bot.nombre, color: bot.color });
  if (CLAVES_BASE.includes(clave)) {
    if (juego && juego.id !== 'dilema') {
      throw new Error(`"${clave}" es una estrategia del Dilema y no sirve en ${juego.nombre}. Bots de este juego: ${Object.keys(juego.bots ?? {}).join(', ') || '(ninguno)'}.`);
    }
    return agenteBase(clave);
  }
  if (!CONTENDIENTES[clave]) {
    const bots = juego?.bots ? ` Bots de ${juego.nombre}: ${Object.keys(juego.bots).join(', ')}.` : '';
    throw new Error(`Jugador desconocido: "${clave}". Modelos: ${Object.keys(CONTENDIENTES).join(', ')}.${bots}`);
  }
  return agenteModelo(clave);
}
