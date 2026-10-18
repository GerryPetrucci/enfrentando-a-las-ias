// Lo puro del reproductor de la escena (sin DOM, para probarlo en Node): parametros de la URL, recorte del clip por manos, duracion de
// cada beat (con o sin voz) y marcas de tiempo para re-doblar.
//
// La voz (voz.json, que genera herramientas/narrar.mjs) es un objeto { "<id del beat>": { ms, archivo, fuente } }: cada beat dura lo que dure su audio
// si es mas largo que su minimo; sin voz, su minimo. `fuente` es el texto del beat que se narro: un audio solo vale para un beat que dice lo mismo (los ids de
// una partida se repiten en otra, y asi la voz de una no suena sobre la otra). Entrada ilegible no lanza: vale como "sin voz".

import { juegosConEscena, escenaDe, motivoDeNoReproducible } from './lineas.js';

const entero = (v) => {
  const n = v === null || v === '' ? NaN : Number(v);
  return Number.isInteger(n) ? n : null;
};
const bandera = (v) => v !== null && v !== '' && v !== '0' && v !== 'false';

export const FORMATOS_PAGINA = ['9x16', '16x9', 'hoja']; // 'hoja' dibuja los dos formatos juntos en la hoja maestra de OBS

// Una ruta de este mismo sitio (voz/ep1.json): letras, numeros, punto, guion y barras, sin subir de carpeta. Nunca una URL de otro dominio: la pagina esta publicada
// y ?voz= o un voz.json ajeno podrian hacer sonar cualquier audio de internet.
export const esRutaRelativa = (texto) => typeof texto === 'string' && /^[\w.-]+(\/[\w.-]+)*$/.test(texto) && !texto.split('/').includes('..');

// El audio de la voz que esta sonando: una sola a la vez. Sonar otra, o abrir otra partida, corta la anterior (si no, la voz de la partida vieja seguiria sonando sobre la nueva).
// `fabrica` crea el audio (en la pagina, new Audio); un audio que no se puede crear o reproducir (el navegador lo bloquea) no tumba la reproduccion: se queda sin voz.
export function crearReproductorDeVoz(fabrica = (src) => new Audio(src)) {
  let actual = null;
  const detener = () => { try { actual?.pause(); } catch { /* ya estaba parado */ } actual = null; };
  const sonar = (src, vel = 1) => {
    detener();
    try {
      actual = fabrica(src);
      actual.playbackRate = vel;
      actual.play()?.catch?.(() => {});
    } catch { actual = null; }
  };
  return { sonar, detener };
}

// Los margenes de la grabacion con OBS (modo grabar=1): la pagina arranca sola al refrescar la fuente, asi que empieza en negro (margen), se aclara (fundido), cuenta la partida y
// vuelve a negro (fundido) y se queda en negro (cola) hasta que se cierra. Un solo lugar: la pagina, el paquete y el recortador leen estos tiempos.
export const FUNDIDOS = { margenMs: 2000, fundidoMs: 500, colaMs: 2000 };

// Lo que dura todo lo grabado: margen + fundido de entrada + contenido + fundido de salida + cola. `contenidoMs` ya viene a la velocidad de reproduccion (marcarTiempos con vel);
// los margenes y fundidos se escalan con `vel` igual que todo lo demas. Basura -> contenido cero y velocidad 1.
export function planDeGrabacion(contenidoMs, vel = 1) {
  const v = Number.isFinite(vel) && vel > 0 ? vel : 1;
  const contenido = Number.isFinite(contenidoMs) && contenidoMs > 0 ? contenidoMs : 0;
  const margenMs = FUNDIDOS.margenMs / v, fundidoMs = FUNDIDOS.fundidoMs / v, colaMs = FUNDIDOS.colaMs / v;
  return { margenMs, fundidoMs, contenidoMs: contenido, colaMs, totalMs: margenMs + fundidoMs + contenido + fundidoMs + colaMs };
}

// ?archivo=NOMBRE.json (en data/) &partida=N (1 = la primera) &mano=A &hasta=B (clip por manos) &formato=9x16|16x9|hoja &camara=0..9 (a cuantos se les ve lo oculto; sin ella, el valor del juego)
// &sonido=0 (apaga efectos y voz) &vel=2 &razon=1 &auto=1 &limpio=1 &grabar=1 (con auto: margenes y fundidos de negro para grabar) &voz=voz.json &escala=1 (por defecto la escena se ajusta a la ventana)
export function leerParametros(search) {
  const q = new URLSearchParams(search ?? '');
  const mano = Math.max(1, entero(q.get('mano') ?? q.get('ronda') ?? q.get('turno')) ?? 1); // ronda= y turno= son sinonimos de mano= (los juegos que juegan por rondas o por turnos)
  const hastaPedida = entero(q.get('hasta'));
  const vel = Number(q.get('vel'));
  const camara = entero(q.get('camara'));
  const escala = Number(q.get('escala'));
  return {
    archivo: q.get('archivo') || null,
    partida: Math.max(1, entero(q.get('partida')) ?? 1),
    mano,
    hasta: hastaPedida !== null && hastaPedida >= mano ? hastaPedida : Infinity,
    formato: FORMATOS_PAGINA.includes(q.get('formato')) ? q.get('formato') : '9x16',
    camara: camara !== null && camara >= 0 && camara <= 9 ? camara : null, // null = el valor por defecto del juego (lineas.js)
    sonido: q.get('sonido') !== '0' && q.get('sonido') !== 'false',
    vel: Number.isFinite(vel) && vel > 0 ? Math.min(8, Math.max(0.25, vel)) : 1,
    razon: bandera(q.get('razon')),
    auto: bandera(q.get('auto')),
    grabar: bandera(q.get('auto')) && bandera(q.get('grabar')), // sin auto la pagina no arranca sola: no hay nada que enmarcar
    detener: entero(q.get('detener')), // para capturas: avanza al instante hasta ese beat y se queda ahi (null = reproduccion normal)
    grabando: bandera(q.get('auto')) && bandera(q.get('grabar')) && entero(q.get('detener')) === null, // grabar con margenes y fundidos: una captura que se detiene en un beat no espera ni se funde
    limpio: bandera(q.get('limpio')),
    voz: esRutaRelativa(q.get('voz')) ? q.get('voz') : null,
    escala: Number.isFinite(escala) && escala > 0 ? escala : 'ajustar',
  };
}

// m:ss de una duracion en ms (la usan las herramientas de partes y de paquete y los textos del paquete).
export const formatoDeTiempo = (ms) => `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, '0').replace(/^60$/, '59')}`;

// Los beats de las manos mano..hasta. Un clip empieza al abrir su primera mano; el final de la partida va solo si el clip llega a la ultima mano.
export const recortarClip = (beats, mano, hasta) => (Array.isArray(beats) ? beats.filter((b) => b.mano >= mano && b.mano <= hasta) : []);

export const hayVoz = (voz) => !!voz && typeof voz === 'object' && Object.keys(voz).length > 0;

// El texto de un beat como se compara con la fuente de su audio: sin saltos de linea ni espacios de mas.
export const fuenteDeVoz = (texto) => String(texto ?? '').replace(/\s+/g, ' ').trim();

// El audio que le toca a un beat, o null: el id tiene que estar en el voz.json y, si trae `fuente`, el beat tiene que decir lo mismo. Sin `fuente` (escrito a mano) vale por id.
export function entradaDeVoz(voz, beat) {
  if (!voz || typeof voz !== 'object' || !beat || !Object.hasOwn(voz, beat.id)) return null;
  const e = voz[beat.id];
  if (!e || typeof e !== 'object') return null;
  if (typeof e.fuente === 'string' && e.fuente !== fuenteDeVoz(beat.texto)) return null;
  return e;
}

// Cuantos beats tienen su audio y cuantos tienen uno de OTRO texto (la voz es de otra partida o el texto cambio despues de narrarla).
export function resumenDeVoz(beats, voz) {
  let usados = 0, desacordes = 0;
  for (const b of Array.isArray(beats) ? beats : []) {
    if (entradaDeVoz(voz, b)) usados++;
    else if (voz && typeof voz === 'object' && Object.hasOwn(voz, b?.id) && voz[b.id] && typeof voz[b.id] === 'object') desacordes++;
  }
  return { usados, desacordes };
}

// Cuanto dura un beat en pantalla (ms): max(su minimo, su voz) entre la velocidad.
export function duracionDeBeat(beat, voz, vel = 1) {
  const ms = entradaDeVoz(voz, beat)?.ms;
  const delAudio = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const velocidad = Number.isFinite(vel) && vel > 0 ? vel : 1;
  return Math.max(beat.minMs, delAudio) / velocidad;
}

// Cuando empieza y termina cada beat, uno tras otro: es la linea de tiempo que se exporta para re-doblar el video en otro idioma.
export function marcarTiempos(beats, voz, vel = 1) {
  let t = 0;
  return (Array.isArray(beats) ? beats : []).map((b) => {
    const duracion = duracionDeBeat(b, voz, vel);
    const marca = { id: b.id, mano: b.mano, tipo: b.tipo, texto: b.texto, inicioMs: t, finMs: t + duracion };
    t += duracion;
    return marca;
  });
}

// Cada juego se publica en DOS partes (decidido el 17 de octubre de 2026): dos clips de rondas contiguos (`ronda=A&hasta=B` y `ronda=C&hasta=D`) con la duracion mas pareja que permiten las
// rondas enteras. El final de la partida cae en la segunda. Con una sola ronda no hay como partir (null). Con voz (voz.json) usa lo que dura cada audio.
export function dividirEnDos(beats, voz = null) {
  if (!Array.isArray(beats) || !beats.length) return null;
  const manos = [...new Set(beats.map((b) => b.mano))];
  if (manos.length < 2) return null;
  const ms = new Map(manos.map((m) => [m, 0]));
  for (const b of beats) ms.set(b.mano, ms.get(b.mano) + duracionDeBeat(b, voz, 1));
  const total = [...ms.values()].reduce((s, x) => s + x, 0);
  let mejor = { k: 1, dif: Infinity }, acumulado = 0;
  for (let k = 1; k < manos.length; k++) {
    acumulado += ms.get(manos[k - 1]);
    const dif = Math.abs(acumulado - (total - acumulado));
    if (dif < mejor.dif) mejor = { k, dif };
  }
  const suma = (desde, hasta) => manos.slice(desde, hasta).reduce((s, m) => s + ms.get(m), 0);
  return {
    parte1: { mano: manos[0], hasta: manos[mejor.k - 1], ms: suma(0, mejor.k) },
    parte2: { mano: manos[mejor.k], hasta: manos.at(-1), ms: suma(mejor.k, manos.length) },
  };
}

// ---- Lo que dice la pantalla de cada jugada ------------------------------------------------------------------------------------------------
// El texto chico de la placa ("Anuncia", "Duda"...): aceptar no se llama "Anuncia", y una jugada que puso el juego lo dice.
export function rolDeJugada(beat) {
  if (beat?.reemplazo) return 'Jugada del juego';
  if (beat?.tipo === 'defensa') return beat.pasos?.some((p) => p.tipo === 'pliega') ? 'Se retira' : 'Iguala';
  return { anuncio: 'Anuncia', acepta: 'Acepta', duda: 'Duda' }[beat?.tipo] ?? '';
}

// El titulo de la caja de la apuesta (Mayor o menor): si la apuesta la puso el juego por una respuesta ilegal no se le atribuye a la IA.
export function etiquetaDeApuesta(beat, nombre) {
  return { titulo: beat?.reemplazo ? `El juego apuesta por ${nombre}` : `${nombre} apuesta` };
}

// La frase sobre el recuadro del anuncio ("Claude duda"); alerta = se pinta en rojo. Si la jugada la puso el juego no se le atribuye a la IA.
export function etiquetaDeJugada(beat, nombre) {
  if (!beat?.tipo) return { texto: '', alerta: false };
  if (beat.reemplazo) return { texto: `El juego juega por ${nombre}`, alerta: false };
  if (beat.tipo === 'defensa') {
    return beat.pasos?.some((p) => p.tipo === 'pliega') ? { texto: `${nombre} se retira`, alerta: true } : { texto: `${nombre} iguala la subida`, alerta: false };
  }
  const texto = { anuncio: `${nombre} anuncia`, acepta: `${nombre} acepta y sube`, duda: `${nombre} duda` }[beat.tipo] ?? '';
  return { texto, alerta: beat.tipo === 'duda' };
}

// ---- Varios archivos a la vez ------------------------------------------------------------------------------------------------------------
// ?archivo=a.json,b.json (o el boton "Abrir JSON" con varios archivos) carga todos; la escena deja elegir una partida de la lista.

export const listaDeArchivos = (texto) => (typeof texto === 'string' ? [...new Set(texto.split(',').map((x) => x.trim()).filter(Boolean))] : []);

// cargados = [{ nombre, datos (el JSON ya leido, o null), error? }]. Devuelve una entrada por partida de cada archivo, en orden:
// { clave, archivo, numero (1 = la primera del archivo), juego, titulo, manos, valida, motivo, partida }. Solo valen las de un juego con escena (lineas.js) que traen rondas;
// las demas quedan en la lista, marcadas, para que se vea por que no se pueden reproducir.
export function catalogarPartidas(cargados) {
  const entradas = [];
  for (const c of Array.isArray(cargados) ? cargados : []) {
    const archivo = typeof c?.nombre === 'string' ? c.nombre : 'archivo';
    const datos = c?.datos;
    const partidas = datos && typeof datos === 'object' && Array.isArray(datos.partidas) ? datos.partidas : null;
    if (!partidas?.length) {
      const motivo = datos == null ? (c?.error ?? 'no se pudo leer') : 'no trae partidas';
      entradas.push({ clave: `${archivo}#0`, archivo, numero: null, juego: null, titulo: archivo, manos: 0, valida: false, motivo, partida: null });
      continue;
    }
    partidas.forEach((partida, i) => {
      const id = partida?.juego?.id ?? datos.juego?.id;
      const rondas = Array.isArray(partida?.rondas) ? partida.rondas : [];
      // el campo que numera cada registro lo dice la unidad del juego: Duda y apuesta cuenta manos y Mayor o menor rondas (ahi `mano` es la mano de cartas del jugador, no un numero)
      const unidad = juegosConEscena().includes(id) ? escenaDe(id).unidad : 'mano';
      const campo = juegosConEscena().includes(id) ? escenaDe(id).campo ?? unidad : unidad; // el campo con que sus registros numeran la unidad
      const manos = rondas.reduce((m, r) => Math.max(m, Number(r?.[campo]) || 0), 0);
      const motivo = motivoDeNoReproducible(id, partida);
      const nombres = (Array.isArray(partida?.jugadores) ? partida.jugadores : []).map((j) => j?.nombre ?? '?').join(' vs ');
      const titulo = `${archivo} · Partida ${i + 1} — ${nombres} · ${manos} ${manos === 1 ? unidad : `${unidad}s`}${partida?.truncada === true ? ' · cortada' : ''}`;
      entradas.push({ clave: `${archivo}#${i + 1}`, archivo, numero: i + 1, juego: id ?? null, titulo, manos, valida: motivo === null, motivo, partida: motivo === null ? partida : null });
    });
  }
  return entradas;
}

// La partida que se abre al cargar: la pedida ({ archivo, numero }) si sirve y, si no, la primera que sirva (null si ninguna).
export function primeraValida(catalogo, preferida = null) {
  const validas = Array.isArray(catalogo) ? catalogo.filter((e) => e.valida) : [];
  if (!validas.length) return null;
  return (preferida && validas.find((e) => e.archivo === preferida.archivo && e.numero === preferida.numero)) || validas[0];
}
