// Ayudas de las pruebas de la escena de Mayor o menor. No es un archivo de pruebas.
import { correrPartida } from '../../arena.js';
import { resolverAgente } from '../../agentes.js';
import mayormenor from '../../juegos/mayormenor.js';
import { crearEstado } from '../../juegos/mayormenor/estado.js';
import { REGLAS_1_0, REGLAS_2_0 } from '../../juegos/mayormenor/constantes.js';

export { REGLAS_1_0, REGLAS_2_0 };
export const MEZCLA_MM = ['contador', 'azar'];
export const agentesMM = (claves = MEZCLA_MM) => claves.map((c) => resolverAgente(c, mayormenor));

// El juego con las reglas que se pidan: la escena tiene que reproducir las partidas guardadas con las reglas 1.0.0 (las dos reales del 18 de octubre) y las del juego de hoy (2.0.0).
const juegoConReglas = (reglas) => (reglas === REGLAS_2_0 ? mayormenor : { ...mayormenor, versionReglas: reglas.version, crear: (rng) => crearEstado(rng, reglas) });

// Una partida de verdad (la misma estructura que se guarda en data/), jugada por bots. Sin red y sin API. Por omision con las reglas 1.0.0 (lo que ya probaban estas pruebas); `reglas: REGLAS_2_0` para las de hoy.
export const jugarMM = (seed, claves = MEZCLA_MM, { reglas = REGLAS_1_0, ...extra } = {}) => correrPartida({ juego: juegoConReglas(reglas), agentes: agentesMM(claves), seed, ...extra });

// Una partida con un modelo caido en `asiento` (el juego juega por el: cartas y apuestas de reemplazo).
export async function jugarMMConCaido(seed, asiento = 0) {
  const caido = { id: 'caido', nombre: 'Caido', color: '#888888', inicial: 'C', tipo: 'modelo', modelo: 'x/y', async jugar() { throw new Error('HTTP 500'); } };
  const otro = agentesMM(['contador'])[0];
  return correrPartida({ juego: mayormenor, agentes: asiento === 0 ? [caido, otro] : [otro, caido], seed });
}

// Varias partidas para recorrer muchos registros: cartas iguales, apuestas totales, finales anticipados, remontadas.
export async function muchasMM(reglas = REGLAS_1_0) {
  const out = [];
  for (const claves of [['contador', 'azar'], ['prudente', 'temerario'], ['contrario', 'contador'], ['azar', 'azar'], ['temerario', 'temerario'], ['prudente', 'prudente'], ['astuto', 'contador']]) {
    for (let seed = 1; seed <= 8; seed++) out.push(await jugarMM(seed, claves, { reglas }));
  }
  return out;
}
