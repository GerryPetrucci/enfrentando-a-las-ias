// La arena. No sabe de que juego se trata ni quien juega: solo corre el ciclo.
// Agregar juegos o contendientes nuevos no requiere tocar este archivo.

import { crearRng } from './rng.js';

export async function correrPartida({ juego, agentes, seed, alRegistrar = () => {} }) {
  const rng = crearRng(seed);
  const estado = juego.crear(rng);
  const registros = [];
  const inicio = Date.now();
  let tokens = 0;

  while (!juego.terminado(estado)) {
    const vistas = agentes.map((_, i) => juego.vista(estado, i));

    // Simultaneo de verdad: nadie ve la jugada del otro antes de decidir.
    const respuestas = await Promise.all(
      agentes.map(async (agente, i) => {
        try {
          const r = await agente.jugar({ juego, vista: vistas[i], rng });
          if (r.uso?.total_tokens) tokens += r.uso.total_tokens;
          return { ...juego.normalizar(r.respuesta), crudo: r.crudo, error: null };
        } catch (err) {
          // Un modelo caido no tumba la partida: juega el default y queda anotado.
          return { ...juego.normalizar(null), crudo: null, error: String(err?.message ?? err) };
        }
      })
    );

    const registro = juego.aplicar(estado, respuestas, rng);
    registros.push(registro);
    alRegistrar(registro, estado);
  }

  return {
    seed,
    juego: { id: juego.id, nombre: juego.nombre, categoria: juego.categoria },
    jugadores: agentes.map((a) => ({
      id: a.id,
      nombre: a.nombre,
      color: a.color,
      inicial: a.inicial,
      tipo: a.tipo,
      modelo: a.modelo,
      versionPrompt: a.versionPrompt ?? null,
    })),
    rondas: registros,
    ...juego.resultado(estado),
    duracionMs: Date.now() - inicio,
    tokensUsados: tokens,
  };
}
