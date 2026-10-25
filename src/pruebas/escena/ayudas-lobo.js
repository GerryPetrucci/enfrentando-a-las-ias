import juego from '../../juegos/lobo.js';
import { crearRng } from '../../rng.js';
export function jugarLobo(seed = 3, jugadores = 8, { declaraciones = false } = {}) {
  const E = juego.crear(crearRng(seed), { jugadores });
  const rngs = E.roles.map((_, i) => crearRng(seed + i + 100));
  while (!E.fin) juego.aplicar(E, juego.activos(E).map((activo, i) => {
    if (!activo) return null;
    const respuesta = juego.bots.revela.fn(E, i, rngs[i]);
    // Muestra optativa del nuevo campo: cada bot usa solo su propio rol.
    // No cambia mensajes, votos, decisiones nocturnas ni consumo del RNG.
    const vista = JSON.parse(juego.vista(E, i));
    if (declaraciones && vista.fase === 'dia' && ['vidente', 'lobo'].includes(vista.rol)) respuesta.afirmaRol = 'vidente';
    return respuesta;
  }));
  const modelos = ['claude', 'gpt', 'gemini', 'deepseek'], nombres = ['Claude', 'GPT', 'Gemini', 'DeepSeek'];
  const m = jugadores === 8 ? 4 : 3;
  return { seed, juego: { id: 'lobo' }, jugadores: E.roles.map((_, i) => ({ id: modelos[i % m], nombre: `${nombres[i % m]} ${String.fromCharCode(65 + Math.floor(i / m))}` })), rondas: E.historial, ...juego.resultado(E), truncada: false };
}
