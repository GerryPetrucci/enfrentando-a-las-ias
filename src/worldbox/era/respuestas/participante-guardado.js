import { createInterface } from 'node:readline';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hash } from '../../util.js';
import { LETRA, accesoRespuestas, claveDeLlamada, EXTENSIONES } from './almacen.js';
import { extraerJson } from './extraer-json.js';
import { evaluarTexto } from './verificar.js';

// Participantes que NO llaman a ningún modelo: leen sus respuestas de lo que el usuario pegó a mano (carpeta o conversacion.json) y, en modo
// asistido, se las piden al usuario en el momento (con el estado observado) y esperan su Enter. El orquestador no sabe la diferencia: usa
// `participante.decidir(ctx)` como con un bot, así que la validación, la corrección única, la jugada por defecto y el log son los de siempre.

export const ENVOLTURA_MANUAL_VERSION = 'manual-1.0';
export const RECORDATORIO_FORMATO = 'Responde SOLO con el objeto JSON del formato indicado en el texto de sistema (sin Markdown y sin texto fuera del JSON).';
const RESPUESTA_ESPERAR = JSON.stringify({ actions: [{ action: 'esperar', parameters: {} }], reasoning_summary: '' });

// Lector de líneas de la consola. Una línea pulsada cuando nadie espera se descarta (no te saltas una decisión por un doble Enter).
// Si la entrada se cierra, `preguntar()` resuelve null para siempre (el asistente deja de esperar).
export function crearLectorLineas(entrada) {
  const rl = createInterface({ input: entrada, terminal: false }), esperando = [];
  let cerrado = false;
  rl.on('line', l => esperando.shift()?.(l));
  rl.on('close', () => { cerrado = true; while (esperando.length) esperando.shift()(null); });
  return { preguntar: () => cerrado ? Promise.resolve(null) : new Promise(r => esperando.push(r)), cerrar: () => rl.close(), cerrado: () => cerrado };
}
const rutaLegible = r => r;

function etiquetaLlamada(llamada) {
  if (llamada.tipo === 'intervencion') return `Intervención ${llamada.indice} de ${llamada.de_fase} (${llamada.fase === 'guerra' ? 'guerra' : 'desarrollo'})`;
  return `Etapa ${llamada.etapa} del borrador`;
}

// Mensaje exacto que se pega en el chat: texto de sistema (solo la primera vez que ese modelo recibe un mensaje) + el mensaje de usuario de la llamada.
export function mensajeParaChat({ sistema, usuario, conSistema, correccion = null, errores = [] }) {
  const partes = [];
  if (conSistema) partes.push(sistema, '--------------------------------------------------------------------------------');
  if (correccion) {
    partes.push('TU RESPUESTA ANTERIOR FUE INVÁLIDA. Corrige estos errores y responde de nuevo, completa y SOLO con el JSON (esta corrección no cuesta nada):', errores.map(e => `- ${e}`).join('\n'), 'Este es el mensaje de la llamada con tu respuesta anterior incluida:');
  } else partes.push('MENSAJE DE ESTA LLAMADA (JSON):');
  partes.push(usuario, RECORDATORIO_FORMATO);
  return partes.join('\n\n');
}

export function crearParticipantesGuardados({ almacen, modelos, asistido = false, raiz = null, registro = [], lector = null, avisar = t => console.error(t), nombres = {}, sistemaSiempre = false, leer = async r => (await readFile(r, 'utf8')).replace(/^﻿/, ''), escribir = null, esperarMs = 40 } = {}) {
  const accesos = { f1: accesoRespuestas(almacen, 'f1'), f2: accesoRespuestas(almacen, 'f2') };
  const rondas = new Map(), ultimos = new Map();
  // El texto de sistema se pega una sola vez por chat: si el borrador ya vino de un archivo, ese chat ya lo recibió (con el prompt del borrador).
  const enviados = new Set(['f1', 'f2'].filter(id => accesos[id].obtener('etapa1', 0)));
  const escribirArchivo = escribir ?? (async (ruta, texto) => { await mkdir(join(ruta, '..'), { recursive: true }); await writeFile(ruta, texto, 'utf8'); });
  let cola = Promise.resolve(); // las preguntas individuales por una respuesta que falta se hacen una a la vez
  const enCola = fn => { const p = cola.then(fn); cola = p.catch(() => {}); return p; };

  async function buscarArchivo(id, clave, intento) {
    for (const ext of EXTENSIONES) {
      const rel = `${LETRA[id].toLowerCase()}/${clave}${intento ? '.correccion' : ''}${ext}`;
      try { const texto = await leer(join(raiz, rel)); if (texto.trim()) return { texto, archivo: rel }; } catch { /* no existe todavía */ }
    }
    return null;
  }
  function ronda(ctx, clave, intento) {
    const k = `${ctx.llamada.numero}:${intento}`;
    if (!rondas.has(k)) {
      const r = { prompts: [], listo: null };
      // Las dos llamadas de un hito llegan a la vez: se espera un instante para anunciar los DOS archivos juntos y pedir UN solo Enter.
      r.listo = (async () => {
        await new Promise(res => setTimeout(res, esperarMs));
        const u = JSON.parse(ctx.prompt.usuario);
        avisar(['', '================================================================================',
          `Llamada ${ctx.llamada.numero} de ${ctx.llamada.de}: ${etiquetaLlamada(ctx.llamada)}${intento ? ' - CORRECCIÓN' : ''} (año ${u.anio}) - la partida está en pausa`,
          '1) Pega en el chat de cada modelo el contenido de su archivo:',
          ...r.prompts.map(p => `     ${LETRA[p.id]}${nombres[p.id] ? ` (${nombres[p.id]})` : ''}: ${rutaLegible(p.prompt)}`),
          '2) Guarda la respuesta de cada modelo TAL CUAL (con su texto alrededor si lo trae) en:',
          ...r.prompts.map(p => `     ${LETRA[p.id]}: ${rutaLegible(p.respuesta)}`),
          `3) Pulsa Enter cuando estén guardadas.${clave.startsWith('etapa') ? '' : ' (Si un modelo no debe actuar, no crees su archivo: esperará.)'}`].join('\n'));
        return lector ? lector.preguntar() : null;
      })();
      rondas.set(k, r);
    }
    return rondas.get(k);
  }

  async function pedirAsistido(id, ctx, clave, intento) {
    const letra = LETRA[id], prefijo = `${clave}${intento ? '-correccion' : ''}-${letra}`;
    const usuarioPrompt = ctx.prompt.usuario;
    let errores = [];
    if (intento) {
      const previo = ultimos.get(`${id}:${clave}`) ?? '';
      let u = {};
      try { u = JSON.parse(usuarioPrompt); } catch { /* sin contexto extra */ }
      const previos = [...Object.values(u.tus_elecciones?.rasgos ?? {}), ...(u.tus_elecciones?.extras ?? [])];
      const amigable = evaluarTexto(clave, previo, { previos: clave === 'etapa3' ? previos : [], maxFuertes: 1, rivalId: ctx.rival_id });
      errores = amigable.validacion.ok ? (ctx.correccion?.errores ?? []).map(e => e.detalle ?? e.codigo) : amigable.validacion.errores.map(e => e.mensaje);
    }
    const texto = mensajeParaChat({ sistema: ctx.prompt.sistema, usuario: usuarioPrompt, conSistema: sistemaSiempre || !enviados.has(id), correccion: intento ? ctx.correccion : null, errores });
    enviados.add(id);
    const prompt = join(raiz, '_prompts', `${prefijo}.txt`), respuesta = join(raiz, letra.toLowerCase(), `${clave}${intento ? '.correccion' : ''}.txt`);
    await escribirArchivo(prompt, texto);
    const r = ronda(ctx, clave, intento);
    r.prompts.push({ id, prompt, respuesta });
    await r.listo;
    for (let vuelta = 0; ; vuelta++) {
      const f = await buscarArchivo(id, clave, intento);
      if (f) { accesos[id].poner(clave, intento, f); return f; }
      if (!lector || lector.cerrado()) return null;
      const dicho = await enCola(async () => {
        avisar(`Falta la respuesta de ${letra}: no encuentro ${rutaLegible(respuesta)}.\n  Guárdala y pulsa Enter, o escribe «s» y Enter para que ${letra} ${clave.startsWith('etapa') ? 'use la jugada por defecto' : intento ? 'siga sin corregir' : 'ESPERE sin actuar'}.`);
        return lector.preguntar();
      });
      if (dicho === null || /^\s*(s|si|sí|esperar)\s*$/i.test(dicho)) return null;
    }
  }

  const crear = id => ({ id, modelo: modelos[id], async decidir(ctx) {
    const clave = claveDeLlamada(ctx.llamada), intento = ctx.correccion ? 1 : 0, acceso = accesos[id];
    let r = acceso.obtener(clave, intento), fuente = r ? (almacen.origen === 'conversacion' ? 'conversacion' : 'archivo') : 'ninguna';
    if (!r && asistido) { const a = await pedirAsistido(id, ctx, clave, intento); if (a) { r = acceso.obtener(clave, intento); fuente = 'asistido'; } }
    const entrada = { participante: id, letra: LETRA[id], numero: ctx.llamada.numero, clave, intento, es_correccion: intento === 1, fuente, archivo: r?.archivo ?? null,
      prompt_usuario: ctx.prompt.usuario, prompt_hash: hash({ sistema: ctx.prompt.sistema, usuario: ctx.prompt.usuario }), sistema_hash: hash(ctx.prompt.sistema),
      respuesta_cruda: r?.crudo ?? r?.texto ?? null, extraccion: null, entregado: null };
    let entregado;
    if (!r) {
      // Sin respuesta: una etapa queda inválida (jugada por defecto + infracción; la revisión previa lo avisa); una intervención espera; una corrección repite lo anterior.
      entregado = intento ? (ultimos.get(`${id}:${clave}`) ?? '') : clave.startsWith('etapa') ? '' : RESPUESTA_ESPERAR;
      entrada.extraccion = { ok: false, avisos: [], error: { codigo: 'sin_respuesta', mensaje: `No hay respuesta guardada para ${clave}${intento ? ' (corrección)' : ''}.` } };
    } else {
      const ex = extraerJson(r.texto);
      entrada.extraccion = { ok: ex.ok, avisos: ex.avisos ?? [], ...(ex.ok ? { bloques: ex.bloques } : { error: ex.error }) };
      entregado = ex.ok ? ex.json : r.texto;
    }
    entrada.entregado = entregado;
    if (!intento) ultimos.set(`${id}:${clave}`, entregado);
    registro.push(entrada);
    return entregado;
  } });
  return { participantes: [crear('f1'), crear('f2')], registro, accesos };
}
