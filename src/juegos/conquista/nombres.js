// Los nombres de reino dependen del modelo que ocupa el asiento y no del asiento (decidido el 18 de octubre de 2026): el nombre de color de cada reino coincide con el color global de su IA
// (web/paleta.js). Si no, un mensaje como «Azur propone paz a Violeta» no le dice nada al publico, porque Azur podia ser el reino naranja de Claude o el blanco de GPT segun como rotaran los asientos.
// Los jugadores sin color propio (bots, modelos de practica repetidos) toman los nombres que sobran, en el orden de siempre: una partida solo de bots queda igual que antes.
// Sin acentos: lo ven las IAs (EL CONTRATO). La web los muestra con acento (web/casino/reinos-conquista.js).

import { NOMBRES_REINOS } from './constantes.js';

// Con los nombres de siempre mas «Iris» (el arcoiris de Gemini, que es multicolor). Maximo 5 jugadores: nunca se acaban.
export const NOMBRES_POSIBLES = [...NOMBRES_REINOS, 'Iris'];

// Claude naranja = Ambar, GPT blanco = Marfil, Gemini multicolor = Iris, Llama magenta = Rosa, DeepSeek azul = Azur. Los de practica comparten el color de su familia.
export const REINO_POR_MODELO = { claude: 'Ambar', gpt: 'Marfil', gemini: 'Iris', llama: 'Rosa', deepseek: 'Azur', haiku: 'Ambar', luna: 'Marfil', 'flash-lite': 'Iris' };

// El nombre de reino de cada asiento, dados los ids de quienes juegan (en el orden de los asientos). Nunca hay dos iguales.
export function nombresDeReinos(ids) {
  const lista = Array.isArray(ids) ? ids : [];
  const usados = new Set();
  const preferidos = lista.map((id) => {
    const n = typeof id === 'string' && Object.hasOwn(REINO_POR_MODELO, id) ? REINO_POR_MODELO[id] : null;
    if (n && !usados.has(n)) { usados.add(n); return n; }
    return null;
  });
  const libres = NOMBRES_POSIBLES.filter((n) => !usados.has(n));
  return preferidos.map((n) => n ?? libres.shift());
}

// ¿Sirven estos nombres para una partida de k reinos? Uno por asiento, de la lista y sin repetir.
export const nombresValidos = (nombres, k) => Array.isArray(nombres) && nombres.length === k && nombres.every((n) => NOMBRES_POSIBLES.includes(n)) && new Set(nombres).size === k;
