// La arena. No sabe de que juego se trata ni quien juega: solo corre el ciclo.
// Agregar juegos o contendientes nuevos no requiere tocar este archivo.
//
// Lo que un juego puede ofrecer de mas (todo opcional, el Dilema no usa nada de esto):
//   crear(rng, { jugadores, ...opciones })  recibe cuantos asientos hay
//   activos(estado) -> boolean[]            solo se pregunta a los asientos activos (un reino caido no cuesta llamadas)
//   rondas                                  se usa como guardia: una partida que no termina se corta con un error

import { crearRng } from './rng.js';

// Presupuesto de llamadas por partida (CLAUDE.md): al pasarlo se avisa, no se corta.
export const LIMITE_LLAMADAS = 100;

// Cada asiento tiene su propio rng: asi lo que sortee un agente no depende del orden en que respondan los demas.
const rngDeAsiento = (seed, i) => crearRng(((seed >>> 0) ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0);

export async function correrPartida({
  juego, agentes, seed, opciones = {}, maxRondas = null, limiteLlamadas = LIMITE_LLAMADAS,
  limitador = null, alRegistrar = () => {}, alAvisar = () => {},
}) {
  const rng = crearRng(seed);
  const estado = juego.crear(rng, { jugadores: agentes.length, ...opciones });
  const rngs = agentes.map((_, i) => rngDeAsiento(seed, i));
  const registros = [];
  const avisos = [];
  const uso = agentes.map(() => ({ llamadas: 0, tokensEntrada: 0, tokensSalida: 0 }));
  const inicio = Date.now();
  const tope = (juego.rondas ?? 1000) + 2;
  let tokens = 0;
  let llamadas = 0;

  while (!juego.terminado(estado) && (maxRondas === null || registros.length < maxRondas)) {
    if (registros.length >= tope) throw new Error(`${juego.id}: la partida no termina despues de ${tope} rondas`);
    const activos = juego.activos ? juego.activos(estado) : agentes.map(() => true);

    // Simultaneo de verdad: nadie ve la jugada del otro antes de decidir.
    const respuestas = await Promise.all(
      agentes.map(async (agente, i) => {
        if (!activos[i]) return null;
        llamadas++;
        uso[i].llamadas++;
        if (llamadas === limiteLlamadas + 1) {
          const aviso = `La partida paso de ${limiteLlamadas} llamadas (presupuesto del proyecto).`;
          avisos.push(aviso);
          alAvisar(aviso);
        }
        try {
          await limitador?.esperar();
          // Solo los bots de control piden el estado completo; un modelo recibe unicamente su vista.
          const entrada = { juego, vista: juego.vista(estado, i), rng: rngs[i], ...(agente.necesitaEstado ? { estado, i } : {}) };
          const r = await agente.jugar(entrada);
          if (r.uso) {
            tokens += r.uso.total_tokens ?? 0;
            uso[i].tokensEntrada += r.uso.prompt_tokens ?? 0;
            uso[i].tokensSalida += r.uso.completion_tokens ?? 0;
          }
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
    truncada: !juego.terminado(estado),
    llamadas,
    avisos,
    usoPorJugador: uso,
    duracionMs: Date.now() - inicio,
    tokensUsados: tokens,
  };
}
