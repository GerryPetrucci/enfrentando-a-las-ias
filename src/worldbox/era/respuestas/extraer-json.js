// Extractor tolerante de la respuesta de un modelo pegada A MANO desde un chat (formato «era», modo de respuestas guardadas).
// Un chat suele devolver texto alrededor del JSON, bloques ```json, comentarios, comas finales o comillas tipográficas. Aquí se
// recupera el objeto JSON de la respuesta SIN inventar nada: si no hay un JSON legible, el error dice exactamente qué pasó y dónde.
// Esto es solo la lectura; el validador del motor (reglas-era.js, contrato-acciones.js) sigue siendo el que decide si la respuesta vale.

const INVISIBLES = /[​-‍⁠﻿]/g;

// Quita comentarios `//` y `/* */` y comas finales FUERA de las cadenas. Devuelve { texto, comentarios, comas }.
function limpiar(texto) {
  let salida = '', enCadena = false, comentarios = 0, comas = 0;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enCadena) {
      salida += c;
      if (c === '\\') { salida += texto[++i] ?? ''; continue; }
      if (c === '"') enCadena = false;
      continue;
    }
    if (c === '"') { enCadena = true; salida += c; continue; }
    if (c === '/' && texto[i + 1] === '/') { while (i < texto.length && texto[i] !== '\n') i++; salida += '\n'; comentarios++; continue; }
    if (c === '/' && texto[i + 1] === '*') { const f = texto.indexOf('*/', i + 2); i = f < 0 ? texto.length : f + 1; comentarios++; continue; }
    salida += c;
  }
  // Comas finales: `,` seguida (con espacios) de `}` o `]`, fuera de cadenas.
  let r = '', cad = false;
  for (let i = 0; i < salida.length; i++) {
    const c = salida[i];
    if (cad) { r += c; if (c === '\\') { r += salida[++i] ?? ''; continue; } if (c === '"') cad = false; continue; }
    if (c === '"') { cad = true; r += c; continue; }
    if (c === ',') { let j = i + 1; while (j < salida.length && /\s/.test(salida[j])) j++; if (salida[j] === '}' || salida[j] === ']') { comas++; continue; } }
    r += c;
  }
  return { texto: r, comentarios, comas };
}

// Desde `inicio` (un `{`) devuelve el índice del `}` que lo cierra respetando cadenas, o -1 si no cierra.
// Reconoce como comillas las rectas y las tipográficas (“ ”), porque un chat puede haberlas cambiado.
function cierreEquilibrado(texto, inicio) {
  let nivel = 0, enCadena = false, abre = '';
  for (let i = inicio; i < texto.length; i++) {
    const c = texto[i];
    if (enCadena) {
      if (c === '\\' && abre === '"') { i++; continue; }
      if ((abre === '"' && c === '"') || (abre === '“' && (c === '”' || c === '"')) || (abre === "'" && c === "'")) enCadena = false;
      continue;
    }
    if (c === '"' || c === '“') { enCadena = true; abre = c; continue; }
    if (c === '/' && texto[i + 1] === '/') { while (i < texto.length && texto[i] !== '\n') i++; continue; }
    if (c === '/' && texto[i + 1] === '*') { const f = texto.indexOf('*/', i + 2); if (f < 0) return -1; i = f + 1; continue; }
    if (c === '{') nivel++;
    else if (c === '}') { nivel--; if (nivel === 0) return i; }
  }
  return -1;
}

function posicionDeError(mensaje, texto) {
  const m = /position (\d+)/i.exec(mensaje ?? '');
  if (!m) return null;
  const pos = Math.min(Number(m[1]), texto.length);
  const antes = texto.slice(0, pos).split('\n');
  return { posicion: pos, linea: antes.length, columna: antes.at(-1).length + 1, cerca: texto.slice(Math.max(0, pos - 30), pos + 30).replace(/\s+/g, ' ') };
}

function intentarLeer(candidato) {
  const avisos = [];
  const variantes = [
    { texto: candidato, aviso: null },
    { texto: candidato.replace(/[“”]/g, '"'), aviso: 'Había comillas tipográficas (“ ”): se leyeron como comillas normales. Pide al modelo que use comillas rectas ".' },
  ];
  if (!candidato.includes('"') && !/[“”]/.test(candidato)) variantes.push({ texto: candidato.replace(/'/g, '"'), aviso: "Había comillas simples ('): se leyeron como comillas dobles. El JSON válido usa comillas dobles." });
  let ultimoError = null, ultimoTexto = candidato;
  for (const v of variantes) {
    const l = limpiar(v.texto);
    try {
      const valor = JSON.parse(l.texto);
      if (v.aviso) avisos.push(v.aviso);
      if (l.comentarios) avisos.push(`Había ${l.comentarios} comentario(s) dentro del JSON (// o /* */): se ignoraron. El JSON válido no lleva comentarios.`);
      if (l.comas) avisos.push(`Había ${l.comas} coma(s) sobrante(s) antes de } o ]: se ignoraron.`);
      return { ok: true, valor, avisos };
    } catch (e) { ultimoError = e; ultimoTexto = l.texto; }
  }
  return { ok: false, error: ultimoError, texto: ultimoTexto };
}

const esObjeto = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const pareceRespuesta = o => esObjeto(o) && ('actions' in o || 'etapa1' in o || 'etapa2' in o || 'etapa3' in o);

// Resultado: { ok, valor, json (cadena JSON limpia y canónica), avisos[], bloques (cuántos objetos JSON legibles había) }
//            o { ok:false, error:{ codigo, mensaje, linea?, columna?, cerca? }, avisos[] }
export function extraerJson(entrada) {
  const avisos = [];
  if (typeof entrada !== 'string') {
    if (esObjeto(entrada)) return { ok: true, valor: entrada, json: JSON.stringify(entrada), avisos, bloques: 1 };
    return { ok: false, error: { codigo: 'sin_texto', mensaje: 'No hay texto: el archivo está vacío.' }, avisos };
  }
  const texto = entrada.replace(INVISIBLES, '').replace(/\r\n?/g, '\n');
  if (!texto.trim()) return { ok: false, error: { codigo: 'sin_texto', mensaje: 'El archivo está vacío: pega ahí la respuesta del modelo.' }, avisos };
  if (!texto.includes('{')) return { ok: false, error: { codigo: 'sin_json', mensaje: 'No encontré ninguna llave «{»: la respuesta no contiene un JSON. Pídele al modelo que responda SOLO con el objeto JSON del formato.' }, avisos };

  const legibles = [], fallidos = [];
  let desde = 0;
  while (true) {
    const i = texto.indexOf('{', desde);
    if (i < 0) break;
    const fin = cierreEquilibrado(texto, i);
    if (fin < 0) { fallidos.push({ inicio: i, motivo: 'sin_cierre' }); desde = i + 1; continue; }
    const candidato = texto.slice(i, fin + 1), leido = intentarLeer(candidato);
    if (leido.ok) { legibles.push({ inicio: i, fin, valor: leido.valor, avisos: leido.avisos }); desde = fin + 1; }
    else { fallidos.push({ inicio: i, fin, candidato, error: leido.error, textoLimpio: leido.texto }); desde = i + 1; }
  }
  const respuestas = legibles.filter(x => pareceRespuesta(x.valor));
  if (!respuestas.length) {
    // Si el candidato roto más grande abarca más que cualquier objeto legible, el problema real es ese JSON roto (los objetos internos legibles son migajas).
    const mayorFallido = fallidos.filter(f => f.fin !== undefined).reduce((m, f) => Math.max(m, f.fin - f.inicio), -1), mayorLegible = legibles.reduce((m, x) => Math.max(m, x.fin - x.inicio), -1);
    if (legibles.length && mayorLegible >= mayorFallido) {
      const claves = Object.keys(legibles[0].valor).slice(0, 8).join(', ') || '(vacío)';
      return { ok: false, error: { codigo: 'sin_campo_actions', mensaje: `Encontré un JSON, pero no es una respuesta del formato: le falta el campo «actions» (tiene: ${claves}). La respuesta debe ser {"actions":[...],"reasoning_summary":"..."}.` }, avisos, bloques: legibles.length };
    }
    // Ningún bloque se pudo leer: se explica el error del más grande (suele ser la respuesta intentada).
    const peor = fallidos.filter(f => f.fin !== undefined).sort((a, b) => (b.fin - b.inicio) - (a.fin - a.inicio))[0];
    if (peor) {
      const pos = posicionDeError(peor.error?.message, peor.textoLimpio);
      return { ok: false, error: { codigo: 'json_invalido', mensaje: `El JSON no se puede leer${pos ? ` (línea ${pos.linea}, columna ${pos.columna}, cerca de: «${pos.cerca}»)` : ''}. Detalle técnico: ${String(peor.error?.message ?? '').slice(0, 160)}. Pídele al modelo que repita el JSON completo y válido (comillas dobles, sin comentarios, sin comas sobrantes).`, ...(pos ?? {}) }, avisos };
    }
    const abiertas = fallidos.length ? ' La llave de apertura no llega a cerrarse: la respuesta parece CORTADA (el modelo se quedó sin espacio o se interrumpió). Pídele que la repita completa.' : '';
    return { ok: false, error: { codigo: 'json_cortado', mensaje: `No encontré un JSON completo.${abiertas}` }, avisos };
  }
  const combinada = respuestas.filter(x => 'etapa1' in x.valor || 'etapa2' in x.valor || 'etapa3' in x.valor);
  const elegida = combinada.length ? combinada.at(-1) : respuestas.at(-1);
  if (respuestas.length > 1 && !combinada.length) avisos.push(`Había ${respuestas.length} objetos JSON de respuesta en el texto; se usó el ÚLTIMO. Si no era el que querías, deja un solo JSON en el archivo.`);
  avisos.push(...elegida.avisos);
  const fuera = (texto.slice(0, elegida.inicio) + texto.slice(elegida.fin + 1)).replace(/```(?:json)?/gi, '').trim();
  if (fuera) avisos.push(`Había texto fuera del JSON (${fuera.length} caracteres): se ignoró. El motor del juego solo lee el JSON.`);
  return { ok: true, valor: elegida.valor, json: JSON.stringify(elegida.valor), avisos, bloques: respuestas.length };
}

// Respuesta de «borrador completo»: { etapa1: {actions, reasoning_summary}, etapa2: {...}, etapa3: {...} } -> las tres por separado.
export function esBorradorCompleto(valor) { return esObjeto(valor) && ['etapa1', 'etapa2', 'etapa3'].some(k => k in valor); }
export function separarBorrador(valor) {
  const salida = {};
  for (const k of ['etapa1', 'etapa2', 'etapa3']) if (esObjeto(valor?.[k])) salida[k] = valor[k];
  return salida;
}
