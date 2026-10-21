// Los nombres de los videos que se suben y la carpeta de cada serie (decidido el 20 de octubre de 2026). Puro: sin disco ni red.
//
//   j1_pt1_9x16_fb-ig-tk-yt.mp4
//   |  |   |    '-- redes a las que ese archivo sirve (siglas de REDES, orden alfabetico; salen de FORMATOS)
//   |  |   '------- formato
//   |  '----------- pieza: hkN = gancho «Proximamente» (hook) de la parte N, ptN = parte N, clpN = clip N (se sube en ese orden)
//   '-------------- numero de juego (una partida jugada y empaquetada): sube de uno en uno en cada juego nuevo de la carpeta del juego (elegirJuego); sin fecha
//
// La grabacion original de OBS lleva el mismo nombre SIN formato ni redes (j1_pt1.mkv): sus recortes quedan juntos y se reconocen de un vistazo. El paquete de cada juego se llama paquete-jN.
// Cada serie vive en grabaciones/listos/<juego>/<AAAA-MM-DD>_seed-<seed>/ con una subcarpeta por estado (SUBCARPETAS); `grabaciones/` no se versiona.

import { FORMATOS } from './formatos.mjs';

export const REDES = { fb: 'Facebook', ig: 'Instagram', tk: 'TikTok', x: 'X', yt: 'YouTube' };
// originales: lo que graba OBS · por-subir: los recortes listos · subidos: los que ya se subieron (se mueven a mano o cuando avisas) · revision: textos para revisar las partidas
export const SUBCARPETAS = ['originales', 'por-subir', 'subidos', 'revision'];

const ABREVIATURAS = { parte: 'pt', clip: 'clp', gancho: 'hk' };

// 'parte-2' -> 'pt2', 'clip-1' -> 'clp1', 'gancho-1' -> 'hk1' (hook: el «Proximamente» que se sube antes de una parte). Un id desconocido se limpia a letras y numeros; nunca lanza ni queda vacio.
export function abreviarPieza(id) {
  const m = /^(parte|clip|gancho)-(\d+)$/.exec(String(id ?? ''));
  if (m) return `${ABREVIATURAS[m[1]]}${m[2]}`;
  return String(id ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '') || 'pieza';
}

const dosDigitos = (n) => String(n).padStart(2, '0');

// La fecha de la serie: la primera AAAA-MM-DD que se encuentre en los candidatos (el nombre del archivo de la serie, una fecha ISO...); sin ninguna, `hoy`.
export function fechaDe(...candidatos) {
  const hoy = candidatos.at(-1) instanceof Date ? candidatos.pop() : new Date();
  for (const c of candidatos) {
    const m = typeof c === 'string' ? /(\d{4})-(\d{2})-(\d{2})/.exec(c) : null;
    if (m) return { largo: `${m[1]}-${m[2]}-${m[3]}`, corto: `${m[1].slice(2)}-${m[2]}-${m[3]}` };
  }
  const aa = hoy.getFullYear();
  return { largo: `${aa}-${dosDigitos(hoy.getMonth() + 1)}-${dosDigitos(hoy.getDate())}`, corto: `${dosDigitos(aa % 100)}-${dosDigitos(hoy.getMonth() + 1)}-${dosDigitos(hoy.getDate())}` };
}

// j1_pt1: lo que comparten la grabacion original y todos sus recortes (`juego` es el numero de juego: elegirJuego).
export const nombreDePieza = ({ juego, pieza }) => `j${juego}_${abreviarPieza(pieza)}`;

// 'paquete-j12' -> 12; cualquier otra cosa -> null.
export function juegoDeCarpeta(nombre) {
  const m = /^paquete-j(\d+)$/.exec(typeof nombre === 'string' ? nombre : '');
  return m ? Number(m[1]) : null;
}

// El numero de juego (jN) de una partida que se empaqueta: el que ya tiene si su serie ya trae paquete de esa partida (regenerarlo no lo cambia) y, si no, el maximo de los que hay en el juego mas uno.
// `existentes`: [{ serie, juego, partida }] de todos los paquetes de la carpeta del juego. Datos raros se ignoran; nunca lanza.
export function elegirJuego({ existentes, serie, partida } = {}) {
  const lista = (Array.isArray(existentes) ? existentes : []).filter((e) => Number.isInteger(e?.juego) && e.juego >= 1);
  return lista.find((e) => e.serie === serie && e.partida === partida)?.juego ?? lista.reduce((m, e) => Math.max(m, e.juego), 0) + 1;
}

// Los recortes: a la base se le agregan el formato y las redes (sin extension). Un formato desconocido no inventa redes.
export function nombreDeVideo(base, formato) {
  const redes = FORMATOS[formato]?.redes ?? [];
  return [base, formato, ...(redes.length ? [redes.join('-')] : [])].join('_');
}

// 'El número solitario' -> 'el-numero-solitario'
export function slugDe(texto) {
  const s = typeof texto === 'string' ? texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : '';
  return s || 'juego';
}

// La carpeta de una serie, relativa a la raiz del proyecto y con barras normales.
export const carpetaDeSerie = ({ juego, fecha, seed }) => `grabaciones/listos/${slugDe(juego)}/${fecha.largo}_seed-${seed}`;
