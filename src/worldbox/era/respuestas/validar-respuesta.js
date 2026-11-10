import { validarRespuesta, validarAccion, registrarUso } from '../../contrato-acciones.js';
import { copiar, objeto } from '../../util.js';
import { CATALOGO_ERA, INTERVENCION, NINGUNO, PRESUPUESTO_PUNTOS, accionesIntervencion, esFuerte, evaluarEleccion, evaluarRasgoExtra, limiteEtapa, nombreAccionEtapa, rasgoPorId,
  reglasEtapa, slotsDeEtapa, costoBioma, costoMineral } from '../reglas-era.js';

// Validación de una respuesta pegada a mano, con mensajes ACCIONABLES en español (qué campo, qué es válido) para que el usuario pueda
// pedirle una corrección a su modelo. La AUTORIDAD sigue siendo el validador del motor (validarRespuesta + validarAccion + evaluarEleccion /
// evaluarRasgoExtra): `ok` sale de él; los mensajes de aquí solo traducen sus motivos. Una prueba exige que coincidan.

// Distancia de edición (para sugerir «¿quisiste decir…?»).
function distancia(a, b) {
  const m = a.length, n = b.length;
  if (!m || !n) return Math.max(m, n);
  let previa = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const fila = [i];
    for (let j = 1; j <= n; j++) fila[j] = Math.min(previa[j] + 1, fila[j - 1] + 1, previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previa = fila;
  }
  return previa[n];
}
export function sugerencias(valor, opciones, max = 3) {
  const v = String(valor ?? '').toLowerCase();
  if (!v) return [];
  return opciones.map(o => ({ o, d: Math.min(distancia(v, o.toLowerCase()), o.toLowerCase().includes(v) || v.includes(o.toLowerCase()) ? 1 : 99) }))
    .filter(x => x.d <= Math.max(3, Math.floor(v.length / 3))).sort((x, y) => x.d - y.d).slice(0, max).map(x => x.o);
}
const lista = a => a.join(', ');
const parecido = (valor, opciones) => { const s = sugerencias(valor, opciones); return s.length ? ` ¿Quisiste decir ${s.map(x => `«${x}»`).join(' o ')}?` : ''; };
const motivoExcluido = (id, cat) => {
  const r = cat.razas.find(x => x.id === id && !x.ofrecible); if (r) return `la raza «${id}» existe en el juego pero NO se ofrece en esta partida (${r.motivo ?? 'podada'}).`;
  const x = cat.excluidos?.find(e => e.id === id); if (x) return `«${id}» está excluido del catálogo (${x.motivo}).`;
  const rr = cat.rasgos.find(e => e.id === id && !e.ofrecible); if (rr) return `«${id}» no se ofrece en esta partida.`;
  return null;
};

function err(codigo, mensaje, extra = {}) { return { codigo, mensaje, ...extra }; }

// ---- Estructura común: { actions: [...], reasoning_summary: "..." } ----
function estructura(valor, maxAcciones, esEtapa) {
  const errores = [];
  if (!objeto(valor)) return [err('respuesta_invalida', 'La respuesta debe ser un OBJETO JSON con «actions» y «reasoning_summary».', { campo: '(raíz)' })];
  const claves = Object.keys(valor);
  for (const f of ['actions', 'reasoning_summary']) if (!claves.includes(f)) errores.push(err('campo_faltante', `Falta el campo «${f}».`, { campo: f }));
  for (const k of claves.filter(k => !['actions', 'reasoning_summary'].includes(k))) errores.push(err('campo_extra', `Sobra el campo «${k}»: la respuesta solo lleva «actions» y «reasoning_summary».`, { campo: k }));
  if ('reasoning_summary' in valor && typeof valor.reasoning_summary !== 'string') errores.push(err('reasoning_invalido', '«reasoning_summary» debe ser texto (una frase corta).', { campo: 'reasoning_summary' }));
  else if (typeof valor.reasoning_summary === 'string' && valor.reasoning_summary.length > 240) errores.push(err('reasoning_largo', `«reasoning_summary» tiene ${valor.reasoning_summary.length} caracteres y el máximo es 240: acórtalo a una frase.`, { campo: 'reasoning_summary' }));
  if ('actions' in valor) {
    if (!Array.isArray(valor.actions)) errores.push(err('actions_invalido', '«actions» debe ser un arreglo [ ... ].', { campo: 'actions' }));
    else if (valor.actions.length < 1) errores.push(err('actions_vacio', '«actions» está vacío: pon al menos una acción (en una intervención, «esperar» si no quieres hacer nada).', { campo: 'actions' }));
    else if (esEtapa && valor.actions.length !== 1) errores.push(err('numero_de_acciones', `En esta etapa «actions» lleva UNA sola acción y tiene ${valor.actions.length}.`, { campo: 'actions' }));
    else if (valor.actions.length > maxAcciones) errores.push(err('demasiadas_acciones', `«actions» tiene ${valor.actions.length} acciones y el máximo es ${maxAcciones}.`, { campo: 'actions' }));
  }
  return errores;
}
function formaDeAccion(a, indice) {
  const campo = `actions[${indice}]`;
  if (!objeto(a)) return [err('esquema_invalido', `${campo} debe ser un objeto {"action":"...","parameters":{...}}.`, { campo })];
  const errores = [];
  for (const f of ['action', 'parameters']) if (!(f in a)) errores.push(err('campo_faltante', `A ${campo} le falta «${f}».`, { campo: `${campo}.${f}` }));
  for (const k of Object.keys(a).filter(k => !['action', 'parameters'].includes(k))) errores.push(err('campo_extra', `${campo} tiene un campo de más: «${k}» (solo «action» y «parameters»).`, { campo: `${campo}.${k}` }));
  if ('action' in a && typeof a.action !== 'string') errores.push(err('esquema_invalido', `${campo}.action debe ser texto.`, { campo: `${campo}.action` }));
  if ('parameters' in a && !objeto(a.parameters)) errores.push(err('esquema_invalido', `${campo}.parameters debe ser un objeto { ... }.`, { campo: `${campo}.parameters` }));
  return errores;
}
// Parámetros contra un esquema { campo: {tipo, valores?, minimo?, maximo?} } con mensajes por campo.
function parametrosContraEsquema(parametros, esquema, prefijo, { opciones = {} } = {}) {
  const errores = [];
  for (const k of Object.keys(esquema)) if (!Object.hasOwn(parametros, k)) errores.push(err('parametro_faltante', `Falta el parámetro «${k}» en ${prefijo}.`, { campo: `${prefijo}.${k}` }));
  for (const k of Object.keys(parametros)) if (!Object.hasOwn(esquema, k)) errores.push(err('parametro_extra', `Sobra el parámetro «${k}» en ${prefijo}. Los parámetros válidos son: ${lista(Object.keys(esquema))}.`, { campo: `${prefijo}.${k}` }));
  for (const [k, s] of Object.entries(esquema)) {
    if (!Object.hasOwn(parametros, k)) continue;
    const v = parametros[k], campo = `${prefijo}.${k}`;
    if (s.tipo === 'entero') {
      if (!Number.isInteger(v)) errores.push(err('parametro_tipo', `${k} debe ser un número entero (no texto ni decimal) y vale ${JSON.stringify(v)}.`, { campo }));
      else if (v < (s.minimo ?? -Infinity) || v > (s.maximo ?? Infinity)) errores.push(err('parametro_rango', `${k} vale ${v} y debe estar entre ${s.minimo} y ${s.maximo}.`, { campo }));
    } else if (s.tipo === 'cadena') {
      if (typeof v !== 'string') errores.push(err('parametro_tipo', `${k} debe ser texto y vale ${JSON.stringify(v)}.`, { campo }));
      else if (s.valores && !s.valores.includes(v)) {
        const ayuda = opciones[k] ?? (s.valores.length <= 14 ? `Opciones válidas: ${lista(s.valores)}.` : `Hay ${s.valores.length} opciones (están en la lista del prompt).`);
        errores.push(err('valor_invalido', `${k}: «${v}» no es una opción válida.${parecido(v, s.valores)} ${ayuda}`, { campo, valor: v }));
      }
    }
  }
  return errores;
}

// ---------------------------------------------------------------- etapas 1, 2 y 3
// `previos`: ids de rasgos que la civilización ya tiene (cuentan para el tope de rasgos fuertes).
export function validarEtapa(etapa, valor, { cat = CATALOGO_ERA, previos = [], maxFuertes = 1 } = {}) {
  const errores = [];
  const motor = validarRespuesta(valor, { maxAcciones: 1 });
  const nombreEsperado = nombreAccionEtapa(etapa);
  errores.push(...estructura(valor, 1, true));
  let accion = null;
  if (!errores.length) {
    accion = valor.actions[0];
    const forma = formaDeAccion(accion, 0);
    errores.push(...forma);
    if (!forma.length) {
      if (accion.action !== nombreEsperado) errores.push(err('accion_no_permitida', `En la etapa ${etapa} la acción debe llamarse «${nombreEsperado}» y pusiste «${accion.action}».${parecido(accion.action, [nombreEsperado])}`, { campo: 'actions[0].action' }));
      else {
        const esquema = reglasEtapa(etapa, cat)[0].parametros;
        const ayudas = etapa === 1 ? {} : Object.fromEntries(slotsDeEtapa(etapa, cat).map(s => [s.id, `Opciones de la casilla «${s.id}»: ${lista([NINGUNO, ...cat.rasgos.filter(r => r.ofrecible && r.slot === s.id).map(r => r.id)])}.`]));
        const porCampo = parametrosContraEsquema(accion.parameters, esquema, 'actions[0].parameters', { opciones: ayudas });
        // Un rasgo que existe pero va en otra casilla / está excluido: explicación más útil que «no es válido».
        for (const e of porCampo) {
          if (e.codigo !== 'valor_invalido') continue;
          const slot = e.campo.split('.').at(-1), id = e.valor;
          if (etapa === 1) { const extra = motivoExcluido(id, cat); if (extra) e.mensaje = `${slot}: ${extra}`; continue; }
          const otro = cat.rasgos.find(r => r.id === id && r.ofrecible);
          if (otro) e.mensaje = `${slot}: «${id}» es un rasgo de la casilla «${otro.slot}» (etapa ${slotsDeEtapa(2, cat).some(s => s.id === otro.slot) ? 2 : 3}), no de «${slot}». Ponlo en «${otro.slot}» o usa «${NINGUNO}» aquí.`;
          else { const x = motivoExcluido(id, cat); if (x) e.mensaje = `${slot}: ${x} Usa «${NINGUNO}» o una opción de la lista: ${lista(esquema[slot].valores)}.`; }
        }
        errores.push(...porCampo);
      }
    }
  }
  // Contenido (presupuesto, bioma-raza, fuertes): solo si la forma y los valores son válidos; usa el evaluador del motor.
  let evaluacion = null;
  if (!errores.length && motor.ok) {
    const val = validarAccion(accion, { acciones: reglasEtapa(etapa, cat), turno: 1, puntos: 0 });
    if (val.ok) {
      evaluacion = evaluarEleccion(etapa, accion.parameters, cat, previos, maxFuertes);
      for (const e of evaluacion.errores) errores.push(err(e.codigo, mensajeContenido(etapa, e, accion.parameters, cat, previos), { campo: etapa === 1 ? 'actions[0].parameters' : 'actions[0].parameters (suma de costos)' }));
    }
  }
  const ok = motor.ok && errores.length === 0;
  if (!ok && !errores.length) errores.push(err(motor.error ?? 'respuesta_invalida', 'El motor rechazó la respuesta (forma inválida).'));
  const val2 = ok ? validarAccion(accion, { acciones: reglasEtapa(etapa, cat), turno: 1, puntos: 0 }) : { ok: false };
  if (ok && !val2.ok) { errores.push(err(val2.error, `El motor rechazó la acción (${val2.error}).`)); }
  return { ok: ok && val2.ok, errores, acciones: ok ? valor.actions : null, razon: motor.ok ? valor.reasoning_summary : '', eleccion: evaluacion?.eleccion ?? null, costo: evaluacion?.costo ?? null };
}
function mensajeContenido(etapa, e, parametros, cat, previos) {
  if (e.codigo === 'presupuesto_excedido') {
    if (etapa === 1) {
      const bioma = parametros.bioma === NINGUNO ? null : parametros.bioma;
      return `Presupuesto de la etapa 1 excedido: ${parametros.mineral} cuesta ${costoMineral(parametros.mineral, cat)}${bioma ? ` + ${bioma} cuesta ${costoBioma(bioma, cat)}` : ''}, suman ${costoMineral(parametros.mineral, cat) + (bioma ? costoBioma(bioma, cat) : 0)} y el máximo es ${limiteEtapa(1)}. Cambia a un mineral más barato (stone o gems cuestan 0) o quita el bioma.`;
    }
    const filas = Object.entries(parametros).filter(([, id]) => id !== NINGUNO).map(([slot, id]) => `${slot}: ${id} (${rasgoPorId(id, cat)?.costo ?? '?'})`);
    return `Presupuesto de la etapa ${etapa} excedido: ${e.detalle} Costos elegidos → ${filas.join('; ')}. Quita o cambia algún rasgo (poner «${NINGUNO}» en una casilla ahorra sus puntos).`;
  }
  if (e.codigo === 'rasgo_fuerte_excedido') return `${e.detalle} Los rasgos marcados FUERTE son: ${lista(cat.rasgos.filter(r => r.ofrecible && r.fuerte).map(r => r.id))}. Deja solo uno en toda la partida.`;
  return e.detalle ?? e.codigo;
}

// ---------------------------------------------------------------- intervenciones
const MENSAJES_EXTRA = {
  rasgo_no_ofrecido: id => `«${id}» no es un rasgo del catálogo de esta partida.`,
  rasgo_no_extra: id => `«${id}» no sirve como rasgo_extra: solo se permiten rasgos de «efecto medido» (no de «conducta» ni «sabor»).`,
  ya_presente: id => `ya tienes «${id}»: elige otro rasgo.`,
  rasgo_opuesto: id => `«${id}» es opuesto a un rasgo que ya tienes.`,
  rasgo_fuerte_excedido: id => `«${id}» es FUERTE y ya tienes uno (máximo 1 en toda la partida).`,
  reserva_insuficiente: id => `no te alcanza la reserva de rasgos extra para «${id}».`,
  limite_llamada: id => `solo puedes sumar 1 rasgo_extra por llamada («${id}» sobra).`,
};
const MENSAJES_ACCION = {
  accion_no_permitida: (a, fase) => `la acción «${a}» no existe o no se permite ${fase === 'desarrollo' ? 'durante el DESARROLLO (maldecir e incendiar solo valen en la guerra)' : 'en esta fase'}.`,
  parametros_invalidos: a => `los parámetros de «${a}» no cumplen su esquema.`,
  objetivo_invalido: a => `el objetivo de «${a}» debe ser el id de tu rival (rival.id de la observación) y estar vivo.`,
  puntos_insuficientes: a => `«${a}» no cabe en tus puntos de acción (${INTERVENCION.puntosAccion} por llamada).`,
  limite_partida: a => `«${a}» superaría el tope de toda la partida (unidades 10, poderes 10, recursos donados 100).`,
};
// Estado inicial de una civilización para evaluar intervenciones: topes usados, rasgos propios y reserva.
export function estadoIntervencionInicial({ propios = [], reserva = PRESUPUESTO_PUNTOS.rasgo_extra } = {}) { return { usos: {}, propios: [...propios], reserva }; }
// Replica fiel de `evaluarIntervencion` del orquestador (sin tocarlo). `estado` = { usos, propios, reserva }; NO lo modifica.
export function validarIntervencion(fase, valor, estado = estadoIntervencionInicial(), { cat = CATALOGO_ERA, rivalId = null, rivalVivo = true, anunciadas = null } = {}) {
  const rivalesVivos = rivalId === null ? null : rivalVivo ? [rivalId] : [];
  const errores = estructura(valor, INTERVENCION.maxAcciones, false);
  const motor = validarRespuesta(valor, { maxAcciones: INTERVENCION.maxAcciones });
  const validadas = [];
  const reglas = accionesIntervencion(fase, { anunciadas: anunciadas ?? new Set(['crear_unidades', 'donar_recursos', 'bendecir', 'maldecir', 'incendiar', 'declarar_guerra']) });
  const uso = copiar(estado.usos);
  let puntos = INTERVENCION.puntosAccion, reserva = estado.reserva, extras = 0;
  const propios = [...estado.propios];
  const hayLista = Array.isArray(valor?.actions) && valor.actions.length >= 1;
  if (hayLista && motor.ok) {
    valor.actions.forEach((a, i) => {
      const campo = `actions[${i}]`;
      if (a?.action === 'rasgo_extra') {
        const val = validarAccion(a, { acciones: reglas, turno: 1, puntos });
        if (!val.ok) {
          const id = a.parameters?.id, conocido = typeof id === 'string' ? cat.rasgos.find(r => r.id === id) : null;
          const medidos = reglas.find(r => r.nombre === 'rasgo_extra')?.parametros.id.valores ?? [];
          const porque = conocido ? (!conocido.ofrecible ? `«${id}» no se ofrece en esta partida.` : MENSAJES_EXTRA.rasgo_no_extra(id)) : typeof id === 'string' ? `«${id}» no existe.${parecido(id, medidos)}` : 'los parámetros deben ser exactamente {"id":"<rasgo>"}.';
          errores.push(err(conocido ? 'rasgo_no_extra' : 'parametros_invalidos', `${campo} (rasgo_extra): ${porque} Rasgos válidos como extra: los de «efecto medido» del catálogo (${medidos.length}).`, { campo, indice: i })); validadas.push({ action: 'esperar', parameters: {} }); return;
        }
        const motivo = extras >= INTERVENCION.rasgosExtraPorLlamada ? 'limite_llamada' : evaluarRasgoExtra(a.parameters.id, { propios, reserva }, cat);
        if (motivo) { errores.push(err(motivo, `${campo} (rasgo_extra): ${(MENSAJES_EXTRA[motivo] ?? (() => motivo))(a.parameters.id)}`, { campo, indice: i })); validadas.push({ action: 'esperar', parameters: {} }); return; }
        extras++; reserva -= rasgoPorId(a.parameters.id, cat).costo; propios.push(a.parameters.id); validadas.push(copiar(a)); return;
      }
      const val = validarAccion(a, { acciones: reglas, turno: 1, cooldowns: {}, puntos, usos: uso, rivalesVivos });
      if (!val.ok) { errores.push(...traducirAccion(a, val.error, fase, campo, i, reglas)); validadas.push({ action: 'esperar', parameters: {} }); return; }
      puntos -= val.regla.puntos; registrarUso(uso, val.regla, a.parameters); validadas.push(copiar(a));
    });
  }
  const ok = motor.ok && errores.length === 0;
  if (!ok && !errores.length) errores.push(err(motor.error ?? 'respuesta_invalida', 'El motor rechazó la respuesta (forma inválida).'));
  return { ok, errores, acciones: hayLista && motor.ok ? validadas : null, razon: motor.ok ? valor.reasoning_summary : '', usoFinal: ok ? { usos: uso, propios, reserva } : null };
}
function traducirAccion(a, codigo, fase, campo, indice, reglas) {
  const nombre = a?.action ?? '?';
  const forma = formaDeAccion(a, indice);
  if (forma.length) return forma;
  if (codigo === 'accion_no_permitida') {
    const validas = reglas.map(r => r.nombre);
    return [err(codigo, `${campo}: ${MENSAJES_ACCION.accion_no_permitida(nombre, fase)}${parecido(nombre, validas)} Acciones válidas ahora: ${lista(validas)}.`, { campo, indice })];
  }
  if (codigo === 'parametros_invalidos') {
    const regla = reglas.find(r => r.nombre === nombre);
    const detalle = regla ? parametrosContraEsquema(a.parameters, regla.parametros, `${campo}.parameters`) : [];
    return detalle.length ? detalle.map(d => ({ ...d, indice })) : [err(codigo, `${campo}: ${MENSAJES_ACCION.parametros_invalidos(nombre)}`, { campo, indice })];
  }
  return [err(codigo, `${campo}: ${(MENSAJES_ACCION[codigo] ?? (() => codigo))(nombre)}`, { campo, indice })];
}

// Resumen de una validación para mostrar en consola.
export function resumirErrores(errores) { return errores.map(e => `- ${e.mensaje}`).join('\n'); }
export { esFuerte };
