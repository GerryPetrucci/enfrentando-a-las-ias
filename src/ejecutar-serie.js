// Corre las partidas de una serie (el plan sale de planDeSerie en src/serie.js) y devuelve sus resultados en el orden del plan.
//
//   paralelo: false  una partida tras otra (lo de siempre: modo en vivo, bots, modelos gratis)
//   paralelo: true   todas a la vez. Es lo que necesita el lote: en cada ronda las IAs de todas las partidas piden su jugada
//                    casi al mismo tiempo y el coordinador (src/coordinador-lote.js) las junta en un solo envio por modelo.
//
// No lee la linea de comandos ni escribe archivos: eso es de src/correr.js. Asi se prueba con bots, sin red y sin gastar.

import { correrPartida } from './arena.js';

export async function ejecutarSerie({
  juego, plan, agentesPorClave, paralelo = false, maxRondas = null, limitador = null, opciones = {},
  alEmpezar = () => {}, alRegistrar = () => {}, alTerminar = () => {}, alAvisar = () => {},
}) {
  const correr = async (p) => {
    alEmpezar(p);
    const r = await correrPartida({
      juego,
      agentes: p.claves.map((c) => agentesPorClave.get(c)),
      seed: p.seed,
      opciones, // lo que el juego acepta al crearse (la Guerra de territorios: el bioma del mapa)
      maxRondas,
      limitador,
      alRegistrar: (registro, estado) => alRegistrar(p, registro, estado),
      alAvisar: (aviso) => alAvisar(p, aviso),
    });
    // `invertido` solo existe en duelos: marca que los dos jugadores cambiaron de asiento (lo lee el reproductor).
    const resultado = { ...r, invertido: p.claves.length === 2 && p.rotacion === 1, rotacion: p.rotacion };
    alTerminar(resultado, p);
    return resultado;
  };
  if (paralelo) return Promise.all(plan.map(correr));
  const resultados = [];
  for (const p of plan) resultados.push(await correr(p));
  return resultados;
}
