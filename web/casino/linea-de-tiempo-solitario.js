// Linea de tiempo de la escena de El numero solitario: convierte los registros guardados de una partida (DOS por ronda: la fase 1, en que cada quien elige su pareja de cartas,
// y la fase 2, en que marca cual juega) en BEATS, lo que se ve y se dice en orden. La mesa (mesa-solitario.js) los ejecuta; aqui no se decide nada que el motor no haya registrado.
//
// Un beat: { id, mano, tipo, registro, asiento, camara, texto, lineas, minMs, reemplazo, pasos }   (mano es el numero de ronda: asi se llama la unidad de un clip en todas las escenas)
//   tipo      apertura | parejas | marcas | revelado | resultado | corte | final
//   asiento   el jugador al que apunta el beat (el ganador en el resultado, el que queda a salvo en el corte, la pieza en el final); null en los demas
//   camara    los asientos cuya marca ve el publico en esa ronda: 2 de los que siguen jugando (camara.js)
//   reemplazo alguna pareja o marca de ese beat la puso el juego por una respuesta ilegal (se marca por fila; nunca se le atribuye a la IA, ni en pantalla ni en la voz)
//   pasos     los movimientos de la animacion (vocabulario fijado en el plan, tareas A5 y C1):
//     estado {puntos[], fichas[], jugando[], salvos[]} (salvos[s] = numero del corte en que quedo a salvo, o 0)
//     jugar {asientos} (las cartas llegan boca abajo a quien juega) · revelar {que: 'parejas', parejas[], reemplazadas[]} | {que: 'marcas', marcas[], anuladas[], reemplazadas[]}
//     marcar {asiento, carta, reemplazada} (solo con la camara, solo en el beat de las marcas) · anula {numero, asientos} (un tachado por numero repetido)
//     premio {asiento, numero, puntos} · cobra {asiento, fichas} (la ficha de victoria) · blanco {} (ronda en que todo numero se repitio)
//     corte {numero, jugador, puntos, criterio, ranking} · final {final}
//
// Las parejas se eligen en secreto y se revelan TODAS JUNTAS (nunca antes de su beat); las marcas tambien: la camara le ve la marca a 2 de los que juegan antes del reveal y a los demas
// no se les ve nada. Los comentarios del motor se dicen al FINAL del resultado de su ronda, nunca antes; los que siguen a la linea del corte se dicen con el corte.
// Sin DOM ni `window`: lo importan la mesa (navegador), el generador de voz y las pruebas (Node).

import { elegirCamara } from './camara.js';
import { nombrar, duracion } from './linea-comun.js';

export const RONDAS_TOPE = 12; // el tope de rondas del motor (RONDAS en src/juegos/solitario/constantes.js): una prueba los compara
export const JUGADORES_TOPE = 5;
export const CAMARA_POR_DEFECTO = 2; // de los que siguen jugando
export const MIN_MS = { apertura: 1800, parejas: 4200, marcas: 2400, revelado: 4200, resultado: 3200, corte: 4500, final: 5000 };

const ceros = () => Array(JUGADORES_TOPE).fill(0);
const sentados = (xs) => (Array.isArray(xs) ? xs.flatMap((x, s) => (x === null || x === undefined ? [] : [s])) : []);

// Los de mas puntos entre los que siguen jugando (vacio si nadie ha puntuado): igual que lideres() del motor.
function lideres(puntos, vivos) {
  const max = Math.max(0, ...vivos.map((s) => puntos[s]));
  return max === 0 ? [] : vivos.filter((s) => puntos[s] === max);
}

// Si la jugada de un asiento la puso el juego, su linea no dice que la eligio: "X enseña..." / "X juega el N." pasan a decir que la puso el juego.
function sinAtribuir(linea, reemplazadas) {
  const pareja = linea.tipo === 'pareja' ? /^\{(\d)\} (?:enseña|muestra) el (\d+) y el (\d+)\.$/.exec(linea.texto) : null;
  if (pareja && reemplazadas[Number(pareja[1])]) return { ...linea, texto: `El juego elige la pareja de {${pareja[1]}}: el ${pareja[2]} y el ${pareja[3]}.` };
  const marca = linea.tipo === 'marca' ? /^\{(\d)\} juega el (\d+)\.$/.exec(linea.texto) : null;
  if (marca && reemplazadas[Number(marca[1])]) return { ...linea, texto: `El juego juega el ${marca[2]} por {${marca[1]}}.` };
  return linea;
}

export function construirLineaDeTiempo(partida, { seed, camara = CAMARA_POR_DEFECTO } = {}) {
  const rondas = Array.isArray(partida?.rondas) ? partida.rondas : [];
  if (!rondas.length) return [];
  const semilla = seed ?? partida.seed;
  const n = Number.isInteger(camara) ? camara : CAMARA_POR_DEFECTO;
  const beats = [];
  // lo que cada beat de apertura necesita saber de antes: el registro de la fase 1 no trae puntos ni fichas, asi que se llevan de la fase 2 anterior
  let puntos = ceros(), fichas = ceros(), salvos = ceros();

  rondas.forEach((r, i) => {
    const activos = sentados(r.parejas);
    const vistas = activos.length ? elegirCamara(semilla, r.ronda, Math.min(n, activos.length), activos.length).map((k) => activos[k]) : [];
    const reemplazadas = Array.from({ length: JUGADORES_TOPE }, (_, s) => r.invalidas?.[s] === true);
    const lineasDe = (...tipos) => (r.narracion ?? []).filter((l) => tipos.includes(l.tipo));
    const crear = (tipo, { asiento = null, lineas = [], pasos = [], reemplazo = false } = {}) => {
      const dichas = lineas.map((l) => sinAtribuir(l, reemplazadas)).map((l) => ({ tipo: l.tipo, texto: nombrar(l.texto, partida.jugadores) }));
      const texto = dichas.map((l) => l.texto).join(' ');
      beats.push({ id: `r${r.ronda}-${beats.length}-${tipo}`, mano: r.ronda, tipo, registro: i, asiento, camara: vistas, texto, lineas: dichas, minMs: duracion(MIN_MS[tipo], texto), reemplazo, pasos });
    };
    const estado = (jugando) => ({ tipo: 'estado', puntos: [...puntos], fichas: [...fichas], jugando, salvos: [...salvos] });
    const juegan = Array.from({ length: JUGADORES_TOPE }, (_, s) => activos.includes(s));

    if (r.fase === 1) {
      crear('apertura', { lineas: lineasDe('apertura', 'situacion'), pasos: [estado(juegan)] });
      crear('parejas', {
        lineas: lineasDe('pareja'), reemplazo: activos.some((s) => reemplazadas[s]),
        pasos: [{ tipo: 'jugar', asientos: activos }, { tipo: 'revelar', que: 'parejas', parejas: r.parejas, reemplazadas }],
      });
      return;
    }

    // Fase 2. Hasta la linea del corte va el resultado (con sus comentarios al final); desde ella, el corte.
    const todas = r.narracion ?? [];
    const iCorte = todas.findIndex((l) => l.tipo === 'corte');
    const antes = iCorte >= 0 ? todas.slice(0, iCorte) : todas;
    const delCorte = iCorte >= 0 ? todas.slice(iCorte) : [];

    crear('marcas', {
      pasos: vistas.filter((s) => r.marcas?.[s] !== null && r.marcas?.[s] !== undefined).map((s) => ({ tipo: 'marcar', asiento: s, carta: r.marcas[s], reemplazada: reemplazadas[s] })),
    });
    const numeros = [...new Set(activos.filter((s) => r.anuladas?.[s] === true).map((s) => r.marcas[s]))].sort((a, b) => a - b);
    crear('revelado', {
      lineas: antes.filter((l) => ['marca', 'anulacion'].includes(l.tipo)), reemplazo: activos.some((s) => reemplazadas[s]),
      pasos: [
        { tipo: 'revelar', que: 'marcas', marcas: r.marcas, anuladas: r.anuladas, reemplazadas },
        ...numeros.map((numero) => ({ tipo: 'anula', numero, asientos: activos.filter((s) => r.marcas[s] === numero && r.anuladas[s] === true) })),
      ],
    });
    puntos = [...r.puntos]; fichas = [...r.fichas];
    const pasosResultado = r.ganador === null
      ? [{ tipo: 'blanco' }]
      : [{ tipo: 'premio', asiento: r.ganador, numero: r.numero, puntos: r.puntosGanados[r.ganador] }, { tipo: 'cobra', asiento: r.ganador, fichas: 1 }];
    crear('resultado', { asiento: r.ganador, lineas: [...antes.filter((l) => l.tipo === 'resultado'), ...antes.filter((l) => l.tipo === 'comentario')], pasos: [...pasosResultado, estado(juegan)] });
    if (r.corte) {
      salvos = salvos.map((x, s) => (s === r.corte.jugador ? r.corte.numero : x));
      crear('corte', {
        asiento: r.corte.jugador, lineas: delCorte,
        pasos: [
          { tipo: 'corte', numero: r.corte.numero, jugador: r.corte.jugador, puntos: r.corte.puntos, criterio: r.corte.criterio, ranking: r.corte.ranking },
          estado(juegan.map((x, s) => x && s !== r.corte.jugador)),
        ],
      });
    }
  });

  // El final solo existe si la partida termino: una partida cortada se reproduce hasta donde llego, sin final inventado.
  const ultimo = rondas.at(-1);
  if (partida.truncada !== true && Array.isArray(partida.epilogo) && partida.epilogo.length) {
    const lineas = partida.epilogo.map((l) => ({ tipo: l.tipo, texto: nombrar(l.texto, partida.jugadores) }));
    const texto = lineas.map((l) => l.texto).join(' ');
    beats.push({ id: `final-${beats.length}`, mano: ultimo.ronda, tipo: 'final', registro: rondas.length - 1, asiento: ultimo.final?.pieza ?? null, camara: [], texto, lineas, minMs: duracion(MIN_MS.final, texto), reemplazo: false, pasos: [{ tipo: 'final', final: ultimo.final ?? null }] });
  }
  return beats;
}

// ---- El banner de la escena: ciclo, que se hace en esa fase y cuando es el siguiente corte ----
const FASES = { apertura: 'Cada quien elige dos cartas', parejas: 'Cada quien elige dos cartas', marcas: 'Cada quien marca la que juega', revelado: 'Se revelan las marcas', resultado: 'Resultado de la ronda', final: 'Final' };

export function bannerDe(beat) {
  const ronda = Number.isInteger(beat?.mano) ? beat.mano : 1;
  const ciclo = ronda > 6 ? 2 : 1;
  if (beat?.tipo === 'final') return { ciclo, fase: 'Final', corte: '' };
  const corte = ronda <= 3 ? 'Corte: ronda 3' : ronda <= 6 ? 'Corte: ronda 6' : 'Final: ronda 12';
  const fase = beat?.tipo === 'corte' ? `Corte ${beat.pasos?.find((p) => p.tipo === 'corte')?.numero ?? ''}`.trim() : FASES[beat?.tipo] ?? '';
  return { ciclo, fase, corte };
}

// ---- Que rondas valen la pena para un clip de redes -----------------------------------------------------------------------------------------
// Cada ronda suma puntos por lo que paso en ella (todo sale del registro y refleja las mismas reglas que los comentarios del motor). Los pesos son editoriales.
const PESOS = { final: 5, corte: 3, 'toma la delantera': 3, 'choque de tres': 3, 'ronda en blanco': 3, 'premio alto': 2 };

export function puntuarRondas(partida) {
  const rondas = Array.isArray(partida?.rondas) ? partida.rondas : [];
  const orden = [];
  const porRonda = new Map();
  rondas.forEach((r, i) => {
    if (!porRonda.has(r.ronda)) { porRonda.set(r.ronda, []); orden.push(r.ronda); }
    porRonda.get(r.ronda).push([r, i]);
  });
  let puntosAntes = ceros();
  return orden.map((ronda) => {
    const registros = porRonda.get(ronda);
    const r2 = registros.find(([r]) => r.fase === 2)?.[0];
    const motivos = [];
    if (r2) {
      const vivos = sentados(r2.parejas);
      const choques = new Map();
      for (const s of vivos) if (r2.anuladas?.[s] === true) choques.set(r2.marcas[s], (choques.get(r2.marcas[s]) ?? 0) + 1);
      if ([...choques.values()].some((c) => c >= 3)) motivos.push('choque de tres');
      if (r2.ganador === null) motivos.push('ronda en blanco');
      else {
        if (r2.numero >= 7) motivos.push('premio alto');
        const antes = lideres(puntosAntes, vivos), despues = lideres(r2.puntos, vivos);
        if (!(antes.length === 1 && antes[0] === r2.ganador) && despues.length === 1 && despues[0] === r2.ganador) motivos.push('toma la delantera');
      }
      if (r2.corte) motivos.push('corte');
      if (r2.final) motivos.push('final');
      puntosAntes = [...r2.puntos];
    }
    return { ronda, puntos: motivos.reduce((a, m) => a + PESOS[m], 0), motivos, registros: [registros[0][1], registros.at(-1)[1]] };
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

// Lo que la mesa informa de si misma al detenerse (data-estado): cartas en las filas, sellos ("Juega", "Anulada"), premio del ganador, etiquetas de camara y panel del corte o del final.
export function erroresDeEstado(estado, beat) {
  if (!estado) return ['la escena no informo su estado (data-estado)'];
  const errores = [];
  if (estado.cartas !== 0) errores.push(`quedan ${estado.cartas} cartas en las filas al empezar ${beat.id}`);
  if (estado.sellos > 0) errores.push(`quedan ${estado.sellos} sellos (Juega o Anulada) visibles al empezar ${beat.id}: son de la ronda anterior`);
  if (estado.premio > 0) errores.push(`premio visible (${estado.premio}) al empezar ${beat.id}: es de la ronda anterior`);
  if (estado.pastillas !== 0) errores.push(`queda una etiqueta de camara de la ronda anterior en ${beat.id}`);
  if (estado.panel > 0.01) errores.push(`panel visible (${estado.panel}) al empezar ${beat.id}: es del corte o del final anterior`);
  return errores;
}
