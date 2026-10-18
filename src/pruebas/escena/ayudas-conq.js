// Ayudas de las pruebas de la escena de la Guerra de territorios. No es un archivo de pruebas.
//
// Partidas REALES del motor (la misma estructura que se guarda en data/), jugadas por bots de control: sin red y sin API. Los bots casi no pelean, asi que los seeds de abajo salen de una
// busqueda (17 de octubre de 2026, 2,550 partidas de 2 a 5 reinos) de las partidas que cubren los escenarios que la escena tiene que saber dibujar. Una prueba comprueba que cada una
// siga cubriendo lo que dice: si el motor cambia y alguna ya no lo cubre, hay que volver a buscar los seeds (no editar la prueba).
import { correrPartida } from '../../arena.js';
import { resolverAgente } from '../../agentes.js';
import conquista from '../../juegos/conquista.js';

export const ESCENARIOS_NECESARIOS = [
  'dos bandos con defensor', 'tres bandos', 'empate', 'repelido', 'decisiva por diferencia', 'maximo 4 combates en un turno',
  'caida de capital', 'pacto formado', 'pacto cumplido', 'ruptura con privado previo', 'maravilla',
];

const MEZCLA_A = ['azar', 'azar', 'agresivo', 'economico', 'pacifico'];
const MEZCLA_B = ['agresivo', 'agresivo', 'agresivo', 'azar', 'azar'];
export const ESCENARIOS = [
  { id: 'guerra-18', seed: 18, bots: MEZCLA_A, cubre: ['empate', 'dos bandos con defensor', 'repelido', 'decisiva por diferencia', 'caida de capital', 'pacto formado', 'pacto cumplido'] },
  { id: 'guerra-61', seed: 61, bots: MEZCLA_B, cubre: ['dos bandos con defensor', 'repelido', 'maximo 4 combates en un turno', 'tres bandos', 'caida de capital'] },
  { id: 'guerra-94', seed: 94, bots: MEZCLA_A, cubre: ['dos bandos con defensor', 'maravilla', 'pacto formado', 'ruptura con privado previo'] },
];

const agentes = (claves) => claves.map((c) => resolverAgente(c, conquista));
const cache = new Map();

// Una partida de bots de control (de 2 a 5 reinos segun cuantos bots se den). El mapa y su bioma salen del seed, como en una serie de verdad.
export async function jugarConqBots(seed, bots, opciones = {}) {
  const clave = JSON.stringify([seed, bots, opciones]);
  if (!cache.has(clave)) cache.set(clave, await correrPartida({ juego: conquista, agentes: agentes(bots), seed, opciones }));
  return structuredClone(cache.get(clave)); // cada prueba recibe su copia: puede estropearla sin afectar a las demas
}

// Lo mismo, pero el reino de `asiento` es un modelo caido (cada llamada falla): el motor lo anota y su reino pasa el turno.
export async function jugarConqConCaido(seed, k, asiento) {
  const clave = JSON.stringify(['caido', seed, k, asiento]);
  if (!cache.has(clave)) {
    const caido = { id: 'caido', nombre: 'Caido', color: '#888888', inicial: 'C', tipo: 'modelo', modelo: 'x/y', async jugar() { throw new Error('HTTP 500'); } };
    const otros = agentes(['agresivo', 'pacifico', 'economico', 'azar', 'agresivo'].slice(0, k - 1));
    const todos = [...otros.slice(0, asiento), caido, ...otros.slice(asiento)];
    cache.set(clave, await correrPartida({ juego: conquista, agentes: todos, seed }));
  }
  return structuredClone(cache.get(clave));
}

export const partidasDeEjemplo = () => Promise.all(ESCENARIOS.map((e) => jugarConqBots(e.seed, e.bots)));

// Que escenarios de ESCENARIOS_NECESARIOS cubre una partida, leyendo solo sus registros.
export function escenariosDe(partida) {
  const cubre = new Set(), privados = [];
  for (const r of partida?.rondas ?? []) {
    for (const c of r.combates ?? []) {
      if (c.bandos.length === 2 && c.bandos.some((b) => b.defensor)) cubre.add('dos bandos con defensor');
      if (c.bandos.length >= 3) cubre.add('tres bandos');
      if (c.resultado === 'empate') cubre.add('empate');
      if (c.resultado === 'repelido') cubre.add('repelido');
      const f = c.bandos.map((b) => b.f).sort((a, b) => b - a);
      if (f[0] !== f[1] && (f[0] - f[1]) / f[0] < 0.10) cubre.add('decisiva por diferencia');
    }
    if ((r.combates ?? []).length >= 4) cubre.add('maximo 4 combates en un turno');
    for (const e of r.eventos ?? []) {
      if (e.tipo === 'caida') cubre.add('caida de capital');
      if (e.tipo === 'pacto') cubre.add('pacto formado');
      if (e.tipo === 'pacto_cumplido') cubre.add('pacto cumplido');
      if (e.tipo === 'maravilla' || e.tipo === 'maravilla_gana') cubre.add('maravilla');
      if (e.tipo === 'ruptura' && privados.some((q) => q.k === e.k && q.a === e.contra)) cubre.add('ruptura con privado previo');
    }
    privados.push(...(r.privados ?? []));
  }
  return cubre;
}
