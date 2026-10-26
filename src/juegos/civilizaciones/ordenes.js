// Parser de la Carrera de civilizaciones (spec 6): del JSON que contesta una IA a ordenes ya leidas.
// TOLERANTE y NUNCA LANZA (invariante 3): recibe null, texto suelto, JSON con comillas simples, una lista en vez de objeto, una cadena en `ordenes`... y siempre devuelve
// una jugada legal, marcada `invalida: true` si no se pudo leer nada. Aqui solo se lee la FORMA de cada orden; si se puede pagar o si existe la region lo decide el motor
// al aplicarla (con su motivo). Reglas de numeros y nombres de la 1.2.0 (C07): enteros finitos y positivos de hasta 1,000,000 (un decimal se descarta, no se redondea),
// nombres compuestos completos o por prefijo unico dentro de su catalogo, recurso y cantidad leidos desde la derecha, `sitio` ordinal 1 a 3.

import {
  RECURSOS_ALMACEN, OFICIOS, TECNOLOGIAS, EDIFICIOS, MARAVILLAS, RASGOS, EVENTOS, MAX_ORDENES, MAX_CANTIDAD, LIMITES_TEXTO, REGIONES, SITIOS, RASGOS_FALLBACK,
} from './constantes.js';

// Minusculas, sin acentos ni tildes, y los separadores comunes convertidos en espacios. El guion es un separador (arado-pesado) salvo el signo menos de un numero (-3 sigue
// siendo negativo: una cantidad negativa se descarta y un porcentaje negativo pasa a 0, nunca se vuelve positivo).
export const normalizarTexto = (x) => String(x ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/(^|\s)-(?=\d)/g, '$1\u0001').replace(/[_\-,;:=()"'`%]+/g, ' ').replace(/\u0001/g, '-').replace(/\s+/g, ' ').trim();

// Un texto de la IA: sin saltos de linea ni caracteres de control, espacios colapsados y recortado (por caracteres, sin partir un par sustituto).
export function limpiar(x, max) {
  if (typeof x !== 'string' && typeof x !== 'number') return '';
  return [...String(x).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()].slice(0, max).join('').trim();
}

// ---- catalogos: nombre normalizado -> id ----
const catalogo = (items, claves) => items.map((it) => ({ id: it.id, claves: claves(it).map(normalizarTexto) }));
const CAT_TEC = catalogo(TECNOLOGIAS, (t) => [t.nombre, t.id]);
const CAT_EDIFICIO = catalogo(EDIFICIOS, (e) => [e.id]);
const CAT_MARAVILLA = catalogo(MARAVILLAS, (m) => [m.id, m.nombre]);
const CAT_RASGO = catalogo(RASGOS, (r) => [r.id, r.id.replace(/(es|s)$/, '')]);
const CAT_EVENTO = [...catalogo(EVENTOS, (e) => [e.id, e.nombre]), { id: 'invasion', claves: ['invasion', 'invasiones'] }];

// Coincidencia exacta con alguna clave o, si no, prefijo (de al menos 3 letras) que identifique UN solo elemento del catalogo.
export function resolver(texto, cat) {
  const t = normalizarTexto(texto);
  if (!t) return null;
  const exacto = cat.filter((c) => c.claves.includes(t));
  if (exacto.length === 1) return exacto[0].id;
  if (exacto.length > 1 || t.length < 3) return null;
  const prefijo = cat.filter((c) => c.claves.some((k) => k.startsWith(t)));
  return prefijo.length === 1 ? prefijo[0].id : null;
}

const RECURSO_DE = Object.fromEntries(RECURSOS_ALMACEN.flatMap((r) => { const n = normalizarTexto(r); return [[n, r], [n + 's', r]]; }));
const OFICIO_DE = Object.fromEntries(OFICIOS.flatMap((o) => {
  const n = normalizarTexto(o), sing = n.replace(/(es|s)$/, '');
  return [[n, o], [sing, o], [sing + 's', o], [sing + 'es', o]];
}));
export const recursoDe = (tok) => RECURSO_DE[normalizarTexto(tok)] ?? null;

// Entero finito y positivo de hasta MAX_CANTIDAD escrito solo con digitos; cualquier otra cosa (decimal, negativo, texto) es null.
export function entero(tok) {
  if (typeof tok !== 'string' || !/^\d{1,9}$/.test(tok)) return null;
  const n = Number(tok);
  return n >= 1 && n <= MAX_CANTIDAD ? n : null;
}

// R3, R03 y 3 son la misma region (id 2). Fuera de 1..N no existe.
export function regionDe(tok, n = REGIONES) {
  const m = /^r?0*(\d{1,3})$/i.exec(String(tok ?? ''));
  if (!m) return null;
  const id = Number(m[1]) - 1;
  return id >= 0 && id < n ? id : null;
}

// ---- lectura de la respuesta completa ----
function leerObjeto(r) {
  if (Array.isArray(r)) return { ordenes: r };
  if (r && typeof r === 'object') return r;
  if (typeof r === 'string') {
    for (const intento of [r, r.replace(/'/g, '"')]) {
      try { const x = JSON.parse(intento); if (Array.isArray(x)) return { ordenes: x }; if (x && typeof x === 'object') return x; } catch { /* siguiente intento */ }
    }
  }
  return {};
}

function listaDeOrdenes(x) {
  if (Array.isArray(x)) return x;
  if (typeof x === 'string') return x.split(/\r?\n|;/).map((s) => s.trim()).filter(Boolean);
  return [];
}

// ---- una orden ----
// Devuelve { orden } con la orden leida o { motivo } si no se pudo leer.
function leerOrden(bruto, nRegiones) {
  const original = typeof bruto === 'string' ? bruto : (bruto && typeof bruto === 'object' ? (bruto.orden ?? bruto.texto ?? bruto.accion ?? '') : '');
  if (typeof original !== 'string' || !original.trim()) return { texto: limpiar(String(original ?? ''), 80), motivo: 'orden ilegible' };
  const texto = limpiar(original, 120);
  const tk = normalizarTexto(texto).split(' ').filter(Boolean);
  const verbo = tk[0];
  const no = (motivo) => ({ texto, motivo });
  const ok = (o) => ({ texto, orden: { tipo: verbo, texto, ...o } });
  const resto = tk.slice(1);
  switch (verbo) {
    case 'asignar': {
      const reparto = {}, partes = tk.slice(1);
      for (let i = 0; i < partes.length; i++) {
        const of = OFICIO_DE[partes[i]];
        if (!of) continue;
        const v = partes[i + 1] === undefined || partes[i + 1] === '' ? NaN : Number(partes[i + 1]);
        if (Number.isFinite(v)) { reparto[of] = v; i++; }
      }
      return Object.keys(reparto).length ? ok({ reparto }) : no('asignar no trae ningun oficio con su porcentaje');
    }
    case 'investigar': {
      const tec = resolver(resto.join(' '), CAT_TEC);
      return tec ? ok({ tec }) : no('tecnologia desconocida');
    }
    case 'construir': {
      const region = regionDe(resto[0], nRegiones);
      if (region === null) return no('region inexistente');
      const edificio = resolver(resto.slice(1).join(' '), CAT_EDIFICIO);
      return edificio ? ok({ region, edificio }) : no('edificio desconocido');
    }
    case 'colonizar': {
      const region = regionDe(resto[0], nRegiones);
      return region === null ? no('region inexistente') : ok({ region });
    }
    case 'reclutar': {
      const n = entero(resto[0]);
      return n === null ? no('cantidad invalida (entero positivo)') : ok({ n });
    }
    case 'invertir': {
      if (resto.length < 3) return no('invertir pide MARAVILLA RECURSO CANTIDAD');
      let [recurso, n] = [recursoDe(resto.at(-2)), entero(resto.at(-1))];
      let nombre = resto.slice(0, -2);
      if (!recurso && recursoDe(resto.at(-1)) && entero(resto.at(-2))) { recurso = recursoDe(resto.at(-1)); n = entero(resto.at(-2)); } // "invertir faro 8 Oro"
      if (!recurso) return no('recurso desconocido');
      if (n === null) return no('cantidad invalida (entero positivo)');
      const maravilla = resolver(nombre.join(' '), CAT_MARAVILLA);
      return maravilla ? ok({ maravilla, recurso, n }) : no('maravilla desconocida');
    }
    case 'dilema': {
      const n = entero(resto[0]);
      return n >= 1 && n <= 3 ? ok({ n }) : no('dilema pide una opcion de 1 a 3');
    }
    case 'responder': {
      const n = entero(resto.at(-1));
      if (n === null || n > 3) return no('responder pide una opcion de 1 a 3');
      const clave = resto.length > 1 ? resolver(resto.slice(0, -1).join(' '), CAT_EVENTO) : null;
      if (resto.length > 1 && !clave) return no('clave de respuesta desconocida');
      return ok({ clave, n });
    }
    case 'regalar': {
      let [recurso, n] = [recursoDe(resto[0]), entero(resto[1])];
      if (!recurso && recursoDe(resto[1]) && entero(resto[0])) { recurso = recursoDe(resto[1]); n = entero(resto[0]); }
      if (!recurso) return no('recurso desconocido');
      return n === null ? no('cantidad invalida (entero positivo)') : ok({ recurso, n });
    }
    case 'ofrecer': {
      const a = [recursoDe(resto[0]), entero(resto[1]), recursoDe(resto[2]), entero(resto[3])];
      const b = [recursoDe(resto[1]), entero(resto[0]), recursoDe(resto[3]), entero(resto[2])];
      const [da, nDa, pide, nPide] = a.every((x) => x !== null) ? a : b;
      if ([da, nDa, pide, nPide].some((x) => x === null)) return no('ofrecer pide RECURSO N RECURSO N');
      return ok({ da, nDa, pide, nPide });
    }
    case 'aceptar': {
      if (resto.length === 0) return ok({ n: null });
      const n = entero(resto[0]);
      return n !== null && n <= 2 ? ok({ n }) : no('aceptar pide el numero de la oferta (1 o 2)');
    }
    default:
      return no('orden desconocida');
  }
}

// ---- fundacion (solo el turno 1) ----
function leerRasgos(x) {
  const lista = Array.isArray(x) ? x : typeof x === 'string' ? x.split(/[^\p{L}]+/u).filter(Boolean) : [];
  const out = [];
  for (const it of lista) {
    const id = resolver(String(it ?? ''), CAT_RASGO);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

export function leerFundacion(f, { sitios = SITIOS, idsSitios = [] } = {}) {
  const ajustes = [];
  if (!f || typeof f !== 'object' || Array.isArray(f)) return { valida: false, nombre: '', lema: '', sitio: 0, rasgos: [...RASGOS_FALLBACK], ajustes: ['sin fundacion'] };
  const nombre = limpiar(f.nombre, LIMITES_TEXTO.nombre), lema = limpiar(f.lema, LIMITES_TEXTO.lema);
  if (!nombre) ajustes.push('sin nombre');
  let sitio = 0, sitioOk = false;
  const s = typeof f.sitio === 'number' ? String(f.sitio) : normalizarTexto(f.sitio);
  const ord = entero(s);
  if (ord !== null && ord <= sitios) { sitio = ord - 1; sitioOk = true; }
  else {
    const id = regionDe(s);
    const i = id === null ? -1 : idsSitios.indexOf(id);
    if (i >= 0) { sitio = i; sitioOk = true; }
  }
  if (!sitioOk) ajustes.push('sitio invalido: se uso el primero');
  const dados = leerRasgos(f.rasgos).slice(0, 2);
  const rasgos = [...dados];
  // Un rasgo repetido o desconocido pasa al siguiente de la lista que no se haya elegido (spec 3.4); sin ninguno valen los de siempre (agricultores y forjadores).
  for (const r of RASGOS.map((x) => x.id)) { if (rasgos.length >= 2) break; if (!rasgos.includes(r)) rasgos.push(r); }
  if (dados.length < 2) ajustes.push('rasgos incompletos: se completaron');
  return { valida: Boolean(nombre) && sitioOk && dados.length >= 2, nombre, lema, sitio, rasgos, ajustes };
}

// ---- la respuesta completa ----
// `estado` (opcional) da el numero de regiones y los ids de los 3 sitios; sin el valen los del mapa de 2 reinos.
export function normalizarRespuesta(respuesta, estado = null) {
  try {
    const nRegiones = estado?.mundo?.regs?.length ?? REGIONES;
    const idsSitios = estado?.mundo?.sitios ?? [];
    const r = leerObjeto(respuesta);
    const conocida = ['fundacion', 'ordenes', 'mensaje', 'nota', 'razon'].some((k) => k in r);
    const bruto = listaDeOrdenes(r.ordenes);
    const ordenes = [], descartadas = [];
    bruto.forEach((b, i) => {
      if (i >= MAX_ORDENES) { descartadas.push({ texto: limpiar(typeof b === 'string' ? b : '', 80), motivo: `mas de ${MAX_ORDENES} ordenes` }); return; }
      const leida = leerOrden(b, nRegiones);
      if (leida.orden) ordenes.push(leida.orden); else descartadas.push({ texto: leida.texto, motivo: leida.motivo });
    });
    return {
      invalida: !conocida,
      motivo: conocida ? null : 'la respuesta no traia fundacion, ordenes, mensaje, nota ni razon',
      fundacion: r.fundacion === undefined ? null : leerFundacion(r.fundacion, { idsSitios }),
      ordenes, descartadas,
      mensaje: limpiar(r.mensaje, LIMITES_TEXTO.mensaje), nota: limpiar(r.nota, LIMITES_TEXTO.nota), razon: limpiar(r.razon, LIMITES_TEXTO.razon),
    };
  } catch {
    // Nunca lanza: lo que sea que haya llegado, la jugada es legal y vacia.
    return { invalida: true, motivo: 'respuesta ilegible', fundacion: null, ordenes: [], descartadas: [], mensaje: '', nota: '', razon: '' };
  }
}
