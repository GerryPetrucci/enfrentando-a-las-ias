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

// Los tipos de pieza para la frase del cierre (cierre.js): `cierre=parte` en la direccion. final = la parte que llega al ultimo turno; parte = una que deja el juego a medias; clip; gancho.
export const TIPOS_DE_CIERRE = ['final', 'parte', 'clip', 'gancho'];

// Una ruta de este mismo sitio (voz/ep1.json): letras, numeros, punto, guion y barras, sin subir de carpeta. Nunca una URL de otro dominio: la pagina esta publicada
// y ?voz= o un voz.json ajeno podrian hacer sonar cualquier audio de internet.
export const esRutaRelativa = (texto) => typeof texto === 'string' && /^[\w.-]+(\/[\w.-]+)*$/.test(texto) && !texto.split('/').includes('..');

// El audio de la voz que esta sonando: una sola a la vez. Sonar otra, o abrir otra partida, corta la anterior (si no, la voz de la partida vieja seguiria sonando sobre la nueva).
// `fabrica` crea el audio (en la pagina, new Audio); un audio que no se puede crear o reproducir (el navegador lo bloquea) no tumba la reproduccion: se queda sin voz.
export function crearReproductorDeVoz(fabrica = (src) => new Audio(src), { separado = false } = {}) {
  let actual = null;
  let contexto = null, fuente = null, canal = null;
  const detener = () => { try { actual?.pause(); fuente?.disconnect(); } catch { /* ya estaba parado */ } actual = null; fuente = null; };
  const sonar = (src, vel = 1) => {
    detener();
    try {
      actual = fabrica(src);
      if (separado) {
        const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
        contexto ??= new AC();
        if (!canal) { canal = contexto.createStereoPanner(); canal.pan.value = -1; canal.connect(contexto.destination); }
        fuente = contexto.createMediaElementSource(actual); fuente.connect(canal);
        contexto.resume()?.catch?.(() => {});
      }
      actual.playbackRate = vel;
      actual.play()?.catch?.(() => {});
    } catch { actual = null; }
  };
  return { sonar, detener };
}

// Los margenes de la grabacion con OBS (modo grabar=1): la pagina arranca sola al refrescar la fuente, asi que empieza en negro (margen), se aclara (fundido), cuenta la partida y
// vuelve a negro (fundido) y se queda en negro (cola) hasta que se cierra. Un solo lugar: la pagina, el paquete, las capturas y el recortador (que deriva de aqui lo minimo que busca) leen estos tiempos.
export const FUNDIDOS = { margenMs: 2000, fundidoMs: 500, colaMs: 2000 };

// Lo que dura todo lo grabado: margen + fundido de entrada + contenido + fundido de salida + cola. `contenidoMs` ya viene a la velocidad de reproduccion (marcarTiempos con vel); los margenes
// y fundidos NO dependen de ella: son del grabador (el recortador los busca por su duracion), no de la partida. Basura -> contenido cero.
export function planDeGrabacion(contenidoMs) {
  const contenido = Number.isFinite(contenidoMs) && contenidoMs > 0 ? contenidoMs : 0;
  const { margenMs, fundidoMs, colaMs } = FUNDIDOS;
  return { margenMs, fundidoMs, contenidoMs: contenido, colaMs, totalMs: margenMs + fundidoMs + contenido + fundidoMs + colaMs };
}

// ms -> segundos con un decimal como mucho (2000 -> 2, 500 -> 0.5): los textos de los margenes salen de FUNDIDOS.
export const segundos = (ms) => Number((ms / 1000).toFixed(1));

// La direccion de la escena para abrirla y grabar una pieza (rondas desde..hasta): sin barra (limpio=1), arranca sola (auto=1) y con margenes y fundidos de negro (grabar=1). La usan el paquete
// (su LEEME) y herramientas/partes.mjs; `formato` por omision es la hoja maestra de 4K del OBS del proyecto.
export function direccionDeGrabacion({ archivo, partida = 1, desde, hasta, formato = 'hoja', voz = null, cierre = null }) {
  // cierre=1: la tarjeta final con el logo y las redes (cierre.js); con `cierre` (final | parte | clip) la pagina sabe que frase le toca a la pieza (sin ella la deduce: llega al ultimo turno o no)
  const q = new URLSearchParams({ archivo, partida: String(partida), ronda: String(desde), hasta: String(hasta), formato, auto: '1', limpio: '1', grabar: '1', cierre: TIPOS_DE_CIERRE.includes(cierre) ? cierre : '1' });
  if (voz) q.set('voz', voz);
  return `escena.html?${q}`;
}

// La direccion para grabar el gancho «Próximamente» de una parte (gancho.js): los cortes son unidades (manos, rondas o turnos) de la partida. El gancho no se narra: con `voz` la pagina usa solo
// el audio del cierre (cierre.js: vozSoloCierre), nunca el de los cortes.
export function direccionDeGancho({ archivo, partida = 1, cortes, parte = 1, de = 2, formato = 'hoja', voz = null }) {
  const q = new URLSearchParams({ archivo, partida: String(partida), gancho: '1', cortes: (cortes ?? []).join(','), parte: String(parte), de: String(de), formato, auto: '1', limpio: '1', grabar: '1', cierre: 'gancho' });
  if (voz) q.set('voz', voz);
  return `escena.html?${q}`;
}

// ?archivo=NOMBRE.json (en data/) &partida=N (1 = la primera) &mano=A &hasta=B (clip por manos) &formato=9x16|16x9|hoja &camara=0..9 (a cuantos se les ve lo oculto; sin ella, el valor del juego)
// &sonido=0 (apaga efectos y voz) &vel=2 &razon=1 &auto=1 &limpio=1 &grabar=1 (con auto y sin detener: margenes y fundidos de negro para grabar) &voz=voz.json &escala=1 (por defecto la escena se ajusta a la ventana)
export function leerParametros(search) {
  const q = new URLSearchParams(search ?? '');
  const mano = Math.max(1, entero(q.get('mano') ?? q.get('ronda') ?? q.get('turno')) ?? 1); // ronda= y turno= son sinonimos de mano= (los juegos que juegan por rondas o por turnos)
  const hastaPedida = entero(q.get('hasta'));
  const vel = Number(q.get('vel'));
  const camara = entero(q.get('camara'));
  const escala = Number(q.get('escala'));
  const auto = bandera(q.get('auto'));
  return {
    archivo: q.get('archivo') || null,
    partida: Math.max(1, entero(q.get('partida')) ?? 1),
    mano,
    hasta: hastaPedida !== null && hastaPedida >= mano ? hastaPedida : Infinity,
    formato: FORMATOS_PAGINA.includes(q.get('formato')) ? q.get('formato') : '9x16',
    camara: camara !== null && camara >= 0 && camara <= 9 ? camara : null, // null = el valor por defecto del juego (lineas.js)
    sonido: q.get('sonido') !== '0' && q.get('sonido') !== 'false',
    audioSeparado: q.get('audio') === 'separado', // voz izquierda, efectos derecha; solo para la maestra de OBS
    vel: Number.isFinite(vel) && vel > 0 ? Math.min(8, Math.max(0.25, vel)) : 1,
    razon: bandera(q.get('razon')),
    auto,
    // grabar con margenes y fundidos: sin auto la pagina no arranca sola y una captura que se detiene en un beat (detener=) no espera ni se funde, asi que no hay nada que enmarcar.
    // El script de escena.html (que deja la pagina en negro antes de que cargue nada) aplica esta misma regla: una prueba las ata.
    grabar: auto && bandera(q.get('grabar')) && !q.has('detener'),
    detener: entero(q.get('detener')), // para capturas: avanza al instante hasta ese beat y se queda ahi (null = reproduccion normal)
    limpio: bandera(q.get('limpio')),
    voz: esRutaRelativa(q.get('voz')) ? q.get('voz') : null,
    escala: Number.isFinite(escala) && escala > 0 ? escala : 'ajustar',
    // gancho=1&cortes=10,6,14&parte=2&de=2: el gancho «Próximamente» de una parte (gancho.js). null = una pieza normal.
    cierre: bandera(q.get('cierre')), // cierre=1: se agrega al final la tarjeta con el logo, los @ de las redes y la pagina de resultados (cierre.js)
    tipoCierre: TIPOS_DE_CIERRE.includes(q.get('cierre')) ? q.get('cierre') : null, // cierre=parte|final|clip|gancho: que frase le toca a la pieza; null (cierre=1) = la pagina lo deduce
    gancho: bandera(q.get('gancho')) ? { cortes: cortesDe(q.get('cortes')), parte: Math.max(1, entero(q.get('parte')) ?? 1), de: Math.max(1, entero(q.get('de')) ?? 2) } : null,
  };
}

const MAX_CORTES_URL = 8;
// "10,6,14" -> [10, 6, 14]: enteros positivos, sin repetir, en el orden pedido y a lo mas MAX_CORTES_URL.
function cortesDe(texto) {
  const unidades = [];
  for (const x of String(texto ?? '').split(',')) {
    const n = /^\d+$/.test(x.trim()) ? Number(x) : null;
    if (n >= 1 && !unidades.includes(n)) unidades.push(n);
  }
  return unidades.slice(0, MAX_CORTES_URL);
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

// Cuantos momentos con algo que decir NO tienen su voz en `voz` (voz.json): la voz es de otra partida, o se narro antes de un cambio del texto (los ids de los beats cambian cuando cambia cuantos hay). Se
// grabarian sin voz sin que nada lo diga (con limpio=1 el aviso de la pagina queda oculto): el paquete y partes.mjs lo avisan. Sin voz (nada o vacia) no hay de que avisar: 0.
export function momentosSinVoz(beats, voz) {
  if (!hayVoz(voz)) return 0;
  return (Array.isArray(beats) ? beats : []).filter((b) => b?.texto && !entradaDeVoz(voz, b)).length;
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
// Un beat con `vel` propia (los cortes del gancho de gancho.js van acelerados) dura lo suyo entre esa velocidad Y la de la pagina; duracionDeBeat no la cuenta: la mesa la aplica sola.
export function marcarTiempos(beats, voz, vel = 1) {
  let t = 0;
  return (Array.isArray(beats) ? beats : []).map((b) => {
    const propia = Number.isFinite(b?.vel) && b.vel > 0 ? b.vel : 1, pagina = Number.isFinite(vel) && vel > 0 ? vel : 1;
    const duracion = duracionDeBeat(b, voz, pagina * propia);
    const marca = { id: b.id, mano: b.mano, tipo: b.tipo, texto: b.texto, inicioMs: t, finMs: t + duracion };
    t += duracion;
    return marca;
  });
}

// Cada juego se publica en DOS partes (decidido el 17 de octubre de 2026): dos clips de rondas contiguos (`ronda=A&hasta=B` y `ronda=C&hasta=D`) con la duracion mas pareja que permiten las
// rondas enteras. El final de la partida cae en la segunda. Con una sola ronda no hay como partir (null). Con voz (voz.json) usa lo que dura cada audio.
export function dividirEnDos(beats, voz = null, corteTras = null) {
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
  if (corteTras !== null) {
    const indice = manos.indexOf(corteTras);
    if (!Number.isInteger(corteTras) || indice < 0 || indice === manos.length - 1) throw new Error('El corte editorial debe ser una unidad existente anterior a la última.');
    mejor.k = indice + 1;
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
