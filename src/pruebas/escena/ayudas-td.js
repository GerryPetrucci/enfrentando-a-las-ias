// Ayudas de las pruebas de la escena de Triple dado. No es un archivo de pruebas.
import { correrPartida } from '../../arena.js';
import { resolverAgente } from '../../agentes.js';
import tripledado from '../../juegos/tripledado.js';

export const MEZCLA_TD = ['azar', 'goloso', 'reservado', 'calculador'];
export const agentesTD = (claves = MEZCLA_TD) => claves.map((c) => resolverAgente(c, tripledado));

// Una partida de verdad (la misma estructura que se guarda en data/), jugada por bots. Sin red y sin API.
export const jugarTD = (seed, claves = MEZCLA_TD, extra = {}) => correrPartida({ juego: tripledado, agentes: agentesTD(claves), seed, ...extra });

// Una partida con un modelo caido en `asiento` (el juego juega por el: tarjetas de reemplazo).
export async function jugarTDConCaido(seed, asiento = 0) {
  const caido = { id: 'caido', nombre: 'Caido', color: '#888888', inicial: 'C', tipo: 'modelo', modelo: 'x/y', async jugar() { throw new Error('HTTP 500'); } };
  const otros = agentesTD(MEZCLA_TD.slice(0, 3));
  return correrPartida({ juego: tripledado, agentes: [...otros.slice(0, asiento), caido, ...otros.slice(asiento)], seed });
}

// Varias partidas para recorrer muchos registros: premios de ZERO, triples, empates, remontadas.
export async function muchasTD() {
  const out = [];
  for (let seed = 1; seed <= 6; seed++) out.push(await jugarTD(seed));
  for (const claves of [['goloso', 'goloso', 'goloso', 'goloso'], ['tanque', 'tanque', 'azar', 'azar'], ['reservado', 'calculador', 'tanque', 'goloso'], ['azar', 'azar', 'azar', 'azar']]) {
    for (let seed = 1; seed <= 3; seed++) out.push(await jugarTD(seed, claves));
  }
  return out;
}
