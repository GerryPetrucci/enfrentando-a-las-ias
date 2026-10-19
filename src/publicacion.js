// Que se publica de cada serie y cuando (politica del usuario, 19 de octubre de 2026):
//   - Los datos completos de una partida NO se publican hasta que se sube su parte FINAL (donde se dice el resultado).
//   - Cuando se sube cualquier otra parte, la serie aparece en el sitio como «por publicarse»: su seed y los fragmentos de la conversacion entre modelos y de los prompts
//     hasta donde llega lo subido (nada del resultado, ni de lo que viene despues).
//   - Una partida cuya parte 1 aun no se sube aparece solo con su seed.
// Todo es puro (se prueba en Node): `herramientas/publicar.mjs` lee y escribe los archivos; aqui solo se decide que va en cada uno.
//
// El registro (data/publicas/registro.json, versionado) guarda por serie y partida el estado y las partes subidas:
//   { series: { [etiqueta]: { partidas: { [n]: { estado: 'por-publicarse' | 'publicada', hastaTurno, partes: [{ parte, hastaTurno, final, fecha }] } } } } }

export const POR_PUBLICARSE = 'por-publicarse';
export const PUBLICADA = 'publicada';

// Lo UNICO que sale de una partida a medio publicar. Todo lo demas (puntos, ganador, orden, metricas, duracion, tokens, avisos, cuantos turnos tuvo en total...) adelanta el resultado.
const CLAVES_PARCIALES = ['seed', 'juego', 'jugadores', 'mapa', 'reinos', 'rotacion', 'invertido', 'rondas'];

export const numeroDeRonda = (r, i) => (Number.isInteger(r?.turno) ? r.turno : Number.isInteger(r?.ronda) ? r.ronda : i + 1);
export const ultimaRonda = (partida) => (Array.isArray(partida?.rondas) && partida.rondas.length ? numeroDeRonda(partida.rondas.at(-1), partida.rondas.length - 1) : 0);

// ¿Una parte que llega hasta `hastaTurno` es la FINAL de la partida (la que dice el resultado)? Si la partida se corto antes de terminar, no hay parte final.
export const esParteFinal = (partida, hastaTurno) => partida?.truncada !== true && Number.isInteger(hastaTurno) && ultimaRonda(partida) >= 1 && hastaTurno >= ultimaRonda(partida);

const copia = (x) => structuredClone(x);

// La partida tal como se ve mientras esta por publicarse: solo hasta `hastaTurno` y sin nada del resultado. `prompts` (opcional) ya viene recortado por quien lo pide.
export function partidaParcial(partida, hastaTurno, prompts = null) {
  const base = Object.fromEntries(CLAVES_PARCIALES.filter((k) => partida?.[k] !== undefined).map((k) => [k, copia(partida[k])]));
  const rondas = (Array.isArray(partida?.rondas) ? partida.rondas : []).filter((r, i) => numeroDeRonda(r, i) <= hastaTurno);
  return { ...base, rondas: copia(rondas), truncada: true, parcial: { hastaTurno: Math.max(0, hastaTurno) }, estadoPublicacion: POR_PUBLICARSE, ...(prompts ? { prompts } : {}) };
}

export const partidaCompleta = (partida, prompts = null) => ({ ...copia(partida), estadoPublicacion: PUBLICADA, ...(prompts ? { prompts } : {}) });

// El registro de una serie despues de subir una parte. No cambia el que recibe. `final`: la parte dice el resultado de la partida.
export function registrarParte(registro, { etiqueta, partida, parte, hastaTurno, final, fecha }) {
  const r = copia(registro ?? { series: {} });
  r.series ??= {};
  r.series[etiqueta] ??= { partidas: {} };
  const actual = r.series[etiqueta].partidas[partida] ?? { estado: POR_PUBLICARSE, hastaTurno: 0, partes: [] };
  const partes = [...actual.partes.filter((p) => p.parte !== parte), { parte, hastaTurno, final: final === true, fecha }].sort((a, b) => a.parte - b.parte);
  r.series[etiqueta].partidas[partida] = { estado: final === true ? PUBLICADA : POR_PUBLICARSE, hastaTurno: Math.max(actual.hastaTurno, hastaTurno), partes };
  return r;
}

// La serie lista para publicar: cada partida segun su estado en el registro (publicada: completa; por publicarse: hasta lo subido; sin partes: solo su seed).
// `crudo` es el archivo completo de la serie; `porPartida(n, hastaTurno|null)` devuelve los prompts reconstruidos (o null si el juego no los sabe reconstruir); `sistema` es el prompt de sistema.
export function armarSeriePublica(crudo, registroSerie, { sistema = null, porPartida = () => null } = {}) {
  const partidas = (Array.isArray(crudo?.partidas) ? crudo.partidas : []).map((p, i) => {
    const n = i + 1, reg = registroSerie?.partidas?.[n] ?? null;
    if (reg?.estado === PUBLICADA) return partidaCompleta(p, porPartida(n, null));
    return partidaParcial(p, reg?.hastaTurno ?? 0, reg?.hastaTurno ? porPartida(n, reg.hastaTurno) : null);
  });
  const todas = partidas.length > 0 && partidas.every((p) => p.estadoPublicacion === PUBLICADA);
  const { partidas: _crudas, evaluacion, ...resto } = crudo ?? {};
  return {
    ...copia(resto),
    prompt: { ...(crudo?.prompt ?? {}), ...(sistema ? { sistema } : {}) },
    publicacion: { estado: todas ? PUBLICADA : POR_PUBLICARSE, partidas: copia(registroSerie?.partidas ?? {}) },
    ...(todas && evaluacion ? { evaluacion: copia(evaluacion) } : {}),
    partidas,
  };
}
