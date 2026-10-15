// Ayudas compartidas por las pruebas de la escena de Duda y apuesta. No es un archivo de pruebas.
import { correrPartida } from '../../arena.js';
import { resolverAgente } from '../../agentes.js';
import dudaapuesta from '../../juegos/dudaapuesta.js';

export const MEZCLA = ['calculador', 'farolero', 'retador', 'prudente'];
export const PRUDENTES = ['prudente', 'prudente', 'prudente', 'prudente'];
export const agentes = (claves = MEZCLA) => claves.map((c) => resolverAgente(c, dudaapuesta));

// Una partida de verdad (la misma estructura que se guarda en data/), jugada por bots. Sin red y sin API.
export const jugar = (seed, claves = MEZCLA, extra = {}) => correrPartida({ juego: dudaapuesta, agentes: agentes(claves), seed, ...extra });

// Partidas con casos que los bots dan (buscados a mano):
//   MEZCLA seed 3: una retirada (registro 20) y un recuento donde lo ganado no es lo movido (el ultimo, con una ficha de espacio de por medio)
//   PRUDENTES seed 1: el pago a la banca despues de la mano 15
export const CASOS = { retirada: [3, MEZCLA], ganadoDistinto: [3, MEZCLA], pago: [1, PRUDENTES] };

// Varias partidas para recorrer muchos registros (mezclas distintas: con retiradas, con pagos, con espacios perdidos).
export async function muchas() {
  const out = [];
  for (const claves of [MEZCLA, PRUDENTES, ['prudente', 'prudente', 'calculador', 'calculador'], ['azar', 'azar', 'azar', 'azar']]) {
    for (let seed = 1; seed <= 12; seed++) out.push(await jugar(seed, claves));
  }
  return out;
}
