// Linea de tiempo de la escena de Mayor o menor: convierte los registros guardados de una partida (uno por ronda) en BEATS, lo que se ve y se dice en orden.
// La mesa (mesa-mayormenor.js) los ejecuta; aqui no se decide nada que el motor no haya registrado.
//
// Un beat: { id, mano, tipo, registro, asiento, camara, texto, lineas, minMs, reemplazo, pasos }   (mano es el numero de ronda: asi se llama la unidad de un clip en todas las escenas)
//   tipo      apertura | crupier | jugada | apuesta | revelado | resultado | final
//   asiento   el jugador al que le toca (activo en casi todos; predictor en la apuesta)
//   camara    los asientos cuya carta oculta ve el publico en esa ronda (ver camara.js: 1 de 2 por defecto)
//   reemplazo la carta o la apuesta de ese beat la puso el juego por una respuesta ilegal (se marca; nunca se le atribuye a la IA)
//   pasos     los movimientos de la animacion (vocabulario fijado en el plan, tarea A5):
//     roles {activo, predictor} · crupier {asiento, carta, quedan} · jugar {asiento, carta | null (solo con la camara)} · pregunta {}
//     apuesta {asiento, fichas, lado, todo} · revelar {carta} · comparar {veredicto, crupier, carta} · sello {sello: acierta | falla | igual}
//     cobra {asiento, fichas} (de la banca) · paga {asiento, fichas} (a la banca) · devuelve {asiento, fichas} (la apuesta vuelve a su dueno)
//     estado {fichas, disponibles, crupierQuedan} · final {final}
//
// Los comentarios del motor ("lo apuesta todo", "pasa al frente"...) se dicen al FINAL del resultado de su ronda, nunca antes (no adelantan nada).
// Sin DOM ni `window`: lo importan la mesa (navegador), el generador de voz y las pruebas (Node).

import { elegirCamara } from './camara.js';
import { nombrar, duracion, lider } from './linea-comun.js';

export const RONDAS_TOPE = 18; // el tope de rondas del motor (RONDAS en src/juegos/mayormenor/constantes.js): una prueba los compara
export const CAMARA_POR_DEFECTO = 1; // de 2 jugadores: en la mitad de las rondas se ve la carta jugada
export const MIN_MS = { apertura: 1800, crupier: 1800, jugada: 1800, apuesta: 2400, revelado: 3600, resultado: 2800, final: 4000 };

export function construirLineaDeTiempo(partida, { seed, camara = CAMARA_POR_DEFECTO } = {}) {
  const rondas = Array.isArray(partida?.rondas) ? partida.rondas : [];
  if (!rondas.length) return [];
  const semilla = seed ?? partida.seed;
  const n = Number.isInteger(camara) ? camara : CAMARA_POR_DEFECTO;
  const beats = [];

  rondas.forEach((r, i) => {
    const vistas = elegirCamara(semilla, r.ronda, n, 2);
    const visible = vistas.includes(r.activo);
    const lineasDe = (...tipos) => (r.narracion ?? []).filter((l) => tipos.includes(l.tipo));
    const crear = (tipo, { asiento = r.activo, lineas = [], pasos = [], reemplazo = false } = {}) => {
      const dichas = lineas.map((l) => ({ tipo: l.tipo, texto: nombrar(l.texto, partida.jugadores) }));
      const texto = dichas.map((l) => l.texto).join(' ');
      beats.push({ id: `r${r.ronda}-${beats.length}-${tipo}`, mano: r.ronda, tipo, registro: i, asiento, camara: vistas, texto, lineas: dichas, minMs: duracion(MIN_MS[tipo], texto), reemplazo, pasos });
    };

    // La mano de cada jugador y el mazo del crupier: el registro trae lo que queda DESPUES de la ronda; antes, al activo le faltaba la carta que va a jugar.
    const disponibles = (despues) => [0, 1].map((s) => (despues || s !== r.activo ? [...r.mano[s]] : [...r.mano[s], r.carta].sort((a, b) => a - b)));
    const quedan = (despues) => [0, 1].map((s) => r.crupierQuedan[s].length + (!despues && s === r.activo ? 1 : 0));

    crear('apertura', { lineas: lineasDe('apertura'), pasos: [{ tipo: 'roles', activo: r.activo, predictor: r.predictor }, { tipo: 'estado', fichas: r.fichasAntes, disponibles: disponibles(false), crupierQuedan: quedan(false) }] });
    crear('crupier', { lineas: lineasDe('crupier'), pasos: [{ tipo: 'crupier', asiento: r.activo, carta: r.crupier, quedan: r.crupierQuedan[r.activo].length }] });
    crear('jugada', { lineas: lineasDe('jugada'), reemplazo: r.invalidas?.[r.activo] === true, pasos: [{ tipo: 'jugar', asiento: r.activo, carta: visible ? r.carta : null }, { tipo: 'pregunta' }] });
    crear('apuesta', { asiento: r.predictor, lineas: lineasDe('apuesta'), reemplazo: r.invalidas?.[r.predictor] === true, pasos: [{ tipo: 'apuesta', asiento: r.predictor, fichas: r.apuesta, lado: r.lado, todo: r.apostoTodo === true && r.invalidas?.[r.predictor] !== true }] });
    crear('revelado', {
      lineas: lineasDe('revelacion'),
      pasos: [
        { tipo: 'revelar', carta: r.carta },
        { tipo: 'comparar', veredicto: r.veredicto, crupier: r.crupier, carta: r.carta },
        { tipo: 'sello', sello: r.acierto === true ? 'acierta' : r.acierto === false ? 'falla' : 'igual' },
      ],
    });
    // El resultado: lo que cobra el activo de la banca y lo que pasa con la apuesta (vuelve y gana, se paga a la banca, o solo vuelve si la carta es igual).
    const pasosResultado = [];
    if (r.ganaActivo > 0) pasosResultado.push({ tipo: 'cobra', asiento: r.activo, fichas: r.ganaActivo });
    if (r.veredicto === 'igual') pasosResultado.push({ tipo: 'devuelve', asiento: r.predictor, fichas: r.apuesta });
    else if (r.acierto) pasosResultado.push({ tipo: 'devuelve', asiento: r.predictor, fichas: r.apuesta }, { tipo: 'cobra', asiento: r.predictor, fichas: r.ganaPredictor });
    else pasosResultado.push({ tipo: 'paga', asiento: r.predictor, fichas: r.apuesta });
    pasosResultado.push({ tipo: 'estado', fichas: r.fichas, disponibles: disponibles(true), crupierQuedan: quedan(true) });
    crear('resultado', { lineas: [...lineasDe('resultado'), ...lineasDe('comentario')], pasos: pasosResultado });
  });

  // El final solo existe si la partida termino: una partida cortada se reproduce hasta donde llego, sin final inventado.
  const ultimo = rondas.at(-1);
  if (partida.truncada !== true && Array.isArray(partida.epilogo) && partida.epilogo.length) {
    const lineas = partida.epilogo.map((l) => ({ tipo: l.tipo, texto: nombrar(l.texto, partida.jugadores) }));
    const texto = lineas.map((l) => l.texto).join(' ');
    beats.push({ id: `final-${beats.length}`, mano: ultimo.ronda, tipo: 'final', registro: rondas.length - 1, asiento: ultimo.final?.ganador ?? null, camara: [], texto, lineas, minMs: duracion(MIN_MS.final, texto), reemplazo: false, pasos: [{ tipo: 'final', final: ultimo.final ?? null }] });
  }
  return beats;
}

// ---- Que rondas valen la pena para un clip de redes -----------------------------------------------------------------------------------------
// Cada ronda suma puntos por lo que paso en ella (todo sale del registro y refleja las mismas reglas que los comentarios del motor). Los pesos son editoriales.
const PESOS = { final: 5, 'lo apuesta todo': 4, 'cae de golpe': 3, 'pasa al frente': 3, 'apuesta grande': 2, 'carta igual': 2, 'regala la ronda': 2 };

export function puntuarRondas(partida) {
  const rondas = Array.isArray(partida?.rondas) ? partida.rondas : [];
  return rondas.map((r, i) => {
    const motivos = [];
    const predictor = r.predictor, activo = r.activo;
    if (r.apostoTodo && r.invalidas?.[predictor] !== true) motivos.push('lo apuesta todo');
    if (r.apuesta * 2 >= r.fichasAntes?.[predictor]) motivos.push('apuesta grande');
    if (r.veredicto === 'igual') motivos.push('carta igual');
    const manoAntes = [...(r.mano?.[activo] ?? []), r.carta];
    const arriba = manoAntes.filter((c) => c > r.crupier).length, abajo = manoAntes.filter((c) => c < r.crupier).length;
    if (r.invalidas?.[activo] !== true && r.veredicto === 'menor' && arriba > abajo) motivos.push('regala la ronda');
    if (r.acierto === false && r.apuesta * 2 >= r.fichasAntes?.[predictor]) motivos.push('cae de golpe');
    const antes = lider(r.fichasAntes), despues = lider(r.fichas);
    if (antes !== null && despues !== null && antes !== despues) motivos.push('pasa al frente');
    if (r.final) motivos.push('final');
    return { ronda: r.ronda, puntos: motivos.reduce((a, m) => a + PESOS[m], 0), motivos, registros: [i, i] };
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

// Lo que la mesa informa de si misma al detenerse (data-estado): opacidad del sello y de la caja de apuesta, cartas en el escenario y etiquetas de camara puestas.
export function erroresDeEstado(estado, beat) {
  if (!estado) return ['la escena no informo su estado (data-estado)'];
  const errores = [];
  if (estado.sello > 0.01) errores.push(`sello visible (${estado.sello}) al empezar ${beat.id}: es de la ronda anterior`);
  if (estado.apuesta > 0.01) errores.push(`apuesta visible (${estado.apuesta}) al empezar ${beat.id}: es de la ronda anterior`);
  if (estado.cartas !== 0) errores.push(`quedan ${estado.cartas} cartas en el escenario al empezar ${beat.id}`);
  if (estado.pastillas !== 0) errores.push(`queda una etiqueta de camara de la ronda anterior en ${beat.id}`);
  return errores;
}
