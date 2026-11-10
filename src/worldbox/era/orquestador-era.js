import { randomUUID } from 'node:crypto';
import { comprobarAdaptador, normalizarTerminal } from '../adaptador.js';
import { ESPERAR, registrarUso, validarAccion, validarRespuesta } from '../contrato-acciones.js';
import { crearTelemetria } from '../telemetria.js';
import { canonico, conTiempo, copiar, entero, exigir, hash, normalizarError, ErrorArena, ERRORES_TECNICOS } from '../util.js';
import { ACCIONES_REAL } from '../reglas.js';
import { construirObservacionEra, resumenCivilizacion } from './observacion-era.js';
import { construirPromptEra, construirSistemaEra } from './prompt-era.js';
import { CATALOGO_ERA, INTERVENCION, MOTIVOS_REEMBOLSABLES, NINGUNO, PRESUPUESTO_PUNTOS, PROMPT_VERSION_ERA, RULES_VERSION_ERA, accionesIntervencion, calendarioEra, clasificarEra, eleccionPorDefecto, evaluarEleccion,
  evaluarRasgoExtra, limiteEtapa, rasgoPorId, reglasEtapa, resolverPartida, opcionesControlEra, nombreAccionEtapa, puntuarEra, totalLlamadas, validarPartida } from './reglas-era.js';
import { crearLineaTiempo, describirEventoJuego } from './linea-tiempo.js';

const CORTES = ['presupuesto', 'presupuesto_excedido', 'limite_tokens', 'tarifa_requerida'];
const TIPOS_RASGO = ['reino', 'cultura', 'idioma', 'clan', 'subespecie', 'religion'];

// Ciclo del formato «era» (docs/worldbox-era.md): etapa 1 -> mundo -> años -> etapas 2 y 3 -> intervenciones -> caída del muro y guerra por regla -> fin.
// Nada rompe la partida: una respuesta inválida recibe UNA corrección y después la jugada por defecto; un fallo técnico pierde la llamada sin infracción.
// Una partida cortada por presupuesto, tokens, tiempo o puente termina `completo:false` con su último estado confirmado.
export async function correrEra({ adaptador, participantes, pasarela, semilla = 1, partida: partidaEntrada, presupuesto = 0, maxTokens = 1_000_000, maxTiempoMs, timeoutMs,
  competitionId = randomUUID(), runId = randomUUID(), telemetria, ahora = Date.now, observador, presentacion, lineaTiempo, cat = CATALOGO_ERA, reinos } = {}) {
  const p = resolverPartida({ ...partidaEntrada, maxTiempoMs: maxTiempoMs ?? partidaEntrada?.maxTiempoMs, timeoutMs: timeoutMs ?? partidaEntrada?.timeoutMs });
  validarPartida(p);
  exigir(Array.isArray(participantes) && participantes.length === 2 && new Set(participantes.map(x => x?.id)).size === 2, 'argumento_invalido');
  exigir(participantes.every(x => /^[a-zA-Z0-9_-]{1,40}$/.test(x.id) && typeof x.modelo === 'string' && (typeof x.decidir === 'function' || pasarela)), 'argumento_invalido');
  exigir(entero(semilla, 0, 2147483647) && Number.isFinite(presupuesto) && presupuesto >= 0 && entero(maxTokens, 1, 1e9) && entero(p.maxTiempoMs, 1, 86_400_000) && entero(p.timeoutMs, 1, 3_600_000), 'argumento_invalido'); // 1 h como tope: el modo asistido espera a una persona
  const log = telemetria ?? await crearTelemetria();
  const linea = lineaTiempo ?? crearLineaTiempo({ ahora });
  // Las dos llamadas de un hito corren a la vez: el registro se escribe SIEMPRE en orden (una cola), para que el archivo y la lista en memoria coincidan.
  let colaLog = Promise.resolve();
  const reg = e => { const p = colaLog.then(() => log.registrar(e)); colaLog = p.catch(() => {}); return p; };
  const inicioMs = ahora(), pausas = { ms: 0 };
  const transcurrido = () => ahora() - inicioMs - pausas.ms;
  const plazo = () => Math.max(1, Math.min(p.timeoutMs, p.maxTiempoMs - transcurrido()));
  const llamarAdaptador = (fn, ms) => conTiempo(fn, ms ?? plazo());
  const pres = presentacion ?? null, dormir = pres?.dormir ?? (ms => new Promise(r => setTimeout(r, ms)));
  const sinContar = async fn => { const t0 = ahora(); try { return await fn(); } finally { pausas.ms += Math.max(0, ahora() - t0); } };
  const pausar = async ms => { if (ms > 0) await sinContar(() => dormir(ms)); };
  // Con `pres.esperar` (modo --manual) la pausa de lectura es un Enter del usuario, que comenta en vivo; sin él, la pausa fija de siempre.
  const pausarOEsperar = async info => { if (pres?.esperar) await sinContar(() => pres.esperar(info)); else await pausar(pres?.lecturaMs); };
  const [A, B] = participantes, ids = participantes.map(x => x.id), otro = id => ids.find(x => x !== id);
  const nombreModelo = id => observador?.nombre?.(id) ?? id;
  const calendario = calendarioEra(p), total = totalLlamadas(p);
  const penal = Object.fromEntries(ids.map(id => [id, 0])), usos = Object.fromEntries(ids.map(id => [id, {}]));
  const elec = Object.fromEntries(ids.map(id => [id, { raza: null, mineral: null, bioma: null, rasgos: {}, rasgos_aplicados: {}, rasgos_pendientes: {}, rasgos_no_aplicados: [], extras: [] }]));
  const propios = Object.fromEntries(ids.map(id => [id, []])), reserva = Object.fromEntries(ids.map(id => [id, PRESUPUESTO_PUNTOS.rasgo_extra]));
  let info, estadoJuego = null, costo = 0, tokens = 0, corte = null, iniciado = false, completo = false, razon = 'limite_anios', desde = 0, guerraDeclarada = false, guerraActiva = false, pazVista = false;
  let velocidadActual = null, fasePartida = 'borrador', etapaTexto = 'Preparando', velocidadFija = false, ultimoSnapshot = 0, hayMuro = true, mantenerRasgos = false, anioCaida = null;
  const anomalias = [];
  const sistema = construirSistemaEra(p, cat), sistemaHash = hash(sistema);
  const avisar = async e => { if (!observador?.emitir) return; try { await observador.emitir({ puntos: puntosActuales(), elegidos: elec, ...e }); } catch { /* el observador nunca detiene la partida */ } };
  const retocar = async (clave, datos) => { if (!pres || info?.capacidades?.[clave] !== true || typeof adaptador[clave] !== 'function') return; try { await conTiempo(() => adaptador[clave](datos), Math.min(p.timeoutMs, 10000)); } catch { /* sin camara o interfaz se graba igual */ } };
  const zooms = pres?.zooms ?? null;
  const enfocar = (id, zoom) => retocar('camara', { faccion: id, zoom });

  // Para el registro: por civilizacion y tipo, cuantos rasgos mantenidos hay activos / pendientes y cuantas veces se perdieron o reaplicaron.
  const resumenMantenidos = () => Object.fromEntries((estadoJuego?.civilizaciones ?? []).map(c => [c.id, Object.fromEntries(Object.entries(c.rasgos_mantenidos ?? {}).map(([t, l]) => [t,
    { activos: l.filter(d => d.estado === 'activo').length, pendientes: l.filter(d => d.estado !== 'activo').length, perdidas: l.reduce((s, d) => s + d.perdidas, 0), reaplicaciones: l.reduce((s, d) => s + d.reaplicaciones, 0), ids: l.filter(d => d.estado === 'activo').map(d => d.id) }]))]));
  const vistaCivs = () => estadoJuego?.civilizaciones.map(c => ({ ...c })) ?? [];
  function puntosActuales() { if (!estadoJuego) return {}; return puntuarEra(vistaCivs(), penal); }
  async function refrescar() {
    const e = await llamarAdaptador(() => adaptador.era.estado(desde));
    exigir(e.hay_era && e.civilizaciones.length === 2 && ids.every(id => e.civilizaciones.some(c => c.id === id)), 'respuesta_invalida');
    estadoJuego = e; desde = e.siguiente_evento;
    for (const ev of e.eventos) registrarEventoJuego(ev);
    return e;
  }
  function registrarEventoJuego(ev) {
    if (ev.tipo === 'guerra_declarada' && ev.faccion_a && ev.faccion_b && ev.faccion_a !== ev.faccion_b) { guerraActiva = true; pazVista = false; }
    if (ev.tipo === 'guerra_terminada') { pazVista = true; guerraActiva = false; }
    const d = describirEventoJuego(ev, id => nombreModelo(id));
    if (d) linea.registrar({ ...d, anio: ev.anio, t_juego_s: ev.t_juego_s, evento_juego: ev.tipo });
    if (ev.tipo === 'muro_puesto') hayMuro = true; if (ev.tipo === 'muro_quitado') hayMuro = false;
  }

  // ------------------------------------------------------------ una llamada a un participante (con UNA corrección)
  async function pedir(participante, llamada, datos, reglas, maxAcc, evaluar) {
    let correccion = null, ultimo = null;
    const { correccion: _omitida, ...sinCorreccion } = datos;
    void _omitida;
    for (let intento = 0; intento <= 1; intento++) {
      const prompt = { sistema, usuario: construirPromptEra(p, { ...datos, correccion }, cat).usuario, prompt_version: PROMPT_VERSION_ERA, rules_version: RULES_VERSION_ERA };
      const inicioLlamada = ahora();
      let r;
      if (participante.decidir) {
        try { r = { texto: await conTiempo(signal => participante.decidir({ llamada, presupuesto: datos.presupuesto, observation: datos.observation, correccion, acciones: reglas, propios: copiar(propios[participante.id]), reserva: reserva[participante.id], rival_id: otro(participante.id), prompt, signal }), plazo()) }; }
        catch (e) { r = { texto: '', error_type: normalizarError(e).codigo }; }
        r = { request_id: randomUUID(), latency_ms: Math.max(0, ahora() - inicioLlamada), input_tokens: 0, output_tokens: 0, cost: 0, cost_source: 'reportado', retry_count: 0, ...r };
      } else r = await pasarela.decidir({ modelo: participante.modelo, sistema: prompt.sistema, usuario: prompt.usuario, maxAcciones: maxAcc, razonamiento: participante.razonamiento ?? null, limiteMs: plazo(), limiteTokens: maxTokens - tokens });
      costo += r.cost; tokens += r.input_tokens + r.output_tokens;
      const v = validarRespuesta(r.texto, { maxAcciones: maxAcc });
      let error = r.error_type ?? null, errores = [];
      const cortePropio = CORTES.includes(error) ? error : costo > presupuesto + 1e-12 ? 'presupuesto_excedido' : tokens > maxTokens ? 'limite_tokens' : transcurrido() >= p.maxTiempoMs ? 'limite_tiempo' : null;
      let evaluacion = null;
      if (error && (ERRORES_TECNICOS.has(error) || cortePropio)) errores = [];
      else if (error || !v.ok) errores = [{ codigo: error ?? v.error, detalle: 'La respuesta no es un JSON válido con actions (arreglo) y reasoning_summary (cadena de hasta 240 caracteres), o fue cortada.' }];
      else { evaluacion = evaluar(v.acciones); errores = evaluacion.errores; }
      const tecnico = (error && ERRORES_TECNICOS.has(error)) || cortePropio;
      const ok = !tecnico && errores.length === 0;
      await reg({ tipo: 'decision', competition_id: competitionId, run_id: runId, turn_number: llamada.numero, participant_id: participante.id, model_id: participante.modelo, prompt_version: PROMPT_VERSION_ERA, rules_version: RULES_VERSION_ERA,
        observation_hash: hash(sinCorreccion), observation: copiar(sinCorreccion), request_id: r.request_id, latency_ms: r.latency_ms, action_raw: typeof r.texto === 'string' ? r.texto : (JSON.stringify(r.texto) ?? ''),
        action_validated: ok || evaluacion ? (evaluacion?.validadas ?? []) : [ESPERAR], execution_result: [{ resultado: ok ? 'aceptada' : 'rechazada', codigo: ok ? 'ok' : (errores[0]?.codigo ?? error ?? 'tecnico') }], input_tokens: r.input_tokens, output_tokens: r.output_tokens, cost: r.cost,
        cost_source: r.cost_source, score_delta: 0, world_snapshot_ref: hash(vistaCivs().map(resumenCivilizacion)), error_type: tecnico ? (cortePropio ?? error) : (errores[0]?.codigo ?? null), retry_count: r.retry_count, timestamp: new Date(ahora()).toISOString(),
        sistema_hash: sistemaHash, prompt_hash: hash({ sistema: prompt.sistema, usuario: prompt.usuario }), llamada, intento, correccion: correccion !== null, errores, intentos: r.intentos ?? [], razonamiento_efectivo: r.razonamiento_efectivo ?? null, anio: estadoJuego?.anio ?? 1 });
      ultimo = { r, v, errores, evaluacion, tecnico, corte: cortePropio, error, ok };
      if (cortePropio) { corte ??= cortePropio; return ultimo; }
      if (ok || tecnico || intento === 1) return ultimo;
      correccion = { intento_anterior: String(r.texto ?? '').slice(0, 1500), errores: errores.slice(0, 12) };
    }
    return ultimo;
  }
  const hitoBase = (numero, tipo, extra = {}) => ({ numero, de: total, tipo, ...extra });

  // ------------------------------------------------------------ etapas del borrador
  const idsElegidos = id => [...Object.values(elec[id].rasgos), ...elec[id].extras];
  const evaluarEtapa = (etapa, id) => acciones => {
    const reglas = reglasEtapa(etapa, cat), errores = [];
    if (acciones.length !== 1) return { errores: [{ codigo: 'numero_de_acciones', detalle: 'Debe ser UNA sola acción.' }], validadas: [] };
    const val = validarAccion(acciones[0], { acciones: reglas, turno: 1, puntos: 0 });
    if (!val.ok || acciones[0].action !== nombreAccionEtapa(etapa)) return { errores: [{ codigo: val.ok ? 'accion_no_permitida' : val.error, detalle: `La acción debe ser ${nombreAccionEtapa(etapa)} con exactamente los parámetros de su esquema y valores de las listas.` }], validadas: [] };
    const ev = evaluarEleccion(etapa, acciones[0].parameters, cat, idsElegidos(id), p.maxFuertes);
    errores.push(...ev.errores);
    return { errores, validadas: [acciones[0]], eleccion: ev.eleccion, costo: ev.costo };
  };
  function datosEtapa(participante, numero, etapa) {
    const id = participante.id, rivalVisible = p.revelar === 'etapa' && etapa >= 2;
    const presup = { puntos_etapa: limiteEtapa(etapa), reserva_rasgos_extra: PRESUPUESTO_PUNTOS.rasgo_extra };
    const base = { llamada: hitoBase(numero, `etapa${etapa}`, { fase: 'borrador', etapa }), anio: estadoJuego?.anio ?? 0, presupuesto: presup,
      observation: estadoJuego ? construirObservacionEra({ estado: estadoJuego, yo: id, rival: otro(id), revelarRival: rivalVisible, partida: p, guerra: guerraDeclarada, puntaje: puntosActuales() }) : null,
      tus_elecciones: etapa === 1 ? null : copiar(elec[id]), elecciones_del_rival: rivalVisible ? copiar(elec[otro(id)]) : null };
    return base;
  }
  async function etapaBorrador(etapa, numero) {
    await avisar({ fase: 'pensando', pensando: ids, llamada: hitoBase(numero, `etapa${etapa}`, { fase: 'borrador', etapa }), fase_era: 'borrador', etapa: `Borrador · etapa ${etapa} de 3`, estado: estadoJuego ?? undefined });
    const res = await Promise.all(participantes.map(x => pedir(x, hitoBase(numero, `etapa${etapa}`, { fase: 'borrador', etapa }), datosEtapa(x, numero, etapa), reglasEtapa(etapa, cat), 1, evaluarEtapa(etapa, x.id))));
    const resultado = {};
    participantes.forEach((x, i) => {
      const r = res[i];
      let eleccion, acciones;
      if (r.ok) { eleccion = r.evaluacion.eleccion; acciones = r.evaluacion.validadas; }
      else {
        // Jugada por defecto: determinista. Cada elemento inválido de la respuesta cuenta una infracción; un fallo técnico, ninguna.
        const params = r.v?.ok && r.v.acciones?.[0]?.action === nombreAccionEtapa(etapa) ? r.v.acciones[0].parameters : null;
        eleccion = eleccionPorDefecto(etapa, params, cat, idsElegidos(x.id), p.maxFuertes);
        if (!r.tecnico) { penal[x.id] += Math.max(1, r.errores.length); }
        acciones = [{ action: nombreAccionEtapa(etapa), parameters: etapa === 1 ? { raza: eleccion.raza, mineral: eleccion.mineral, bioma: eleccion.bioma ?? NINGUNO }
          : Object.fromEntries(Object.keys(reglasEtapa(etapa, cat)[0].parametros).map(s => [s, eleccion.rasgos[s] ?? NINGUNO])) }];
      }
      if (etapa === 1) Object.assign(elec[x.id], eleccion); else { Object.assign(elec[x.id].rasgos, eleccion.rasgos); }
      resultado[x.id] = { eleccion, acciones, razon: r.ok ? r.v.reasoning_summary : '', error: r.ok ? null : (r.tecnico ? (r.corte ?? r.error) : r.errores[0]?.codigo), correcciones: r.ok || r.errores.length ? 1 : 0 };
    });
    return resultado;
  }
  // Un rasgo elegido que NO quedo aplicado: se informa al modelo (motivo) y, si no fue culpa suya, se le devuelven los puntos a su reserva de rasgos extra.
  async function noAplicado(x, slot, id, motivo, etapa) {
    const r = rasgoPorId(id, cat), reembolso = MOTIVOS_REEMBOLSABLES.includes(motivo) ? r.costo : 0;
    elec[x.id].rasgos_no_aplicados.push({ casilla: slot, id, motivo, puntos_devueltos: reembolso, etapa });
    delete elec[x.id].rasgos_pendientes[slot];
    if (reembolso) reserva[x.id] += reembolso;
    await reg({ tipo: 'rasgo_no_aplicado', competition_id: competitionId, run_id: runId, participant_id: x.id, casilla: slot, id, motivo, puntos_devueltos: reembolso, reserva_rasgos_extra: reserva[x.id], anio: estadoJuego?.anio ?? 1 });
  }
  const slotDe = (x, id) => Object.entries(elec[x.id].rasgos).find(([, v]) => v === id)?.[0];
  async function aplicarRasgos(etapa) {
    // Etapas 2 y 3: un POST por tipo y facción, con parcial:true (lo que el juego rechaza no se aplica). Cultura, idioma, religión y clan se piden con
    // mantener:true: el puente los reaplica si el juego reemplaza el objeto y aplica lo pendiente en cuanto el reino tiene cultura/idioma/religión.
    for (const x of participantes) {
      const porTipo = {};
      for (const [slot, id] of Object.entries(elec[x.id].rasgos)) { if (cat.slots.find(s => s.id === slot)?.etapa !== etapa) continue; (porTipo[rasgoPorId(id, cat).tipo] ??= []).push(id); }
      for (const tipo of TIPOS_RASGO.filter(t => porTipo[t])) {
        const mantener = mantenerRasgos && p.tiposMantenidos.includes(tipo);
        const res = await llamarAdaptador(() => adaptador.era.rasgos({ faccion: x.id, tipo, agregar: porTipo[tipo], parcial: true, ...(mantener ? { mantener: true } : {}) }));
        for (const id of res.aplicados) { propios[x.id].push(id); const slot = slotDe(x, id); if (slot) elec[x.id].rasgos_aplicados[slot] = id; }
        for (const pd of res.pendientes ?? []) { const slot = slotDe(x, pd.id); if (slot) elec[x.id].rasgos_pendientes[slot] = pd.id; }
        await reg({ tipo: 'rasgos_aplicados', competition_id: competitionId, run_id: runId, etapa, participant_id: x.id, tipo_rasgo: tipo, pedidos: porTipo[tipo], aplicados: res.aplicados, pendientes: (res.pendientes ?? []).map(d => d.id), rechazados: res.rechazados, resultado: res.resultado, mantener, anio: estadoJuego?.anio ?? 1 });
        for (const rz of res.rechazados) { const slot = slotDe(x, rz.id); if (slot) await noAplicado(x, slot, rz.id, rz.codigo, etapa); }
      }
    }
  }
  // Hito «rasgos»: a los `aniosEsperaRasgos` de la etapa 3 se mira lo que sigue pendiente. Lo que ya se aplico queda; lo demas se suelta del puente, se informa al modelo y se devuelven los puntos.
  async function resolverPendientes() {
    await refrescar();
    for (const x of participantes) {
      const civ = estadoJuego.civilizaciones.find(c => c.id === x.id), pend = { ...elec[x.id].rasgos_pendientes };
      for (const [slot, id] of Object.entries(pend)) {
        const tipo = rasgoPorId(id, cat).tipo, d = civ?.rasgos_mantenidos?.[tipo]?.find(y => y.id === id);
        if (d?.estado === 'activo') {
          elec[x.id].rasgos_aplicados[slot] = id; propios[x.id].push(id); delete elec[x.id].rasgos_pendientes[slot];
          await reg({ tipo: 'rasgo_diferido', competition_id: competitionId, run_id: runId, participant_id: x.id, casilla: slot, id, anio: estadoJuego.anio });
          continue;
        }
        try { await llamarAdaptador(() => adaptador.era.rasgos({ faccion: x.id, tipo, soltar: [id] })); } catch { /* si no se puede soltar, el rasgo queda pendiente en el puente: no cuenta */ }
        await noAplicado(x, slot, id, d?.motivo ?? 'objeto_ausente', 3);
      }
    }
  }
  async function mostrarDecisiones(resultado, numero, tipo, extra = {}) {
    for (const x of participantes) {
      const r = resultado[x.id];
      if (!r) continue;
      const e = { fase: 'decidio', activo: x.id, acciones: r.acciones, razon: r.razon, error: r.error, llamada: hitoBase(numero, tipo, extra), estado: estadoJuego ?? undefined };
      if (zooms) await enfocar(x.id, zooms.cerca);
      await avisar(e);
      linea.registrar({ tipo: 'llamada', importancia: 'alta', anio: estadoJuego?.anio ?? 1, t_juego_s: estadoJuego?.tiempo_juego_s ?? 0, modelo: x.id, llamada: numero, descripcion: `${nombreModelo(x.id)}: ${textoCorto(r.acciones)}`, frase: r.razon });
      await pausarOEsperar({ tipo: 'decision', participante: x.id, nombre: nombreModelo(x.id), llamada: numero, de: total, anio: estadoJuego?.anio ?? 1, texto: textoCorto(r.acciones) });
    }
  }
  const textoCorto = acciones => observador?.texto?.(acciones) ?? acciones.map(a => a.action).join(', ');

  // ------------------------------------------------------------ intervenciones
  function presupuestoIntervencion(id) {
    const u = usos[id];
    return { puntos_accion: INTERVENCION.puntosAccion, max_acciones: INTERVENCION.maxAcciones, unidades_restantes: INTERVENCION.topes.unidades - (u.crear_unidades?.acumulado ?? 0), poderes_restantes: INTERVENCION.topes.poderes - (u['grupo:poderes']?.veces ?? 0),
      donado_restante: INTERVENCION.topes.donado - (u.donar_recursos?.acumulado ?? 0), reserva_rasgos_extra: reserva[id], rasgos_extra_por_llamada: INTERVENCION.rasgosExtraPorLlamada };
  }
  const evaluarIntervencion = (id, fase, rivalVivo) => acciones => {
    const reglas = accionesIntervencion(fase, { anunciadas: anunciadasReales }), errores = [], validadas = [], uso = copiar(usos[id]);
    let puntos = INTERVENCION.puntosAccion, reservaLocal = reserva[id], extras = 0;
    const propiosLocal = [...propios[id]];
    acciones.forEach((a, i) => {
      if (a?.action === 'rasgo_extra') {
        const val = validarAccion(a, { acciones: reglas, turno: 1, puntos });
        if (!val.ok) { errores.push({ codigo: val.error, detalle: `Acción ${i + 1} (rasgo_extra): parámetros inválidos.`, indice: i }); validadas.push(copiar(ESPERAR)); return; }
        const motivo = extras >= INTERVENCION.rasgosExtraPorLlamada ? 'limite_llamada' : evaluarRasgoExtra(a.parameters.id, { propios: propiosLocal, reserva: reservaLocal }, cat);
        if (motivo) { errores.push({ codigo: motivo, detalle: `Acción ${i + 1} (rasgo_extra ${a.parameters.id}) no es válida.`, indice: i }); validadas.push(copiar(ESPERAR)); return; }
        extras++; reservaLocal -= rasgoPorId(a.parameters.id, cat).costo; propiosLocal.push(a.parameters.id); validadas.push(copiar(a)); return;
      }
      const val = validarAccion(a, { acciones: reglas, turno: 1, cooldowns: {}, puntos, usos: uso, rivalesVivos: rivalVivo ? [otro(id)] : [] });
      if (!val.ok) { errores.push({ codigo: val.error, detalle: `Acción ${i + 1} (${a?.action ?? '?'}): ${val.error}.`, indice: i }); validadas.push(copiar(ESPERAR)); return; }
      puntos -= val.regla.puntos; registrarUso(uso, val.regla, a.parameters); validadas.push(copiar(a));
    });
    return { errores, validadas };
  }
  let anunciadasReales = new Set();
  async function intervencion(h, numero) {
    const fase = h.fase, etiqueta = fase === 'guerra' ? 'Guerra' : 'Desarrollo';
    // E5: si la partida ya se decidio (una sola civilizacion viva) no se llama a nadie: la intervencion se omite y queda registrada.
    if (estadoJuego.civilizaciones.filter(c => c.vivo).length < 2) {
      await reg({ tipo: 'intervencion_omitida', competition_id: competitionId, run_id: runId, llamada: numero, fase, indice: h.indice, motivo: 'partida_decidida', anio: estadoJuego.anio });
      linea.registrar({ tipo: 'intervencion_omitida', importancia: 'baja', anio: estadoJuego.anio, t_juego_s: estadoJuego.tiempo_juego_s, descripcion: `Se omite la intervención ${h.indice} de ${fase}: la partida ya está decidida` });
      return false;
    }
    await avisar({ fase: 'pensando', pensando: ids, llamada: hitoBase(numero, 'intervencion', { fase, indice: h.indice, de_fase: h.de }), fase_era: fase, etapa: `${etiqueta} · intervención ${h.indice} de ${h.de}`, estado: estadoJuego ?? undefined });
    const rivalVivo = x => estadoJuego.civilizaciones.find(c => c.id === otro(x.id))?.vivo === true;
    const vivos = participantes.filter(x => estadoJuego.civilizaciones.find(c => c.id === x.id)?.vivo);
    const res = await Promise.all(vivos.map(x => pedir(x, hitoBase(numero, 'intervencion', { fase, indice: h.indice, de_fase: h.de }), {
      llamada: hitoBase(numero, 'intervencion', { fase, indice: h.indice, de_fase: h.de }), anio: estadoJuego.anio, presupuesto: presupuestoIntervencion(x.id),
      observation: construirObservacionEra({ estado: estadoJuego, yo: x.id, rival: otro(x.id), revelarRival: true, partida: p, guerra: guerraDeclarada, puntaje: puntosActuales() }),
      tus_elecciones: copiar(elec[x.id]), elecciones_del_rival: copiar(elec[otro(x.id)]) }, accionesIntervencion(fase, { anunciadas: anunciadasReales }), INTERVENCION.maxAcciones, evaluarIntervencion(x.id, fase, rivalVivo(x)))));
    const resultado = {};
    vivos.forEach((x, i) => {
      const r = res[i];
      let acciones, errorFinal = null;
      if (r.ok) acciones = r.evaluacion.validadas;
      else if (r.evaluacion) { acciones = r.evaluacion.validadas; penal[x.id] += r.errores.length; errorFinal = r.errores[0]?.codigo; }
      else { acciones = [copiar(ESPERAR)]; if (!r.tecnico) penal[x.id] += 1; errorFinal = r.tecnico ? (r.corte ?? r.error) : r.errores[0]?.codigo; }
      resultado[x.id] = { acciones, razon: r.v?.ok ? r.v.reasoning_summary : '', error: errorFinal };
    });
    // Ejecución, un participante tras otro (el orden rota con el número de intervención).
    const orden = [...vivos.slice((numero) % vivos.length), ...vivos.slice(0, (numero) % vivos.length)];
    for (const x of orden) {
      const ejecuciones = [];
      for (const a of resultado[x.id].acciones) {
        if (a.action === 'esperar') { ejecuciones.push({ resultado: 'sin_efecto', codigo: 'esperar' }); continue; }
        if (a.action === 'rasgo_extra') {
          const r = rasgoPorId(a.parameters.id, cat);
          const mantener = mantenerRasgos && p.tiposMantenidos.includes(r.tipo);
          const res2 = await llamarAdaptador(() => adaptador.era.rasgos({ faccion: x.id, tipo: r.tipo, agregar: [r.id], parcial: true, ...(mantener ? { mantener: true } : {}) }));
          if (res2.pendientes?.length) { try { await llamarAdaptador(() => adaptador.era.rasgos({ faccion: x.id, tipo: r.tipo, soltar: [r.id] })); } catch { /* sin efecto */ } }
          const ok = res2.aplicados.includes(r.id);
          if (ok) { reserva[x.id] -= r.costo; propios[x.id].push(r.id); elec[x.id].extras.push(r.id); }
          else penal[x.id] += 1;
          ejecuciones.push({ resultado: ok ? 'ejecutada' : 'rechazada', codigo: ok ? 'ok' : (res2.rechazados[0]?.codigo ?? 'rechazada') });
          continue;
        }
        try {
          const e = await llamarAdaptador(() => adaptador.ejecutar({ faccion: x.id, accion: a.action, parametros: a.parameters }));
          const regla = accionesIntervencion(fase, { anunciadas: anunciadasReales }).find(y => y.nombre === a.action);
          if (e.resultado === 'rechazada') penal[x.id] += 1;
          else registrarUso(usos[x.id], regla, a.parameters, { ejecutada: e.resultado === 'ejecutada', efecto: e.efecto ?? null });
          ejecuciones.push(e);
        } catch (err) {
          const codigo = normalizarError(err).codigo;
          if (codigo !== 'solicitud_invalida') throw err;
          penal[x.id] += 1; ejecuciones.push({ resultado: 'rechazada', codigo });
        }
      }
      resultado[x.id].ejecuciones = ejecuciones;
      await reg({ tipo: 'intervencion', competition_id: competitionId, run_id: runId, llamada: numero, participant_id: x.id, fase, acciones: resultado[x.id].acciones, ejecuciones, usos: copiar(usos[x.id]), reserva_rasgos_extra: reserva[x.id], anio: estadoJuego.anio });
    }
    await refrescar();
    await mostrarDecisiones(resultado, numero, 'intervencion', { fase, indice: h.indice, de_fase: h.de });
    await avisar({ fase: 'aplicando', activo: orden.at(-1)?.id, acciones: resultado[orden.at(-1)?.id]?.acciones ?? [], razon: '', estado: estadoJuego });
    return true;
  }

  // ------------------------------------------------------------ velocidad, muro y guerra
  async function velocidad(v, motivo) {
    if (velocidadActual === v) return;
    if (info.capacidades.era_velocidad && typeof adaptador.era.velocidad === 'function') { await llamarAdaptador(() => adaptador.era.velocidad({ velocidad: v })); velocidadActual = v; await reg({ tipo: 'velocidad', competition_id: competitionId, run_id: runId, velocidad: v, motivo, anio: estadoJuego?.anio ?? 1 }); }
    else if (!velocidadFija) { velocidadFija = true; anomalias.push({ tipo: 'velocidad_fija', detalle: 'El puente no cambia la velocidad en vivo: toda la partida va a la del escenario.' }); }
  }
  async function declararGuerra(motivo) {
    const intentos = [];
    for (const [a, b] of [[A.id, B.id], [B.id, A.id]]) {
      const vivos = estadoJuego.civilizaciones.every(c => c.vivo);
      if (!vivos) break;
      let e;
      try { e = await llamarAdaptador(() => adaptador.ejecutar({ faccion: a, accion: 'declarar_guerra', parametros: { objetivo: b } })); }
      catch (err) { e = { resultado: 'rechazada', codigo: normalizarError(err).codigo }; }
      intentos.push({ desde: a, hacia: b, resultado: e.resultado, codigo: e.codigo });
      if (e.resultado === 'ejecutada' || e.codigo === 'ya_en_guerra') { guerraDeclarada = true; guerraActiva = true; pazVista = false; break; }
    }
    await reg({ tipo: 'guerra', competition_id: competitionId, run_id: runId, motivo, intentos, declarada: guerraDeclarada, anio: estadoJuego.anio });
    if (!guerraDeclarada) anomalias.push({ tipo: 'guerra_no_declarada', anio: estadoJuego.anio, intentos });
    return guerraDeclarada;
  }
  async function caidaDelMuro() {
    const m = await llamarAdaptador(() => adaptador.era.muro({ operacion: 'quitar' }));
    await reg({ tipo: 'muro', competition_id: competitionId, run_id: runId, muro_puesto: m.muro_puesto, anio: estadoJuego.anio });
    anioCaida = estadoJuego.anio;
    fasePartida = 'guerra'; etapaTexto = 'Guerra';
    await velocidad(p.velocidadGuerra, 'guerra');
    await refrescar();
    const declarada = await declararGuerra('caida_del_muro');
    await refrescar();
    await avisar({ fase: 'turno', fase_era: 'guerra', etapa: 'Guerra', guerra: declarada, evento: declarada ? 'Cae el muro y empieza la guerra.' : 'Cae el muro.', estado: estadoJuego });
    await pausarOEsperar({ tipo: 'muro', anio: estadoJuego.anio, texto: declarada ? 'Cae el muro y empieza la guerra' : 'Cae el muro' });
  }

  // ------------------------------------------------------------ partida
  let terminal = null;
  try {
    info = await llamarAdaptador(() => comprobarAdaptador(adaptador));
    exigir(info.capacidades.era === true && adaptador.era && typeof adaptador.era.estado === 'function' && typeof adaptador.era.rasgos === 'function' && typeof adaptador.era.muro === 'function', 'no_soportado');
    exigir(p.segundosAvance <= info.limites.max_segundos_avance && p.segundosAvanceGuerra <= info.limites.max_segundos_avance, 'no_soportado');
    mantenerRasgos = info.capacidades.era_mantener === true;
    if (!mantenerRasgos) anomalias.push({ tipo: 'sin_mantenimiento', detalle: 'El puente no mantiene rasgos: cultura, idioma y religion pueden perderse (el juego los reemplaza).' });
    // Solo existen las acciones que el puente anuncia verificadas con EXACTAMENTE el esquema del reglamento (si el mod cambia un rango, la accion queda fuera).
    anunciadasReales = new Set(info.acciones.filter(a => ['crear_unidades', 'donar_recursos', 'bendecir', 'maldecir', 'incendiar', 'declarar_guerra'].includes(a.nombre) && canonico(a.parametros) === canonico(ACCIONES_REAL[a.nombre].parametros)).map(a => a.nombre));
    exigir(anunciadasReales.has('declarar_guerra'), 'no_soportado');
    await avisar({ fase: 'preparando', fase_era: 'borrador', etapa: 'Preparando', llamada: null, estado: undefined });
    if (!pres?.interfazVisible) await retocar('interfaz', { visible: false });

    // Etapa 1 (sin mundo todavía). Los dos eligen a ciegas y a la vez.
    const r1 = await etapaBorrador(1, 1);
    if (corte) throw Object.assign(new Error(corte), { corte: true });
    await reg({ tipo: 'etapa', competition_id: competitionId, run_id: runId, etapa: 1, elecciones: Object.fromEntries(ids.map(id => [id, r1[id].eleccion])), costos: Object.fromEntries(ids.map(id => [id, 0])) });

    // Mundo: espejo, muro, biomas, minerales y leyes. Si el juego no encuentra sitio, se vuelve a generar (mapa distinto) hasta `intentosMundo`.
    const eraOpciones = { espejo: true, ...opcionesControlEra(p), ...(p.muroAncho > 0 ? { muro: { ancho: p.muroAncho } } : {}), leyes: p.leyes, edad: p.edad, pausar_edades: true,
      biomas: Object.fromEntries(ids.filter(id => elec[id].bioma).map(id => [id, elec[id].bioma])),
      minerales: ids.map(id => ({ faccion: id, mineral: elec[id].mineral, cantidad: p.cantidadMinerales, radio: p.radioMinerales })),
      ...(reinos?.facciones?.length ? { facciones: reinos.facciones } : {}), ...(reinos?.sinCapaReinos ? { mapa_reinos: false } : {}) }; // E10: nombre y color de cada reino
    const opciones = { velocidad: p.velocidadDesarrollo, plantilla: p.plantilla, unidades_iniciales: p.unidadesIniciales, era: eraOpciones, ...(p.mapaGuardado ? { mapa: p.mapaGuardado } : {}) };
    let reinicio, ultimoError;
    for (let i = 0; i < p.intentosMundo && !reinicio; i++) {
      try { reinicio = await llamarAdaptador(() => adaptador.reiniciarEscenario({ semilla, tamano_mapa: p.tamanoMapa, facciones: participantes.map(x => ({ id: x.id, especie: elec[x.id].raza })), opciones })); }
      catch (e) { ultimoError = normalizarError(e); if (ultimoError.codigo !== 'error_interno') throw ultimoError; }
    }
    if (!reinicio) throw ultimoError;
    // E10: lo que el juego aplicó de verdad (color y nombre del reino); la capa de OBS adopta ese color (con --colores-juego es el del juego).
    const reinosJuego = Object.fromEntries((reinicio.era?.resultado?.presentacion ?? []).map(x => [x.faccion, x]));
    try { observador?.colores?.(Object.fromEntries(Object.entries(reinosJuego).filter(([, x]) => x.color_aplicado && x.color_aplicado !== '#000000').map(([id, x]) => [id, x.color_aplicado]))); } catch { /* informativo */ }
    iniciado = true; velocidadActual = reinicio.mundo?.velocidad ?? p.velocidadDesarrollo;
    exigir(reinicio.mundo?.velocidad === undefined || reinicio.mundo.velocidad === p.velocidadDesarrollo, 'configuracion_no_aplicada');
    exigir(ids.every(id => reinicio.facciones.find(f => f.id === id)?.especie === undefined || reinicio.facciones.find(f => f.id === id).especie === elec[id].raza), 'configuracion_no_aplicada');
    await refrescar();
    const calidad = Object.fromEntries(reinicio.facciones.filter(f => f.calidad_sitio !== undefined).map(f => [f.id, f.calidad_sitio]));
    await reg({ tipo: 'inicio', competition_id: competitionId, run_id: runId, origen: info.origen, determinista: info.determinista === true ? true : false, formato: 'era',
      escenario: { escenario_id: reinicio.escenario_id, hash_mundo: reinicio.hash_mundo, semilla_pedida: semilla, semilla_usada: reinicio.semilla_usada, ...(Object.keys(calidad).length ? { calidad_sitio: calidad } : {}), ...(reinicio.mundo ? { mundo: reinicio.mundo } : {}), ...(reinicio.era ? { era: reinicio.era } : {}) },
      participantes: participantes.map(x => ({ id: x.id, modelo: x.modelo, raza: elec[x.id].raza })), ...(reinos?.participantes ? { reinos: reinos.participantes.map(r => ({ ...r, ...(reinosJuego[r.id] ? { color_juego: reinosJuego[r.id].color_aplicado ?? null, reino_juego: reinosJuego[r.id].nombre_aplicado ?? null } : {}) })) } : {}), snapshot: vistaCivs(),
      config: { semilla, partida: p, calendario, llamadas: total, presupuesto_puntos: PRESUPUESTO_PUNTOS, intervencion: INTERVENCION, catalogo_version: cat.catalogo_version, catalogo_hash: hash(cat), sistema_hash: sistemaHash, rules_version: RULES_VERSION_ERA, prompt_version: PROMPT_VERSION_ERA,
        presupuesto, maxTokens, adaptador: info, acciones_reales: [...anunciadasReales], parametros_modelo: pasarela?.configuracion ?? null } });
    // Generar un mundo reinicia la interfaz del juego pero deja puesta la bandera «oculta»: se muestra y se oculta de nuevo (docs/worldbox-grabacion.md).
    if (pres && !pres.interfazVisible && info.capacidades.interfaz === true && typeof adaptador.interfaz === 'function') { await retocar('interfaz', { visible: true }); await new Promise(r => setTimeout(r, pres.pausaInterfazMs ?? 300)); }
    if (!pres?.interfazVisible) await retocar('interfaz', { visible: false });
    if (zooms) await enfocar(A.id, zooms.lejos);
    await avisar({ fase: 'preparando', fase_era: 'borrador', etapa: 'Preparando', velocidad: velocidadActual, estado: estadoJuego, evento: 'Se funda el mundo.' });
    linea.registrar({ tipo: 'fundacion_previa', importancia: 'baja', anio: 1, t_juego_s: 0, descripcion: 'Mundo generado (antes de la grabación)' });
    if (pres?.preludio) { try { await sinContar(() => pres.preludio({ listo: () => linea.marcarInicio() })); } catch { /* sin preludio se graba igual */ } }
    if (!linea.iniciada()) linea.marcarInicio();
    for (const ev of estadoJuego.eventos) void ev; // los eventos de la fundación ya se registraron en refrescar()
    await avisar({ fase: 'turno', fase_era: 'borrador', etapa: 'Borrador · etapa 1 de 3', velocidad: velocidadActual, estado: estadoJuego, evento: 'Empieza la partida.' });
    await mostrarDecisiones(r1, 1, 'etapa1', { fase: 'borrador', etapa: 1 });

    // Años, hitos y fin.
    let siguiente = 0;
    const hitos = calendario;
    let numero = 1;
    while (true) {
      if (transcurrido() >= p.maxTiempoMs) { razon = 'limite_tiempo'; break; }
      while (siguiente < hitos.length && estadoJuego.anio >= hitos[siguiente].anio) {
        const h = hitos[siguiente++];
        if (h.tipo === 'muro') { await caidaDelMuro(); continue; }
        if (h.tipo === 'rasgos') { await resolverPendientes(); continue; }
        numero++;
        fasePartida = h.tipo === 'etapa' ? 'borrador' : h.fase;
        if (h.tipo === 'etapa') {
          etapaTexto = `Borrador · etapa ${h.etapa} de 3`;
          const r = await etapaBorrador(h.etapa, numero);
          if (corte) break;
          await aplicarRasgos(h.etapa);
          await refrescar();
          await reg({ tipo: 'etapa', competition_id: competitionId, run_id: runId, etapa: h.etapa, anio: estadoJuego.anio, elecciones: Object.fromEntries(ids.map(id => [id, r[id].eleccion])), aplicados: Object.fromEntries(ids.map(id => [id, { ...elec[id].rasgos_aplicados }])), costos: Object.fromEntries(ids.map(id => [id, 0])) });
          await mostrarDecisiones(r, numero, `etapa${h.etapa}`, { fase: 'borrador', etapa: h.etapa });
          if (h.etapa === 3) { fasePartida = 'desarrollo'; etapaTexto = 'Desarrollo'; await avisar({ fase: 'turno', fase_era: 'desarrollo', etapa: 'Desarrollo', estado: estadoJuego, evento: 'Termina el borrador: ahora se ven las elecciones de los dos.' }); }
        } else {
          etapaTexto = fasePartida === 'guerra' ? 'Guerra' : 'Desarrollo';
          if (!(await intervencion(h, numero))) numero--;
        }
        if (corte) break;
        await pausar(0);
      }
      if (corte) { razon = corte; break; }
      if (estadoJuego.anio >= p.anioLimite) { razon = 'limite_anios'; completo = true; break; }
      const vivas = estadoJuego.civilizaciones.filter(c => c.vivo).length;
      if (vivas <= 1) { terminal = normalizarTerminal(await llamarAdaptador(() => adaptador.estadoTerminal())); razon = 'eliminacion'; completo = true; break; }
      // Si una guerra terminó en paz, el motor la vuelve a declarar (la guerra es regla, no azar).
      if (p.renovarGuerra && pazVista && guerraDeclarada && !hayMuro && estadoJuego.anio < p.anioLimite) { pazVista = false; await declararGuerra('renovar_paz'); }
      if (zooms) await enfocar(ids[Math.floor(estadoJuego.anio / 5) % 2], fasePartida === 'guerra' ? zooms.medio : zooms.lejos);
      const avance = await llamarAdaptador(() => adaptador.avanzar({ segundos_juego: fasePartida === 'guerra' ? p.segundosAvanceGuerra : p.segundosAvance }), Math.max(1, Math.min(pres?.timeoutAvanceMs ?? p.timeoutMs, p.maxTiempoMs - transcurrido())));
      await refrescar();
      if (estadoJuego.anio - ultimoSnapshot >= 10 || avance.terminal) {
        ultimoSnapshot = estadoJuego.anio;
        await reg({ tipo: 'anio', competition_id: competitionId, run_id: runId, anio: estadoJuego.anio, tiempo_juego_s: estadoJuego.tiempo_juego_s, tiempo_real_s: estadoJuego.tiempo_real_s, civilizaciones: vistaCivs().map(resumenCivilizacion), puntos: puntosActuales(), muro: estadoJuego.muro.puesto, velocidad: velocidadActual,
          ...(estadoJuego.mantenimiento ? { mantenimiento: estadoJuego.mantenimiento, rasgos_mantenidos: resumenMantenidos() } : {}) });
      }
      await avisar({ fase: 'turno', fase_era: fasePartida, etapa: etapaTexto, estado: estadoJuego, velocidad: velocidadActual, guerra: guerraActiva });
    }
    if (!terminal) { try { terminal = normalizarTerminal(await llamarAdaptador(() => adaptador.estadoTerminal())); } catch { /* se usa el estado de la era */ } }
  } catch (e) {
    if (!iniciado) throw e.corte ? new ErrorArena(corte) : normalizarError(e);
    razon = e.corte ? corte : `puente_${normalizarError(e).codigo}`;
  } finally {
    if (iniciado) {
      if (zooms) await enfocar(A.id, zooms.lejos);
      const filas = vistaCivs();
      const clasificacion = filas.length ? clasificarEra(filas, penal) : [];
      await avisar({ fase: 'fin', ranking: clasificacion, estado: estadoJuego ?? undefined });
      if (pres) { await pausar(pres.finMs); await retocar('camara', { liberar: true }); await retocar('interfaz', { visible: true }); }
    } else if (pres) await retocar('interfaz', { visible: true });
    try { await conTiempo(() => adaptador.cerrar(), p.timeoutMs); } catch { if (iniciado) await reg({ tipo: 'cierre_error', codigo: 'cierre_fallido' }); }
  }
  // ---- cierre: ranking, ganador y línea de tiempo ----
  const filas = vistaCivs(), clasificacion = filas.length ? clasificarEra(filas, penal) : [];
  const ganador = clasificacion.length && clasificacion[0].puesto === 1 && clasificacion[1]?.puesto !== 1 && (razon === 'eliminacion' || razon === 'limite_anios') ? clasificacion[0].participant_id : null;
  if (estadoJuego) linea.registrar({ tipo: 'fin', importancia: 'alta', anio: estadoJuego.anio, t_juego_s: estadoJuego.tiempo_juego_s, descripcion: ganador ? `Gana ${nombreModelo(ganador)}` : 'La partida termina sin ganador único', razon });
  await reg({ tipo: 'fin', competition_id: competitionId, run_id: runId, formato: 'era', completo, razon, anio: estadoJuego?.anio ?? 0, ganador, snapshot: filas.map(resumenCivilizacion), infracciones: { ...penal }, puntos: filas.length ? puntuarEra(filas, penal) : {},
    ranking: clasificacion.map(c => ({ participant_id: c.participant_id, puesto: c.puesto, puntos: c.puntos, vivo: c.vivo })), terminal: terminal ? { terminal: terminal.terminal, razon: terminal.razon } : null, elecciones: copiar(elec), consumo: { costo, tokens }, anomalias, anio_caida_muro: anioCaida, ...(estadoJuego?.mantenimiento ? { mantenimiento: estadoJuego.mantenimiento, rasgos_mantenidos: resumenMantenidos() } : {}) });
  return { eventos: log.eventos, linea, ganador, razon, completo };
}
