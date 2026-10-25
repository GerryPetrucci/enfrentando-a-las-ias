// La arena. No sabe de que juego se trata ni quien juega: solo corre el ciclo.
// Agregar juegos o contendientes nuevos no requiere tocar este archivo.
//
// Lo que un juego puede ofrecer de mas (todo opcional, el Dilema no usa nada de esto):
//   crear(rng, { jugadores, ...opciones })  recibe cuantos asientos hay
//   opcionesDeAgentes(agentes) -> opciones  lo que el juego quiere saber de quienes se sientan (Guerra: el nombre de reino de cada modelo); `opciones` de la llamada manda sobre esto
//   normalizar(respuesta, estado)           ademas de la respuesta recibe el estado (Guerra: los nombres de reino de la partida); los demas juegos lo ignoran
//   activos(estado) -> boolean[]            solo se pregunta a los asientos activos (un reino caido no cuesta llamadas)
//   rondas                                  se usa como guardia: una partida que no termina se corta con un error

import { crearRng } from './rng.js';

// Presupuesto de llamadas por partida (CLAUDE.md): al pasarlo se avisa, no se corta.
export const LIMITE_LLAMADAS = 100;

// Optativo por juego. Reservar toda la fase antes de lanzar Promise.all evita
// consultar solo algunos asientos cuando queda poco presupuesto.
export function comprobarPresupuestoLlamadas(juego, llamadas, activos) {
  const limite = juego.limiteLlamadasDuro;
  if (limite === undefined || limite === null) return null;
  if (!Number.isSafeInteger(limite) || limite < 0) throw new Error('Límite duro de llamadas inválido.');
  const necesarias = activos.filter(Boolean).length;
  return llamadas + necesarias > limite
    ? { motivo: 'llamadas', limite, llamadas, necesarias, restantes: limite - llamadas }
    : null;
}

// Los errores de API de cada asiento van en `registro.errores`. Un juego que no los guarda (Lobo solo marca `invalidas`) los recibe aqui, asi quedan
// en el resultado y la consola puede contarlos; si el juego ya trae `errores` no se toca.
const conErrores = (registro, errores) => (registro && registro.errores === undefined ? Object.assign(registro, { errores }) : registro);

// Cada asiento tiene su propio rng: asi lo que sortee un agente no depende del orden en que respondan los demas.
const rngDeAsiento = (seed, i) => crearRng(((seed >>> 0) ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0);

export async function correrPartida({
  juego, agentes, seed, opciones = {}, maxRondas = null, limiteLlamadas = LIMITE_LLAMADAS,
  limitador = null, alRegistrar = () => {}, alAvisar = () => {},
}) {
  const rng = crearRng(seed);
  const estado = juego.crear(rng, { jugadores: agentes.length, ...(juego.opcionesDeAgentes?.(agentes) ?? {}), ...opciones });
  const rngs = agentes.map((_, i) => rngDeAsiento(seed, i));
  const registros = [];
  const avisos = [];
  const uso = agentes.map(() => ({ llamadas: 0, tokensEntrada: 0, tokensSalida: 0 }));
  const inicio = Date.now();
  const tope = (juego.rondas ?? 1000) + 2;
  let tokens = 0;
  let llamadas = 0;
  let cortePorLlamadas = null;

  while (!juego.terminado(estado) && (maxRondas === null || registros.length < maxRondas)) {
    if (registros.length >= tope) throw new Error(`${juego.id}: la partida no termina despues de ${tope} rondas`);
    const activos = juego.activos ? juego.activos(estado) : agentes.map(() => true);

    cortePorLlamadas = comprobarPresupuestoLlamadas(juego, llamadas, activos);
    if (cortePorLlamadas) {
      const aviso = `Corte duro: ${llamadas}/${cortePorLlamadas.limite} llamadas; la siguiente fase necesita ${cortePorLlamadas.necesarias}.`;
      avisos.push(aviso);
      alAvisar(aviso);
      const cierre = conErrores(juego.cerrarPorLimiteLlamadas?.(estado, cortePorLlamadas), agentes.map(() => null));
      if (cierre) { registros.push(cierre); alRegistrar(cierre, estado); }
      break;
    }

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
        // Lo que gasto una llamada, haya salido bien o no: una respuesta cortada por max_tokens tambien cobra sus tokens.
        const gastar = (u) => {
          if (!u) return;
          tokens += u.total_tokens ?? 0;
          uso[i].tokensEntrada += u.prompt_tokens ?? 0;
          uso[i].tokensSalida += u.completion_tokens ?? 0;
        };
        try {
          await limitador?.esperar();
          // Solo los bots de control piden el estado completo; un modelo recibe unicamente su vista.
          const entrada = { juego, vista: juego.vista(estado, i), rng: rngs[i], ...(agente.necesitaEstado ? { estado, i } : {}) };
          const r = await agente.jugar(entrada);
          gastar(r.uso);
          return { ...juego.normalizar(r.respuesta, estado), crudo: r.crudo, error: null };
        } catch (err) {
          // Un modelo caido no tumba la partida: juega el default y queda anotado, con el texto que llego (si llego algo) y lo que costo.
          gastar(err?.uso);
          return { ...juego.normalizar(null, estado), crudo: typeof err?.crudo === 'string' ? err.crudo : null, error: String(err?.message ?? err) };
        }
      })
    );

    const registro = conErrores(juego.aplicar(estado, respuestas, rng), respuestas.map((r) => r?.error ?? null));
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
    ...(cortePorLlamadas ? { cortePorLlamadas } : {}),
    avisos,
    usoPorJugador: uso,
    duracionMs: Date.now() - inicio,
    tokensUsados: tokens,
  };
}
