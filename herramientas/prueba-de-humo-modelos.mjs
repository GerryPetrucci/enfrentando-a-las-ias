#!/usr/bin/env node
// Prueba de humo para SUMAR modelos nuevos (plan: privado/planes/plan-probar-modelos-nuevos.md). Hermana de verificar-modelos.mjs,
// que solo mira metadatos: esta SI llama a los modelos, con 3 llamadas chicas por candidato (no una partida):
//   1. dilema      formato simple (Dilema del Prisionero en la ronda 3)
//   2. lobo-noche  un Lobo en la noche 1, con manada y objetivos validos
//   3. lobo-dia    la Vidente en el dia 1, con muerte, inspeccion y el campo opcional afirmaRol
// Los prompts son los de produccion (src/prompt.js + las reglas reales de cada juego) y la validacion es la del motor
// (normalizar del Dilema; aplicarTurno de Lobo). Solo se confirma que el FORMATO funciona, no que el modelo juegue bien.
//
//   node herramientas/prueba-de-humo-modelos.mjs                          (lista candidatos y estima el costo; NO llama a ningun modelo)
//   node herramientas/prueba-de-humo-modelos.mjs --modelos=grok,glm       (estima solo esos)
//   node herramientas/prueba-de-humo-modelos.mjs --modelos=grok,glm --ejecutar --tope-usd=0.50   (llama de verdad, modo pago)
//   --archivo=catalogo.json usa un catalogo guardado en vez de bajar el de OpenRouter (que es publico y gratis).
//
// Seguro por diseno: sin --ejecutar nunca llama; con --ejecutar exige lista explicita de modelos y un tope en dolares. El tope se
// revisa ANTES de cada llamada (puede pasarse por una sola llamada) y hay un maximo fijo de llamadas. El resultado completo, con las
// respuestas, va a privado/pruebas/ (nunca al repo publico).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dilema from '../src/juegos/dilema.js';
import lobo from '../src/juegos/lobo.js';
import { BOTS } from '../src/juegos/lobo-bots.js';
import { activosDe } from '../src/juegos/lobo/estado.js';
import { VERSION as VERSION_LOBO } from '../src/juegos/lobo/constantes.js';
import { construirSistema, construirUsuario, VERSION_PROMPT } from '../src/prompt.js';
import { PARAMETROS } from '../src/parametros.js';
import { llamarModelo, extraerJSON, fijarModo } from '../src/modelos.js';
import { crearRng } from '../src/rng.js';
import { parsearArgumentos, rutaLibre } from '../src/serie.js';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Candidatos del catalogo de OpenRouter del 24 de octubre de 2026. Todavia NO son contendientes (src/modelos.js): eso es la etapa 3.
export const CANDIDATOS = {
  mistral: { nombre: 'Mistral', modelo: 'mistralai/mistral-medium-3-5', grupo: 'media' }, // en la corrida del 25-10 se llamaba "mistral-medium"
  grok: { nombre: 'Grok', modelo: 'x-ai/grok-4.3', grupo: 'media' },
  qwen: { nombre: 'Qwen', modelo: 'qwen/qwen3.8-max-0902', grupo: 'media' },
  glm: { nombre: 'GLM', modelo: 'z-ai/glm-5.3', grupo: 'media' },
  kimi: { nombre: 'Kimi', modelo: 'moonshotai/kimi-k3.1-pro', grupo: 'media' },
  minimax: { nombre: 'MiniMax', modelo: 'minimax/minimax-m3', grupo: 'media' },
  cohere: { nombre: 'Command A+', modelo: 'cohere/command-a-plus', grupo: 'media' },
  ministral: { nombre: 'Ministral 8B', modelo: 'mistralai/ministral-8b-2512', grupo: 'economico' },
  'qwen-flash': { nombre: 'Qwen Flash', modelo: 'qwen/qwen3.7-flash', grupo: 'economico' },
  'glm-flash': { nombre: 'GLM Flash', modelo: 'z-ai/glm-5.3-flash', grupo: 'economico' },
  phi4: { nombre: 'Phi-4', modelo: 'microsoft/phi-4', grupo: 'economico' },
};

export const IDS_PRUEBAS = ['dilema', 'lobo-noche', 'lobo-dia'];
// 11 candidatos x (3 llamadas + a lo mucho 1 repeticion) = 44; el resto es holgura. Es un tope fijo, no "hasta que se acabe algo".
export const LLAMADAS_MAX = 48;
// Supuesto para el costo "tipico": con razonamiento "medium" varios modelos gastan 1,500-2,000 tokens pensando (ver src/parametros.js).
const SALIDA_TIPICA = 1500;
const CARACTERES_POR_TOKEN = 3; // conservador: sobreestima la entrada
const CONTEXTO_CORTO = 32768;

// ---------- fixtures: las 3 vistas, armadas con el motor real ----------

function estadoDelDilema() {
  const E = dilema.crear();
  const j = (jugada, promesa, mensaje) => dilema.normalizar({ jugada, promesa, mensaje, razon: 'ronda de ejemplo' });
  dilema.aplicar(E, [j('C', 'C', 'Cooperemos.'), j('C', 'T', 'Confía en mí.')]);
  dilema.aplicar(E, [j('C', 'C', 'Sigo cooperando.'), j('T', 'C', 'Esta vez no.')]);
  return E;
}

function jugarFase(E, rng) {
  const actores = activosDe(E);
  return lobo.aplicar(E, E.roles.map((_, i) => (actores[i] ? BOTS.guarda(E, i, rng) : null)));
}

// Mesa de 8 con bots hasta el dia 1: primer seed donde la Vidente sigue viva (para que tenga una inspeccion que contar).
export function armarMesa() {
  for (let seed = 1; seed <= 200; seed++) {
    const rng = crearRng(seed);
    const E = lobo.crear(rng, { jugadores: 8 });
    jugarFase(E, rng); // Cupido
    if (E.fin || E.fase !== 'lobos') continue;
    const noche = structuredClone(E);
    while (!E.fin && E.fase !== 'dia') jugarFase(E, rng);
    const vidente = E.roles.indexOf('vidente');
    if (E.fin || !E.vivos[vidente]) continue;
    return { seed, noche, dia: E, asientoLobo: noche.roles.indexOf('lobo'), asientoVidente: vidente };
  }
  throw new Error('No se pudo armar una mesa de Lobo con la Vidente viva en el dia 1.');
}

// ---------- validacion: la del motor, sin inventar otra ----------

const tipoDe = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
const camposDe = (r) => Object.entries(r).map(([k, v]) => `${k}:${tipoDe(v)}`).join(', ');

function evaluarDilema(respuesta) {
  const n = dilema.normalizar(respuesta);
  if (n.invalida) return { ok: false, motivo: `jugada fuera de C/T (recibió ${camposDe(respuesta)})` };
  const notas = [];
  if (!/^[CT]/i.test(String(respuesta.promesa ?? '').trim())) notas.push('promesa ausente o fuera de C/T (el motor la reemplaza por C)');
  return { ok: true, notas };
}

// Aplica la respuesta del modelo a una copia de la mesa, con bots en el resto de los asientos, y mira si el motor la marco invalida.
function evaluarLobo(E, asiento) {
  return (respuesta) => {
    try {
      const copia = structuredClone(E);
      const actores = activosDe(copia);
      const rng = crearRng(1);
      const registro = lobo.aplicar(copia, copia.roles.map((_, i) => (i === asiento ? respuesta : actores[i] ? BOTS.guarda(copia, i, rng) : null)));
      if (registro.invalidas[asiento] !== false) return { ok: false, motivo: `el motor la marcó inválida (recibió ${camposDe(respuesta)})` };
      return { ok: true, notas: respuesta.afirmaRol !== undefined ? [`declaró rol: ${respuesta.afirmaRol}`] : [] };
    } catch (err) {
      return { ok: false, motivo: `el motor no pudo aplicarla: ${err.message}` };
    }
  };
}

export function construirPruebas(mesa = armarMesa()) {
  return [
    { id: 'dilema', sistema: construirSistema(dilema), usuario: construirUsuario(dilema.vista(estadoDelDilema(), 0)), evaluar: evaluarDilema },
    { id: 'lobo-noche', sistema: construirSistema(lobo), usuario: construirUsuario(lobo.vista(mesa.noche, mesa.asientoLobo)), evaluar: evaluarLobo(mesa.noche, mesa.asientoLobo) },
    { id: 'lobo-dia', sistema: construirSistema(lobo), usuario: construirUsuario(lobo.vista(mesa.dia, mesa.asientoVidente)), evaluar: evaluarLobo(mesa.dia, mesa.asientoVidente) },
  ];
}

// ---------- catalogo y estimacion (sin llamar a ningun modelo) ----------

const porMillon = (x) => (x == null || x === '' ? null : +(Number(x) * 1e6).toFixed(4));
const finito = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const precioValido = (p) => finito(p?.entrada) && finito(p?.salida);

// Regla del proyecto (src/parametros.js): razonamiento "medium", nunca un nivel mayor. Sin "medium" el modelo usa su defecto, salvo que ese defecto
// este por encima de medium (GLM 5.3 y Kimi K3.1 arrancan en "max" y la primera prueba se les fue entera en pensar: 0 caracteres de respuesta en 4000
// tokens): entonces el nivel mas alto que no pasa de medium, "low", si lo ofrece. Si no, null = su defecto.
export function razonamientoDe(razonamiento) {
  const niveles = razonamiento?.supported_efforts ?? [];
  if (niveles.includes('medium')) return 'medium';
  if (['high', 'xhigh', 'max'].includes(razonamiento?.default_effort) && niveles.includes('low')) return 'low';
  return null;
}

export function resolverCandidatos(catalogo, claves, candidatos = CANDIDATOS) {
  const porId = new Map(catalogo.data.map((m) => [m.id, m]));
  return claves.map((clave) => {
    const c = candidatos[clave];
    const m = porId.get(c.modelo);
    const fila = { clave, ...c, razonamiento: null, precio: null, avisos: [], problema: null };
    if (!m) return { ...fila, problema: `${c.modelo} no está en el catálogo de OpenRouter` };
    fila.precio = { entrada: porMillon(m.pricing?.prompt), salida: porMillon(m.pricing?.completion) };
    // Sin precio valido no hay tope que valga (un precio ausente contado como 0 anularia el control del gasto).
    if (!precioValido(fila.precio)) return { ...fila, precio: null, problema: `${c.modelo} no trae un precio válido en el catálogo (entrada ${m.pricing?.prompt}, salida ${m.pricing?.completion})` };
    fila.razonamiento = razonamientoDe(m.reasoning);
    if (m.context_length && m.context_length < CONTEXTO_CORTO) fila.avisos.push(`contexto de solo ${m.context_length} tokens: puede cortarse con historiales largos`);
    if (m.expiration_date) fila.avisos.push(`el catálogo anuncia su retiro el ${m.expiration_date}`);
    return fila;
  });
}

const costoDe = (entrada, salida, precio) => (entrada * precio.entrada + salida * precio.salida) / 1e6;

export function estimarModelo(candidato, pruebas) {
  const entradas = pruebas.map((p) => Math.ceil((p.sistema.length + p.usuario.length) / CARACTERES_POR_TOKEN));
  const peorLlamada = entradas.map((e) => costoDe(e, PARAMETROS.maxTokens, candidato.precio));
  const suma = (xs) => xs.reduce((a, b) => a + b, 0);
  return {
    tokensEntrada: suma(entradas),
    // Peor caso: todas las llamadas gastan max_tokens enteros y una de ellas se repite.
    peorCaso: suma(peorLlamada) + Math.max(...peorLlamada),
    peorLlamada: Math.max(...peorLlamada),
    tipico: suma(entradas.map((e) => costoDe(e, SALIDA_TIPICA, candidato.precio))),
  };
}

// ---------- ejecucion ----------

const esErrorFatal = (err) => /OpenRouter (401|402)\b|Falta OPENROUTER_API_KEY/.test(err?.message ?? '');

// null = no se puede saber cuanto cobro (uso ausente, vacio o parcial): quien llama reserva el peor caso en vez de contarlo como 0.
export function costoDeUso(uso, precio) {
  if (finito(uso?.cost)) return uso.cost;
  if (!finito(uso?.prompt_tokens) || !finito(uso?.completion_tokens) || !precioValido(precio)) return null;
  return costoDe(uso.prompt_tokens, uso.completion_tokens, precio);
}

export async function ejecutarPrueba({ candidato, prueba, llamar }) {
  const inicio = Date.now();
  let r;
  try {
    // reintentos: 0 para que una llamada contada sea exactamente una solicitud HTTP; una falla transitoria la cubre la repeticion.
    r = await llamar({ modelo: candidato.modelo, sistema: prueba.sistema, usuario: prueba.usuario, razonamiento: candidato.razonamiento, reintentos: 0 });
  } catch (err) {
    // Un 4xx se rechaza antes de procesar: no cobra. Cualquier otro fallo (5xx, respuesta cortada, red) pudo cobrarse sin informar
    // el uso: costo desconocido (null), y quien cuenta el gasto reserva el peor caso.
    const sinCobro = /^OpenRouter 4\d\d\b/.test(err.message);
    return { prueba: prueba.id, ok: false, motivo: `error de la llamada: ${err.message}`, fatal: esErrorFatal(err), costo: sinCobro ? 0 : null, ms: Date.now() - inicio };
  }
  const respuesta = extraerJSON(r.texto);
  let veredicto;
  if (r.finishReason === 'length') veredicto = { ok: false, motivo: 'cortada por max_tokens (finish_reason=length)' };
  else if (!r.texto) veredicto = { ok: false, motivo: 'respuesta vacía' };
  else if (!respuesta) veredicto = { ok: false, motivo: 'la respuesta no traía un JSON válido' };
  else veredicto = prueba.evaluar(respuesta);
  return {
    prueba: prueba.id, ok: veredicto.ok, motivo: veredicto.motivo ?? null, notas: veredicto.notas ?? [],
    finishReason: r.finishReason, tokensEntrada: r.uso?.prompt_tokens ?? null, tokensSalida: r.uso?.completion_tokens ?? null,
    // La respuesta va completa: el detalle guardado en privado/ es material para analizar (y, si sirve, para contenido).
    costo: costoDeUso(r.uso, candidato.precio), ms: Date.now() - inicio, texto: String(r.texto ?? ''),
  };
}

// aprobado: 3/3 sin cortes. dudoso: falla 1 y su repeticion sale bien. rechazado: fallan 2 o mas, o falla 1 y la repeticion tambien.
// incompleto: la corrida se corto (tope, error de llave o credito) antes de tener pruebas o la repeticion; no se juzga al modelo.
export function veredicto(intentos, repeticion = null) {
  const hechos = intentos.filter((i) => !i.omitida);
  const fallas = hechos.filter((i) => !i.ok).length;
  if (fallas >= 2) return 'rechazado';
  if (hechos.length < IDS_PRUEBAS.length) return 'incompleto';
  if (fallas === 1) return !repeticion ? 'incompleto' : repeticion.ok ? 'dudoso' : 'rechazado';
  return 'aprobado';
}

export async function correrPrueba({ candidatos, pruebas, llamar, topeUsd, maxLlamadas = LLAMADAS_MAX, alProgreso = () => {} }) {
  // Un tope o un precio que no sean numeros finitos dejarian el control del gasto sin efecto (NaN nunca es >= que nada).
  if (!(topeUsd > 0) || !Number.isFinite(topeUsd)) throw new Error(`Tope en dólares inválido: ${topeUsd}.`);
  for (const c of candidatos) if (!precioValido(c.precio)) throw new Error(`${c.clave}: sin precio válido; no se puede controlar el gasto.`);
  let llamadas = 0, gastado = 0, detenido = null;
  const modelos = [];

  // Una llamada bajo el tope fijo de llamadas y el tope en dolares; null si ya no se puede llamar.
  const intentar = async (candidato, prueba) => {
    if (llamadas >= maxLlamadas) { detenido = `tope fijo de ${maxLlamadas} llamadas`; return null; }
    if (gastado >= topeUsd) { detenido = `tope de $${topeUsd} alcanzado ($${gastado.toFixed(4)} gastados)`; return null; }
    llamadas++;
    const r = await ejecutarPrueba({ candidato, prueba, llamar });
    // Sin costo conocido (uso ausente o incompleto, fallo que pudo cobrarse) se reserva el peor caso para no subestimar el gasto.
    if (r.costo == null) {
      r.costo = costoDe(Math.ceil((prueba.sistema.length + prueba.usuario.length) / CARACTERES_POR_TOKEN), PARAMETROS.maxTokens, candidato.precio);
      r.costoReservado = true;
    }
    gastado += r.costo;
    if (r.fatal) detenido = `error que impide seguir: ${r.motivo}`;
    alProgreso(candidato, r);
    return r;
  };

  for (const candidato of candidatos) {
    const intentos = [];
    for (const prueba of pruebas) {
      // Con 2 fallas ya es rechazado: la tercera llamada solo gastaria.
      if (intentos.filter((i) => !i.ok).length >= 2) { intentos.push({ prueba: prueba.id, ok: false, omitida: true, motivo: 'omitida: ya hay 2 fallas' }); continue; }
      const r = await intentar(candidato, prueba);
      if (!r) break;
      // Un error de llave o de credito es de la cuenta, no del modelo: queda registrado pero fuera del veredicto.
      intentos.push(r.fatal ? { ...r, omitida: true } : r);
      if (detenido) break;
    }
    let repeticion = null;
    const fallas = intentos.filter((i) => !i.ok && !i.omitida);
    if (!detenido && intentos.length === pruebas.length && fallas.length === 1) {
      repeticion = await intentar(candidato, pruebas.find((p) => p.id === fallas[0].prueba));
    }
    const hechos = intentos.filter((i) => !i.omitida);
    modelos.push({
      clave: candidato.clave, nombre: candidato.nombre, modelo: candidato.modelo, razonamiento: candidato.razonamiento,
      veredicto: veredicto(intentos, repeticion), intentos, repeticion,
      tokensEntrada: [...hechos, repeticion].reduce((n, i) => n + (i?.tokensEntrada ?? 0), 0),
      tokensSalida: [...hechos, repeticion].reduce((n, i) => n + (i?.tokensSalida ?? 0), 0),
      costo: [...hechos, repeticion].reduce((n, i) => n + (i?.costo ?? 0), 0),
    });
    if (detenido) break;
  }
  return { modelos, llamadas, gastado, detenido };
}

// ---------- salida ----------

const usd = (x) => `$${x.toFixed(4)}`;

function imprimirEstimacion(filas, pruebas) {
  console.log(`\n  ${'clave'.padEnd(15)} ${'modelo'.padEnd(34)} ${'precio ent/sal'.padEnd(15)} ${'razon.'.padEnd(7)} ${'peor caso'.padEnd(10)} tipico`);
  let peor = 0, tipico = 0, mayorLlamada = 0;
  for (const f of filas) {
    if (f.problema) { console.log(`  ${f.clave.padEnd(15)} ${f.modelo.padEnd(34)} PROBLEMA: ${f.problema}`); continue; }
    const e = estimarModelo(f, pruebas);
    peor += e.peorCaso; tipico += e.tipico; mayorLlamada = Math.max(mayorLlamada, e.peorLlamada);
    console.log(`  ${f.clave.padEnd(15)} ${f.modelo.padEnd(34)} ${`${f.precio.entrada}/${f.precio.salida}`.padEnd(15)} ${(f.razonamiento ?? 'defecto').padEnd(7)} ${usd(e.peorCaso).padEnd(10)} ${usd(e.tipico)}`);
    for (const a of f.avisos) console.log(`      aviso: ${a}`);
  }
  console.log(`\n  Total: peor caso ${usd(peor)} (todas las llamadas gastan los ${PARAMETROS.maxTokens} tokens de salida y una se repite por modelo);`);
  console.log(`  típico ~${usd(tipico)} (supuesto: ${SALIDA_TIPICA} tokens de salida por llamada, sin repeticiones). Con tope, el gasto real puede pasarse por una sola llamada (hasta ${usd(mayorLlamada)}).`);
  console.log('  Precios en USD por millón de tokens, del catálogo. Esto NO llamó a ningún modelo.\n');
}

function imprimirResultados({ modelos, llamadas, gastado, detenido }) {
  console.log(`\n  ${'clave'.padEnd(15)} ${'modelo'.padEnd(34)} ${'veredicto'.padEnd(11)} ${'ok'.padEnd(5)} ${'tokens ent/sal'.padEnd(15)} costo`);
  for (const m of modelos) {
    const hechos = m.intentos.filter((i) => !i.omitida);
    console.log(`  ${m.clave.padEnd(15)} ${m.modelo.padEnd(34)} ${m.veredicto.padEnd(11)} ${`${hechos.filter((i) => i.ok).length}/${IDS_PRUEBAS.length}`.padEnd(5)} ${`${m.tokensEntrada}/${m.tokensSalida}`.padEnd(15)} ${usd(m.costo)}`);
    for (const i of [...m.intentos, ...(m.repeticion ? [{ ...m.repeticion, prueba: `${m.repeticion.prueba} (repetida)` }] : [])]) {
      if (!i.ok) console.log(`      ${i.prueba}: ${i.motivo}`);
      else for (const n of i.notas ?? []) console.log(`      ${i.prueba}: ${n}`);
    }
  }
  console.log(`\n  ${llamadas} llamadas, ${usd(gastado)} gastados.${detenido ? ` DETENIDO: ${detenido}.` : ''}\n`);
}

// ---------- programa ----------

const salir = (mensaje) => { console.error(`\n  ${mensaje}\n`); process.exit(1); };

// Solo corre como programa, no al importarlo desde las pruebas.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = parsearArgumentos(process.argv.slice(2));
  const claves = typeof o.modelos === 'string' ? o.modelos.split(',').map((s) => s.trim()).filter(Boolean) : Object.keys(CANDIDATOS);
  const desconocidas = claves.filter((c) => !CANDIDATOS[c]);
  if (desconocidas.length) salir(`Candidato desconocido: ${desconocidas.join(', ')}. Disponibles: ${Object.keys(CANDIDATOS).join(', ')}.`);
  const topeUsd = Number(o['tope-usd']);
  if (o.ejecutar) {
    if (typeof o.modelos !== 'string') salir('--ejecutar exige una lista explícita: --modelos=grok,glm (no se corre "todos a ciegas").');
    if (!(topeUsd > 0)) salir('--ejecutar exige un tope de gasto en dólares: --tope-usd=0.50.');
    if (claves.length * (IDS_PRUEBAS.length + 1) > LLAMADAS_MAX) salir(`Con ${claves.length} modelos se pasaría del máximo fijo de ${LLAMADAS_MAX} llamadas.`);
  }

  let catalogo;
  try {
    catalogo = typeof o.archivo === 'string'
      ? JSON.parse(readFileSync(resolve(o.archivo), 'utf8'))
      : await (await fetch('https://openrouter.ai/api/v1/models')).json();
    if (!Array.isArray(catalogo?.data)) throw new Error('el catálogo no trae la lista "data"');
  } catch (err) {
    salir(`No pude leer el catálogo de OpenRouter: ${err.message}`);
  }

  const filas = resolverCandidatos(catalogo, claves);
  const mesa = armarMesa();
  const pruebas = construirPruebas(mesa);
  imprimirEstimacion(filas, pruebas);
  if (!o.ejecutar) {
    console.log('  Para llamar de verdad: --modelos=<lista> --ejecutar --tope-usd=<dólares>.\n');
    process.exit(filas.some((f) => f.problema) ? 1 : 0);
  }

  const candidatos = filas.filter((f) => !f.problema);
  if (!candidatos.length) salir('Ningún candidato está en el catálogo; no hay nada que probar.');
  if (candidatos.length < filas.length) console.log(`  Se omiten ${filas.length - candidatos.length} candidato(s) que no están en el catálogo.\n`);
  fijarModo('pago');
  const resultado = await correrPrueba({
    candidatos, pruebas, llamar: llamarModelo, topeUsd,
    alProgreso: (c, r) => console.log(`  ${c.clave.padEnd(15)} ${r.prueba.padEnd(11)} ${r.ok ? 'ok' : `FALLA: ${r.motivo}`}`),
  });
  imprimirResultados(resultado);

  const carpeta = resolve(RAIZ, 'privado', 'pruebas');
  if (!existsSync(carpeta)) mkdirSync(carpeta, { recursive: true });
  const archivo = rutaLibre(resolve(carpeta, `humo-modelos-${new Date().toISOString().slice(0, 10)}.json`));
  // Se guarda lo necesario para reconstruir cada llamada: la mesa (seed y asientos) y los prompts exactos que recibio cada modelo.
  writeFileSync(archivo, JSON.stringify({
    fecha: new Date().toISOString(), versionPrompt: VERSION_PROMPT, versionLobo: VERSION_LOBO, topeUsd,
    mesa: { seed: mesa.seed, jugadores: 8, asientoLobo: mesa.asientoLobo, asientoVidente: mesa.asientoVidente },
    prompts: pruebas.map(({ id, sistema, usuario }) => ({ id, sistema, usuario })),
    ...resultado,
  }, null, 2));
  console.log(`  Detalle guardado en ${archivo}\n`);
  process.exit(resultado.detenido ? 1 : 0);
}
