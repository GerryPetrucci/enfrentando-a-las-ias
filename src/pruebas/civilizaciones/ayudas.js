// Ayudas compartidas por las pruebas de la Carrera de civilizaciones. No es un archivo de pruebas.
import { crearRng } from '../../rng.js';
import { crearMapa } from '../../mapa.js';
import { correrPartida } from '../../arena.js';
import { resolverAgente } from '../../agentes.js';
import civilizaciones from '../../juegos/civilizaciones.js';
import { crearEstado } from '../../juegos/civilizaciones/estado.js';
import { normalizarRespuesta } from '../../juegos/civilizaciones/ordenes.js';
import { aplicarTurno } from '../../juegos/civilizaciones/turno/index.js';
import { construirSistema, construirUsuario } from '../../prompt.js';
import { CARACTERES_POR_TOKEN } from '../../juegos/civilizaciones/constantes.js';

export { civilizaciones };

const cacheMapas = new Map();
export function mapaDe(seed, bioma = 'continente') {
  const c = `${seed}|${bioma}`;
  if (!cacheMapas.has(c)) cacheMapas.set(c, crearMapa(seed, 2, { bioma }));
  return cacheMapas.get(c);
}

// Estado nuevo con una COPIA del mapa, para que cada prueba pueda cambiar terreno o recursos sin afectar a las demas.
export function nuevoEstado(seed = 7, bioma = 'continente') {
  const m = mapaDe(seed, bioma);
  const copia = { ...m, regs: m.regs.map((r) => ({ ...r, vecinos: [...r.vecinos] })) };
  return crearEstado(crearRng(seed), { jugadores: 2, mapa: copia, seedTemporada: null }); // regresiones 1.5
}

export const resp = (extra = {}) => ({ ordenes: [], mensaje: '', nota: '', razon: '', ...extra });
export const FUNDACION = { nombre: 'Prueba', lema: 'Lema de prueba', sitio: 1, rasgos: ['eruditos', 'constructores'] };

// Aplica UN turno con las respuestas crudas de cada civilizacion (pasan por el parser, como en la arena). Devuelve el registro.
export function turno(E, crudas = [{}, {}]) {
  return aplicarTurno(E, crudas.map((r) => normalizarRespuesta(r === null ? null : resp(r), E)));
}

// Estado ya fundado (turno 1 jugado) con las dos civilizaciones iguales; `rasgos` y `sitio` de la fundacion.
export function fundado({ seed = 7, bioma = 'continente', rasgos = ['eruditos', 'constructores'], sitio = 1 } = {}) {
  const E = nuevoEstado(seed, bioma);
  const fundacion = { ...FUNDACION, rasgos, sitio };
  turno(E, [{ fundacion }, { fundacion }]);
  return E;
}

// Una partida completa por la arena con dos agentes (claves de bot o de modelo). `alRegistrar(registro, estado)` se llama tras cada turno.
export async function jugar(a, b, seed = 5, extra = {}) {
  return correrPartida({ juego: civilizaciones, agentes: [a, b].map((c) => resolverAgente(c, civilizaciones)), seed, ...extra });
}

// Tokens estimados como en Guerra: caracteres / 1.97.
export const tokens = (texto) => Math.ceil(texto.length / CARACTERES_POR_TOKEN);
export const promptDe = (E, i) => construirSistema(civilizaciones) + '\n' + construirUsuario(civilizaciones.vista(E, i));
