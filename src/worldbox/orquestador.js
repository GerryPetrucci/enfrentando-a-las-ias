import { randomUUID } from 'node:crypto';
import { comprobarAdaptador, normalizarTerminal, normalizarEjecucion, normalizarReinicio } from './adaptador.js';
import { accionesHabilitadas, comprobarCatalogo, ESPERAR, validarAccion, validarRespuesta, restriccionesVisibles, registrarUso, CATALOGO } from './contrato-acciones.js';
import { construirObservacion } from './observacion.js';
import { construirPrompt } from './prompt.js';
import { crearTelemetria } from './telemetria.js';
import { reconstruirReporte } from './reporte.js';
import { puntuar } from './puntuacion.js';
import { PERFILES, perfilPorOrigen } from './reglas.js';
import { conTiempo, copiar, entero, exigir, hash, normalizarError, ERRORES_TECNICOS, PROMPT_VERSION, SEMILLA_MAX } from './util.js';

// Primera faccion en actuar: (indicePartida + turno - 1) % n. Rota cada turno y entre partidas.
export function ordenRotado(participantes, indicePartida = 0, turno = 1) {
  const inicio = (indicePartida + turno - 1) % participantes.length;
  return [...participantes.slice(inicio), ...participantes.slice(0, inicio)];
}
// Aplica los valores del perfil de reglas a lo que el llamador no fijo explicitamente.
export function resolverConfig(c, perfil) {
  const p = perfil.partida, maxAcciones = c.maxAcciones ?? p.maxAcciones;
  return { ...c, maxAcciones, turnos: c.turnos ?? p.turnos, puntosPorTurno: c.puntosPorTurno ?? p.puntosPorTurno ?? maxAcciones, segundosPorTurno: c.segundosPorTurno ?? p.segundosPorTurno,
    tamanoMapa: c.tamanoMapa ?? p.tamanoMapa, maxTiempoMs: c.maxTiempoMs ?? p.maxTiempoMs, timeoutMs: c.timeoutMs ?? p.timeoutMs,
    umbralSitio: c.umbralSitio === undefined ? p.umbralSitio : c.umbralSitio, intentosMapa: c.intentosMapa ?? p.intentosMapa,
    opcionesEscenario: { velocidad: p.velocidad, plantilla: p.plantilla, unidades_iniciales: p.unidadesIniciales, ...(c.opcionesEscenario ?? {}) },
    especie: c.especie === undefined ? p.especie : c.especie };
}
export function validarConfig({ participantes, pasarela, semilla, turnos, maxAcciones, puntosPorTurno, segundosPorTurno, tamanoMapa, presupuesto, maxTokens, maxTiempoMs, timeoutMs, indicePartida, umbralSitio = null, intentosMapa = 1 }) {
  exigir((umbralSitio === null || entero(umbralSitio, 0, 100000)) && entero(intentosMapa, 1, 50));
  exigir(Array.isArray(participantes) && entero(participantes.length, 2, 4) && new Set(participantes.map(p => p?.id)).size === participantes.length);
  exigir(participantes.every(p => /^[a-zA-Z0-9_-]{1,40}$/.test(p.id) && typeof p.modelo === 'string' && (typeof p.decidir === 'function' || pasarela)));
  exigir(entero(semilla, 0, SEMILLA_MAX) && entero(turnos, 1, 10000) && entero(maxAcciones, 1, 10) && entero(puntosPorTurno, 1, 100) && entero(segundosPorTurno, 1, 3600) && entero(tamanoMapa, 12, 10000) && entero(indicePartida, 0, 10000));
  exigir(Number.isFinite(presupuesto) && presupuesto >= 0 && entero(maxTokens, 1, 1e9) && entero(maxTiempoMs, 1, 86_400_000) && entero(timeoutMs, 1, 120000));
}
// Ciclo de la fase 4 del plan: observacion congelada por faccion -> prompt -> decision -> validacion -> adaptador ->
// avance -> registro. Nada rompe la partida: lo invalido se convierte en `esperar` y se registra. Una partida cortada
// por presupuesto/tokens/tiempo/puente termina `completo:false` con su ultimo estado confirmado; no se excluye.
// `reglas`: 'simulado' | 'real' | 'generico' (por omision, segun el origen que anuncie el adaptador).
export async function correrCompetencia({ adaptador, participantes, pasarela, reglas, semilla = 1, turnos, maxAcciones, puntosPorTurno, segundosPorTurno,
  tamanoMapa, opcionesEscenario, especie, presupuesto = 0, maxTokens = 1_000_000, maxTiempoMs, timeoutMs,
  umbralSitio, intentosMapa, indicePartida = 0, competitionId = randomUUID(), runId = randomUUID(), telemetria, ahora = Date.now, observador, presentacion, timeoutAvanceMs } = {}) {
  exigir(reglas === undefined || Object.hasOwn(PERFILES, reglas), 'argumento_invalido');
  const base = { adaptador, participantes, pasarela, semilla, turnos, maxAcciones, puntosPorTurno, segundosPorTurno, tamanoMapa, opcionesEscenario, especie, presupuesto, maxTokens, maxTiempoMs, timeoutMs, umbralSitio, intentosMapa, indicePartida };
  validarConfig(resolverConfig(base, PERFILES[reglas ?? 'simulado']));
  const log = telemetria ?? await crearTelemetria();
  const inicio = ahora(), pausas = { ms: 0 }, penalizaciones = Object.fromEntries(participantes.map(p => [p.id, 0]));
  const usos = Object.fromEntries(participantes.map(p => [p.id, {}])), cooldownsLocal = Object.fromEntries(participantes.map(p => [p.id, {}]));
  let interfazOculta = false, info, snapshot, terminados = 0, completo = false, razon = 'turnos', costo = 0, tokens = 0, iniciado = false, rulesVersion, perfil, cfg;
  // Los limites de tiempo salen del perfil elegido tras conocer el adaptador; hasta entonces valen los del perfil previo.
  let maxMs = resolverConfig(base, PERFILES[reglas ?? 'simulado']).maxTiempoMs, tMs = resolverConfig(base, PERFILES[reglas ?? 'simulado']).timeoutMs;
  // La pausa de lectura del modo grabacion es presentacion: no cuenta contra el tiempo maximo de la partida.
  const transcurrido = () => ahora() - inicio - pausas.ms;
  const plazo = () => Math.max(1, Math.min(tMs, maxMs - transcurrido()));
  const llamarAdaptador = fn => conTiempo(fn, plazo());
  // Modo grabacion (docs/worldbox-grabacion.md): solo PRESENTACION. El observador recibe cada fase para escribir el estado en vivo;
  // la camara y la interfaz se usan solo si el puente las anuncia y NUNCA hacen fallar la partida. Nada de esto entra a la telemetria.
  const pres = presentacion ?? null, dormir = pres?.dormir ?? (ms => new Promise(r => setTimeout(r, ms)));
  let tiempoJuego = 0;
  const avisar = async e => {
    if (!observador) return;
    const puntos = snapshot && perfil ? Object.fromEntries(participantes.map(p => [p.id, puntuar(snapshot.find(f => f.id === p.id) ?? {}, penalizaciones[p.id], perfil.pesos)])) : {};
    try { await observador({ snapshot, puntos, tiempo_juego_s: tiempoJuego, ...e }); } catch { /* el observador nunca detiene la partida */ }
  };
  const retocar = async (clave, datos) => {
    if (!pres || info?.capacidades?.[clave] !== true || typeof adaptador[clave] !== 'function') return;
    try { await conTiempo(() => adaptador[clave](datos), Math.min(tMs, 10000)); } catch { /* sin camara o interfaz se graba igual */ }
  };
  // Zoom por fase (modo grabacion): cerca sobre quien decide, medio mientras el mundo avanza el turno, lejos en la preparacion y la tarjeta final.
  // `presentacion.zooms` = {cerca, medio, lejos}; sin el, rige `presentacion.zoom` (zoom unico) como antes. El puente suaviza el cambio (setTargetZoom).
  const zooms = pres?.zooms ?? null; let ultimaActiva = null;
  const vivaPara = pref => snapshot?.find(f => f.id === pref)?.vivo ? pref : snapshot?.find(f => f.vivo)?.id ?? participantes[0].id; // la camara no puede seguir a un reino sin unidades
  const enfocar = (pref, zoom) => retocar('camara', { faccion: vivaPara(pref), zoom });
  // Toda espera de presentacion (pausa de lectura, espera de Enter en modo manual) queda fuera del tiempo maximo de la partida.
  const sinContar = async fn => { const t0 = ahora(); try { return await fn(); } finally { pausas.ms += Math.max(0, ahora() - t0); } };
  const pausar = async ms => { if (ms > 0) await sinContar(() => dormir(ms)); };
  // El estado terminal confirmado es la autoridad (no el `terminal` de avanzar) y debe seguir listando a todos.
  const estado = async () => {
    const t = normalizarTerminal(await llamarAdaptador(() => adaptador.estadoTerminal()));
    exigir(t.resumen_por_faccion.length === participantes.length && participantes.every(p => t.resumen_por_faccion.some(f => f.id === p.id)), 'respuesta_invalida');
    return t;
  };
  try {
    info = await llamarAdaptador(() => comprobarAdaptador(adaptador));
    perfil = PERFILES[reglas ?? perfilPorOrigen(info.origen).nombre];
    exigir((perfil.nombre === 'simulado') === (info.origen === 'simulado'), 'no_soportado');
    cfg = resolverConfig(base, perfil); validarConfig(cfg);
    await avisar({ fase: 'preparando', turno: 0 });
    maxMs = cfg.maxTiempoMs; tMs = cfg.timeoutMs;
    rulesVersion = perfil.rules_version;
    const acciones = accionesHabilitadas(info, CATALOGO, perfil); comprobarCatalogo(acciones);
    exigir(cfg.maxAcciones <= info.limites.max_acciones_por_turno && cfg.segundosPorTurno <= info.limites.max_segundos_avance, 'no_soportado');
    // Modo grabacion, orden de preparacion: 1) interfaz oculta ANTES de generar (el mundo viejo no se ve con la barra de poderes), 2) generar el mundo
    // y fundar las facciones, 3) camara lejos, 4) preludio (espera del aviso del juego, «Listo para grabar», cuenta atras), 5) turno 1.
    // Nada de esto cuenta contra el tiempo de la partida ni los plazos del puente.
    interfazOculta = true; await retocar('interfaz', { visible: false });
    const simulado = info.origen === 'simulado';
    const opciones = { max_acciones: cfg.maxAcciones, ...(simulado ? { puntos_por_turno: cfg.puntosPorTurno } : Object.fromEntries(Object.entries(cfg.opcionesEscenario).filter(([, v]) => v !== null && v !== undefined))) };
    const generar = async () => {
      const r = normalizarReinicio(await llamarAdaptador(() => adaptador.reiniciarEscenario({ semilla, tamano_mapa: cfg.tamanoMapa,
        facciones: participantes.map(p => { const e = p.especie ?? cfg.especie; return e ? { id: p.id, especie: e } : { id: p.id }; }), opciones })));
      exigir(participantes.every(p => r.facciones.some(f => f.id === p.id)), 'respuesta_invalida');
      return r;
    };
    // Equidad del terreno: la calidad del sitio inicial que informa el puente explica parte de la diferencia entre dos reinos
    // iguales (docs/worldbox-reglas.md, seccion 7). Si la diferencia entre facciones supera el umbral se genera OTRO mundo, hasta
    // `intentosMapa`; cada mundo probado queda registrado. Solo mira datos previos a cualquier decision: no sesga a nadie.
    const brecha = r => { const q = participantes.map(p => r.facciones.find(f => f.id === p.id).calidad_sitio); return q.every(x => x !== undefined) ? Math.max(...q) - Math.min(...q) : null; };
    let reinicio = await generar(); const mundosProbados = [{ hash_mundo: reinicio.hash_mundo, diferencia_sitio: brecha(reinicio) }];
    while (cfg.umbralSitio !== null && mundosProbados.at(-1).diferencia_sitio !== null && mundosProbados.at(-1).diferencia_sitio > cfg.umbralSitio && mundosProbados.length < cfg.intentosMapa) {
      reinicio = await generar(); mundosProbados.push({ hash_mundo: reinicio.hash_mundo, diferencia_sitio: brecha(reinicio) });
    }
    const equidadSitio = cfg.umbralSitio === null || mundosProbados.at(-1).diferencia_sitio === null ? null
      : { umbral: cfg.umbralSitio, intentos: mundosProbados.length, diferencia: mundosProbados.at(-1).diferencia_sitio, cumple: mundosProbados.at(-1).diferencia_sitio <= cfg.umbralSitio, mundos_probados: mundosProbados };
    // Configuracion EFECTIVA: lo que el puente confirma haber aplicado (si no lo informa, lo pedido). Si un valor informado difiere
    // de lo pedido, la partida no empieza: sus reglas no serian las del reglamento y el prompt mentiria. El prompt, la auditoria
    // y el log usan SIEMPRE esta configuracion, no los valores por omision del perfil.
    const especiePedida = p => p.especie ?? cfg.especie ?? null, op = cfg.opcionesEscenario, m = reinicio.mundo ?? {};
    for (const p of participantes) { const e = reinicio.facciones.find(f => f.id === p.id).especie; exigir(e === undefined || especiePedida(p) === null || e === especiePedida(p), 'configuracion_no_aplicada'); }
    for (const [pedido, informado] of [[op.velocidad, m.velocidad], [op.unidades_iniciales, m.unidades_iniciales], [op.plantilla, m.plantilla]]) exigir(informado === undefined || pedido === null || pedido === undefined || informado === pedido, 'configuracion_no_aplicada');
    const efectiva = { especies: [...new Set(participantes.map(p => reinicio.facciones.find(f => f.id === p.id).especie ?? especiePedida(p)).filter(Boolean))], unidadesIniciales: m.unidades_iniciales ?? op.unidades_iniciales ?? null,
      velocidad: m.velocidad ?? op.velocidad ?? null, plantilla: m.plantilla ?? op.plantilla ?? null, tamano: m.tamano ?? null, ancho: m.ancho ?? null, alto: m.alto ?? null };
    snapshot = (await estado()).resumen_por_faccion;
    // Auditoria de reproducibilidad: lo que se pidio, lo que el adaptador dice haber usado y el estado inicial observado.
    // Solo el simulador es determinista por construccion; un puente sin semilla no lo es, y con semilla es 'desconocido'.
    // Si el adaptador usa una semilla distinta de la pedida, ninguna promesa de reproducibilidad sobrevive.
    const semillaDistinta = reinicio.semilla_usada !== null && reinicio.semilla_usada !== semilla;
    const determinista = semillaDistinta || info.determinista === false ? false : info.determinista;
    // Equidad del terreno: NO se supone. Se registra la calidad de sitio que informe el puente por faccion y el mundo generado.
    const calidad = Object.fromEntries(reinicio.facciones.filter(f => f.calidad_sitio !== undefined).map(f => [f.id, f.calidad_sitio]));
    const escenario = { escenario_id: reinicio.escenario_id, hash_mundo: reinicio.hash_mundo, semilla_pedida: semilla, semilla_usada: reinicio.semilla_usada, hash_estado_inicial: hash(snapshot),
      ...(Object.keys(calidad).length ? { calidad_sitio: calidad } : {}), ...(reinicio.mundo ? { mundo: reinicio.mundo } : {}), ...(equidadSitio ? { equidad_sitio: equidadSitio } : {}),
      ...(reinicio.id_solicitud ? { id_solicitud_reinicio: reinicio.id_solicitud } : {}) };
    await log.registrar({ tipo: 'inicio', competition_id: competitionId, run_id: runId, origen: info.origen, determinista, escenario,
      participantes: participantes.map(p => ({ id: p.id, modelo: p.modelo, ...(p.especie ?? cfg.especie ? { especie: p.especie ?? cfg.especie } : {}) })), snapshot,
      config: { semilla, turnos: cfg.turnos, maxAcciones: cfg.maxAcciones, puntosPorTurno: cfg.puntosPorTurno, segundosPorTurno: cfg.segundosPorTurno, tamanoMapa: cfg.tamanoMapa, opcionesEscenario: cfg.opcionesEscenario, umbralSitio: cfg.umbralSitio, intentosMapa: cfg.intentosMapa, presupuesto, maxTokens,
        maxTiempoMs: cfg.maxTiempoMs, timeoutMs: cfg.timeoutMs, indicePartida, prompt_version: PROMPT_VERSION, rules_version: rulesVersion, reglas: perfil.nombre, pesos: perfil.pesos, victoria_supervivencia: perfil.victoriaSupervivencia === true, efectiva,
        adaptador: info, acciones_habilitadas: acciones.map(a => a.nombre), parametros_modelo: pasarela?.configuracion ?? null } });
    iniciado = true;
    // Generar un mundo reinicia la interfaz del juego pero deja puesta la bandera «oculta»: sin un CAMBIO de estado el juego no la vuelve a ocultar
    // (visto en vivo: la barra de poderes quedaba a la vista). Por eso se muestra y se oculta de nuevo, con una pausa corta para que el juego vea el cambio.
    if (pres && info?.capacidades?.interfaz === true && typeof adaptador.interfaz === 'function') {
      await retocar('interfaz', { visible: true });
      await new Promise(r => setTimeout(r, pres.pausaInterfazMs ?? 300));
    }
    await retocar('interfaz', { visible: false });
    if (zooms) await enfocar(participantes[0].id, zooms.lejos); else if (pres?.zoom) await retocar('camara', { faccion: participantes[0].id, zoom: pres.zoom });
    await avisar({ fase: 'preparando', turno: 0 });
    if (pres?.preludio) { try { await sinContar(() => pres.preludio()); } catch { /* sin preludio se graba igual */ } }
    bucle: for (let turno = 1; turno <= cfg.turnos; turno++) {
      if (transcurrido() >= maxMs) { razon = 'limite_tiempo'; break; }
      const orden = ordenRotado(participantes, indicePartida, turno).filter(p => snapshot.find(f => f.id === p.id).vivo);
      // Capturar TODAS las vistas antes de ejecutar la primera accion.
      const vistas = new Map();
      for (const p of orden) vistas.set(p.id, construirObservacion(await llamarAdaptador(() => adaptador.observar(p.id))));
      for (const p of orden) {
        if (!snapshot.find(f => f.id === p.id).vivo) continue;
        if (transcurrido() >= maxMs) { razon = 'limite_tiempo'; break bucle; }
        const vista = vistas.get(p.id), inicioDecision = ahora();
        ultimaActiva = p.id;
        if (zooms) await enfocar(p.id, zooms.cerca); else await retocar('camara', { faccion: p.id, ...(pres?.zoom ? { zoom: pres.zoom } : {}) });
        await avisar({ fase: 'pensando', turno, activo: p.id });
        // Cooldowns: lo que informe el juego y lo que el orquestador lleva; el juego real no los calcula.
        const cooldowns = { ...snapshot.find(f => f.id === p.id).cooldowns };
        for (const [k, v] of Object.entries(cooldownsLocal[p.id])) cooldowns[k] = Math.max(cooldowns[k] ?? 0, v);
        const propios = Object.fromEntries(Object.entries(cooldowns).filter(([, v]) => v > turno));
        const prompt = construirPrompt({ ...vista, acciones, maxAcciones: cfg.maxAcciones, puntosPorTurno: cfg.puntosPorTurno, turnos: cfg.turnos, segundosPorTurno: cfg.segundosPorTurno, turno,
          orden: orden.map(p => p.id), perfil, rulesVersion, restricciones: restriccionesVisibles(acciones, usos[p.id]), cooldownsPropios: propios, config: efectiva });
        const rivalesVivos = snapshot.filter(f => f.vivo && f.id !== p.id).map(f => f.id), anomalias = [];
        let r;
        if (p.decidir) {
          try { r = { texto: await conTiempo(signal => p.decidir({ ...copiar(vista), acciones: copiar(acciones), prompt, signal, turno, usos: copiar(usos[p.id]), cooldowns: copiar(cooldowns), puntosTurno: cfg.puntosPorTurno, maxAcciones: cfg.maxAcciones }), plazo()) }; }
          catch (e) { r = { texto: '', error_type: normalizarError(e).codigo }; }
          r = { request_id: randomUUID(), latency_ms: Math.max(0, ahora() - inicioDecision), input_tokens: 0, output_tokens: 0, cost: 0, cost_source: 'reportado', retry_count: 0, ...r };
        } else {
          r = await pasarela.decidir({ modelo: p.modelo, ...prompt, maxAcciones: cfg.maxAcciones, razonamiento: p.razonamiento ?? null, limiteMs: plazo(), limiteTokens: maxTokens - tokens });
        }
        costo += r.cost; tokens += r.input_tokens + r.output_tokens;
        let error = r.error_type ?? null;
        const v = validarRespuesta(r.texto, { maxAcciones: cfg.maxAcciones });
        if (!error && !v.ok) error = v.error;
        // Cortes de seguridad: detienen la partida y no penalizan a nadie.
        const corte = ['presupuesto', 'presupuesto_excedido', 'limite_tokens', 'tarifa_requerida'].includes(error) ? error : costo > presupuesto + 1e-12 ? 'presupuesto_excedido' : tokens > maxTokens ? 'limite_tokens' : transcurrido() >= maxMs ? 'limite_tiempo' : null;
        const antes = puntuar(snapshot.find(f => f.id === p.id), penalizaciones[p.id], perfil.pesos);
        // Infraccion = culpa del participante (contenido invalido). Los fallos de infraestructura pierden la decision sin penalizar.
        let infracciones = error && !corte && !ERRORES_TECNICOS.has(error) ? 1 : 0, puntos = cfg.puntosPorTurno, enviadas = 0, invalidas = 0, rechazadas = 0;
        const validadas = [], ejecuciones = [];
        await avisar({ fase: 'decidio', turno, activo: p.id, acciones: error || corte ? [ESPERAR] : v.acciones, razon: v.ok ? v.reasoning_summary : '', error: error ?? corte });
        // Modo manual: la partida se detiene con la decision a la vista hasta que quien graba la deje seguir (antes de ejecutar nada).
        if (pres?.esperar) {
          await avisar({ fase: 'esperando', turno, activo: p.id, acciones: error || corte ? [ESPERAR] : v.acciones, razon: v.ok ? v.reasoning_summary : '', error: error ?? corte });
          try { await sinContar(() => pres.esperar({ turno, participante: p.id, modelo: p.modelo })); } catch { /* sin consola, sigue */ }
        }
        for (const propuesta of error || corte ? [ESPERAR] : v.acciones) {
          const validacion = validarAccion(propuesta, { acciones, turno, cooldowns, puntos, usos: usos[p.id], rivalesVivos });
          if (!validacion.ok) { infracciones++; invalidas++; error ??= validacion.error; }
          const accion = validacion.accion;
          validadas.push(accion);
          // `esperar` nunca viaja al adaptador: es la accion nula del orquestador.
          if (accion.action === 'esperar') { ejecuciones.push({ resultado: 'sin_efecto', codigo: 'esperar' }); continue; }
          let ejecucion;
          try {
            enviadas++;
            ejecucion = normalizarEjecucion(await llamarAdaptador(() => adaptador.ejecutar({ faccion: p.id, accion: accion.action, parametros: accion.parameters })));
          } catch (e) {
            const codigo = normalizarError(e).codigo;
            // Un 400 `solicitud_invalida` del puente en una ORDEN es contenido que el puente no acepta (p. ej. un id que no conoce),
            // no una averia: queda como accion rechazada con infraccion y la partida continua. Cualquier otro error del puente
            // (no_listo, juego_ocupado, tiempo agotado, conexion...) sigue su politica tecnica y deja la partida incompleta.
            if (codigo === 'solicitud_invalida') {
              ejecucion = { resultado: 'rechazada', codigo: 'solicitud_invalida' };
              ejecuciones.push(ejecucion); infracciones++; rechazadas++; error ??= codigo; continue;
            }
            error = codigo; razon = `puente_${error}`;
            ejecuciones.push({ resultado: 'rechazada', codigo: error, estado_incierto: true }); break;
          }
          ejecuciones.push(ejecucion);
          if (ejecucion.resultado === 'rechazada') { infracciones++; rechazadas++; error ??= ejecucion.codigo; }
          else {
            // Aceptada (ejecutada o sin_efecto): gasta puntos y activa cooldown. Solo `ejecutada` cuenta para los topes de la partida,
            // salvo lo CONFIRMADO por el juego en `efecto` (unidades creadas), que descuenta cupo aunque el resultado sea sin_efecto.
            puntos -= validacion.regla.puntos;
            if (validacion.regla.cooldown) cooldowns[accion.action] = turno + validacion.regla.cooldown + 1;
            anomalias.push(...registrarUso(usos[p.id], validacion.regla, accion.parameters, { ejecutada: ejecucion.resultado === 'ejecutada', efecto: ejecucion.efecto ?? null }));
          }
        }
        cooldownsLocal[p.id] = { ...cooldowns };
        penalizaciones[p.id] += infracciones;
        if (!razon.startsWith('puente_') && enviadas > 0) {
          try { snapshot = (await estado()).resumen_por_faccion; }
          catch (e) { error = normalizarError(e).codigo; razon = `puente_${error}`; }
        }
        await avisar({ fase: 'aplicando', turno, activo: p.id, acciones: validadas, razon: v.ok ? v.reasoning_summary : '', error: error ?? corte, invalidas, rechazadas });
        await log.registrar({ tipo: 'decision', competition_id: competitionId, run_id: runId, turn_number: turno, participant_id: p.id, model_id: p.modelo,
          prompt_version: PROMPT_VERSION, rules_version: rulesVersion, sistema_hash: hash(prompt.sistema), prompt_hash: hash({ sistema: prompt.sistema, usuario: prompt.usuario }), ...vista, request_id: r.request_id, latency_ms: r.latency_ms,
          action_raw: typeof r.texto === 'string' ? r.texto : (JSON.stringify(r.texto) ?? ''), action_validated: validadas, execution_result: ejecuciones,
          input_tokens: r.input_tokens, output_tokens: r.output_tokens, cost: r.cost, cost_source: r.cost_source, score_delta: puntuar(snapshot.find(f => f.id === p.id), penalizaciones[p.id], perfil.pesos) - antes,
          world_snapshot_ref: hash(snapshot), snapshot, error_type: error ?? corte, retry_count: r.retry_count, intentos: r.intentos ?? [], penalizaciones: infracciones, acciones_invalidas: invalidas, acciones_rechazadas: rechazadas,
          usos: copiar(usos[p.id]), orden: orden.map(x => x.id), estado_orquestador: JSON.parse(prompt.usuario).estado_orquestador ?? null,
          razonamiento_efectivo: r.razonamiento_efectivo ?? null, ...(anomalias.length ? { anomalias } : {}), timestamp: new Date(ahora()).toISOString() });
        if (razon.startsWith('puente_')) break bucle;
        if (corte) { razon = corte; break bucle; }
        if (!pres?.esperar) await pausar(pres?.lecturaMs);
      }
      if (transcurrido() >= maxMs) { razon = 'limite_tiempo'; break; }
      if (zooms) await enfocar(ultimaActiva ?? participantes[0].id, zooms.medio);
      // Avanzar a velocidad x1 dura de verdad los segundos del turno: tiene su propio plazo (por omision, el mismo de siempre).
      const avance = await conTiempo(() => adaptador.avanzar({ segundos_juego: cfg.segundosPorTurno }), Math.max(1, Math.min(timeoutAvanceMs ?? tMs, maxMs - transcurrido())));
      tiempoJuego = avance?.tiempo_juego_s ?? tiempoJuego;
      const terminal = await estado(); snapshot = terminal.resumen_por_faccion; terminados++;
      await log.registrar({ tipo: 'turno', turn_number: turno, snapshot, avance: { segundos_pedidos: cfg.segundosPorTurno, tiempo_juego_s: avance?.tiempo_juego_s ?? null, ...(avance?.id_solicitud ? { id_solicitud: avance.id_solicitud } : {}) },
        resultados: participantes.map(p => { const f = snapshot.find(f => f.id === p.id); return { participant_id: p.id, model_id: p.modelo, ...f, penalizaciones: penalizaciones[p.id], puntos: puntuar(f, penalizaciones[p.id], perfil.pesos) }; }) });
      await avisar({ fase: 'turno', turno });
      if (!zooms) await retocar('camara', { liberar: true });
      if (terminal.terminal) { completo = true; razon = terminal.razon === 'turnos' ? 'turnos' : 'supervivencia'; break; }
      if (turno === cfg.turnos) completo = true;
    }
  } catch (e) {
    if (!iniciado) throw normalizarError(e);
    razon = `puente_${normalizarError(e).codigo}`;
  } finally {
    // Cierre de la presentacion ANTES de cerrar el escenario: tarjeta final, y la camara y la interfaz vuelven a como estaban.
    if (iniciado) {
      if (zooms) await enfocar(ultimaActiva ?? participantes[0].id, zooms.lejos);
      await avisar({ fase: 'fin', turno: terminados });
      if (pres) { await pausar(pres.finMs); await retocar('camara', { liberar: true }); await retocar('interfaz', { visible: true }); }
    }
    if (!iniciado && interfazOculta) await retocar('interfaz', { visible: true }); // la preparacion fallo: la interfaz no se queda oculta
    try { await conTiempo(() => adaptador.cerrar(), tMs); }
    catch { if (iniciado) await log.registrar({ tipo: 'cierre_error', codigo: 'cierre_fallido' }); }
  }
  await log.registrar({ tipo: 'fin', completo, razon, turnos: terminados, snapshot, consumo: { costo, tokens } });
  return { reporte: reconstruirReporte(log.eventos), eventos: log.eventos };
}
