// Solo eventos públicos, en su orden original. Nunca leer la instantánea del
// final de un turno para anticipar sus revelaciones, ni datos privados/resultados.
import { duracion } from './linea-comun.js';
import { nombreRol, ROLES_LOBO } from './lobo-arte.js';
import { crearNarrador } from './narracion-lobo.js';
import { mezclarCasas } from './lobo-casas.js';
import { nombresDeEscena, etiquetaAsiento, traducirAsientos } from './lobo-nombres.js';
export const JUGADORES_TOPE = 12, RONDAS_TOPE = 6, CAMARA_POR_DEFECTO = 0;
export const MIN_MS = { preparacion: 6500, noche: 3600, enamorados: 3600, amanecer: 3000, muerte: 4000, disparo: 3200, mensaje: 3200, votacion: 5000, final: 6500, identidad: 5000, elenco: 10000 };
const copiar = (x) => structuredClone(x);
const listas = (x) => Array.isArray(x) ? x : [];
const asientoValido = (x, n) => Number.isInteger(x) && x >= 0 && x < n;

export function fragmentarMensaje(texto, max = 120) {
  let resto = String(texto ?? '').trim();
  const partes = [];
  while (resto.length > max) {
    const espacio = resto.lastIndexOf(' ', max);
    const corte = espacio > max / 2 ? espacio : max;
    partes.push(resto.slice(0, corte)); resto = resto.slice(corte).trimStart();
  }
  if (resto) partes.push(resto);
  return partes.length ? partes : [''];
}

export function construirLineaDeTiempo(partida) {
  const registros = listas(partida?.rondas), n = partida?.jugadores?.length;
  if (!registros.length || ![8, 12].includes(n)) return [];
  const nombres = nombresDeEscena(partida.jugadores.map((j) => j?.nombre));
  const nombre = (i) => nombres[i] ?? 'Jugador'; // lo que se dice y se subtitula: solo el nombre del modelo (con letra si se repite), nunca el numero de asiento
  const hecho = (i) => `${nombre(i)} · ${etiquetaAsiento(i)}`; // el hecho visible (`lineas`) conserva el numero real del asiento
  const narrador = crearNarrador({ nombre, nombres: partida.jugadores.map((j) => j.nombre) });
  const estado = { jugadores: Array.from({ length: n }, (_, asiento) => ({ asiento, vivo: true })), enamorados: [], declaraciones: [], fin: false };
  const beats = [], noches = new Set();
  // `texto`: el hecho visible; `voz`: lo que recibe el narrador cuando lo dice tal cual (las citas de los mensajes), sin numeros de asiento.
  const crear = (tipo, r, registro, texto, paso, antes = copiar(estado), voz = texto) => {
    const lineas = texto ? [{ tipo: 'hecho', texto }] : [];
    const { dicho, mudas } = narrador.contar({ tipo, ronda: r.ronda, paso, texto: voz });
    const narracion = dicho.map((l) => l.texto).join(' ');
    beats.push({ id: `lobo-${r.ronda}-${beats.length}-${tipo}`, mano: r.ronda, registro, tipo, asiento: paso.asiento ?? null, camara: [],
      texto: narracion, lineas, dicho, mudas, minMs: duracion(MIN_MS[tipo], narracion), reemplazo: false,
      pasos: [{ tipo: 'estado', ...antes }, copiar(paso), { tipo: 'estado-final', ...copiar(estado) }] });
  };
  const comprobar = (asiento, rolReal) => {
    const d = estado.declaraciones.findLast((d) => d.asiento === asiento);
    return d ? { ronda: d.ronda, rolDeclarado: d.rol, rolReal, coincide: d.rol === rolReal } : null;
  };
  const primero = registros.find((r) => r?.publico && Number.isInteger(r.ronda));
  if (primero) crear('preparacion', primero, registros.indexOf(primero), 'La aldea se prepara para dormir.', { tipo: 'preparacion', habitantes: n, casas: mezclarCasas(n, partida.seed) });
  for (const [indice, r] of registros.entries()) {
    if (!r?.publico || !Number.isInteger(r.ronda)) continue;
    if (!noches.has(r.ronda) && ['cupido', 'lobos', 'bruja', 'vidente'].includes(r.fase)) {
      noches.add(r.ronda);
      crear('noche', r, indice, `Noche ${r.ronda}. La aldea duerme; alguien recorre sus calles.`, { tipo: 'noche' });
    }
    const eventos = listas(r.publico.eventos);
    // el narrador elige que acusaciones lee en voz alta: ya con los asientos citados convertidos en nombres, igual que se leeran
    if (r.fase === 'dia') narrador.prepararDia(eventos.map((e) => (e?.tipo === 'mensaje' && typeof e.mensaje === 'string' ? { ...e, mensaje: traducirAsientos(e.mensaje, nombre, n) } : e)));
    for (const e of eventos) {
      if (!e || typeof e !== 'object') continue;
      const antes = copiar(estado), valido = (i) => asientoValido(i, n);
      switch (e.tipo) {
        case 'enamorados': {
          // Lobo 1.3.0: el evento trae SOLO lo que el modo del seed revela (`asientos` = la pareja, `cupido` = quien es Cupido; sin ninguno, `revela: 'nada'`).
          // Un evento sin `revela` es de lobo 1.2.0 y trae las dos cosas.
          const conPareja = e.asientos !== undefined, conCupido = valido(e.cupido);
          if (conPareja && (e.asientos?.length !== 2 || !e.asientos.every(valido))) break;
          if (!conPareja && !conCupido && e.revela !== 'nada') break;
          if (conPareja) estado.enamorados = [...e.asientos];
          if (conCupido) estado.jugadores[e.cupido].rol = 'cupido';
          const unidos = conPareja ? `${hecho(e.asientos[0])} y ${hecho(e.asientos[1])} quedan unidos: si uno muere, el otro también.` : '';
          const texto = conCupido ? `${hecho(e.cupido)} se revela como Cupido. ${unidos || 'Ya ha elegido a sus enamorados en secreto.'}` : unidos || 'Cupido ha elegido a dos enamorados. Nadie sabe quiénes son.';
          crear('enamorados', r, indice, texto, { tipo: 'enamorados', ...(conPareja ? { asientos: [...e.asientos] } : {}), ...(conCupido ? { cupido: e.cupido } : {}) }, antes); break;
        }
        case 'amanecer':
          crear('amanecer', r, indice, eventos.some((e) => e.tipo === 'muerte') ? 'Amanece en la aldea.' : 'Amanece en la aldea. Nadie ha muerto esta noche.', { tipo: 'amanecer', hayMuertes: eventos.some((e) => e.tipo === 'muerte') }); break;
        case 'muerte': {
          if (!valido(e.asiento) || !Object.hasOwn(ROLES_LOBO, e.rol)) break;
          estado.jugadores[e.asiento] = { ...estado.jugadores[e.asiento], vivo: false, rol: e.rol };
          const comprobacion = comprobar(e.asiento, e.rol);
          const causa = { amor: 'muere por su vínculo de amor', voto: 'es expulsado por la aldea', disparo: 'cae por el disparo del cazador', veneno: 'muere por el veneno', noche: 'muere durante la noche' }[e.causa] ?? 'muere';
          // La primera muerte de un enamorado descubre la pareja cuando el modo la ocultaba (lobo 1.3.0).
          const pareja = valido(e.pareja) && e.pareja !== e.asiento ? e.pareja : null;
          if (pareja !== null) estado.enamorados = [e.asiento, pareja];
          crear('muerte', r, indice, `${hecho(e.asiento)} ${causa}. Su rol era ${nombreRol(e.rol)}.${pareja !== null ? ` Era uno de los enamorados: su pareja es ${hecho(pareja)}.` : ''}`, { tipo: 'muerte', asiento: e.asiento, rol: e.rol, causa: e.causa, ...(pareja !== null ? { pareja } : {}), ...(comprobacion ? { comprobacion } : {}) }, antes); break;
        }
        case 'disparo':
          if (valido(e.asiento) && valido(e.objetivo)) crear('disparo', r, indice, `${hecho(e.asiento)}, el cazador, dispara a ${hecho(e.objetivo)}.`, { tipo: 'disparo', asiento: e.asiento, objetivo: e.objetivo });
          break;
        case 'mensaje': {
          if (!valido(e.asiento)) break;
          const afirmaRol = Object.hasOwn(ROLES_LOBO, e.afirmaRol) ? e.afirmaRol : null;
          const nuevaDeclaracion = afirmaRol && afirmaRol !== estado.jugadores[e.asiento].afirmaRol;
          if (afirmaRol) {
            estado.declaraciones.push({ asiento: e.asiento, ronda: r.ronda, rol: afirmaRol });
            estado.jugadores[e.asiento].afirmaRol = afirmaRol;
          }
          // los asientos que cita el modelo («asiento 5») se vuelven nombres antes de partir el mensaje en tarjetas: ni la voz ni la tarjeta dicen un numero de asiento
          const partes = fragmentarMensaje(traducirAsientos(e.mensaje, nombre, n));
          const dice = (quien) => (mensaje) => (mensaje ? `${quien(e.asiento)} dice: «${mensaje}»` : `${quien(e.asiento)} guarda silencio.`);
          // «X dice» solo abre el mensaje: las tarjetas que lo continúan (2/4, 3/4...) se leen sin repetirlo, para que la voz no corte la frase
          partes.forEach((mensaje, i) => crear('mensaje', r, indice, dice(hecho)(mensaje), { tipo: 'mensaje', asiento: e.asiento, mensaje, parte: i + 1, total: partes.length, ...(i === 0 && nuevaDeclaracion ? { afirmaRol } : {}) }, i === 0 ? antes : copiar(estado), i === 0 ? dice(nombre)(mensaje) : `«${mensaje}»`));
          break;
        }
        case 'votacion': {
          const votos = listas(e.votos).filter((v) => valido(v?.asiento) && valido(v?.voto)).map(({ asiento, voto }) => ({ asiento, voto }));
          const expulsado = valido(e.expulsado) ? e.expulsado : null;
          crear('votacion', r, indice, e.empate ? 'La votación termina en empate. Nadie es expulsado.' : expulsado !== null ? `La aldea vota. ${hecho(expulsado)} recibe más votos y será expulsado.` : 'La aldea muestra sus votos.',
            { tipo: 'votacion', votos, conteo: listas(e.conteo).slice(0, n), empate: e.empate === true, expulsado }); break;
        }
        case 'final': {
          if (partida.truncada === true || e.roles?.length !== n || !e.roles.every((r) => Object.hasOwn(ROLES_LOBO, r))) break;
          estado.fin = true; estado.ganadorBando = e.ganadorBando; estado.puntos = listas(e.puntos).slice(0, n);
          estado.jugadores = estado.jugadores.map((j, i) => ({ ...j, rol: e.roles[i] }));
          const texto = e.ganadorBando === 'aldea' ? 'La aldea gana: no quedan lobos.' : e.ganadorBando === 'lobos' ? 'Los lobos ganan: no quedan otros habitantes.' : e.motivo === 'extincion' ? 'La aldea queda vacía. Empate.' : 'Se alcanza el tope de rondas. Empate entre bandos.';
          // Si la pareja seguía oculta, el final la nombra (el evento `final` de lobo 1.3.0 trae `enamorados`).
          const secreta = estado.enamorados.length === 0 && listas(e.enamorados).length === 2 && e.enamorados.every(valido);
          if (secreta) estado.enamorados = [...e.enamorados];
          const parejaViva = estado.enamorados.length === 2 && estado.enamorados.every((i) => estado.jugadores[i].vivo);
          const revelada = secreta && parejaViva ? [...estado.enamorados] : null;
          crear('final', r, indice, `${texto} Se revelan todas las identidades.${revelada ? ` Los enamorados eran ${hecho(revelada[0])} y ${hecho(revelada[1])}, y sobreviven: ganan su bono.` : parejaViva ? ' Los dos enamorados sobreviven y ganan su bono.' : ''}`, { tipo: 'final', ganadorBando: e.ganadorBando, motivo: e.motivo, parejaViva, ...(revelada ? { pareja: revelada } : {}) }, antes);
          for (const j of estado.jugadores.filter((j) => j.vivo)) {
            const comprobacion = comprobar(j.asiento, j.rol);
            if (comprobacion) crear('identidad', r, indice, `${hecho(j.asiento)} revela su identidad.`, { tipo: 'identidad', asiento: j.asiento, rol: j.rol, comprobacion });
          }
          crear('elenco', r, indice, 'La aldea revela su elenco completo.', { tipo: 'elenco', jugadores: copiar(estado.jugadores) }); break;
        }
      }
    }
  }
  return beats;
}

export function beatsDeEstado(beats, max = 6) {
  return listas(beats).flatMap((b, i) => b.tipo === 'noche' && b.mano > 1 ? [i] : []).slice(0, max);
}
export function erroresDeEstado(visible, beat) {
  if (!visible) return ['La escena no informó su estado.'];
  const esperado = beat?.pasos?.find((p) => p.tipo === 'estado-final');
  if (!esperado) return ['Falta el estado público esperado.'];
  const errores = [];
  if (JSON.stringify(visible.jugadores) !== JSON.stringify(esperado.jugadores)) errores.push('Las identidades o muertes visibles no corresponden a este momento.');
  if (beat.tipo === 'noche' && (visible.votos || visible.mensaje)) errores.push('Quedaron votos o mensajes del día anterior.');
  return errores;
}
export function mejoresRondas(partida, n = 3) {
  const pesos = { muerte: 2, disparo: 3, enamorados: 1, final: 4 };
  const rondas = new Map();
  for (const b of construirLineaDeTiempo(partida)) {
    const r = rondas.get(b.mano) ?? { ronda: b.mano, puntos: 0, motivos: [] };
    if (pesos[b.tipo]) { r.puntos += pesos[b.tipo]; if (!r.motivos.includes(b.tipo)) r.motivos.push(b.tipo); }
    rondas.set(b.mano, r);
  }
  return [...rondas.values()].sort((a, b) => b.puntos - a.puntos || a.ronda - b.ronda).slice(0, n);
}
