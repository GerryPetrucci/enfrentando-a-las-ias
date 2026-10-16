// Lo puro del reproductor de la escena (sin DOM, para probarlo en Node): parametros de la URL, recorte del clip por manos, duracion de
// cada beat (con o sin voz) y marcas de tiempo para re-doblar.
//
// La voz (voz.json, que genera la herramienta de voz por escribir) es un objeto { "<id del beat>": { ms, archivo } }: cada beat dura lo que
// dure su audio si es mas largo que su minimo; sin voz, su minimo. Entrada ilegible no lanza: vale como "sin voz".

const entero = (v) => {
  const n = v === null || v === '' ? NaN : Number(v);
  return Number.isInteger(n) ? n : null;
};
const bandera = (v) => v !== null && v !== '' && v !== '0' && v !== 'false';

export const FORMATOS_PAGINA = ['9x16', '16x9', 'hoja']; // 'hoja' dibuja los dos formatos juntos en la hoja maestra de OBS

// ?archivo=NOMBRE.json (en data/) &partida=N (1 = la primera) &mano=A &hasta=B (clip por manos) &formato=9x16|16x9|hoja &camara=0..4 (a cuantos se les ven las cartas)
// &sonido=0 &vel=2 &razon=1 &auto=1 &limpio=1 &voz=voz.json &escala=1 (por defecto la escena se ajusta a la ventana)
export function leerParametros(search) {
  const q = new URLSearchParams(search ?? '');
  const mano = Math.max(1, entero(q.get('mano')) ?? 1);
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
    camara: camara !== null && camara >= 0 && camara <= 4 ? camara : 2,
    sonido: q.get('sonido') !== '0' && q.get('sonido') !== 'false',
    vel: Number.isFinite(vel) && vel > 0 ? Math.min(8, Math.max(0.25, vel)) : 1,
    razon: bandera(q.get('razon')),
    auto: bandera(q.get('auto')),
    limpio: bandera(q.get('limpio')),
    voz: q.get('voz') || null,
    escala: Number.isFinite(escala) && escala > 0 ? escala : 'ajustar',
  };
}

// Los beats de las manos mano..hasta. Un clip empieza al abrir su primera mano; el final de la partida va solo si el clip llega a la ultima mano.
export const recortarClip = (beats, mano, hasta) => (Array.isArray(beats) ? beats.filter((b) => b.mano >= mano && b.mano <= hasta) : []);

export const hayVoz = (voz) => !!voz && typeof voz === 'object' && Object.keys(voz).length > 0;

// Cuanto dura un beat en pantalla (ms): max(su minimo, su voz) entre la velocidad.
export function duracionDeBeat(beat, voz, vel = 1) {
  const ms = voz && typeof voz === 'object' ? voz[beat.id]?.ms : null;
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

// ---- Varios archivos a la vez ------------------------------------------------------------------------------------------------------------
// ?archivo=a.json,b.json (o el boton "Abrir JSON" con varios archivos) carga todos; la escena deja elegir una partida de la lista.

export const listaDeArchivos = (texto) => (typeof texto === 'string' ? [...new Set(texto.split(',').map((x) => x.trim()).filter(Boolean))] : []);

// cargados = [{ nombre, datos (el JSON ya leido, o null), error? }]. Devuelve una entrada por partida de cada archivo, en orden:
// { clave, archivo, numero (1 = la primera del archivo), titulo, manos, valida, motivo, partida }. Solo valen las de Duda y apuesta que traen rondas;
// las demas quedan en la lista, marcadas, para que se vea por que no se pueden reproducir.
export function catalogarPartidas(cargados) {
  const entradas = [];
  for (const c of Array.isArray(cargados) ? cargados : []) {
    const archivo = typeof c?.nombre === 'string' ? c.nombre : 'archivo';
    const datos = c?.datos;
    const partidas = datos && typeof datos === 'object' && Array.isArray(datos.partidas) ? datos.partidas : null;
    if (!partidas?.length) {
      const motivo = datos == null ? (c?.error ?? 'no se pudo leer') : 'no trae partidas';
      entradas.push({ clave: `${archivo}#0`, archivo, numero: null, titulo: archivo, manos: 0, valida: false, motivo, partida: null });
      continue;
    }
    partidas.forEach((partida, i) => {
      const id = partida?.juego?.id ?? datos.juego?.id;
      const rondas = Array.isArray(partida?.rondas) ? partida.rondas : [];
      const manos = rondas.reduce((m, r) => Math.max(m, Number(r?.mano) || 0), 0);
      let motivo = null;
      if (id !== 'dudaapuesta') motivo = `es de ${id ?? 'otro juego'}, no de Duda y apuesta`;
      else if (!rondas.length) motivo = 'sin rondas';
      const nombres = (Array.isArray(partida?.jugadores) ? partida.jugadores : []).map((j) => j?.nombre ?? '?').join(' vs ');
      const titulo = `${archivo} · Partida ${i + 1} — ${nombres} · ${manos} ${manos === 1 ? 'mano' : 'manos'}${partida?.truncada === true ? ' · cortada' : ''}`;
      entradas.push({ clave: `${archivo}#${i + 1}`, archivo, numero: i + 1, titulo, manos, valida: motivo === null, motivo, partida: motivo === null ? partida : null });
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
