// Ayudas de las pruebas de la escena de Subasta de tiempo. No es un archivo de pruebas.
import { correrPartida } from '../../arena.js';
import { resolverAgente } from '../../agentes.js';
import subasta from '../../juegos/subasta.js';

export const MEZCLA_SUB = ['retirado', 'parejo', 'azar', 'gastador', 'cuentagotas'];
// Dos bots que los de control no cubren: uno apuesta 400 s de golpe (mas de la mitad del banco) y despues todo lo que le queda; otro apuesta medio segundo.
const EXTRA = { bots: {
  fuerte: { fn: (E, s) => ({ apuesta: Math.min(400, E.bancos[s] / 10), razon: 'bot de control' }), nombre: 'Fuerte', color: '#999999' },
  migaja: { fn: () => ({ apuesta: 0.5, razon: 'bot de control' }), nombre: 'Migaja', color: '#aaaaaa' },
} };
export const agentesSub = (claves = MEZCLA_SUB) => claves.map((c) => (EXTRA.bots[c] ? resolverAgente(c, EXTRA) : resolverAgente(c, subasta)));

// Una partida de verdad (la misma estructura que se guarda en data/), jugada por bots. Sin red y sin API.
export const jugarSub = (seed, claves = MEZCLA_SUB, extra = {}) => correrPartida({ juego: subasta, agentes: agentesSub(claves), seed, ...extra });

// Una partida con un modelo caido en `asiento` (el juego lo retira: respuesta ilegible).
export async function jugarSubConCaido(seed, asiento = 0) {
  const caido = { id: 'caido', nombre: 'Caido', color: '#888888', inicial: 'C', tipo: 'modelo', modelo: 'x/y', async jugar() { throw new Error('HTTP 500'); } };
  const otros = agentesSub(MEZCLA_SUB.slice(1));
  return correrPartida({ juego: subasta, agentes: [...otros.slice(0, asiento), caido, ...otros.slice(asiento)], seed });
}

// Varias partidas para recorrer muchos registros: empates en lo mas alto, todos se retiran, bancos agotados, remontadas.
export async function muchasSub() {
  const out = [];
  for (let seed = 1; seed <= 5; seed++) out.push(await jugarSub(seed));
  for (const claves of [['retirado', 'retirado', 'retirado', 'retirado', 'retirado'], ['parejo', 'parejo', 'parejo', 'parejo', 'parejo'], ['gastador', 'gastador', 'azar', 'azar', 'cuentagotas'], ['azar', 'azar', 'azar', 'azar', 'azar'], ['gastador', 'gastador', 'gastador', 'parejo', 'retirado']]) {
    for (let seed = 1; seed <= 2; seed++) out.push(await jugarSub(seed, claves));
  }
  for (let seed = 1; seed <= 2; seed++) out.push(await jugarSub(seed, ['fuerte', 'parejo', 'azar', 'retirado', 'cuentagotas']));
  out.push(await jugarSub(1, ['migaja', 'retirado', 'retirado', 'retirado', 'retirado'])); // gana cada subasta por casi nada
  return out;
}
