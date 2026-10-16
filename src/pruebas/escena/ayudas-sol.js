// Ayudas de las pruebas de la escena de El numero solitario. No es un archivo de pruebas.
import { correrPartida } from '../../arena.js';
import { resolverAgente } from '../../agentes.js';
import solitario from '../../juegos/solitario.js';

export const MEZCLA_SOL = ['bajo', 'azar', 'medio', 'lector', 'escalera'];
export const agentesSol = (claves = MEZCLA_SOL) => claves.map((c) => resolverAgente(c, solitario));

// Una partida de verdad (la misma estructura que se guarda en data/), jugada por bots. Sin red y sin API.
export const jugarSol = (seed, claves = MEZCLA_SOL, extra = {}) => correrPartida({ juego: solitario, agentes: agentesSol(claves), seed, ...extra });

// Una partida con un modelo caido en `asiento` (el juego juega por el: parejas y marcas de reemplazo).
export async function jugarSolConCaido(seed, asiento = 0) {
  const caido = { id: 'caido', nombre: 'Caido', color: '#888888', inicial: 'C', tipo: 'modelo', modelo: 'x/y', async jugar() { throw new Error('HTTP 500'); } };
  const otros = agentesSol(MEZCLA_SOL.filter((c) => c !== 'azar'));
  const agentes = [...otros.slice(0, asiento), caido, ...otros.slice(asiento)];
  return correrPartida({ juego: solitario, agentes, seed });
}

// Varias partidas para recorrer muchos registros: choques, rondas sin ganador (todos juegan lo mismo), cortes por sorteo, remontadas.
export async function muchasSol() {
  const out = [];
  for (let seed = 1; seed <= 6; seed++) out.push(await jugarSol(seed));
  for (let seed = 1; seed <= 3; seed++) out.push(await jugarSol(seed, ['bajo', 'bajo', 'bajo', 'bajo', 'bajo']));
  for (let seed = 1; seed <= 4; seed++) out.push(await jugarSol(seed, ['azar', 'azar', 'azar', 'azar', 'azar']));
  for (let seed = 1; seed <= 3; seed++) out.push(await jugarSol(seed, ['escalera', 'lector', 'medio', 'azar', 'bajo']));
  return out;
}
