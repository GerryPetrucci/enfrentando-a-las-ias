#!/usr/bin/env node
// Examen de ingreso de modelos por juego: decide con que modelos conviene jugar cada juego ANTES de gastar una partida entera.
// Los escenarios son prompts reales de produccion (src/prompt.js + el motor), sacados de una partida jugada por bots; la validacion es la del motor.
// Esta primera parte arma los escenarios de Guerra de territorios; la corrida con modelos y el veredicto se agregan encima.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, isAbsolute, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import conquista from '../src/juegos/conquista.js';
import { regionesDe } from '../src/juegos/conquista/estado.js';
import { construirSistema, construirUsuario, VERSION_PROMPT } from '../src/prompt.js';
import { PARAMETROS } from '../src/parametros.js';
import { CONTENDIENTES, extraerJSON, llamarModelo, fijarModo } from '../src/modelos.js';
import { crearRng } from '../src/rng.js';
import { parsearArgumentos, rutaLibre } from '../src/serie.js';
import { costoDeUso } from './prueba-de-humo-modelos.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const CARACTERES_POR_TOKEN = 1.97; // el de src/pruebas (tope de prompt de Guerra): el espanol con acentos rinde menos que el ingles
// Bots que dan variedad al historial: cada asiento rota entre ellos. Son solo el pasado de la mesa; el modelo examinado decide el turno del escenario.
const MEZCLA_CONQUISTA = ['mixto-adaptativo', 'lancero-masa', 'agresivo'];

// ---------- veredicto ----------
// Umbrales (propuestos el 27-10-2026; se ajustan con datos): no apto si falla la mitad de las llamadas o un escenario falla en todas sus repeticiones;
// con reservas si hay cualquier falla, si la salida mediana pasa de la mitad del tope de tokens o si menos del 70 % de las ordenes son legales.
const MITAD = 0.5;
const ORDENES_LEGALES_MIN = 0.7;
const suma = (xs) => xs.reduce((a, b) => a + b, 0);
const mediana = (xs) => {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  return o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2;
};

// intentos: [{ escenario, ok, motivo, finishReason, tokensSalida, ordenes: { validas, total }, costo, ms }] (uno por llamada).
export function veredictoDeExamen(intentos, { maxTokens }) {
  const llamadas = intentos.length;
  const buenos = intentos.filter((i) => i.ok);
  const fallas = llamadas - buenos.length;
  // Un corte con una jugada utilizable dentro no es falla: la partida la aceptaria (src/agentes.js solo falla si no hay JSON).
  const cortes = intentos.filter((i) => !i.ok && i.finishReason === 'length').length;
  const ordenesTotal = suma(buenos.map((i) => i.ordenes?.total ?? 0));
  const metricas = {
    llamadas, fallas, cortes,
    ordenesLegales: ordenesTotal ? suma(buenos.map((i) => i.ordenes?.validas ?? 0)) / ordenesTotal : null,
    salidaMediana: mediana(intentos.map((i) => i.tokensSalida).filter((n) => Number.isFinite(n))),
    msMediano: mediana(intentos.map((i) => i.ms).filter((n) => Number.isFinite(n))),
    costo: suma(intentos.map((i) => i.costo ?? 0)),
  };
  if (!llamadas) return { veredicto: 'incompleto', motivos: ['no hay llamadas que juzgar'], metricas };

  const motivosNoApto = [];
  const porEscenario = new Map();
  for (const i of intentos) {
    const e = porEscenario.get(i.escenario) ?? { total: 0, fallas: 0 };
    e.total++; if (!i.ok) e.fallas++;
    porEscenario.set(i.escenario, e);
  }
  // «Falla siempre» solo dice algo con 2 o mas repeticiones; con una sola (diagnostico sobre turnos reales) manda la proporcion de fallas.
  for (const [id, e] of porEscenario) if (e.total >= 2 && e.fallas === e.total) motivosNoApto.push(`el escenario ${id} falla en todas sus repeticiones (${e.total} de ${e.total})`);
  if (fallas / llamadas >= MITAD) motivosNoApto.push(`fallan ${fallas} de ${llamadas} llamadas (la mitad o más)`);
  if (motivosNoApto.length) return { veredicto: 'no apto', motivos: [...motivosNoApto, ...detalleDeFallas({ llamadas, fallas, cortes })], metricas };

  const motivos = detalleDeFallas({ llamadas, fallas, cortes });
  if (metricas.salidaMediana > maxTokens * MITAD) motivos.push(`la salida mediana (${Math.round(metricas.salidaMediana)} tokens) pasa de la mitad del tope (${maxTokens})`);
  if (metricas.ordenesLegales !== null && metricas.ordenesLegales < ORDENES_LEGALES_MIN) motivos.push(`solo el ${Math.round(metricas.ordenesLegales * 100)} % de sus órdenes son legales`);
  return { veredicto: motivos.length ? 'con reservas' : 'apto', motivos, metricas };
}

function detalleDeFallas({ llamadas, fallas, cortes }) {
  const motivos = [];
  if (cortes) motivos.push(`${cortes} de ${llamadas} llamadas cortadas por max_tokens`);
  if (fallas - cortes > 0) motivos.push(`${fallas - cortes} de ${llamadas} llamadas fallaron por otra causa (error de la API, JSON inválido o sin órdenes)`);
  return motivos;
}

// ---------- candidatos ----------
const finito = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const precioValido = (p) => finito(p?.entrada) && finito(p?.salida);
const porMillon = (x) => (x == null || x === '' ? null : +(Number(x) * 1e6).toFixed(4));

// Los modelos que se examinan son los contendientes de verdad (src/modelos.js): el mismo modelo y el MISMO razonamiento con que juegan las partidas.
// El catalogo de OpenRouter (publico y gratis) solo aporta el precio, que hace falta para controlar el gasto.
export function candidatosDeContendientes(catalogo, claves) {
  const porId = new Map(catalogo.data.map((m) => [m.id, m]));
  return claves.map((clave) => {
    const c = CONTENDIENTES[clave];
    if (!c) throw new Error(`Contendiente desconocido: "${clave}". Disponibles: ${Object.keys(CONTENDIENTES).join(', ')}.`);
    const fila = { clave, nombre: c.nombre, modelo: c.modelo, razonamiento: c.razonamiento ?? null, precio: null, problema: null };
    const m = porId.get(c.modelo);
    if (!m) return { ...fila, problema: `${c.modelo} no está en el catálogo de OpenRouter` };
    const precio = { entrada: porMillon(m.pricing?.prompt), salida: porMillon(m.pricing?.completion) };
    // Sin precio valido no hay tope que valga (un precio ausente contado como 0 anularia el control del gasto).
    if (!precioValido(precio)) return { ...fila, problema: `${c.modelo} no trae un precio válido en el catálogo (entrada ${m.pricing?.prompt}, salida ${m.pricing?.completion})` };
    return { ...fila, precio };
  });
}

// ---------- tabla de aptitud (privado/planes/aptitud-modelos.md) ----------
const COLUMNAS = ['Modelo', 'Juego', 'Veredicto', 'Llamadas OK', 'Cortes', 'Órdenes legales', 'Salida mediana', 'Costo del examen', 'Reglas', 'Tope de tokens', 'Fecha', 'Notas'];
const celdaSegura = (s) => String(s).replace(/\|/g, '/').replace(/\s+/g, ' ').trim();

// `modelo` es un elemento de correrExamen().modelos. El contexto (reglas, tope y fecha) va en la fila porque el resultado caduca si cambia.
export function filaDeAptitud(modelo, { juego, reglas, maxTokens, fecha }) {
  const m = modelo.metricas;
  const celdas = [
    `${modelo.nombre} (\`${modelo.clave}\`)`, juego, modelo.veredicto, `${m.llamadas - m.fallas}/${m.llamadas}`, String(m.cortes),
    m.ordenesLegales == null ? '-' : `${Math.round(m.ordenesLegales * 100)} %`, m.salidaMediana == null ? '-' : String(Math.round(m.salidaMediana)),
    `$${m.costo.toFixed(4)}`, reglas, String(maxTokens), fecha, modelo.motivos.join('; ') || '-',
  ].map(celdaSegura);
  return { clave: modelo.clave, juego, celdas };
}

// Una fila por modelo y juego: un examen nuevo reemplaza la anterior y deja las demas. Ordenada por juego y modelo.
export function fusionarAptitud(texto, filas) {
  const porLlave = new Map();
  for (const linea of String(texto).split('\n')) {
    if (!linea.startsWith('| ') || linea.startsWith('| Modelo ')) continue;
    const celdas = linea.slice(1, -1).split('|').map((c) => c.trim());
    const clave = celdas[0].match(/\(`([^`]+)`\)/)?.[1];
    if (clave) porLlave.set(`${clave}\u0000${celdas[1]}`, celdas);
  }
  for (const f of filas) porLlave.set(`${f.clave}\u0000${f.juego}`, f.celdas);
  const ordenadas = [...porLlave.values()].sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));
  return [
    '# Aptitud de modelos por juego',
    '',
    'Lo escribe `node herramientas/examen-modelos.mjs`: no se edita a mano. Un resultado **caduca** si cambia la versión de reglas, el prompt o el tope de tokens',
    '(las columnas «Reglas» y «Tope de tokens» dicen con qué se midió). «Apto» quiere decir que el modelo permite jugar, no que juegue bien.',
    'Es una muestra corta (cuatro escenarios, dos repeticiones cada uno): estima la tasa de fallas, no la garantiza en una partida entera.',
    '',
    `| ${COLUMNAS.join(' | ')} |`,
    `|${COLUMNAS.map(() => '---').join('|')}|`,
    ...ordenadas.map((c) => `| ${c.join(' | ')} |`),
    '',
  ].join('\n');
}

// ---------- corredor ----------
const costoDe = (entrada, salida, precio) => (entrada * precio.entrada + salida * precio.salida) / 1e6;
// Un error de llave o de credito es de la cuenta, no del modelo.
const esErrorFatal = (err) => /OpenRouter (401|402)\b|Falta OPENROUTER_API_KEY/.test(err?.message ?? '');

// Una llamada al modelo sobre un escenario, juzgada con el motor. Usa el tope de tokens de produccion (no pasa maxTokens: llamarModelo toma PARAMETROS).
async function ejecutarEscenario({ candidato, escenario, repeticion, llamar, maxTokens = null }) {
  const inicio = Date.now();
  const base = { escenario: escenario.id, repeticion };
  let r;
  try {
    // reintentos: 0 para que una llamada contada sea una sola solicitud HTTP; una falla transitoria la cubre la repeticion.
    // maxTokens solo se manda si se pidio uno distinto del de produccion (por omision llamarModelo usa PARAMETROS.maxTokens).
    r = await llamar({ modelo: candidato.modelo, sistema: escenario.sistema, usuario: escenario.usuario, razonamiento: candidato.razonamiento, reintentos: 0, ...(maxTokens !== null ? { maxTokens } : {}) });
  } catch (err) {
    // Un 4xx se rechaza antes de procesar y no cobra; cualquier otro fallo pudo cobrarse sin informar el uso (costo null = reservar el peor caso).
    const sinCobro = /^OpenRouter 4\d\d\b/.test(err.message);
    return { ...base, ok: false, motivo: `error de la llamada: ${err.message}`, fatal: esErrorFatal(err), finishReason: null, tokensEntrada: null, tokensSalida: null, tokensRazonamiento: null,
      ordenes: { validas: 0, total: 1 }, costo: sinCobro ? 0 : null, ms: Date.now() - inicio, texto: '', razonamiento: '' };
  }
  const json = extraerJSON(r.texto);
  let veredicto;
  if (!json) {
    veredicto = {
      ok: false, ordenes: { validas: 0, total: 1 },
      motivo: r.finishReason === 'length' ? 'cortada por max_tokens (finish_reason=length)' : r.texto ? 'la respuesta no traía un JSON válido' : 'respuesta vacía',
    };
  } else veredicto = escenario.evaluar(json);
  return {
    ...base, ok: veredicto.ok, motivo: veredicto.motivo, finishReason: r.finishReason ?? null,
    tokensEntrada: r.uso?.prompt_tokens ?? null, tokensSalida: r.uso?.completion_tokens ?? null,
    tokensRazonamiento: r.uso?.completion_tokens_details?.reasoning_tokens ?? null,
    ordenes: veredicto.ordenes, costo: costoDeUso(r.uso, candidato.precio), ms: Date.now() - inicio,
    // Completos: el razonamiento de una respuesta cortada es lo unico que explica el corte. Todo esto queda en privado/, nunca en data/.
    texto: String(r.texto ?? ''), razonamiento: String(r.razonamiento ?? ''),
  };
}

// candidatos: [{ clave, nombre, modelo, razonamiento, precio: { entrada, salida } }] (USD por millon de tokens).
// escenarios: de escenariosDeConquista (u otro juego). Cada modelo recibe todos los escenarios, `repeticiones` veces cada uno.
// El gasto nunca pasa del tope: antes de cada llamada se reserva su peor caso (entrada + todo el tope de tokens de salida).
// `maxTokens` (opcional): otro tope de tokens de salida que el de produccion, para medir cuanto necesita un modelo (el 28-10-2026: Haiku con el prompt completo, 8000 vs 16000).
export async function correrExamen({ candidatos, escenarios, repeticiones = 2, llamar, topeUsd, maxLlamadas = 200, paralelo = 1, maxTokens: maxTokensPedido = null, alProgreso = () => {} }) {
  if (!(topeUsd > 0) || !Number.isFinite(topeUsd)) throw new Error(`Tope en dólares inválido: ${topeUsd}.`);
  for (const c of candidatos) if (!precioValido(c.precio)) throw new Error(`${c.clave}: sin precio válido; no se puede controlar el gasto.`);
  const maxTokens = maxTokensPedido ?? PARAMETROS.maxTokens;
  let llamadas = 0, gastado = 0, reservado = 0, detenido = null;
  const modelos = [];

  for (const candidato of candidatos) {
    const pendientes = escenarios.flatMap((escenario) => Array.from({ length: repeticiones }, (_, i) => ({ escenario, repeticion: i + 1 })));
    const total = pendientes.length;
    const intentos = [];
    const enCurso = new Set();

    while (pendientes.length && !detenido) {
      if (enCurso.size >= paralelo) { await Promise.race(enCurso); continue; }
      const { escenario, repeticion } = pendientes[0];
      const peor = costoDe(Math.ceil(escenario.tokensEstimados * 1.1), maxTokens, candidato.precio);
      if (llamadas >= maxLlamadas) { detenido = `tope fijo de ${maxLlamadas} llamadas`; break; }
      if (gastado + reservado + peor > topeUsd) {
        if (enCurso.size) { await Promise.race(enCurso); continue; } // lo que esta en vuelo puede liberar reserva: se vuelve a mirar
        detenido = `tope de $${topeUsd} (${gastado.toFixed(4)} gastados; la siguiente llamada podria costar hasta $${peor.toFixed(4)})`;
        break;
      }
      pendientes.shift();
      llamadas++; reservado += peor;
      const promesa = ejecutarEscenario({ candidato, escenario, repeticion, llamar, maxTokens: maxTokensPedido }).then((r) => {
        reservado -= peor;
        // Sin costo conocido (uso ausente o fallo que pudo cobrarse) se cuenta el peor caso para no subestimar el gasto.
        if (r.costo == null) { r.costo = peor; r.costoReservado = true; }
        gastado += r.costo;
        if (r.fatal) detenido = `error que impide seguir: ${r.motivo}`;
        intentos.push(r);
        alProgreso(candidato, r);
        enCurso.delete(promesa);
      });
      enCurso.add(promesa);
    }
    await Promise.all(enCurso);

    const orden = (r) => escenarios.findIndex((e) => e.id === r.escenario) * 1000 + r.repeticion;
    const hechos = intentos.filter((i) => !i.fatal).sort((a, b) => orden(a) - orden(b));
    const juicio = veredictoDeExamen(hechos, { maxTokens });
    const completo = hechos.length === total && !intentos.some((i) => i.fatal);
    modelos.push({
      clave: candidato.clave, nombre: candidato.nombre, modelo: candidato.modelo, razonamiento: candidato.razonamiento,
      ...(completo ? juicio : { ...juicio, veredicto: 'incompleto', motivos: [`solo se hicieron ${hechos.length} de ${total} llamadas${detenido ? ` (${detenido})` : ''}`, ...juicio.motivos] }),
      intentos: hechos,
    });
    if (detenido) break;
  }
  return { modelos, llamadas, gastado, detenido, maxTokens };
}

// Juega con bots hasta cada turno pedido y congela la mesa justo antes de que se jueguen sus ordenes (E.turno === turno).
// El asiento examinado tiene que seguir vivo en TODOS los escenarios (un reino eliminado no tiene ordenes posibles y el examen culparia al modelo):
// por defecto es el reino mas grande del ultimo turno pedido (el estado mas complejo, donde los modelos que razonan de mas se atoran);
// uno pedido a mano que ya cayo es un error. El pasado de la mesa lo juegan solo los bots, asi que no depende del asiento elegido.
export function escenariosDeConquista({ jugadores = 3, seed = 1, bioma = undefined, turnos = [2, 8, 15, 22], asiento = null } = {}) {
  const pedidos = [...turnos].sort((a, b) => a - b);
  const E = conquista.crear(crearRng(seed * 7919 + 13), { jugadores, bioma });
  const bots = Array.from({ length: jugadores }, (_, s) => conquista.bots[MEZCLA_CONQUISTA[s % MEZCLA_CONQUISTA.length]]);
  const rngs = Array.from({ length: jugadores }, (_, i) => crearRng((seed * 31 + i * 977) >>> 0));
  const sistema = construirSistema(conquista);
  const escenarios = [];

  // Las jugadas de los bots en la mesa dada: lo que habria pasado en ese turno sin el modelo examinado (que, si se da, ocupa `propio`).
  const jugadasDeBots = (mesa, rngsDe, propia = null, propio = -1) => mesa.reinos.map((r, s) => {
    if (!r.vivo) return null;
    if (s === propio && propia) return propia;
    return conquista.normalizar(bots[s].fn(mesa, s, rngsDe[s]), mesa);
  });

  const mesas = [];
  for (const turno of pedidos) {
    // `turno` es el numero que lee el modelo («Turno 9 de 30») y el de r.turno en una partida guardada; el contador interno del motor va uno atras.
    while (!conquista.terminado(E) && E.turno + 1 < turno) conquista.aplicar(E, jugadasDeBots(E, rngs));
    if (conquista.terminado(E) || E.turno + 1 !== turno) throw new Error(`La partida de bots termina antes del turno ${turno} (seed ${seed}): pide un turno menor u otro seed.`);
    mesas.push({ turno, mesa: structuredClone(E) });
  }

  if (asiento !== null && !(Number.isInteger(asiento) && asiento >= 0 && asiento < jugadores)) throw new Error(`El asiento ${asiento} no existe en una mesa de ${jugadores} reinos.`);
  const ultima = mesas.at(-1).mesa;
  const elegido = asiento ?? ultima.reinos.reduce((mejor, r, s) => (r.vivo && (mejor < 0 || regionesDe(ultima, s).length > regionesDe(ultima, mejor).length) ? s : mejor), -1);
  if (elegido < 0) throw new Error(`En el turno ${mesas.at(-1).turno} no queda ningún reino vivo (seed ${seed}): pide un turno menor u otro seed.`);
  for (const { turno, mesa } of mesas) {
    if (!mesa.reinos[elegido].vivo) throw new Error(`El reino del asiento ${elegido} está eliminado en el turno ${turno} (seed ${seed}): elige otro asiento o pide turnos más tempranos.`);
  }

  asiento = elegido;
  for (const { turno, mesa } of mesas) {
    const usuario = construirUsuario(conquista.vista(mesa, asiento));
    // Lo que jugaria el bot de ese asiento: sirve de jugada legal de referencia (y para probar que evaluar() acepta lo legal).
    const jugadaDeReferencia = bots[asiento].fn(mesa, asiento, crearRng((seed * 31 + asiento * 977 + turno) >>> 0));
    escenarios.push({
      id: `conquista-t${turno}`, juego: conquista.id, turno, asiento, regiones: regionesDe(mesa, asiento).length, seed, bioma: mesa.bioma ?? bioma ?? null,
      sistema, usuario, tokensEstimados: Math.ceil((sistema.length + usuario.length) / CARACTERES_POR_TOKEN),
      jugadaDeReferencia,
      // Aplica la respuesta del modelo a una copia de la mesa, con bots en los demas asientos, y cuenta cuantas ordenes dio el motor por buenas.
      evaluar: (respuesta) => evaluarEnMesa(mesa, asiento, respuesta, (copia, propia) => {
        const rngsEval = Array.from({ length: jugadores }, (_, i) => crearRng((seed * 31 + i * 977 + turno) >>> 0));
        return jugadasDeBots(copia, rngsEval, propia, asiento);
      }),
    });
  }
  return escenarios;
}

// Lo comun a todo escenario de Guerra: la respuesta del modelo se normaliza con el motor y se aplica a una COPIA de la mesa junto con las jugadas
// que arme `armarJugadas(copia, propia)` para los demas reinos; se cuentan las ordenes que el motor dio por buenas. Un turno sin una sola orden es un turno perdido.
function evaluarEnMesa(mesa, asiento, respuesta, armarJugadas) {
  const copia = structuredClone(mesa);
  const propia = conquista.normalizar(respuesta, copia);
  if (propia.invalida) return { ok: false, motivo: propia.motivo ?? 'el motor la marcó inválida', ordenes: { validas: 0, total: 1 } };
  const registro = conquista.aplicar(copia, armarJugadas(copia, propia));
  const { validas, total } = registro.obediencia[asiento];
  if (total === 0) {
    // Pasar el turno a proposito ("ordenes": []) es una decision valida (el 28-10-2026 GLM Flash razono en el turno 30 que su segundo puesto estaba asegurado);
    // lo que no vale es un objeto sin la lista de ordenes, que es un formato mal entendido.
    if (Array.isArray(respuesta?.ordenes)) return { ok: true, motivo: null, ordenes: { validas: 0, total: 0 } };
    return { ok: false, motivo: 'la respuesta no trae la lista "ordenes"', ordenes: { validas: 0, total: 1 } };
  }
  return { ok: true, motivo: null, ordenes: { validas, total } };
}

// Escenarios de una partida REAL ya guardada (`crudo` = el archivo de data/ con su lista `partidas`): los prompts que de verdad vio un jugador, rejugados con el motor
// (src/juegos/conquista/replay.js), cada uno con lo que paso en su llamada real (`real`). Sirve para repetir con otro modelo, o con el mismo, los turnos donde algo fallo.
// Se niega si el prompt de sistema de hoy no es el de la partida o si la rejugada no coincide con los estados guardados: esos prompts no serian los reales.
// `sistemaDistinto`: se va a probar OTRO prompt de sistema sobre los estados de esa partida (conSistema); entonces no se exige que el de hoy sea el que se jugo,
// porque el prompt de usuario (lo que ve cada reino) no depende del texto de las reglas.
export function escenariosDePartida(crudo, { jugador, turnos = null, partida = 1, sistemaDistinto = false } = {}) {
  const p = crudo?.partidas?.[partida - 1];
  if (!p) throw new Error(`La serie no tiene la partida ${partida} (tiene ${crudo?.partidas?.length ?? 0}).`);
  const sistema = construirSistema(conquista);
  if (!sistemaDistinto && crudo.prompt?.hash && createHash('sha256').update(sistema).digest('hex') !== crudo.prompt.hash) {
    throw new Error(`Esta partida se jugó con otro prompt de sistema (reglas ${crudo.prompt.reglas ?? '?'}; ahora ${conquista.versionReglas}): los prompts reconstruidos no serían los que vio el modelo. Usa un worktree del commit con el que se jugó.`);
  }
  const asiento = p.jugadores.findIndex((j) => j.id === jugador);
  if (asiento < 0) throw new Error(`Jugador desconocido: "${jugador}". En la partida: ${p.jugadores.map((j) => j.id).join(', ')}.`);

  const mesas = new Map();
  const r = conquista.reconstruirPrompts(p, Infinity, { alTurno: ({ turno, E, jugadas }) => mesas.set(turno, { mesa: structuredClone(E), jugadas: structuredClone(jugadas) }) });
  if (!r.fiel) throw new Error('La rejugada de la partida no coincide con los estados guardados: los prompts reconstruidos no son de fiar.');

  const pedidos = turnos ?? r.turnos.filter((t) => t.prompts[asiento] !== null).map((t) => t.turno);
  return pedidos.map((turno) => {
    const t = r.turnos.find((x) => x.turno === turno);
    if (!t || t.prompts[asiento] === null) throw new Error(`El jugador ${jugador} no jugó el turno ${turno} en la partida ${partida}.`);
    const ronda = p.rondas.find((x) => x.turno === turno);
    const error = ronda.errores?.[asiento] ?? null;
    const { mesa, jugadas } = mesas.get(turno);
    const usuario = t.prompts[asiento];
    return {
      id: `real-t${turno}`, juego: conquista.id, turno, asiento, jugador, partida, seed: p.seed, bioma: mesa.bioma ?? null, regiones: regionesDe(mesa, asiento).length,
      sistema, usuario, tokensEstimados: Math.ceil((sistema.length + usuario.length) / CARACTERES_POR_TOKEN),
      // Lo que paso en la llamada real de este turno (`cortada`: se quedo sin tokens antes de dar su jugada).
      real: { cortada: /max_tokens|finish_reason=length/.test(error ?? ''), error, invalida: !!ronda.respuestas?.[asiento]?.invalida, ordenes: ronda.respuestas?.[asiento]?.ordenes?.length ?? 0 },
      // La respuesta del modelo examinado reemplaza a la del jugador; los demas reinos juegan lo que jugaron de verdad.
      evaluar: (respuesta) => evaluarEnMesa(mesa, asiento, respuesta, (copia, propia) => Object.assign(structuredClone(jugadas), { [asiento]: propia })),
    };
  });
}

// EXPERIMENTO de redaccion: cambia un texto del prompt de USUARIO de cada escenario, solo en memoria (el juego y las partidas no se tocan). Sirve para probar,
// contra los estados reales de una partida, si agregar una leyenda o aclarar una frase cambia lo que hacen los modelos, antes de tocar el prompt de verdad.
// Un texto que no aparece en algun escenario es un error: un experimento que no cambia nada daria un resultado falso.
export function conVariante(escenarios, de, a) {
  return escenarios.map((e) => {
    if (!e.usuario.includes(de)) throw new Error(`El texto a reemplazar no aparece en el prompt de ${e.id}: «${de.slice(0, 70)}».`);
    const usuario = e.usuario.replaceAll(de, a);
    return { ...e, usuario, tokensEstimados: Math.ceil((e.sistema.length + usuario.length) / CARACTERES_POR_TOKEN), variante: true };
  });
}

// EXPERIMENTO de prompt completo: reemplaza el prompt de SISTEMA de cada escenario por otro texto (un borrador de privado/spec/), conservando el estado que ve cada
// reino, la evaluacion con el motor y lo que paso en la partida real. Asi se prueba un prompt nuevo contra los mismos 30 turnos reales antes de tocar el juego.
export function conSistema(escenarios, texto) {
  return escenarios.map((e) => ({ ...e, sistema: texto, tokensEstimados: Math.ceil((texto.length + e.usuario.length) / CARACTERES_POR_TOKEN), sistemaDistinto: true }));
}

// Lee un prompt de sistema alternativo. Solo dentro de privado/ (donde viven los borradores) y nunca archivos de llaves: lo que se lee viaja a la API.
export function leerSistema(ruta) {
  const absoluta = resolve(RAIZ, String(ruta)), privado = resolve(RAIZ, 'privado');
  if (!absoluta.startsWith(privado + sep)) throw new Error(`--sistema solo lee archivos dentro de privado/ (recibió ${ruta}).`);
  if (/^\.env/i.test(basename(absoluta))) throw new Error('--sistema: no se leen llaves ni archivos .env.');
  try { return readFileSync(absoluta, 'utf8'); } catch (err) { throw new Error(`No pude leer el prompt de sistema ${ruta}: ${err.message}`); }
}

// «texto viejo=>texto nuevo» (se separa en el primer =>; el texto nuevo puede ir vacio para quitar algo).
export function parsearVariante(texto) {
  const i = String(texto).indexOf('=>');
  if (i < 0) throw new Error('--reemplazar=<texto viejo>=><texto nuevo>: falta el separador =>.');
  if (i === 0) throw new Error('--reemplazar: el texto viejo está vacío.');
  return { de: texto.slice(0, i), a: texto.slice(i + 2) };
}

// ¿Los turnos que se cortaron en la partida real se vuelven a cortar? ¿Y los que salieron bien? Si los primeros se cortan mucho mas que los segundos, el fallo
// depende de lo que ve el modelo en esos turnos; si se cortan igual (poco), fue otra cosa (el proveedor, la hora).
export function compararConReal(intentos, escenarios) {
  const cortadaEnReal = new Map(escenarios.map((e) => [e.id, !!e.real?.cortada]));
  const grupo = (cortadas) => {
    const xs = intentos.filter((i) => cortadaEnReal.get(i.escenario) === cortadas);
    return { llamadas: xs.length, cortes: xs.filter((i) => !i.ok && i.finishReason === 'length').length };
  };
  return { cortadosEnReal: grupo(true), buenosEnReal: grupo(false) };
}

// ---------- programa ----------
//   node herramientas/examen-modelos.mjs --juego=conquista --modelos=haiku,glm-flash                      (estima el costo; NO llama a ningun modelo)
//   node herramientas/examen-modelos.mjs --juego=conquista --modelos=haiku,glm-flash --ejecutar --tope-usd=0.50   (llama de verdad, modo pago)
//   --repeticiones=2  --turnos=2,8,15,22  --jugadores=4  --paralelo=3  --archivo=catalogo.json (catalogo guardado en vez del publico de OpenRouter)  --sin-tabla
//   --max-tokens=16000  otro tope de tokens de salida que el de produccion (PARAMETROS.maxTokens), para medir cuanto necesita un modelo
// DIAGNOSTICO sobre una partida real guardada (en vez de los escenarios de bots): repite con los modelos pedidos los prompts que de verdad vio un jugador.
//   node herramientas/examen-modelos.mjs --juego=conquista --modelos=glm-flash --partida=pruebas/ARCHIVO.json --jugador=glm-flash [--turnos=7,9,10] [--repeticiones=1] [--ejecutar --tope-usd=0.20]
//   (la ruta es relativa a data/ o completa; no escribe la tabla de aptitud: es un diagnostico de esa partida, no un examen de ingreso)
//   --reemplazar="texto viejo=>texto nuevo"  cambia ese texto del prompt de usuario de cada escenario SOLO en memoria (prueba una leyenda o una aclaracion contra los
//   estados reales antes de tocar el prompt del juego); si el texto no aparece en algun escenario, se niega. Sirve con o sin --partida.
//   --sistema=privado/spec/ARCHIVO.txt  reemplaza el prompt de SISTEMA completo por un borrador (solo archivos dentro de privado/); con --partida salta la comprobacion
//   del hash (el prompt de usuario no depende del texto de las reglas). Es como se prueba un prompt nuevo contra los mismos turnos reales.// Seguro por diseno: sin --ejecutar nunca llama; con --ejecutar exige lista explicita de modelos y un tope en dolares, que se respeta reservando el peor caso
// de cada llamada ANTES de hacerla. El detalle completo (con el razonamiento) va a privado/pruebas/ y el resumen a privado/planes/aptitud-modelos.md.

const JUEGOS = {
  conquista: {
    nombre: 'Guerra de territorios', reglas: conquista.versionReglas,
    // 4 reinos y cordillera: el prompt de las partidas publicadas. --jugadores=5 prueba el peor caso de tamano.
    escenarios: (opciones) => escenariosDeConquista({ jugadores: 4, seed: 2970899132, bioma: 'cordillera', ...opciones }),
    partida: escenariosDePartida,
  },
};
const SALIDA_TIPICA = 1500; // tokens de salida por llamada para el costo "tipico" (los modelos que razonan gastan 1 500-2 000 pensando)
const RUTA_APTITUD = resolve(RAIZ, 'privado', 'planes', 'aptitud-modelos.md');

const usd = (x) => `$${x.toFixed(4)}`;
const salir = (mensaje) => { console.error(`\n  ${mensaje}\n`); process.exit(1); };

export function estimarExamen(candidato, escenarios, repeticiones, maxTokens = PARAMETROS.maxTokens) {
  const suma = (xs) => xs.reduce((a, b) => a + b, 0);
  return {
    llamadas: escenarios.length * repeticiones,
    peorCaso: repeticiones * suma(escenarios.map((e) => costoDe(Math.ceil(e.tokensEstimados * 1.1), maxTokens, candidato.precio))),
    tipico: repeticiones * suma(escenarios.map((e) => costoDe(e.tokensEstimados, SALIDA_TIPICA, candidato.precio))),
  };
}

function imprimirEstimacion(filas, escenarios, repeticiones, juego, origen = null) {
  console.log(`\n  ${origen ? 'Diagnóstico' : 'Examen'} de ${juego.nombre} (${juego.reglas}) · ${escenarios.length} escenarios × ${repeticiones} repeticiones por modelo · tope de tokens de salida ${PARAMETROS.maxTokens}`);
  if (origen) {
    const cortados = escenarios.filter((e) => e.real.cortada).length;
    if (origen.sistemaIgualAlJugado !== null) console.log(`  Prompt de sistema ${origen.sistemaIgualAlJugado ? 'IGUAL al de la partida real (misma huella)' : 'DISTINTO al de la partida real (otra huella)'}.`);
    console.log(`  Sobre la partida real «${origen.etiqueta}», turnos de ${origen.jugador} (${cortados} de ${escenarios.length} cortados en la partida real):${escenarios.map((e) => `${e.id} (~${e.tokensEstimados} tokens de entrada${e.real.cortada ? ', cortada en la partida real' : ''})`).join(', ')}`);
  } else {
    console.log(`  Escenarios (el modelo juega el reino del asiento ${escenarios[0].asiento + 1}, que sigue vivo en todos): ${escenarios.map((e) => `${e.id} (~${e.tokensEstimados} tokens de entrada, ${e.regiones} regiones)`).join(', ')}`);
  }
  console.log(`\n  ${'clave'.padEnd(13)} ${'modelo'.padEnd(34)} ${'precio ent/sal'.padEnd(15)} ${'razon.'.padEnd(7)} ${'llamadas'.padEnd(9)} ${'peor caso'.padEnd(10)} típico`);
  let peor = 0, tipico = 0;
  for (const f of filas) {
    if (f.problema) { console.log(`  ${f.clave.padEnd(13)} ${f.modelo.padEnd(34)} PROBLEMA: ${f.problema}`); continue; }
    const e = estimarExamen(f, escenarios, repeticiones);
    peor += e.peorCaso; tipico += e.tipico;
    console.log(`  ${f.clave.padEnd(13)} ${f.modelo.padEnd(34)} ${`${f.precio.entrada}/${f.precio.salida}`.padEnd(15)} ${(f.razonamiento ?? 'defecto').padEnd(7)} ${String(e.llamadas).padEnd(9)} ${usd(e.peorCaso).padEnd(10)} ${usd(e.tipico)}`);
  }
  console.log(`\n  Total: peor caso ${usd(peor)} (todas las llamadas gastan los ${PARAMETROS.maxTokens} tokens de salida), típico ~${usd(tipico)} (supuesto: ${SALIDA_TIPICA} tokens de salida por llamada).`);
  console.log('  Precios en USD por millón de tokens, del catálogo. Esto NO llamó a ningún modelo.\n');
}

function imprimirResultados({ modelos, llamadas, gastado, detenido }) {
  console.log(`\n  ${'modelo'.padEnd(15)} ${'veredicto'.padEnd(13)} ${'ok'.padEnd(5)} ${'cortes'.padEnd(7)} ${'órdenes legales'.padEnd(16)} ${'salida mediana'.padEnd(15)} costo`);
  for (const m of modelos) {
    const x = m.metricas;
    console.log(`  ${m.clave.padEnd(15)} ${m.veredicto.padEnd(13)} ${`${x.llamadas - x.fallas}/${x.llamadas}`.padEnd(5)} ${String(x.cortes).padEnd(7)} ${(x.ordenesLegales == null ? '-' : `${Math.round(x.ordenesLegales * 100)} %`).padEnd(16)} ${(x.salidaMediana == null ? '-' : String(Math.round(x.salidaMediana))).padEnd(15)} ${usd(x.costo)}`);
    for (const motivo of m.motivos) console.log(`      ${motivo}`);
  }
  console.log(`\n  ${llamadas} llamadas, ${usd(gastado)} gastados.${detenido ? ` DETENIDO: ${detenido}.` : ''}\n`);
}

// Solo corre como programa, no al importarlo desde las pruebas.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = parsearArgumentos(process.argv.slice(2));
  if (typeof o.juego !== 'string') salir(`Falta --juego=<juego>. Con examen: ${Object.keys(JUEGOS).join(', ')}.`);
  const juego = JUEGOS[o.juego];
  if (!juego) salir(`Juego sin examen: ${o.juego}. Con examen: ${Object.keys(JUEGOS).join(', ')}.`);
  if (typeof o.modelos !== 'string') salir('Falta --modelos=<lista> con claves de src/modelos.js, por ejemplo --modelos=haiku,glm-flash.');
  const claves = o.modelos.split(',').map((s) => s.trim()).filter(Boolean);
  const entero = (valor, defecto, min, max, nombre) => {
    const n = valor === undefined ? defecto : Number(valor);
    if (!Number.isInteger(n) || n < min || n > max) salir(`--${nombre} debe ser un entero entre ${min} y ${max} (recibió ${valor}).`);
    return n;
  };
  const repeticiones = entero(o.repeticiones, 2, 1, 5, 'repeticiones');
  const maxTokensPedido = o['max-tokens'] === undefined ? null : entero(o['max-tokens'], null, 1000, 64000, 'max-tokens');
  const paralelo = entero(o.paralelo, 3, 1, 8, 'paralelo');
  const opcionesDeEscenarios = {};
  if (o.turnos !== undefined) {
    const turnos = String(o.turnos).split(',').map(Number);
    if (!turnos.length || turnos.some((t) => !Number.isInteger(t) || t < 1)) salir('--turnos=2,8,15,22: enteros desde 1, separados por coma.');
    opcionesDeEscenarios.turnos = turnos;
  }
  if (o.jugadores !== undefined) opcionesDeEscenarios.jugadores = entero(o.jugadores, 4, 2, 5, 'jugadores');
  const topeUsd = Number(o['tope-usd']);
  if (o.ejecutar && !(topeUsd > 0)) salir('--ejecutar exige un tope de gasto en dólares: --tope-usd=0.50.');

  let sistemaAlterno = null;
  if (o.sistema !== undefined) {
    if (typeof o.sistema !== 'string') salir('--sistema=<archivo dentro de privado/>, por ejemplo --sistema=privado/spec/guerra-prompt-2.3.0-borrador.txt.');
    try { sistemaAlterno = { archivo: o.sistema, texto: leerSistema(o.sistema) }; } catch (err) { salir(err.message); }
  }
  let variante = null;
  if (o.reemplazar !== undefined) {
    if (typeof o.reemplazar !== 'string') salir('--reemplazar=<texto viejo>=><texto nuevo>.');
    try { variante = parsearVariante(o.reemplazar); } catch (err) { salir(err.message); }
  }

  // Diagnostico sobre una partida real guardada: se lee con el motor, no se copia nada de ella al repo ni a la consola salvo su etiqueta.
  let crudo = null;
  if (o.partida !== undefined) {
    if (typeof o.partida !== 'string') salir('--partida=<archivo>: la ruta es relativa a data/ (por ejemplo pruebas/NOMBRE.json) o completa.');
    if (typeof o.jugador !== 'string') salir('--partida exige --jugador=<id del jugador cuyos turnos se repiten>, por ejemplo --jugador=glm-flash.');
    if (typeof juego.partida !== 'function') salir(`${juego.nombre} todavía no sabe reconstruir una partida guardada.`);
    if (o.jugadores !== undefined) salir('--jugadores no va con --partida (los reinos son los de la partida guardada).');
    try {
      crudo = JSON.parse(readFileSync(isAbsolute(o.partida) ? o.partida : resolve(RAIZ, 'data', o.partida), 'utf8'));
    } catch (err) {
      salir(`No pude leer la partida ${o.partida}: ${err.message}`);
    }
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

  let filas, escenarios;
  try {
    filas = candidatosDeContendientes(catalogo, claves);
    escenarios = crudo ? juego.partida(crudo, { jugador: o.jugador, turnos: opcionesDeEscenarios.turnos ?? null, sistemaDistinto: !!sistemaAlterno }) : juego.escenarios(opcionesDeEscenarios);
    if (sistemaAlterno) escenarios = conSistema(escenarios, sistemaAlterno.texto);
    if (variante) escenarios = conVariante(escenarios, variante.de, variante.a);
  } catch (err) {
    salir(err.message);
  }
  // ¿El prompt de sistema que se va a usar es EXACTAMENTE el de la partida real? (la huella lo dice: sirve para saber que una linea base es de verdad la de entonces)
  const igualAlJugado = crudo?.prompt?.hash ? createHash('sha256').update(escenarios[0].sistema).digest('hex') === crudo.prompt.hash : null;
  const origen = crudo ? { etiqueta: crudo.etiqueta ?? String(o.partida), jugador: o.jugador, sistemaIgualAlJugado: igualAlJugado } : null;
  if (sistemaAlterno) console.log(`\n  Prompt de sistema DISTINTO al del juego (${sistemaAlterno.texto.length} caracteres): ${sistemaAlterno.archivo}`);
  if (variante) console.log(`\n  Variante de prompt en memoria (el juego no cambia): «${variante.de.slice(0, 80)}${variante.de.length > 80 ? '…' : ''}» → «${variante.a.slice(0, 120)}${variante.a.length > 120 ? '…' : ''}»`);
  imprimirEstimacion(filas, escenarios, repeticiones, juego, origen);
  if (!o.ejecutar) {
    console.log('  Para llamar de verdad: --ejecutar --tope-usd=<dólares>.\n');
    process.exit(filas.some((f) => f.problema) ? 1 : 0);
  }

  const candidatos = filas.filter((f) => !f.problema);
  if (!candidatos.length) salir('Ningún modelo tiene precio en el catálogo; no hay nada que examinar.');
  if (candidatos.length < filas.length) console.log(`  Se omiten ${filas.length - candidatos.length} modelo(s) con problema.\n`);
  fijarModo('pago');
  const resultado = await correrExamen({
    candidatos, escenarios, repeticiones, llamar: llamarModelo, topeUsd, paralelo, maxTokens: maxTokensPedido,
    alProgreso: (c, r) => {
      const real = escenarios.find((e) => e.id === r.escenario)?.real;
      console.log(`  ${c.clave.padEnd(13)} ${r.escenario.padEnd(14)} #${r.repeticion}  ${r.ok ? `ok (${r.ordenes.validas}/${r.ordenes.total} órdenes)` : `FALLA: ${r.motivo}`}${real ? (real.cortada ? '   [en la real: cortada]' : '   [en la real: salió]') : ''}`);
    },
  });
  imprimirResultados(resultado);
  if (crudo) {
    for (const m of resultado.modelos) {
      const { cortadosEnReal: a, buenosEnReal: b } = compararConReal(m.intentos, escenarios);
      const pc = (g) => (g.llamadas ? `${g.cortes} de ${g.llamadas} llamadas (${Math.round((100 * g.cortes) / g.llamadas)} %)` : 'sin llamadas');
      console.log(`  ${m.clave}: cortes en los turnos que se cortaron en la partida real → ${pc(a)}; en los que salieron bien → ${pc(b)}\n`);
    }
  }

  const fecha = new Date().toISOString().slice(0, 10);
  const carpeta = resolve(RAIZ, 'privado', 'pruebas');
  if (!existsSync(carpeta)) mkdirSync(carpeta, { recursive: true });
  const archivo = rutaLibre(resolve(carpeta, `examen-${o.juego}${crudo ? '-real' : ''}-${fecha}.json`));
  // Los prompts no se guardan (son reproducibles con el seed y los turnos, o con la partida); si, el razonamiento de cada llamada.
  writeFileSync(archivo, JSON.stringify({
    fecha: new Date().toISOString(), juego: o.juego, reglas: juego.reglas, versionPrompt: VERSION_PROMPT, topeUsd, repeticiones,
    ...(origen ? { partidaReal: { archivo: o.partida, ...origen } } : {}),
    ...(variante ? { variante } : {}),
    ...(sistemaAlterno ? { sistemaDistinto: { archivo: sistemaAlterno.archivo, caracteres: sistemaAlterno.texto.length } } : {}),
    escenarios: escenarios.map(({ id, turno, asiento, seed, bioma, tokensEstimados, real }) => ({ id, turno, asiento, seed, bioma, tokensEstimados, ...(real ? { real } : {}) })),
    ...resultado,
  }, null, 2));
  console.log(`  Detalle guardado en ${archivo}`);

  // Solo se anotan los modelos que se alcanzaron a juzgar: uno incompleto no tiene veredicto que valga. Un diagnostico de partida real no es un examen de ingreso: no va a la tabla.
  const juzgados = resultado.modelos.filter((m) => m.veredicto !== 'incompleto');
  if (juzgados.length && !o['sin-tabla'] && !crudo) {
    const carpetaPlanes = dirname(RUTA_APTITUD);
    if (!existsSync(carpetaPlanes)) mkdirSync(carpetaPlanes, { recursive: true });
    const previo = existsSync(RUTA_APTITUD) ? readFileSync(RUTA_APTITUD, 'utf8') : '';
    writeFileSync(RUTA_APTITUD, fusionarAptitud(previo, juzgados.map((m) => filaDeAptitud(m, { juego: o.juego, reglas: juego.reglas, maxTokens: resultado.maxTokens, fecha }))));
    console.log(`  Tabla de aptitud actualizada: ${RUTA_APTITUD}`);
  }
  console.log('');
  process.exit(resultado.detenido ? 1 : 0);
}
