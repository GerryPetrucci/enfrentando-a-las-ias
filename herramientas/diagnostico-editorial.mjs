#!/usr/bin/env node
// Diagnostico de solo lectura. No genera paquetes ni cambia la politica de dos partes.
// node herramientas/diagnostico-editorial.mjs --archivo=SERIE.json [--partida=1] [--objetivo=90] [--sinvoz | --voz=RUTA] [--json]
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { lineaDe, motivoDeNoReproducible } from '../web/casino/lineas.js';
import { dividirEnDos, duracionDeBeat, momentosSinVoz, direccionDeGrabacion, planDeGrabacion, formatoDeTiempo } from '../web/casino/escena-config.js';
import { claveDeCierre, duracionDeCierre } from '../web/casino/cierre.js';
import { carpetaDeVoz } from './narrar.mjs';

// Solo corta entre unidades completas. Minimiza el numero de piezas que caben;
// a igual numero, prefiere duraciones parejas. Una unidad demasiado larga queda
// sola y marcada: nunca se acelera la voz ni se oculta parte de la partida.
export function diagnosticar(beats, { voz = null, objetivoMs = 90000, seed = 0, partidaNumero = 1 } = {}) {
  if (!Number.isFinite(objetivoMs) || objetivoMs <= 0) throw new Error('El objetivo debe ser un numero positivo de segundos.');
  if (!Array.isArray(beats) || !beats.length) throw new Error('No hay momentos para medir.');
  const unidades = [], porTipo = new Map();
  for (const b of beats) {
    if (!Number.isInteger(b?.mano) || b.mano < 1 || !Number.isFinite(b.minMs) || b.minMs < 0) throw new Error('La linea contiene una unidad o duracion invalida.');
    const ms = duracionDeBeat(b, voz);
    if (unidades.at(-1)?.mano !== b.mano) {
      if (unidades.length && b.mano <= unidades.at(-1).mano) throw new Error('Las unidades deben estar ordenadas y ser contiguas en la linea.');
      unidades.push({ mano: b.mano, ms: 0 });
    }
    unidades.at(-1).ms += ms;
    const tipo = b.tipo ?? 'sin-tipo', anterior = porTipo.get(tipo) ?? { tipo, momentos: 0, ms: 0 };
    anterior.momentos++; anterior.ms += ms; porTipo.set(tipo, anterior);
  }
  const acumulados = [0];
  for (const u of unidades) acumulados.push(acumulados.at(-1) + u.ms);
  const pieza = (i, j) => {
    const desde = unidades[i].mano, hasta = unidades[j - 1].mano;
    const contenidoMs = acumulados[j] - acumulados[i];
    const cierreMs = duracionDeCierre(claveDeCierre({ seed, partida: partidaNumero, desde, hasta }), voz);
    const ms = contenidoMs + cierreMs;
    return { desde, hasta, contenidoMs, cierreMs, ms, excedeObjetivo: ms > objetivoMs, grabacionMs: planDeGrabacion(ms).totalMs };
  };
  const mejores = [{ cantidad: 0, dispersion: 0, anterior: null, pieza: null }];
  for (let j = 1; j <= unidades.length; j++) {
    let mejor = null;
    for (let i = 0; i < j; i++) {
      const p = pieza(i, j);
      if (p.excedeObjetivo && j - i > 1) continue;
      const previo = mejores[i], cantidad = previo.cantidad + 1, dispersion = previo.dispersion + p.ms ** 2;
      if (!mejor || cantidad < mejor.cantidad || (cantidad === mejor.cantidad && dispersion < mejor.dispersion)) mejor = { cantidad, dispersion, anterior: i, pieza: p };
    }
    mejores.push(mejor);
  }
  const propuestas = [];
  for (let j = unidades.length; j > 0; j = mejores[j].anterior) propuestas.unshift(mejores[j].pieza);
  const dos = dividirEnDos(beats, voz);
  const actuales = dos ? [dos.parte1, dos.parte2].map((p) => pieza(unidades.findIndex((u) => u.mano === p.mano), unidades.findIndex((u) => u.mano === p.hasta) + 1)) : [pieza(0, unidades.length)];
  const ms = acumulados.at(-1);
  return {
    objetivoMs, ms, momentos: beats.length, unidades, actuales, propuestas,
    porTipo: [...porTipo.values()].sort((a, b) => b.ms - a.ms).map((t) => ({ ...t, porcentaje: ms ? Math.round(t.ms / ms * 1000) / 10 : 0 })),
    sinVoz: momentosSinVoz(beats, voz),
  };
}

const leerJSON = (ruta) => JSON.parse(readFileSync(ruta, 'utf8').replace(/^\uFEFF/, ''));

export async function leerDiagnosticos({ archivo, partida, voz: rutaExplicita, sinvoz = false, objetivo = 90 } = {}) {
  if (!archivo) throw new Error('Falta --archivo=SERIE.json (en data/).');
  if (sinvoz && rutaExplicita) throw new Error('Elige --sinvoz o --voz, no ambos.');
  if (rutaExplicita && partida === undefined) throw new Error('--voz necesita --partida=N para no usar un audio en otra partida.');
  const numero = partida === undefined ? null : Number(partida), objetivoMs = Number(objetivo) * 1000;
  if (numero !== null && (!Number.isInteger(numero) || numero < 1)) throw new Error('--partida debe ser un entero positivo.');
  if (!Number.isFinite(objetivoMs) || objetivoMs <= 0) throw new Error('--objetivo debe ser un numero positivo de segundos.');
  const datos = leerJSON(resolve('data', archivo));
  if (!Array.isArray(datos.partidas) || !datos.partidas.length) throw new Error('El archivo no trae partidas.');
  if (numero !== null && !datos.partidas[numero - 1]) throw new Error(`El archivo no tiene la partida ${numero}.`);
  const salida = [];
  for (const [i, p] of datos.partidas.entries()) {
    if (numero !== null && i + 1 !== numero) continue;
    const id = p.juego?.id ?? datos.juego?.id, motivo = motivoDeNoReproducible(id, p);
    if (motivo) throw new Error(`Partida ${i + 1}: ${motivo}`);
    const candidata = `${carpetaDeVoz(archivo, i + 1)}/voz.json`;
    const rutaVoz = sinvoz ? null : rutaExplicita ?? (existsSync(resolve(candidata)) ? candidata : null);
    const voz = rutaVoz ? leerJSON(resolve(rutaVoz)) : null;
    const linea = await lineaDe(id), beats = linea(p);
    const diagnostico = diagnosticar(beats, { voz, objetivoMs, seed: p.seed, partidaNumero: i + 1 });
    const conURL = (pieza) => ({ ...pieza, url: direccionDeGrabacion({ archivo, partida: i + 1, desde: pieza.desde, hasta: pieza.hasta, voz: rutaVoz }) });
    salida.push({ archivo, partida: i + 1, juego: id, truncada: p.truncada === true, rutaVoz,
      ...diagnostico, actuales: diagnostico.actuales.map(conURL), propuestas: diagnostico.propuestas.map(conURL) });
  }
  return salida;
}

export function informeDe(diagnosticos) {
  const lineas = ['# Diagnostico editorial', '', 'Solo lectura. El objetivo es editorial, no un limite verificado de ninguna red.',
    'Las propuestas no regeneran paquetes, numeracion ni textos de publicacion.', ''];
  for (const d of diagnosticos) {
    lineas.push(`## ${d.juego} · partida ${d.partida}`, '',
      `Contenido: ${formatoDeTiempo(d.ms)} · ${d.unidades.length} unidades · ${d.momentos} momentos.`,
      `Medicion: ${d.rutaVoz ? `con voz (${d.rutaVoz})` : 'SIN VOZ: estimacion con los tiempos minimos; falta medir el audio real'}.`,
      ...(d.sinVoz ? [`AVISO: ${d.sinVoz} momentos con texto no tienen audio vigente; regenerar voz antes de grabar.`] : []),
      ...(d.truncada ? ['AVISO: partida truncada; no publicar.'] : []),
      '', '| Tipo | Momentos | Tiempo | % |', '|---|---:|---:|---:|',
      ...d.porTipo.map((t) => `| ${t.tipo} | ${t.momentos} | ${formatoDeTiempo(t.ms)} | ${t.porcentaje} |`), '',
      'Partes actuales (incluyen cierre):', ...d.actuales.map((p, i) => `- ${i + 1}: unidades ${p.desde}–${p.hasta}, ${formatoDeTiempo(p.ms)}${p.excedeObjetivo ? ' · supera el objetivo' : ''}.`), '',
      `Propuesta a ${d.objetivoMs / 1000} s (incluye cierre en cada pieza):`,
      ...d.propuestas.flatMap((p, i) => [`- Ventana ${i + 1}: unidades ${p.desde}–${p.hasta}, ${formatoDeTiempo(p.ms)}; grabacion con margenes: ${formatoDeTiempo(p.grabacionMs)}.${p.excedeObjetivo ? ' NO CABE: una unidad completa supera el objetivo; requiere otra decision editorial.' : ''}`, `  Vista previa: ${p.url}`]), '',
      'Revisar continuidad y contexto al inicio de cada ventana; solo la primera conserva la introduccion original.',
      'Antes de publicar con estos cortes hay que adaptar y revisar el paquete y sus textos. No avisar estas ventanas como partes publicadas del paquete actual.', '');
  }
  return lineas.join('\n');
}

async function principal() {
  const args = Object.fromEntries(process.argv.slice(2).map((x) => { const [k, ...v] = x.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
  if (args.ayuda || args.help) {
    console.log('node herramientas/diagnostico-editorial.mjs --archivo=SERIE.json [--partida=1] [--objetivo=90] [--sinvoz | --voz=RUTA] [--json]\nSin --partida mide todas. Busca la voz local de cada partida. Solo imprime el informe; no escribe archivos ni llama APIs.');
    return;
  }
  try {
    const diagnosticos = await leerDiagnosticos(args);
    console.log(args.json ? JSON.stringify(diagnosticos, null, 2) : informeDe(diagnosticos));
  } catch (e) { console.error(`No pude medir: ${e.message}`); process.exitCode = 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await principal();
