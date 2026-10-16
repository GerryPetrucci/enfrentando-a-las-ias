// Ayudas de las pruebas de la escena de Mayor o menor. No es un archivo de pruebas.
import { correrPartida } from '../../arena.js';
import { resolverAgente } from '../../agentes.js';
import mayormenor from '../../juegos/mayormenor.js';

export const MEZCLA_MM = ['contador', 'azar'];
export const agentesMM = (claves = MEZCLA_MM) => claves.map((c) => resolverAgente(c, mayormenor));

// Una partida de verdad (la misma estructura que se guarda en data/), jugada por bots. Sin red y sin API.
export const jugarMM = (seed, claves = MEZCLA_MM, extra = {}) => correrPartida({ juego: mayormenor, agentes: agentesMM(claves), seed, ...extra });

// Una partida con un modelo caido en `asiento` (el juego juega por el: cartas y apuestas de reemplazo).
export async function jugarMMConCaido(seed, asiento = 0) {
  const caido = { id: 'caido', nombre: 'Caido', color: '#888888', inicial: 'C', tipo: 'modelo', modelo: 'x/y', async jugar() { throw new Error('HTTP 500'); } };
  const otro = agentesMM(['contador'])[0];
  return correrPartida({ juego: mayormenor, agentes: asiento === 0 ? [caido, otro] : [otro, caido], seed });
}

// Varias partidas para recorrer muchos registros: cartas iguales, apuestas totales, finales anticipados, remontadas.
export async function muchasMM() {
  const out = [];
  for (const claves of [['contador', 'azar'], ['prudente', 'temerario'], ['contrario', 'contador'], ['azar', 'azar'], ['temerario', 'temerario'], ['prudente', 'prudente']]) {
    for (let seed = 1; seed <= 8; seed++) out.push(await jugarMM(seed, claves));
  }
  return out;
}
