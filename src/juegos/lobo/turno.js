import { activosDe } from './estado.js';
import { bandoDe, ROLES } from './constantes.js';
import { normalizarRespuesta } from './ordenes.js';
import { vistaCamara } from './vista.js';

const vivos = (E, i = null) => E.vivos.flatMap((v, j) => v && j !== i ? [j] : []);
const objetivoValido = (E, j, i) => Number.isInteger(j) && E.vivos[j] === true && j !== i;
const evento = (E, tipo, datos = {}) => E.eventos.push({ ronda: E.ronda, tipo, ...datos });
const acierto = (E, i) => { E.puntos[i]++; E.stats[i].aciertos++; };

const LARGO_CRUDO = 400; // caracteres de la respuesta cruda que se guardan cuando una respuesta fue invalida (igual que Guerra, Duda y apuesta y La Fuga)
// Lo recibido, corto y con comillas: "3" (texto) no es 3 (numero), y eso es justo lo que suele fallar.
const ver = (v) => { const t = JSON.stringify(v); return t === undefined ? 'nada' : t.length > 40 ? `${t.slice(0, 40)}…` : t; };

// Por que un objetivo no sirve (null si sirve). Misma regla que objetivoValido: entero, vivo y, si `yo` no es null, distinto de quien elige.
function motivoDeObjetivo(E, j, yo, campo = 'objetivo') {
  if (!Number.isInteger(j)) return `${campo} debe ser un asiento entero (recibió ${ver(j)})`;
  if (j < 0 || j >= E.vivos.length) return `${campo}: el asiento ${j} no existe (hay ${E.vivos.length})`;
  if (E.vivos[j] !== true) return `${campo}: el asiento ${j} ya murió`;
  if (j === yo) return `${campo}: no puede elegirse a sí mismo (asiento ${j})`;
  return null;
}
const motivoDeAccion = (r, esperada) => (r.accion === esperada ? null : `accion debe ser "${esperada}" (recibió ${ver(r.accion)})`);

// null si la respuesta es valida; si no, el motivo en una frase (se guarda en el registro privado, junto al texto crudo, para analizar despues por que fallan los modelos).
export function motivoInvalido(E, i, r) {
  if (r.error) return `error de API: ${r.error}`;
  if (r.invalida) return 'la respuesta no era un objeto JSON';
  switch (E.fase) {
    case 'cupido': {
      if (!Array.isArray(r.enamorados) || r.enamorados.length !== 2) return `enamorados debe ser una lista de 2 asientos (recibió ${ver(r.enamorados)})`;
      if (r.enamorados[0] === r.enamorados[1]) return `los dos enamorados deben ser distintos (recibió ${ver(r.enamorados)})`;
      return motivoDeObjetivo(E, r.enamorados[0], null, 'enamorados') ?? motivoDeObjetivo(E, r.enamorados[1], null, 'enamorados');
    }
    case 'lobos':
      return motivoDeAccion(r, 'matar') ?? motivoDeObjetivo(E, r.objetivo, i) ?? (E.roles[r.objetivo] === 'lobo' ? `objetivo: el asiento ${r.objetivo} es de la manada` : null);
    case 'vidente': return motivoDeAccion(r, 'inspeccionar') ?? motivoDeObjetivo(E, r.objetivo, i);
    case 'bruja': {
      if (typeof r.salvar !== 'boolean') return `salvar debe ser true o false (recibió ${ver(r.salvar)})`;
      if (r.salvar && !E.pociones.salvar) return 'quiso salvar pero la poción de salvar ya se usó';
      if (r.salvar && E.victima === null) return 'quiso salvar pero esta noche no hay víctima';
      if (r.matar === null) return null;
      if (!Number.isInteger(r.matar)) return `matar debe ser null o un asiento entero (recibió ${ver(r.matar)})`;
      return !E.pociones.matar ? 'quiso envenenar pero la poción de matar ya se usó' : motivoDeObjetivo(E, r.matar, i, 'matar');
    }
    case 'cazador': return motivoDeAccion(r, 'disparar') ?? motivoDeObjetivo(E, r.objetivo, i);
    case 'dia':
      if (typeof r.mensaje === 'string' && r.mensaje.length > 1000) return `mensaje de ${r.mensaje.length} caracteres: el máximo es 1000`;
      return motivoDeObjetivo(E, r.voto, i, 'voto')
        ?? (typeof r.mensaje !== 'string' ? `mensaje debe ser texto (recibió ${ver(r.mensaje)})` : null)
        ?? (r.afirmaRol === undefined || ROLES.includes(r.afirmaRol) ? null : `afirmaRol debe ser uno de ${ROLES.join(', ')} (recibió ${ver(r.afirmaRol)})`);
    default: return `fase desconocida: ${E.fase}`;
  }
}

function reemplazar(E, i) {
  const [a, b] = E.reemplazos[E.historial.length][i];
  const elegir = (lista, dado = a) => lista[Math.floor(dado * lista.length)];
  const otros = vivos(E, i);
  switch (E.fase) {
    case 'cupido': { const x = elegir(vivos(E)); return { enamorados: [x, elegir(vivos(E, x), b)] }; }
    case 'lobos': return { accion: 'matar', objetivo: elegir(otros.filter((j) => E.roles[j] !== 'lobo')) };
    case 'bruja': return { salvar: false, matar: null };
    case 'vidente': return { accion: 'inspeccionar', objetivo: elegir(otros) };
    case 'cazador': return { accion: 'disparar', objetivo: elegir(otros) };
    case 'dia': return { mensaje: '', voto: elegir(otros) };
  }
}

function comprobarDeclaracion(E, asiento) {
  const declaracion = E.declaraciones.findLast((d) => d.asiento === asiento);
  return declaracion ? { ronda: declaracion.ronda, rolDeclarado: declaracion.rol, rolReal: E.roles[asiento], coincide: declaracion.rol === E.roles[asiento] } : null;
}

// Todas las víctimas directas caen antes de propagar amor y disparos.
function morir(E, muertes) {
  const cola = [...muertes];
  while (cola.length) {
    const { asiento: i, causa } = cola.shift();
    if (!E.vivos[i]) continue;
    E.vivos[i] = false;
    const comprobacion = comprobarDeclaracion(E, i);
    evento(E, 'muerte', { asiento: i, rol: E.roles[i], causa, ...(comprobacion ? { comprobacion } : {}) });
    if (E.roles[i] === 'cazador') E.cazadoresPendientes.push(i);
    if (E.enamorados.includes(i)) {
      const pareja = E.enamorados.find((j) => j !== i);
      if (E.vivos[pareja] && !cola.some((m) => m.asiento === pareja)) cola.push({ asiento: pareja, causa: 'amor' });
    }
  }
}

function cerrarSiCorresponde(E, tope = false, motivoCorte = null) {
  const restantes = vivos(E), lobos = restantes.filter((i) => E.roles[i] === 'lobo');
  const ganador = motivoCorte || !restantes.length ? null : !lobos.length ? 'aldea' : lobos.length === restantes.length ? 'lobos' : null;
  if (!ganador && restantes.length && !tope && !motivoCorte) return false;
  E.fin = true;
  E.fase = 'fin';
  E.ganadorBando = ganador;
  E.motivoFin = motivoCorte ?? (!restantes.length ? 'extincion' : ganador ? 'eliminacion' : 'tope');
  E.roles.forEach((rol, i) => {
    if (ganador && bandoDe(rol) === ganador) E.puntos[i] += 10;
    if (E.enamorados.includes(i) && E.enamorados.every((j) => E.vivos[j])) E.puntos[i] += 5;
  });
  evento(E, 'final', { ganadorBando: ganador, motivo: E.motivoFin, roles: [...E.roles], puntos: [...E.puntos],
    comprobaciones: E.roles.flatMap((_, asiento) => { const c = comprobarDeclaracion(E, asiento); return c ? [{ asiento, ...c }] : []; }) });
  return true;
}

// Cierre administrativo sin decisiones inventadas ni inválidas imputadas.
// Un cazador pendiente impide adjudicar victoria por una eliminación anterior:
// la fase incompleta cierra en empate, como cualquier límite sin resolución.
export function cerrarPorLimiteLlamadas(E, corte) {
  if (E.fin) throw new Error('La partida ya terminó.');
  const fase = E.fase, desde = E.eventos.length;
  cerrarSiCorresponde(E, true, 'llamadas');
  const registro = { turno: E.historial.length + 1, ronda: E.ronda, fase,
    cortePorLlamadas: structuredClone(corte),
    publico: { eventos: structuredClone(E.eventos.slice(desde)), camara: vistaCamara(E) },
    privado: { acciones: [] }, invalidas: E.roles.map(() => null),
  };
  E.historial.push(registro);
  return registro;
}

function despuesMuertes(E, destino) {
  if (E.cazadoresPendientes.length && vivos(E).length) {
    E.despuesCazador = destino;
    E.fase = 'cazador';
    return;
  }
  E.cazadoresPendientes = [];
  if (cerrarSiCorresponde(E, destino === 'noche' && E.ronda >= E.maxRondas)) return;
  if (destino === 'noche') { E.ronda++; E.victima = null; E.veneno = null; E.salvada = false; E.fase = 'lobos'; }
  else E.fase = 'dia';
}

// Avanza pasos sin actores sin consumir llamadas ni crear turnos vacíos.
function avanzar(E) {
  while (!E.fin && !activosDe(E).some(Boolean)) {
    if (E.fase === 'bruja') E.fase = 'vidente';
    else if (E.fase === 'vidente') amanecer(E);
    else throw new Error(`Fase sin actores: ${E.fase}`);
  }
}

function amanecer(E) {
  evento(E, 'amanecer');
  morir(E, [
    ...(E.victima !== null && !E.salvada ? [{ asiento: E.victima, causa: 'noche' }] : []),
    ...(E.veneno !== null ? [{ asiento: E.veneno, causa: 'veneno' }] : []),
  ]);
  despuesMuertes(E, 'dia');
}

export function aplicarTurno(E, respuestas = []) {
  if (E.fin) throw new Error('La partida ya terminó.');
  const fase = E.fase, ronda = E.ronda, desde = E.eventos.length;
  const actores = activosDe(E).flatMap((a, i) => a ? [i] : []);
  const acciones = actores.map((i) => {
    const original = normalizarRespuesta(respuestas[i]);
    const motivo = motivoInvalido(E, i, original);
    const invalida = motivo !== null;
    const accion = invalida ? reemplazar(E, i) : original;
    E.stats[i].acciones++;
    if (invalida) E.stats[i].invalidas++;
    // Guardar solo campos del contrato, sin datos arbitrarios suministrados por el modelo. La unica excepcion es una respuesta INVALIDA: ahi se guarda
    // el motivo y el principio del texto crudo, para poder analizar despues por que fallan los modelos (es del registro privado: la escena no lo lee).
    const claves = { cupido: ['enamorados'], lobos: ['accion', 'objetivo'], bruja: ['salvar', 'matar'], vidente: ['accion', 'objetivo'], cazador: ['accion', 'objetivo'], dia: ['mensaje', 'voto', ...(accion.afirmaRol !== undefined ? ['afirmaRol'] : [])] }[fase];
    return { asiento: i, ...Object.fromEntries(claves.map((k) => [k, structuredClone(accion[k])])), invalida,
      ...(invalida ? { motivo, crudo: typeof original.crudo === 'string' ? original.crudo.slice(0, LARGO_CRUDO) : null } : {}) };
  });
  const a = acciones[0];
  switch (fase) {
    case 'cupido': E.enamorados = [...a.enamorados]; E.cupidoRevelado = a.asiento; evento(E, 'enamorados', { asientos: [...E.enamorados], cupido: a.asiento }); E.fase = 'lobos'; break;
    case 'lobos': E.victima = acciones.every((x) => x.objetivo === a.objetivo) ? a.objetivo : null; E.fase = 'bruja'; break;
    case 'bruja':
      E.salvada = a.salvar; E.veneno = a.matar;
      if (a.salvar) { E.pociones.salvar = false; if (E.roles[E.victima] !== 'lobo') acierto(E, a.asiento); }
      if (a.matar !== null) { E.pociones.matar = false; if (E.roles[a.matar] === 'lobo') acierto(E, a.asiento); }
      E.fase = 'vidente'; break;
    case 'vidente': {
      // Todas decidieron desde la vista previa a la fase. Resolver cada
      // inspección en su memoria privada antes de aplicar muertes nocturnas.
      for (const x of acciones) {
        const esLobo = E.roles[x.objetivo] === 'lobo';
        E.inspecciones[x.asiento].push({ ronda, objetivo: x.objetivo, esLobo });
        if (esLobo) acierto(E, x.asiento);
      }
      amanecer(E); break;
    }
    case 'cazador':
      E.cazadoresPendientes.shift();
      evento(E, 'disparo', { asiento: a.asiento, objetivo: a.objetivo });
      if (E.roles[a.objetivo] === 'lobo') acierto(E, a.asiento);
      morir(E, [{ asiento: a.objetivo, causa: 'disparo' }]);
      despuesMuertes(E, E.despuesCazador); break;
    case 'dia': {
      const conteo = E.roles.map(() => 0);
      for (const x of acciones) {
        conteo[x.voto]++;
        if (x.afirmaRol !== undefined) E.declaraciones.push({ asiento: x.asiento, ronda, rol: x.afirmaRol });
        evento(E, 'mensaje', { asiento: x.asiento, mensaje: x.mensaje, ...(x.afirmaRol !== undefined ? { afirmaRol: x.afirmaRol } : {}) });
        if (E.roles[x.asiento] !== 'lobo' && E.roles[x.voto] === 'lobo') acierto(E, x.asiento);
      }
      const max = Math.max(...conteo), candidatos = conteo.flatMap((n, i) => n === max ? [i] : []);
      for (const i of actores) if (E.roles[i] === 'lobo' && !candidatos.includes(i)) acierto(E, i);
      evento(E, 'votacion', { votos: acciones.map((x) => ({ asiento: x.asiento, voto: x.voto })), conteo, empate: candidatos.length !== 1, expulsado: candidatos.length === 1 ? candidatos[0] : null });
      if (candidatos.length === 1) morir(E, [{ asiento: candidatos[0], causa: 'voto' }]);
      despuesMuertes(E, 'noche'); break;
    }
  }
  avanzar(E);
  const registro = { turno: E.historial.length + 1, ronda, fase,
    publico: { eventos: structuredClone(E.eventos.slice(desde)), camara: vistaCamara(E) },
    privado: { acciones, ...(fase === 'lobos' ? { victima: E.victima } : {}), ...(fase === 'vidente' ? { inspecciones: acciones.map((x) => ({ asiento: x.asiento, ...structuredClone(E.inspecciones[x.asiento].at(-1)) })) } : {}) },
    invalidas: E.roles.map((_, i) => acciones.find((x) => x.asiento === i)?.invalida ?? null),
  };
  E.historial.push(registro);
  return registro;
}
