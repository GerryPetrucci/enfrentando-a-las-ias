// Un agente es cualquier cosa con .jugar({ juego, vista }) -> respuesta.
// La arena no sabe ni le importa si es un modelo pagado, un bot escrito por una
// IA, o una estrategia clasica. Eso es lo que hace que el motor sirva para los
// tres modos de contenido:
//
//   agenteModelo  -> la IA decide en vivo, jugada por jugada (caro, dramatico)
//   agenteBot     -> la IA escribio un bot una sola vez, corres 1000 partidas gratis
//   agenteBase    -> estrategias clasicas, para calibrar y para probar sin gastar

import { CONTENDIENTES, llamarModelo, extraerJSON } from './modelos.js';
import { construirSistema, construirUsuario, VERSION_PROMPT } from './prompt.js';

export function agenteModelo(clave) {
  const c = CONTENDIENTES[clave];
  if (!c) {
    throw new Error(
      `Contendiente desconocido: "${clave}". Disponibles: ${Object.keys(CONTENDIENTES).join(', ')}`
    );
  }
  return {
    id: clave,
    nombre: c.nombre,
    color: c.color,
    inicial: c.inicial,
    tipo: 'modelo',
    modelo: c.modelo,
    versionPrompt: VERSION_PROMPT,
    async jugar({ juego, vista }) {
      const { texto, uso, finishReason } = await llamarModelo({
        modelo: c.modelo,
        sistema: construirSistema(juego),
        usuario: construirUsuario(vista),
      });
      const respuesta = extraerJSON(texto);
      // Sin jugada utilizable se lanza el motivo: la arena lo guarda en errores y el video lo muestra,
      // en vez de dejar solo "invalida" (y que parezca que el modelo eligio cooperar).
      if (!respuesta) {
        throw new Error(
          finishReason === 'length'
            ? 'Respuesta cortada por max_tokens (finish_reason=length): el modelo se quedó sin espacio antes de dar su jugada.'
            : texto
              ? 'La respuesta no traía un JSON válido.'
              : 'La respuesta llegó vacía.'
        );
      }
      return { respuesta, crudo: texto, uso };
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
    async jugar({ vista }) {
      return { respuesta: await fn(vista), crudo: null, uso: null };
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
    fn: () => {
      const jugada = Math.random() < 0.5 ? 'C' : 'T';
      return { jugada, promesa: Math.random() < 0.5 ? 'C' : 'T', mensaje: 'Ni yo se que voy a hacer.', razon: 'Moneda al aire.' };
    },
  },
};

export function agenteBase(clave) {
  const b = BASES[clave];
  if (!b) throw new Error(`Estrategia base desconocida: "${clave}"`);
  return agenteBot(clave, b.fn, { nombre: b.nombre, color: b.color });
}

export const CLAVES_BASE = Object.keys(BASES);

// Resuelve un nombre de la linea de comandos al agente que corresponda.
export function resolverAgente(clave) {
  if (CLAVES_BASE.includes(clave)) return agenteBase(clave);
  return agenteModelo(clave);
}
