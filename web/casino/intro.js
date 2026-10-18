// La tarjeta de arranque de cada juego, como un beat que se antepone a los de su linea de tiempo: explica el juego a quien llega sin conocerlo (nombre, regla central y como se gana) antes de que
// empiece la partida. Un solo lugar lo agrega (armarLinea en lineas.js) y lo usan la pagina, las capturas, las partes y la voz, para que todos vean la MISMA lista de beats. El texto es publico
// (textos-juego.js), no el prompt de las IAs. Puro: sin DOM ni red.

import { textoDeJuego } from './textos-juego.js';
import { duracion } from './linea-comun.js';

export const MIN_MS_INTRO = 5000, MAX_MS_INTRO = 8000; // lo que dura en pantalla (la voz puede alargarlo, como en cualquier beat)

// Los beats con el intro delante, o los mismos si el juego no tiene textos (o ya lo trae). Basura -> lista vacia.
export function conIntro(beats, juegoId) {
  if (!Array.isArray(beats)) return [];
  const t = textoDeJuego(juegoId);
  if (!beats.length || !t || beats[0]?.tipo === 'intro') return beats;
  const texto = t.intro;
  const intro = {
    id: 'intro', mano: beats[0].mano, tipo: 'intro', registro: 0, asiento: null, camara: [],
    texto, lineas: [{ tipo: 'hecho', texto, clave: 'intro' }],
    minMs: Math.min(MAX_MS_INTRO, duracion(MIN_MS_INTRO, texto)), reemplazo: false,
    pasos: [{ tipo: 'intro', juego: juegoId, nombre: t.nombre, categoria: t.categoria, regla: t.regla, gana: t.gana }],
  };
  return [intro, ...beats];
}
