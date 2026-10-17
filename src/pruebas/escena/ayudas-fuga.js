// Ayudas de las pruebas de la escena de La Fuga. No es un archivo de pruebas.
import { correrPartida } from '../../arena.js';
import { resolverAgente } from '../../agentes.js';
import fuga from '../../juegos/fuga.js';

// Tres bots que los de control no cubren: uno escribe un mensaje de 200 caracteres (el motor lo corta en 140), otro responde con un mensaje vacio y otro promete y aprovecha con frases ilegibles.
const EXTRA = { bots: {
  largo: { fn: (E, s) => ({ postura: 'ayudar', metodo: 'sigilo', aprovechar: false, promesa: 'ayudar', mensaje: 'm'.repeat(200), razon: 'bot de control' }), nombre: 'Largo', color: '#999999' },
  confuso: { fn: () => ({ postura: 'ayudar', metodo: 'sigilo', aprovechar: 'quizas', promesa: 'tal vez', mensaje: 'Ya veremos.', razon: 'bot de control' }), nombre: 'Confuso', color: '#bbbbbb' },
  mudo: { fn: () => ({ postura: 'avanzar', metodo: 'fuerza', aprovechar: true, promesa: 'avanzar', mensaje: '', razon: 'bot de control' }), nombre: 'Mudo', color: '#aaaaaa' },
} };
export const agentesFuga = (claves = ['tomaydaca', 'traidor']) => claves.map((c) => (EXTRA.bots[c] ? resolverAgente(c, EXTRA) : resolverAgente(c, fuga)));

// Una partida de verdad (la misma estructura que se guarda en data/), jugada por bots. Sin red y sin API.
export const jugarFuga = (seed, claves = ['tomaydaca', 'traidor'], extra = {}) => correrPartida({ juego: fuga, agentes: agentesFuga(claves), seed, ...extra });

// Una partida con un modelo caido en `asiento` (el juego pone por el una jugada neutra: respuesta ilegible).
export async function jugarFugaConCaido(seed, asiento = 0) {
  const caido = { id: 'caido', nombre: 'Caido', color: '#888888', inicial: 'C', tipo: 'modelo', modelo: 'x/y', async jugar() { throw new Error('HTTP 500'); } };
  const otro = agentesFuga(['tomaydaca'])[0];
  return correrPartida({ juego: fuga, agentes: asiento === 0 ? [caido, otro] : [otro, caido], seed });
}

// Varias partidas para recorrer muchos registros: capturas, salidas anticipadas, botines, ofertas, promesas rotas y partidas que terminan antes de la situacion 9.
export async function muchasFuga() {
  const out = [];
  for (const claves of [['tomaydaca', 'traidor'], ['leal', 'traidor'], ['traidor', 'traidor'], ['azar', 'azar'], ['leal', 'leal'], ['azar', 'tomaydaca'], ['mudo', 'largo'], ['confuso', 'tomaydaca']]) {
    for (let seed = 1; seed <= 6; seed++) out.push(await jugarFuga(seed, claves));
  }
  return out;
}
