import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { leerTelemetria, validarDecision } from './telemetria.js';
import { reconstruirReporte } from './reporte.js';
import { accionesHabilitadas, validarAccion, validarRespuesta, registrarUso, restriccionesVisibles, ESPERAR, CATALOGO } from './contrato-acciones.js';
import { construirPrompt } from './prompt.js';
import { PERFILES } from './reglas.js';
import { puntuar, PESOS } from './puntuacion.js';
import { canonico, hash, copiar, ERRORES_TECNICOS, PROMPT_VERSION } from './util.js';

// Auditoria y repeticion (replay) de una corrida SOLO desde su log: no vuelve a jugar, no llama modelos ni juego alguno.
// Comprueba que el log es coherente (hashes, campos, turnos, costos, puntos), que el reporte guardado es exactamente el
// reconstruido y que cada DECISION se reproduce: la respuesta original (`action_raw`) se revalida con el validador y el catalogo de
// su `rules_version`, y de ahi salen las acciones validadas, las infracciones, los usos y los cooldowns, que se contrastan con lo
// registrado; ademas se vincula `model_id` con el participante y, si la version del prompt es la del codigo, se reconstruye el prompt.
const CONTENIDO_RESPUESTA = new Set(['json_invalido', 'respuesta_invalida', 'respuesta_incompleta']);
const CORTES = new Set(['presupuesto', 'presupuesto_excedido', 'limite_tokens', 'tarifa_requerida', 'limite_tiempo']);

// Reconstruye lo que el orquestador debio hacer con la respuesta registrada. `chain` = { cooldowns, usos } de ese participante ANTES de la decision.
export function reconstruirDecision(d, { acciones, c, chain, rivalesVivos }) {
  const sinJugada = Boolean(d.error_type) && (ERRORES_TECNICOS.has(d.error_type) || CORTES.has(d.error_type));
  const salida = { validadas: [], invalidas: 0, rechazadas: 0, infracciones: 0, incierta: false, esperaError: false, cooldowns: { ...chain.cooldowns }, usos: copiar(chain.usos), anomalias: [] };
  if (sinJugada) { salida.validadas.push(copiar(ESPERAR)); return salida; }
  const v = validarRespuesta(d.action_raw, { maxAcciones: c.maxAcciones });
  // Fallos de contenido de la RESPUESTA (antes de mirar las acciones): se pierde la decision y cuenta una infraccion. El texto registrado
  // debe ser coherente con el motivo (un JSON roto no puede haberse registrado como una respuesta valida).
  if (CONTENIDO_RESPUESTA.has(d.error_type) && !(d.error_type === 'respuesta_incompleta' || (!v.ok && v.error === d.error_type))) { salida.validadas.push(copiar(ESPERAR)); salida.infracciones = 1; salida.esperaError = true; salida.incoherente = true; return salida; }
  if (CONTENIDO_RESPUESTA.has(d.error_type) || !v.ok) { salida.validadas.push(copiar(ESPERAR)); salida.infracciones = 1; salida.esperaError = true; return salida; }
  let puntos = c.puntosPorTurno ?? c.maxAcciones;
  for (const [k, propuesta] of v.acciones.entries()) {
    const val = validarAccion(propuesta, { acciones, turno: d.turn_number, cooldowns: salida.cooldowns, puntos, usos: salida.usos, rivalesVivos });
    if (!val.ok) { salida.invalidas++; salida.infracciones++; salida.esperaError = true; }
    salida.validadas.push(val.accion);
    if (val.accion.action === 'esperar') continue;
    const ejec = d.execution_result[k];
    if (!ejec) break;
    if (ejec.estado_incierto) { salida.incierta = true; break; }
    if (ejec.resultado === 'rechazada') { salida.rechazadas++; salida.infracciones++; salida.esperaError = true; continue; }
    puntos -= val.regla.puntos;
    if (val.regla.cooldown) salida.cooldowns[val.accion.action] = d.turn_number + val.regla.cooldown + 1;
    salida.anomalias.push(...registrarUso(salida.usos, val.regla, val.accion.parameters, { ejecutada: ejec.resultado === 'ejecutada', efecto: ejec.efecto ?? null }));
  }
  return salida;
}

export async function auditarEventos(eventos, { reporteGuardado } = {}) {
  const problemas = [], avisos = [];
  const mal = m => problemas.push(m), aviso = m => avisos.push(m);
  const inicio = eventos.find(e => e.tipo === 'inicio'), fin = eventos.findLast(e => e.tipo === 'fin');
  if (!inicio) return { ok: false, problemas: ['sin_evento_inicio'], avisos, resumen: null, replay: [] };
  if (eventos[0] !== inicio) mal('inicio_no_es_el_primero');
  if (!fin) aviso('sin_evento_fin: registro interrumpido');
  const decisiones = eventos.filter(e => e.tipo === 'decision'), turnos = eventos.filter(e => e.tipo === 'turno');
  const c = inicio.config, pesos = c.pesos ?? PESOS, modelos = Object.fromEntries(inicio.participantes.map(p => [p.id, p.modelo]));
  if (hash(inicio.snapshot) !== inicio.escenario?.hash_estado_inicial) mal('hash_estado_inicial_distinto');
  // Reconstruccion del catalogo habilitado desde la informacion del adaptador guardada en el inicio.
  const perfil = PERFILES[c.reglas] ?? null;
  // Solo se REPRODUCEN las decisiones de un log de la misma version de reglas que trae el codigo; con otra (p. ej. un log 1.0.0) las
  // reglas vigentes darian resultados distintos y no se afirma nada: se comprueba la coherencia basica y se avisa.
  const mismaVersion = !perfil || perfil.rules_version === c.rules_version;
  const acciones = perfil && mismaVersion ? accionesHabilitadas(c.adaptador, CATALOGO, perfil.acciones ? perfil : null) : null;
  if (acciones && canonico(acciones.map(a => a.nombre)) !== canonico(c.acciones_habilitadas)) mal('catalogo_reconstruido_distinto');
  if (!mismaVersion) aviso(`log de OTRA version de reglas (${c.rules_version}; el codigo trae ${perfil.rules_version}): se comprueba la coherencia basica, pero las decisiones y los prompts no se reproducen`);
  let anterior = 0, costoSuma = 0, sistemas = new Set(), promptsVerificados = 0, promptsNoVerificables = 0, decisionesReproducidas = 0, ultimoSnapshot = inicio.snapshot;
  const cadena = Object.fromEntries(inicio.participantes.map(p => [p.id, { cooldowns: {}, usos: {} }]));
  // Recorre los eventos EN ORDEN: el estado previo de cada decision es el del evento anterior.
  for (const e of eventos) {
    if (e.tipo === 'turno') { ultimoSnapshot = e.snapshot; continue; }
    if (e.tipo !== 'decision') continue;
    const d = e, i = decisiones.indexOf(d), nombre = `decision ${i + 1} (T${d.turn_number} ${d.participant_id})`;
    const previo = ultimoSnapshot; ultimoSnapshot = d.snapshot ?? previo;
    try { validarDecision(d); } catch (x) { mal(`${nombre}: ${x.codigo ?? 'invalida'}`); continue; }
    if (!Object.hasOwn(modelos, d.participant_id)) { mal(`${nombre}: participante desconocido`); continue; }
    if (d.model_id !== modelos[d.participant_id]) mal(`${nombre}: model_id ${d.model_id} distinto del participante registrado (${modelos[d.participant_id]})`);
    if (d.turn_number < anterior) mal(`${nombre}: turno retrocede`); anterior = d.turn_number;
    if (hash(d.observation) !== d.observation_hash) mal(`${nombre}: observation_hash no coincide`);
    if (hash(d.snapshot) !== d.world_snapshot_ref) mal(`${nombre}: world_snapshot_ref no coincide`);
    if (d.prompt_version !== c.prompt_version || d.rules_version !== c.rules_version) mal(`${nombre}: version distinta de la configurada`);
    sistemas.add(d.sistema_hash); costoSuma += d.cost;
    if (d.execution_result.length !== d.action_validated.length) mal(`${nombre}: resultados y acciones validadas no cuadran`);
    // ---- la decision se reproduce desde la respuesta original ----
    if (acciones) {
      const cadenaP = cadena[d.participant_id], observados = d.observation?.faccion?.cooldowns ?? {};
      const cooldowns = { ...cadenaP.cooldowns }; for (const [k, v] of Object.entries(observados)) cooldowns[k] = Math.max(cooldowns[k] ?? 0, v);
      // Lo que la faccion VIO como sus limites debe ser lo que se deduce del historial.
      if (d.estado_orquestador) {
        const vis = Object.fromEntries(Object.entries(cooldowns).filter(([, v]) => v > d.turn_number));
        if (canonico(vis) !== canonico(d.estado_orquestador.cooldowns ?? {})) mal(`${nombre}: los cooldowns mostrados no coinciden con el historial`);
        if (canonico(restriccionesVisibles(acciones, cadenaP.usos)) !== canonico(d.estado_orquestador.restricciones ?? {})) mal(`${nombre}: las restricciones mostradas no coinciden con los usos del historial`);
      }
      const rivalesVivos = previo.filter(f => f.vivo && f.id !== d.participant_id).map(f => f.id);
      const rec = reconstruirDecision(d, { acciones, c, chain: { cooldowns, usos: cadenaP.usos }, rivalesVivos });
      if (rec.incoherente) mal(`${nombre}: error_type ${d.error_type} incoherente con el texto de action_raw`);
      if (rec.incierta) aviso(`${nombre}: la ejecucion quedo en estado incierto (fallo del puente); no se reproduce`);
      else {
        decisionesReproducidas++;
        if (canonico(rec.validadas) !== canonico(d.action_validated)) mal(`${nombre}: action_validated no corresponde a revalidar action_raw (${JSON.stringify(rec.validadas)} esperado)`);
        if (rec.invalidas !== (d.acciones_invalidas ?? 0)) mal(`${nombre}: acciones_invalidas registradas ${d.acciones_invalidas} y reconstruidas ${rec.invalidas}`);
        if (rec.rechazadas !== (d.acciones_rechazadas ?? 0)) mal(`${nombre}: acciones_rechazadas registradas ${d.acciones_rechazadas} y reconstruidas ${rec.rechazadas}`);
        if (rec.infracciones !== d.penalizaciones) mal(`${nombre}: penalizaciones registradas ${d.penalizaciones} y reconstruidas ${rec.infracciones}`);
        const sinJugada = Boolean(d.error_type) && (ERRORES_TECNICOS.has(d.error_type) || CORTES.has(d.error_type));
        if (!sinJugada && Boolean(d.error_type) !== rec.esperaError) mal(`${nombre}: error_type ${d.error_type} incoherente con la reproduccion`);
        if (canonico(rec.usos) !== canonico(d.usos ?? {})) mal(`${nombre}: los usos registrados no coinciden con los reconstruidos`);
        if (rec.anomalias.length && canonico(rec.anomalias) !== canonico(d.anomalias ?? [])) mal(`${nombre}: anomalias no registradas`);
        cadenaP.cooldowns = rec.cooldowns; cadenaP.usos = rec.usos;
      }
    }
    // Prompt: se reconstruye con el codigo vigente solo si es la misma version; si no, no se puede afirmar nada.
    if (acciones && perfil && d.sistema_hash && d.prompt_hash) {
      if (d.prompt_version !== PROMPT_VERSION || !d.orden || !c.efectiva) { promptsNoVerificables++; continue; }
      const prompt = construirPrompt({ observation: d.observation, acciones, maxAcciones: c.maxAcciones, puntosPorTurno: c.puntosPorTurno ?? c.maxAcciones, turnos: c.turnos, segundosPorTurno: c.segundosPorTurno ?? 1,
        turno: d.turn_number, orden: d.orden ?? [], perfil, rulesVersion: c.rules_version, restricciones: d.estado_orquestador?.restricciones, cooldownsPropios: d.estado_orquestador?.cooldowns, config: c.efectiva });
      if (hash(prompt.sistema) !== d.sistema_hash) mal(`${nombre}: el texto de sistema reconstruido no coincide`);
      else if (hash({ sistema: prompt.sistema, usuario: prompt.usuario }) !== d.prompt_hash) mal(`${nombre}: el prompt reconstruido no coincide`);
      else promptsVerificados++;
    }
  }
  if (sistemas.size > 1) mal('hay mas de un texto de sistema en la corrida');
  for (const t of turnos) for (const r of t.resultados) {
    const f = t.snapshot.find(x => x.id === r.participant_id);
    if (!f) { mal(`turno ${t.turn_number}: falta ${r.participant_id} en el snapshot`); continue; }
    const pen = decisiones.filter(d => d.participant_id === r.participant_id && d.turn_number <= t.turn_number).reduce((s, d) => s + (d.penalizaciones ?? 0), 0);
    if (puntuar(f, pen, pesos) !== r.puntos) mal(`turno ${t.turn_number} ${r.participant_id}: puntos registrados ${r.puntos} distintos de los recalculados ${puntuar(f, pen, pesos)}`);
  }
  if (fin?.consumo && Math.abs(fin.consumo.costo - costoSuma) > 1e-9) mal('el costo del cierre no es la suma de las decisiones');
  const reporte = reconstruirReporte(eventos);
  if (reporteGuardado && canonico(JSON.parse(JSON.stringify(reporte))) !== canonico(reporteGuardado)) mal('reporte.json no es el reconstruido desde el log');
  const replay = turnos.map(t => ({ turno: t.turn_number,
    jugadas: decisiones.filter(d => d.turn_number === t.turn_number).map(d => ({ participante: d.participant_id, modelo: d.model_id, acciones: d.action_validated.map((a, k) => `${a.action}${Object.keys(a.parameters).length ? JSON.stringify(a.parameters) : ''} -> ${d.execution_result[k]?.resultado}/${d.execution_result[k]?.codigo}`), error: d.error_type, infracciones: d.penalizaciones, costo: d.cost })),
    puntos: Object.fromEntries(t.resultados.map(r => [r.participant_id, r.puntos])) }));
  if (promptsNoVerificables) aviso(`${promptsNoVerificables} prompts de otra version o de un log sin 'orden'/'efectiva' no se pueden reconstruir con este codigo`);
  return { ok: problemas.length === 0, problemas, avisos,
    resumen: { competition_id: inicio.competition_id, reglas: c.reglas ?? null, rules_version: c.rules_version, prompt_version: c.prompt_version, origen: inicio.origen, determinista: inicio.determinista,
      completo: reporte.completo, razon: reporte.razon, turnos: reporte.turnos, decisiones: decisiones.length, decisiones_reproducidas: decisionesReproducidas, hash_final: reporte.hash_final, prompts_verificados: promptsVerificados, ranking: reporte.ranking.map(r => ({ participante: r.participant_id, modelo: r.model_id, puesto: r.puesto, puntos: r.puntos })) },
    replay };
}
export async function auditarCarpeta(ruta) {
  const dir = (await stat(ruta)).isDirectory() ? ruta : resolve(ruta, '..');
  const eventos = await leerTelemetria(join(dir, 'eventos.jsonl'));
  let guardado = null;
  try { guardado = JSON.parse(await readFile(join(dir, 'reporte.json'), 'utf8')); } catch { /* sin reporte guardado */ }
  return auditarEventos(eventos, { reporteGuardado: guardado });
}
export function textoReplay(auditoria) {
  return auditoria.replay.map(t => [`Turno ${t.turno}  puntos ${Object.entries(t.puntos).map(([k, v]) => `${k}=${v}`).join(' ')}`,
    ...t.jugadas.map(j => `  ${j.participante} (${j.modelo})${j.error ? ` [${j.error}]` : ''}: ${j.acciones.join('; ')}`)].join('\n')).join('\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), ruta = args.find(a => !a.startsWith('--'));
  if (!ruta) { console.error('Uso: node src/worldbox/auditar.js <carpeta de la corrida | eventos.jsonl> [--replay]'); process.exitCode = 2; }
  else auditarCarpeta(resolve(ruta)).then(a => {
    console.log(args.includes('--replay') ? `${textoReplay(a)}\n${JSON.stringify({ ok: a.ok, problemas: a.problemas, avisos: a.avisos, resumen: a.resumen }, null, 2)}` : JSON.stringify({ ok: a.ok, problemas: a.problemas, avisos: a.avisos, resumen: a.resumen }, null, 2));
    if (!a.ok) process.exitCode = 1;
  }).catch(e => { console.error(`WorldBox: ${e.codigo ?? 'error_interno'}`); process.exitCode = 1; });
}
