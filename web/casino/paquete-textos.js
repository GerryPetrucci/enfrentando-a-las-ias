// El paquete de publicacion de una partida guardada: las piezas que se graban (las dos partes y hasta 3 clips destacados), la direccion exacta de cada una para abrirla y grabarla, y el
// texto de cada red (TikTok, Instagram, Facebook, YouTube y X). Funcion PURA sobre lo que ya esta guardado: solo hechos (quien jugo, el resultado, el seed, las reglas publicas del juego); la linea de
// gancho va marcada `[GANCHO: ...]` con una sugerencia sacada de los datos, para que alguien la confirme o la cambie. Nunca lleva un mensaje privado ni la razon de una IA, y los hashtags de
// modelos son solo de quienes juegan. Lo escribe a disco herramientas/paquete.mjs. Sin DOM ni red.

import { claveDeCierre, duracionDeCierre } from './cierre.js';
import { dividirEnDos, duracionDeBeat, formatoDeTiempo, planDeGrabacion, direccionDeGrabacion, direccionDeGancho, marcarTiempos, momentosSinVoz } from './escena-config.js';
import { elegirCortes, armarGancho } from './gancho.js';
import { direccionDeGanchoImagen, ARTE_GANCHO } from './gancho-imagen.js';
import { escenaDe, juegosConEscena } from './lineas.js';
import { textoDeJuego } from './textos-juego.js';
import { CLIPS_POR_PARTE, publicacionDePieza, ordenDePublicacion } from './editorial-paquete.js';

// Lo que admite cada red (por verificar de nuevo en privado/contenido/guia-paso-a-paso.md); el paquete se queda siempre por debajo.
export const LIMITES = { x: 280, tiktok: 2200, instagram: 2200, youtubeTitulo: 100, youtubeDescripcion: 5000 };
const AVISO = 'Contenido generado por IA. Proyecto independiente, sin afiliación con los proveedores de los modelos.';
const AVISO_CORTO = 'Generado por IA · Proyecto independiente';
const MIN_CLIP_MS = 20000, MAX_CLIP_MS = 40000, MAX_VIDEO_MS = 180000; // conservar el aviso editorial existente de tres minutos
const MODELOS = [[/^(claude|haiku)/, '#Claude'], [/^(gpt|luna)/, '#ChatGPT'], [/^(gemini|flash)/, '#Gemini'], [/^deepseek/, '#DeepSeek'], [/^llama/, '#Llama']];
const UNIDADES = { mano: 'Mano', ronda: 'Ronda', turno: 'Turno' };
const PUNTOS_EN_PANTALLA = ['fuga', 'conquista']; // los juegos cuyo final muestra los mismos puntos que guarda `partida.puntos`
const MAX_INVALIDAS = 0.25; // desde esta fraccion de jugadas invalidas por llamada se avisa de un modelo caido o que no responde bien

// #IAvsIA, los del juego y los de los modelos que juegan (descriptivos), nunca mas de 5.
export function hashtagsDe(textos, jugadores) {
  const modelos = [];
  for (const j of Array.isArray(jugadores) ? jugadores : []) for (const [re, h] of MODELOS) if (typeof j?.id === 'string' && re.test(j.id) && !modelos.includes(h)) modelos.push(h);
  return [...new Set(['#IAvsIA', ...(textos?.hashtags ?? []), ...modelos])].slice(0, 5);
}

// La ventana de unidades (manos, rondas o turnos) de un clip: parte de la unidad elegida y la extiende con las siguientes y luego con las anteriores hasta pasar `minMs` sin pasar `maxMs`.
// `desdeIndice` es la primera unidad que se puede usar (1 deja fuera la primera, que lleva la tarjeta de arranque) y `hastaIndice` la ultima (la ultima unidad de la partida trae el beat final con el resultado). `ajustada` dice si cayo entre los dos limites. null si la unidad no existe.
export function ventanaDeClip(beats, mano, { minMs = MIN_CLIP_MS, maxMs = MAX_CLIP_MS, voz = null, desdeIndice = 0, hastaIndice = Infinity } = {}) {
  const lista = Array.isArray(beats) ? beats : [];
  const unidades = [...new Set(lista.map((b) => b.mano))];
  const i0 = unidades.indexOf(mano);
  if (i0 < 0 || i0 < desdeIndice || i0 > hastaIndice) return null;
  const msDe = new Map(unidades.map((m) => [m, 0])); // lo que dura cada unidad, sumado una sola vez
  for (const b of lista) msDe.set(b.mano, msDe.get(b.mano) + duracionDeBeat(b, voz, 1));
  const dur = (m) => msDe.get(m);
  let a = i0, z = i0, ms = dur(mano);
  while (ms < minMs) {
    if (z + 1 < unidades.length && z + 1 <= hastaIndice && ms + dur(unidades[z + 1]) <= maxMs) { z++; ms += dur(unidades[z]); }
    else if (a - 1 >= desdeIndice && ms + dur(unidades[a - 1]) <= maxMs) { a--; ms += dur(unidades[a]); }
    else break;
  }
  return { mano: unidades[a], hasta: unidades[z], ms: Math.round(ms), ajustada: ms >= minMs && ms <= maxMs };
}

// Acorta la sugerencia de gancho para que el texto completo quepa en `limite` (con `resto` caracteres de lo demas).
const cabeGancho = (sug, resto, limite) => {
  const tope = Math.max(10, limite - resto - '[GANCHO: ]'.length);
  return sug.length <= tope ? sug : `${sug.slice(0, tope - 1).trimEnd()}…`;
};

// partida: la partida guardada · beats: armarLinea(...) · destacadas: destacadasDe(...) · rutaVoz: la voz.json (con `voz` ya leida) · totalPartidas: cuantas trae el archivo (una serie)
// -> { juego, piezas: [{ id, tipo, titulo, grabar: { url, desde, hasta, ms, plan, nota }, textos: { tiktok, instagram, facebook, x, youtube: { titulo, descripcion } }, comentarioFijado }], advertencias }
//    (grabar.plan = planDeGrabacion de la pieza: margen de negro + fundido + la pieza + fundido + cola)
// Una partida que no se puede publicar da `piezas: []` y el motivo (nunca lanza). `formato` por omision es la hoja maestra de 4K del OBS del proyecto.
export function construirPaquete({ partida, beats, destacadas = [], archivo, partidaNumero = 1, juegoNumero = null, voz = null, rutaVoz = null, formato = 'hoja', enlace = '', totalPartidas = 1, clipsPorParte = null, corteTras = null, momentosClips = null } = {}) {
  const juego = partida?.juego?.id ?? null, t = textoDeJuego(juego), advertencias = [];
  const vacio = (motivo) => ({ juego, piezas: [], advertencias: [...advertencias, motivo] });
  if (!partida || typeof partida !== 'object') return vacio('no hay partida');
  if (!t) return vacio(`no hay textos públicos para el juego "${juego}"`);
  if (partida.truncada === true) return vacio('la partida está cortada (truncada): no se publica una partida a medias');
  const lista = Array.isArray(beats) ? beats : [];
  const partes = dividirEnDos(lista, voz, corteTras);
  if (!partes) return vacio('la partida es muy corta para partirla en dos videos');

  for (const [n, p] of [[1, partes.parte1], [2, partes.parte2]]) {
    if (p.ms > MAX_VIDEO_MS) advertencias.push(`La parte ${n} dura ${formatoDeTiempo(p.ms)}: pasa de 3 minutos (el límite de los Shorts y de los Reels recomendados). Considera partir este juego en más partes o recortar al editar.`);
  }
  const sinVoz = momentosSinVoz(lista, voz);
  if (sinVoz) advertencias.push(`La voz (voz.json) no cubre ${sinVoz} ${sinVoz === 1 ? 'momento' : 'momentos'} con texto de esta partida: se grabarian sin voz. ¿Se narró antes de un cambio del texto? Corre herramientas/narrar.mjs otra vez y regenera el paquete con --forzar.`);
  if (formato !== 'hoja') advertencias.push(`El formato es ${formato}: la dirección abre la escena a ese tamaño, pero el LEEME y el recorte suponen la hoja maestra de 3840 × 2160 (--formato=hoja, el valor por omisión). Úsalo solo para probar la escena.`);
  const jugadores = Array.isArray(partida.jugadores) ? partida.jugadores : [];
  const nombres = jugadores.map((j, i) => j?.nombre ?? `Jugador ${i + 1}`);
  if (jugadores.some((j) => j?.tipo !== 'modelo')) advertencias.push('Esta partida tiene jugadores de control (bots), no solo modelos de IA: sirve para probar, no es la que se publica como episodio.');
  jugadores.forEach((j, i) => {
    const invalidas = partida.metricas?.[i]?.jugadasInvalidas, llamadas = partida.usoPorJugador?.[i]?.llamadas;
    if (j?.tipo === 'modelo' && Number.isFinite(invalidas) && Number.isFinite(llamadas) && llamadas > 0 && invalidas / llamadas >= MAX_INVALIDAS) {
      advertencias.push(`${nombres[i]} tuvo ${invalidas} jugadas inválidas en ${llamadas} llamadas: un modelo caído o que no responde bien. Los fallos se publican tal cual, pero decide si esta partida sirve como episodio.`);
    }
  });
  if (juego === 'fuga' && totalPartidas < 2) advertencias.push('La Fuga se publica siempre como serie con los asientos rotados: esta partida sola no es la que se publica.');

  const hayGanador = Number.isInteger(partida.ganador) && partida.ganador >= 0 && partida.ganador < nombres.length && partida.empate !== true;
  const ganador = hayGanador ? nombres[partida.ganador] : null;
  const puntos = Array.isArray(partida.puntos) ? partida.puntos : [];
  const ranking = nombres.map((n, i) => ({ n, p: puntos[i] })).filter((x) => Number.isFinite(x.p)).sort((a, b) => b.p - a.p).map((x) => `${x.n} ${x.p}`).join(' · ');
  const ordenFinal = (Array.isArray(partida.orden) ? partida.orden : []).filter((i) => nombres[i] !== undefined).map((i) => nombres[i]).join(' · ');
  const resultado = hayGanador ? `En esta partida ganó ${ganador}.` : 'Esta partida terminó en empate.';
  // solo se escriben cifras que el video muestra: los puntos del juego en La Fuga y en Guerra de territorios; en los demas juegos `puntos` es el marcador (4/2/0) y no sale en pantalla: ahi va el orden final
  const lineaPuntos = PUNTOS_EN_PANTALLA.includes(juego) ? (ranking ? `Puntos: ${ranking}.` : '') : (ordenFinal ? `Orden final: ${ordenFinal}.` : '');
  const nota = 'Una partida suelta no es un ranking: es lo que pasó con estas reglas y este seed.';
  const serie = totalPartidas > 1 ? `Partida ${partidaNumero} de ${totalPartidas} de la serie. ` : '';
  const hashtags = hashtagsDe(t, jugadores), tags = (n) => hashtags.slice(0, n).join(' ');
  const unidad = juegosConEscena().includes(juego) ? UNIDADES[escenaDe(juego).unidad] ?? 'Ronda' : 'Ronda';
  const metodologia = enlace ? `Marcador y metodología: ${enlace}` : '';
  const mismoPrompt = `Seed ${partida.seed}. Mismo prompt para todas las IAs; las jugadas son las que registró el motor, sin retoques.`;

  const textosDe = ({ sug, encabezado, parte, tipo }) => {
    const dicho = parte === 2 ? `${resultado} ` : '';
    const final = parte === 2 ? [resultado, lineaPuntos] : []; // el resultado solo sale en la parte 2
    const gancho = (resto, limite) => `[GANCHO: ${cabeGancho(sug, resto, limite)}]`;
    const cuerpo = tipo === 'clip' ? `${t.nombre}: un momento de la partida. La partida completa está en el perfil.` : `${encabezado}. ${serie}${dicho}Lo que se mira: ${t.mide}.`;
    const tiktok = [`[GANCHO: ${sug}]`, cuerpo, AVISO_CORTO, tags(5)].join('\n');
    const detalle = tipo === 'clip' ? [`${t.nombre}: un momento de la partida.`, `${t.regla} ${t.gana}`, 'La partida completa está en el perfil.']
      : [`${encabezado}. ${serie}`.trim(), `${t.regla} ${t.gana}`, ...final, `Lo que se mira: ${t.mide}.`];
    const instagram = [`[GANCHO: ${sug}]`, '', ...detalle.filter(Boolean), '', AVISO, '', tags(5)].join('\n');
    // Facebook (la pagina): lo mismo que Instagram, pero con el enlace al marcador (una publicacion de pagina si puede llevarlo) y menos hashtags
    const facebook = [`[GANCHO: ${sug}]`, '', ...detalle.filter(Boolean), '', metodologia, '', AVISO, '', tags(3)].filter((l, i, a) => !(l === '' && (i === 0 || a[i - 1] === ''))).join('\n');
    const armarResto = (conResultado) => `\n${encabezado}. ${conResultado ? dicho : ''}${AVISO_CORTO}\n${tags(2)}`; // en un clip el encabezado es el nombre del juego y `dicho` es vacio
    const conResultado = armarResto(true);
    const restoX = conResultado.length <= LIMITES.x - 80 ? conResultado : armarResto(false); // con un nombre larguisimo el resultado no cabe: X lo omite (las otras redes lo llevan)
    const x = `${gancho(restoX.length, LIMITES.x)}${restoX}`;
    const colaTitulo = ` | ${encabezado}`;
    const titulo = `${gancho(colaTitulo.length, LIMITES.youtubeTitulo)}${colaTitulo}`;
    const descripcion = [
      tipo === 'clip' ? `${t.nombre}: un momento de la partida.` : `${encabezado}${serie ? ` · ${serie.trim()}` : ''}`, '',
      `Cómo se juega: ${t.regla}`, `Cómo se gana: ${t.gana}`, `Lo que se mira: ${t.mide}.`, '',
      ...final, nota, mismoPrompt, metodologia, '', AVISO, tags(5),
    ].filter((l, i, a) => !(l === '' && (i === 0 || a[i - 1] === ''))).join('\n');
    return { tiktok, instagram, facebook, x, youtube: { titulo, descripcion } };
  };
  const comentarioFijado = `Cómo se mide: todas las IAs reciben el mismo prompt (seed ${partida.seed}) y las jugadas no se retocan: lo que ves es lo que registró el motor, sin retoques. ${nota} ${metodologia}\n¿A quién ponemos contra quién la próxima vez?`.trim();

  const piezas = [];
  const intro = lista.find((b) => b.tipo === 'intro'), introMs = intro ? duracionDeBeat(intro, voz, 1) : 0;
  // lo que hay que saber para grabar una pieza: la direccion de la escena, sus rondas, lo que dura y el plan de la grabacion (con los margenes de negro)
  // la pieza termina con el cierre (cierre.js: logo, redes y pagina de resultados): lo que dura se suma a lo que dura la pieza
  // `cierre` = el tipo de la pieza para la frase final (cierre.js): parte (deja el juego a medias), final (la parte que lo termina) o clip
  const grabarDe = (desde, hasta, ms, nota, cierre) => {
    const total = Math.round(ms + duracionDeCierre(claveDeCierre({ seed: partida.seed, partida: partidaNumero, desde, hasta }), voz, cierre));
    return { url: direccionDeGrabacion({ archivo, partida: partidaNumero, desde, hasta, formato, voz: rutaVoz, cierre }), desde, hasta, ms: total, plan: planDeGrabacion(total), nota };
  };
  for (const [n, p] of [[1, partes.parte1], [2, partes.parte2]]) {
    const sug = n === 1 ? `${nombres.length} IAs juegan ${t.nombre}: ¿quién gana?` : hayGanador ? (partida.ganoPorMaravilla === true ? `Ganó ${ganador} por la Maravilla` : partida.extincionMutua === true ? `Ganó ${ganador} tras una extinción mutua` : `Ganó ${ganador}`) : 'Terminó en empate';
    piezas.push({
      id: `parte-${n}`, tipo: 'parte', parte: n, titulo: `${t.nombre} · Parte ${n} de 2`, cierre: n === 2 ? 'final' : 'parte',
      grabar: grabarDe(p.mano, p.hasta, p.ms, n === 1 ? `Empieza con la tarjeta de arranque (${(introMs / 1000).toFixed(0)} s).` : 'Sin tarjeta de arranque.', n === 2 ? 'final' : 'parte'),
      textos: textosDe({ sug, encabezado: `${t.nombre} · Parte ${n} de 2`, parte: n, tipo: 'parte' }), comentarioFijado,
    });
  }

  const clips = [], unidades = [...new Set(lista.map((b) => b.mano))];
  const cupos = clipsPorParte ?? CLIPS_POR_PARTE[juego] ?? [1, 1];
  if (!Array.isArray(cupos) || cupos.length !== 2 || cupos.some((n) => !Number.isInteger(n) || n < 0 || n > 3)) return vacio('clipsPorParte requiere dos enteros entre 0 y 3');
  for (const [indice, rango] of [partes.parte1, partes.parte2].entries()) {
    let elegidos = 0;
    for (const d of Array.isArray(destacadas) ? destacadas : []) {
      if (elegidos >= cupos[indice]) break;
      if (!(d?.puntos > 0) || d.unidad < rango.mano || d.unidad > rango.hasta) continue;
      if (momentosClips && !momentosClips.includes(d.unidad)) continue;
      const w = ventanaDeClip(lista, d.unidad, { voz, desdeIndice: Math.max(1, unidades.indexOf(rango.mano)), hastaIndice: Math.min(unidades.length - 2, unidades.indexOf(rango.hasta)) });
      if (w && !clips.some(({ w: o }) => !(w.hasta < o.mano || w.mano > o.hasta))) { clips.push({ w, d, parte: indice + 1 }); elegidos++; }
    }
    if (elegidos < cupos[indice]) advertencias.push(`Parte ${indice + 1}: ${elegidos} clips de ${cupos[indice]} previstos; no hay suficientes momentos distintos sin spoilers.`);
  }
  clips.sort((a, b) => a.parte - b.parte || a.w.mano - b.w.mano);
  clips.forEach(({ w, d, parte }, i) => {
    const etiqueta = w.mano === w.hasta ? `${unidad} ${w.mano}` : `${unidad}s ${w.mano} a ${w.hasta}`;
    const motivos = (d.motivos ?? []).join(', ');
    piezas.push({
      id: `clip-${i + 1}`, tipo: 'clip', parte, titulo: `${t.nombre} · ${etiqueta}`, cierre: 'clip',
      grabar: grabarDe(w.mano, w.hasta, w.ms, `${etiqueta}${motivos ? ` · motivos: ${motivos}` : ''}${w.ajustada ? '' : ` · fuera de ${MIN_CLIP_MS / 1000} a ${MAX_CLIP_MS / 1000} s (una unidad de este juego ya dura ${Math.round(w.ms / 1000)} s): recórtalo al momento clave al editar`}`, 'clip'),
      textos: textosDe({ sug: `${etiqueta}: el momento más intenso`, encabezado: t.nombre, parte: 0, tipo: 'clip' }), comentarioFijado: null,
    });
  });
  // los ganchos «Proximamente» (gancho.js), uno por parte, para subirlos ANTES de esa parte: cortes rapidos de momentos de esa parte, sin voz (la musica la pone quien lo sube) y sin resultado.
  // REGLA (25 de octubre de 2026): ninguna parte se queda sin gancho. Si no hay al menos 2 cortes buenos para uno en video (Lobo en la aldea, o cualquier juego sin momentos con puntos),
  // el gancho es una IMAGEN fija (gancho-imagen.js): «Próximamente», el nombre del juego, su numero de juego (jN) y el de la parte, con el arte del juego si lo tiene.
  const juegoN = Number.isInteger(juegoNumero) && juegoNumero >= 1 ? juegoNumero : partidaNumero;
  for (const [n, p] of [[1, partes.parte1], [2, partes.parte2]]) {
    const cortes = elegirCortes({ beats: lista, destacadas, rango: p });
    const enImagen = cortes.length < 2;
    if (enImagen) advertencias.push(`No hay momentos buenos para armar el gancho de la parte ${n} en video (menos de 2 cortes que quepan): se genera el gancho de la parte ${n} como IMAGEN (regla del proyecto: ninguna parte sale sin gancho).`);
    const encabezado = enImagen ? `${t.nombre} · Juego ${juegoN} · Parte ${n} de 2` : `${t.nombre} · Partida ${partidaNumero} · Parte ${n} de 2`;
    const sug = n === 1 ? `Próximamente: ${nombres.length} IAs se enfrentan en ${t.nombre}` : `Próximamente: la parte 2 de ${t.nombre}`;
    const cuerpo = `Próximamente: ${encabezado}. Síguenos para no perdértela.`;
    const gancho = (resto, limite) => `[GANCHO: ${cabeGancho(sug, resto, limite)}]`;
    const restoX = `\n${cuerpo}\n${AVISO_CORTO}\n${tags(2)}`, colaTitulo = ` | Próximamente: ${t.nombre} · Parte ${n} de 2`;
    const textos = {
      tiktok: [`[GANCHO: ${sug}]`, cuerpo, AVISO_CORTO, tags(5)].join('\n'),
      instagram: [`[GANCHO: ${sug}]`, '', cuerpo, '', AVISO, '', tags(5)].join('\n'),
      facebook: [`[GANCHO: ${sug}]`, '', cuerpo, '', AVISO, '', tags(3)].join('\n'),
      x: `${gancho(restoX.length, LIMITES.x)}${restoX}`,
      youtube: { titulo: `${gancho(colaTitulo.length, LIMITES.youtubeTitulo)}${colaTitulo}`, descripcion: [cuerpo, '', AVISO, tags(5)].join('\n') },
    };
    if (enImagen) {
      piezas.push({
        id: `gancho-${n}`, tipo: 'gancho-imagen', parte: n, titulo: `${t.nombre} · Gancho de la parte ${n} (imagen)`,
        // Una imagen no se graba: `url` es la pagina que la dibuja (sirve para verla en el navegador) y no hay plan de grabacion.
        grabar: { url: direccionDeGanchoImagen({ juegoId: juego, juegoNumero: juegoN, parte: n, de: 2, formato: '9x16' }), desde: null, hasta: null, ms: 0, plan: null,
          nota: `Imagen fija «Próximamente · Juego ${juegoN} · Parte ${n} de 2»${ARTE_GANCHO[juego] ? ' con el arte del juego' : ' (el juego aún no tiene arte registrado: lleva solo la marca)'}. Se sube antes de la parte ${n}.` },
        textos, comentarioFijado: null,
      });
      continue;
    }
    const ms = marcarTiempos(armarGancho(lista, cortes, { juegoId: juego, partidaNumero, parte: n, de: 2 }), null, 1).at(-1).finMs + duracionDeCierre(claveDeCierre({ seed: partida.seed, partida: partidaNumero, gancho: n }), voz, 'gancho');
    piezas.push({
      id: `gancho-${n}`, tipo: 'gancho', parte: n, titulo: `${t.nombre} · Gancho de la parte ${n}`, cierre: 'gancho',
      grabar: {
        url: direccionDeGancho({ archivo, partida: partidaNumero, cortes: cortes.map((c) => c.unidad), parte: n, de: 2, formato, voz: rutaVoz }), desde: null, hasta: null, ms: Math.round(ms), plan: planDeGrabacion(Math.round(ms)),
        nota: `La voz solo dice el cierre (los cortes no se narran): ponle tu música al subirlo (nada con derechos). Cortes: ${cortes.map((c) => `${c.etiqueta} (${unidad.toLowerCase()} ${c.unidad})`).join(', ')}. Se sube antes de la parte ${n}.`,
      },
      textos, comentarioFijado: null,
    });
  }
  for (const p of piezas) p.publicacion = publicacionDePieza(p, { beats: lista, nombres, seed: partida.seed, juego: t.nombre, juegoNumero: juegoN, unidad, enlace, destacadas });
  return { juego, piezas, ordenPublicacion: ordenDePublicacion(piezas).map((p) => p.id), advertencias };
}
