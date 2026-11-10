import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { extraerJson, esBorradorCompleto, separarBorrador } from './extraer-json.js';

// Respuestas guardadas de cada participante, tal como las pegó el usuario (carpeta) o como quedaron en una partida anterior (conversacion.json).
//
//   <carpeta>/a/borrador.txt            las TRES etapas en un solo JSON {"etapa1":{...},"etapa2":{...},"etapa3":{...}}   (o)
//   <carpeta>/a/etapa1.txt  etapa2.txt  etapa3.txt     una respuesta por etapa
//   <carpeta>/a/desarrollo-1.txt .. desarrollo-3.txt   intervenciones del desarrollo (opcionales: sin archivo = «esperar»)
//   <carpeta>/a/guerra-1.txt guerra-2.txt              intervenciones de la guerra   (opcionales)
//   <carpeta>/a/etapa1.correccion.txt                  respuesta CORREGIDA que dio el modelo cuando se le mostró el error (opcional)
//   <carpeta>/b/...                                    lo mismo para el segundo modelo
//   <carpeta>/participantes.json                       { "a": {"modelo","nombre","canal"}, "b": {...}, "ejemplo": true }  (opcional)

export const EXTENSIONES = ['.txt', '.json', '.md'];
const CARPETAS = { a: 'f1', b: 'f2', f1: 'f1', f2: 'f2', 'modelo-a': 'f1', 'modelo-b': 'f2', modelo_a: 'f1', modelo_b: 'f2' };
export const LETRA = { f1: 'A', f2: 'B' };

// Clave estable de una llamada: etapa1, etapa2, etapa3, desarrollo-1.., guerra-1..
export function claveDeLlamada(llamada) {
  if (llamada.tipo === 'intervencion') return `${llamada.fase}-${llamada.indice}`;
  return `etapa${llamada.etapa ?? Number(String(llamada.tipo).replace('etapa', ''))}`;
}
// Claves que EXIGE un borrador completo y las opcionales (intervenciones), según el calendario de la partida.
export function clavesEsperadas(partida) {
  return { borrador: ['etapa1', 'etapa2', 'etapa3'], intervenciones: [...partida.intervencionesDesarrollo.map((_, i) => `desarrollo-${i + 1}`), ...partida.intervencionesGuerra.map((_, i) => `guerra-${i + 1}`)] };
}
// «Etapa 2.TXT», «etapa_2.correccion.json», «Desarrollo1.md», «borrador-completo.txt» -> { clave, correccion } | null
export function interpretarNombre(archivo) {
  let n = archivo.toLowerCase();
  const ext = EXTENSIONES.find(e => n.endsWith(e));
  if (!ext) return null;
  n = n.slice(0, -ext.length);
  const correccion = /[.\-_ ](correccion|corregida|correcci[oó]n)$/.test(n);
  if (correccion) n = n.replace(/[.\-_ ](correccion|corregida|correcci[oó]n)$/, '');
  n = n.replace(/[\s_]+/g, '-');
  let m;
  if ((m = /^etapa-?([123])$/.exec(n))) return { clave: `etapa${m[1]}`, correccion };
  if ((m = /^(desarrollo|guerra)-?(\d+)$/.exec(n))) return { clave: `${m[1]}-${Number(m[2])}`, correccion };
  if (/^borrador(-completo)?$/.test(n)) return { clave: 'borrador', correccion };
  return null;
}

const leerTexto = async ruta => (await readFile(ruta, 'utf8')).replace(/^﻿/, '');
async function esCarpeta(ruta) { try { return (await stat(ruta)).isDirectory(); } catch { return false; } }

// Devuelve { origen, raiz, ejemplo, participantes: {f1:{modelo,nombre,canal}, f2:{...}}, respuestas: {f1: Map, f2: Map}, avisos[] }.
// Cada Map: clave -> { texto, archivo, correccion: { texto, archivo } | null }. Un `borrador` se reparte en etapa1/2/3 (y gana el archivo de la etapa si existe).
export async function cargarAlmacen(ruta) {
  const avisos = [];
  const vacio = () => ({ f1: new Map(), f2: new Map() });
  if (!(await esCarpeta(ruta))) {
    // Un conversacion.json de una partida anterior: se repiten las MISMAS respuestas (y las mismas correcciones).
    const doc = JSON.parse(await leerTexto(ruta));
    if (doc?.tipo !== 'conversacion-era' || doc.version !== 1) throw Object.assign(new Error('Ese archivo no es una conversacion.json de la era (tipo conversacion-era, version 1).'), { codigo: 'respuestas_invalidas' });
    const respuestas = vacio();
    for (const l of doc.llamadas) {
      const m = respuestas[l.participante];
      if (!m) continue;
      const [primero, segundo] = l.intentos;
      if (!primero || primero.fuente === 'ninguna' || primero.respuesta_cruda == null) continue;
      m.set(l.clave, { texto: primero.texto_entregado ?? primero.respuesta_cruda, crudo: primero.respuesta_cruda, archivo: `conversacion.json#${l.clave}`, correccion: segundo?.respuesta_cruda != null && segundo.fuente !== 'ninguna' ? { texto: segundo.texto_entregado ?? segundo.respuesta_cruda, crudo: segundo.respuesta_cruda, archivo: `conversacion.json#${l.clave}.correccion` } : null });
    }
    const participantes = Object.fromEntries(doc.participantes.map(p => [p.id, { modelo: p.modelo, nombre: p.nombre_mostrado ?? null, canal: p.canal ?? 'chat' }]));
    return { origen: 'conversacion', raiz: ruta, ejemplo: doc.ejemplo === true, participantes, respuestas, avisos };
  }
  const respuestas = vacio();
  const entradas = await readdir(ruta, { withFileTypes: true });
  for (const d of entradas) {
    const id = d.isDirectory() ? CARPETAS[d.name.toLowerCase()] : null;
    if (!id) continue;
    const mapa = respuestas[id], archivos = (await readdir(join(ruta, d.name))).sort();
    const porClave = new Map();
    for (const f of archivos) {
      const i = interpretarNombre(f);
      if (!i) { if (!f.startsWith('.')) avisos.push(`${d.name}/${f}: nombre no reconocido, se ignora (usa etapa1.txt, etapa2.txt, etapa3.txt, borrador.txt, desarrollo-1.txt, guerra-1.txt... y «.correccion» para las correcciones).`); continue; }
      const previo = porClave.get(`${i.clave}|${i.correccion}`);
      if (previo) avisos.push(`${d.name}/${f}: hay dos archivos para ${i.clave}${i.correccion ? ' (corrección)' : ''} (${previo}); se usa el primero.`);
      else porClave.set(`${i.clave}|${i.correccion}`, f);
    }
    const leer = async (clave, correccion) => { const f = porClave.get(`${clave}|${correccion}`); return f ? { texto: await leerTexto(join(ruta, d.name, f)), archivo: `${d.name}/${f}` } : null; };
    for (const clave of ['etapa1', 'etapa2', 'etapa3', 'desarrollo-1', 'desarrollo-2', 'desarrollo-3', 'desarrollo-4', 'desarrollo-5', 'guerra-1', 'guerra-2', 'guerra-3', 'guerra-4', 'guerra-5']) {
      const orig = await leer(clave, false);
      if (orig) mapa.set(clave, { ...orig, correccion: await leer(clave, true) });
    }
    // «borrador»: un JSON con las tres etapas. Cada parte se reparte como si fuera su propio archivo.
    const bor = await leer('borrador', false);
    if (bor) {
      const ex = extraerJson(bor.texto);
      const cor = await leer('borrador', true), exCor = cor ? extraerJson(cor.texto) : null;
      const partes = ex.ok && esBorradorCompleto(ex.valor) ? separarBorrador(ex.valor) : null;
      const partesCor = exCor?.ok && esBorradorCompleto(exCor.valor) ? separarBorrador(exCor.valor) : null;
      if (!partes) {
        // Se guarda tal cual para que la validación informe el error EXACTO (JSON roto o sin etapas).
        for (const e of ['etapa1', 'etapa2', 'etapa3']) if (!mapa.has(e)) mapa.set(e, { texto: bor.texto, archivo: bor.archivo, correccion: cor ? { texto: cor.texto, archivo: cor.archivo } : null, deBorrador: true, borradorInvalido: true });
      } else {
        for (const e of ['etapa1', 'etapa2', 'etapa3']) {
          if (mapa.has(e)) { avisos.push(`${d.name}: existen ${e} y el borrador completo; se usa el archivo de ${e}.`); continue; }
          if (!partes[e]) { avisos.push(`${bor.archivo}: el borrador completo no trae «${e}».`); continue; }
          mapa.set(e, { texto: JSON.stringify(partes[e]), crudo: bor.texto, archivo: `${bor.archivo}#${e}`, deBorrador: true, correccion: partesCor?.[e] ? { texto: JSON.stringify(partesCor[e]), crudo: cor.texto, archivo: `${cor.archivo}#${e}` } : null });
        }
      }
    }
  }
  let participantes = {}, ejemplo = false;
  try {
    const datos = JSON.parse(await leerTexto(join(ruta, 'participantes.json')));
    ejemplo = datos.ejemplo === true;
    participantes = { f1: datos.a ?? datos.f1 ?? {}, f2: datos.b ?? datos.f2 ?? {} };
  } catch (e) { if (e.code !== 'ENOENT') avisos.push(`participantes.json no se pudo leer (${e.message}).`); }
  if (!respuestas.f1.size && !respuestas.f2.size) avisos.push(`No encontré respuestas en «${basename(ruta)}»: crea las carpetas a/ y b/ con etapa1.txt (o borrador.txt) dentro.`);
  return { origen: 'carpeta', raiz: ruta, ejemplo, participantes, respuestas, avisos };
}
export function accesoRespuestas(almacen, id) {
  const mapa = almacen.respuestas[id];
  return {
    obtener(clave, intento = 0) {
      const r = mapa.get(clave);
      if (!r) return null;
      if (intento === 0) return { texto: r.texto, crudo: r.crudo ?? r.texto, archivo: r.archivo, deBorrador: r.deBorrador === true };
      return r.correccion ? { texto: r.correccion.texto, crudo: r.correccion.crudo ?? r.correccion.texto, archivo: r.correccion.archivo, deBorrador: r.deBorrador === true } : null;
    },
    poner(clave, intento, datos) {
      const r = mapa.get(clave) ?? { texto: null, archivo: null, correccion: null };
      if (intento === 0) mapa.set(clave, { ...r, texto: datos.texto, archivo: datos.archivo, correccion: r.correccion ?? null });
      else mapa.set(clave, { ...r, correccion: { texto: datos.texto, archivo: datos.archivo } });
    },
    claves: () => [...mapa.keys()],
  };
}
