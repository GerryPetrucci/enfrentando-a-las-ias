// Linea de tiempo de la escena de Triple dado: convierte los registros guardados de una partida (por ronda: UN registro de prediccion, con las tarjetas y el lanzamiento, y TRES de
// enfrentamiento, el ultimo con el cierre) en BEATS, lo que se ve y se dice en orden. La mesa (mesa-tripledado.js) los ejecuta; aqui no se decide ni se sortea nada: los dados ya
// vienen fijados en el registro (la animacion de rebote la calcula dados.js).
//
// Un beat: { id, mano, tipo, registro, asiento, camara, texto, lineas, minMs, reemplazo, pasos }   (mano es el numero de ronda: asi se llama la unidad de un clip en todas las escenas)
//   tipo      apertura | prediccion | lanzamiento | enfrentamiento (x3) | cierre | comentarios (solo si la ronda tiene) | final
//   camara    los asientos cuya tarjeta ve el publico en esa ronda (camara.js: 2 de 4 por defecto)
//   reemplazo alguna jugada del beat la puso el juego por una respuesta ilegal (la narracion del motor ya lo dice y no se atribuye a la IA)
//   pasos     los movimientos de la animacion (vocabulario fijado en el plan, tarea 3):
//     estado {puntosD[], tarjetasUsadas[][], jugando[]} (puntos en DOCEAVOS enteros: 3.33 = 40) · elegir {asiento, tarjeta | null (solo con la camara), forzada, reemplazada}
//     lanzar {blancos[][]} (los 9 blancos de cada jugador; los rojo y azul nunca se lanzan a la vista) · subir {asiento, dados[], valores[], categoria, ocultos[], reemplazada}
//     combinar {asiento, categoria, puntosD} · barra {puntosRondaD[]} · voltear {tarjetas[], sinUsar[][{color, valor}], aciertos[]} · premio {asiento, tarjeta, baseD, puntosD} · final {final}
//
// Las tarjetas se eligen en secreto: solo la camara las muestra antes del cierre. Un dado rojo o azul se conoce solo en el enfrentamiento que lo usa; los que quedan sin usar, en el cierre.
// Los comentarios del motor se dicen DESPUES del cierre de su ronda, nunca antes, en su propio beat (el cierre ya trae cuatro lineas largas y juntos no caben en los subtitulos);
// en una ronda cortada, sin cierre, van al final de lo ultimo que se conto.
// Sin DOM ni `window`: lo importan la mesa (navegador), el generador de voz y las pruebas (Node).

import { elegirCamara } from './camara.js';
import { nombrar, duracion } from './linea-comun.js';

export const RONDAS_TOPE = 4; // el tope de rondas del motor (RONDAS en src/juegos/tripledado/constantes.js): una prueba los compara
export const JUGADORES_TOPE = 4;
export const CAMARA_POR_DEFECTO = 2; // de 4 jugadores: la tarjeta de dos se ve antes del cierre
export const MIN_MS = { apertura: 1800, prediccion: 2400, lanzamiento: 4200, enfrentamiento: 4200, cierre: 4800, comentarios: 2400, final: 5000 };

const SEATS = [0, 1, 2, 3];
const aDoceavos = (puntos) => Math.round(Number(puntos) * 12); // 3.333... -> 40: exacto aunque venga como decimal
// El unico jugador con mas puntos que todos; un empate en lo alto no es lider (null): igual que liderUnico del motor.
function liderUnico(valores) {
  const max = Math.max(...valores);
  const q = valores.flatMap((v, s) => (v === max ? [s] : []));
  return q.length === 1 ? q[0] : null;
}

export function construirLineaDeTiempo(partida, { seed, camara = CAMARA_POR_DEFECTO } = {}) {
  const rondas = Array.isArray(partida?.rondas) ? partida.rondas : [];
  if (!rondas.length) return [];
  const semilla = seed ?? partida.seed;
  const n = Number.isInteger(camara) ? Math.max(0, Math.min(JUGADORES_TOPE, camara)) : CAMARA_POR_DEFECTO;
  const beats = [];
  let puntosD = [0, 0, 0, 0]; // acumulados al empezar la ronda
  let usadas = [[], [], [], []]; // tarjetas ya gastadas
  let pred = null; // el registro de prediccion de la ronda en curso
  let pendientes = []; // comentarios que esperan al cierre

  rondas.forEach((r, i) => {
    const vistas = elegirCamara(semilla, r.ronda, n, JUGADORES_TOPE);
    const lineasDe = (...tipos) => (r.narracion ?? []).filter((l) => tipos.includes(l.tipo));
    const crear = (tipo, { lineas = [], pasos = [], reemplazo = false, asiento = null, k } = {}) => {
      const dichas = lineas.map((l) => ({ tipo: l.tipo, texto: nombrar(l.texto, partida.jugadores) }));
      const texto = dichas.map((l) => l.texto).join(' ');
      beats.push({ id: `r${r.ronda}-${beats.length}-${tipo}`, mano: r.ronda, tipo, registro: i, asiento, camara: vistas, texto, lineas: dichas, minMs: duracion(MIN_MS[tipo], texto), reemplazo, pasos, ...(k ? { k } : {}) });
    };
    const estado = (puntos, tarjetas) => ({ tipo: 'estado', puntosD: [...puntos], tarjetasUsadas: tarjetas.map((x) => [...x]), jugando: [true, true, true, true] });
    const invalidas = SEATS.map((s) => r.invalidas?.[s] === true);

    if (r.fase === 'prediccion') {
      pred = r; pendientes = [];
      crear('apertura', { lineas: lineasDe('apertura'), pasos: [estado(puntosD, usadas)] });
      crear('prediccion', {
        reemplazo: invalidas.some(Boolean),
        pasos: SEATS.map((s) => ({ tipo: 'elegir', asiento: s, tarjeta: vistas.includes(s) ? r.oculto?.tarjetas?.[s] ?? null : null, forzada: r.forzada === true, reemplazada: invalidas[s] })),
      });
      crear('lanzamiento', { lineas: lineasDe('lanzamiento'), pasos: [{ tipo: 'lanzar', blancos: r.lanzamiento?.blancos ?? [] }] });
      return;
    }

    // Un enfrentamiento: cada jugador sube sus tres dados (los rojo y azul se abren aqui), se nombra la combinacion y crece la barra de la ronda.
    pendientes.push(...lineasDe('comentario'));
    crear('enfrentamiento', {
      k: r.enfrentamiento, lineas: lineasDe('apertura', 'jugada', 'resultado'), reemplazo: invalidas.some(Boolean),
      pasos: [
        ...SEATS.map((s) => ({ tipo: 'subir', asiento: s, dados: r.combos[s].dados, valores: r.combos[s].valores, categoria: r.combos[s].categoria, ocultos: r.combos[s].ocultos, reemplazada: invalidas[s] })),
        ...SEATS.map((s) => ({ tipo: 'combinar', asiento: s, categoria: r.combos[s].categoria, puntosD: r.puntosD[s] })),
        { tipo: 'barra', puntosRondaD: r.puntosRondaD },
      ],
    });
    if (!r.cierre) return;

    // El cierre: se voltean las tarjetas y los dados ocultos sin usar, se premia a quien acerto y los comentarios de toda la ronda cierran el beat.
    const c = r.cierre;
    const sinUsar = SEATS.map((s) => (r.oculto?.sinUsar?.[s] ?? []).map((color) => ({ color, valor: color === 'rojo' ? r.oculto.rojos[s] : r.oculto.azules[s] })));
    puntosD = c.acumulados.map(aDoceavos);
    usadas = usadas.map((x, s) => [...x, pred?.oculto?.tarjetas?.[s]].filter(Boolean));
    crear('cierre', {
      lineas: lineasDe('cierre'), reemplazo: pred ? pred.invalidas?.some((x) => x === true) === true : false,
      pasos: [
        { tipo: 'voltear', tarjetas: c.tarjetas, sinUsar, aciertos: c.aciertos },
        ...SEATS.filter((s) => c.aciertos[s]).map((s) => ({ tipo: 'premio', asiento: s, tarjeta: c.tarjetas[s], baseD: aDoceavos(c.totales[s]), puntosD: aDoceavos(c.puntos[s]) })),
        estado(puntosD, usadas),
      ],
    });
    if (pendientes.length) crear('comentarios', { lineas: pendientes });
    pendientes = [];
  });

  // Una ronda cortada antes de su cierre no tiene donde esperar: sus comentarios se dicen al final de lo ultimo que se conto.
  if (pendientes.length) {
    const ultimo = beats.at(-1);
    ultimo.lineas.push(...pendientes.map((l) => ({ tipo: l.tipo, texto: nombrar(l.texto, partida.jugadores) })));
    ultimo.texto = ultimo.lineas.map((l) => l.texto).join(' ');
    ultimo.minMs = Math.max(ultimo.minMs, duracion(MIN_MS[ultimo.tipo], ultimo.texto));
  }

  // El final solo existe si la partida termino: una partida cortada se reproduce hasta donde llego, sin final inventado.
  const ultimo = rondas.at(-1);
  if (partida.truncada !== true && Array.isArray(partida.epilogo) && partida.epilogo.length) {
    const lineas = partida.epilogo.map((l) => ({ tipo: l.tipo, texto: nombrar(l.texto, partida.jugadores) }));
    const texto = lineas.map((l) => l.texto).join(' ');
    beats.push({ id: `final-${beats.length}`, mano: ultimo.ronda, tipo: 'final', registro: rondas.length - 1, asiento: ultimo.final?.pieza ?? null, camara: [], texto, lineas, minMs: duracion(MIN_MS.final, texto), reemplazo: false, pasos: [{ tipo: 'final', final: ultimo.final ?? null }] });
  }
  return beats;
}

// ---- Lo que escribe la pantalla ----
// Puntos desde doceavos enteros, sin coma flotante: 54 -> "4.5", 40 -> "3.33", 336 -> "28". Un valor ilegible vale 0.
export function puntosTexto(doceavos) {
  const d = Number.isFinite(doceavos) && doceavos > 0 ? Math.round(doceavos) : 0;
  if (d % 12 === 0) return String(d / 12);
  const texto = (d / 12).toFixed(2);
  return texto.replace(/0$/, '');
}

// El banner de la escena: la ronda y que se hace en ese beat.
export function bannerDe(beat) {
  const ronda = Number.isInteger(beat?.mano) ? beat.mano : 1;
  if (beat?.tipo === 'final') return { ronda, fase: 'Final' };
  if (beat?.tipo === 'prediccion' && beat.pasos?.some((p) => p.tipo === 'elegir' && p.forzada)) return { ronda, fase: 'La última tarjeta se pone sola' };
  const fase = { apertura: 'Nadie ha visto los dados', prediccion: 'Cada quien elige su tarjeta en secreto', lanzamiento: 'Se lanzan los dados', cierre: 'Cierre de la ronda', comentarios: 'Lo que dejó la ronda' }[beat?.tipo]
    ?? (beat?.tipo === 'enfrentamiento' ? `Enfrentamiento ${beat.k ?? ''} de 3`.replace('  ', ' ') : '');
  return { ronda, fase };
}

// El cierre de la final: la pieza para el mas alto en solitario y eliminado el mas bajo en solitario; un empate deja a nadie.
export function textoDeFinal(final, nombre) {
  if (!final) return { grande: '', detalle: '' };
  return {
    grande: Number.isInteger(final.pieza) ? `${nombre(final.pieza)} gana la pieza` : 'Nadie gana la pieza',
    detalle: Number.isInteger(final.eliminado) ? `${nombre(final.eliminado)} queda eliminado` : 'Nadie queda eliminado',
  };
}

// ---- Que rondas valen la pena para un clip de redes -----------------------------------------------------------------------------------------
// Cada ronda suma puntos por lo que paso en ella (todo sale del registro y refleja las mismas reglas que los comentarios del motor). Los pesos son editoriales.
const PESOS = { final: 5, ZERO: 4, 'pasa al frente': 3, triple: 2, 'dado de desempate': 2 };

export function puntuarRondas(partida) {
  const rondas = Array.isArray(partida?.rondas) ? partida.rondas : [];
  const orden = [];
  const porRonda = new Map();
  rondas.forEach((r, i) => {
    if (!porRonda.has(r.ronda)) { porRonda.set(r.ronda, []); orden.push(r.ronda); }
    porRonda.get(r.ronda).push([r, i]);
  });
  let antes = [0, 0, 0, 0];
  return orden.map((ronda) => {
    const registros = porRonda.get(ronda);
    const motivos = [];
    const jugadas = registros.map(([r]) => r).filter((r) => r.fase === 'jugada');
    const delJuego = (r, s) => r.invalidas?.[s] === true;
    if (jugadas.some((r) => SEATS.some((s) => !delJuego(r, s) && r.combos?.[s]?.categoria === 'triple'))) motivos.push('triple');
    if (jugadas.some((r) => SEATS.some((s) => !delJuego(r, s) && r.porDesempate?.[s] && r.puesto?.[s] === 1 && r.puesto.filter((p) => p === 1).length === 1))) motivos.push('dado de desempate');
    const cierre = jugadas.find((r) => r.cierre)?.cierre;
    if (cierre) {
      if (SEATS.some((s) => cierre.aciertos[s] && cierre.tarjetas[s] === 'ZERO')) motivos.push('ZERO');
      const despues = cierre.acumulados.map(aDoceavos);
      const a = liderUnico(antes), d = liderUnico(despues);
      if (a !== null && d !== null && a !== d) motivos.push('pasa al frente');
      antes = despues;
    }
    if (registros.at(-1)[0].final) motivos.push('final');
    return { ronda, puntos: motivos.reduce((t, m) => t + PESOS[m], 0), motivos, registros: [registros[0][1], registros.at(-1)[1]] };
  });
}

// Las n rondas con mas puntos (empata la mas temprana), de mayor a menor.
export function mejoresRondas(partida, n) {
  if (!Number.isInteger(n) || n < 1) return [];
  return puntuarRondas(partida).sort((a, b) => b.puntos - a.puntos || a.ronda - b.ronda).slice(0, n);
}

// ---- Para la herramienta de capturas: comprobar que la escena no arrastra nada de una ronda a la siguiente ------------------------------------

// El comienzo de cada ronda desde la segunda (hasta `max` rondas): en ese momento no debe quedar nada visible de la anterior.
export function beatsDeEstado(beats, max = 6) {
  if (!Array.isArray(beats)) return [];
  const rondas = [...new Set(beats.map((b) => b.mano))].slice(1, 1 + max);
  return rondas.map((m) => beats.findIndex((b) => b.mano === m && b.tipo === 'apertura')).filter((i) => i >= 0);
}

// Lo que la mesa informa de si misma al detenerse (data-estado): tarjetas en la mesa, dados en las filas grandes, etiquetas de combinacion, etiquetas de camara, premio y panel.
export function erroresDeEstado(estado, beat) {
  if (!estado) return ['la escena no informo su estado (data-estado)'];
  const errores = [];
  if (estado.cartas !== 0) errores.push(`quedan ${estado.cartas} cartas de tarjeta sobre la mesa al empezar ${beat.id}`);
  if (estado.dados !== 0) errores.push(`quedan ${estado.dados} dados en las filas grandes al empezar ${beat.id}`);
  if (estado.etiquetas !== 0) errores.push(`quedan ${estado.etiquetas} etiquetas de combinacion de la ronda anterior en ${beat.id}`);
  if (estado.pastillas !== 0) errores.push(`queda una etiqueta de camara de la ronda anterior en ${beat.id}`);
  if (estado.premio !== 0) errores.push(`premio visible (${estado.premio}) al empezar ${beat.id}: es de la ronda anterior`);
  if (estado.panel > 0.01) errores.push(`panel visible (${estado.panel}) al empezar ${beat.id}: es del cierre o del final anterior`);
  return errores;
}
