// Linea de tiempo de la escena de Mayor o menor: convierte los registros guardados de una partida (uno por ronda) en BEATS, lo que se ve y se dice en orden.
// La mesa (mesa-mayormenor.js) los ejecuta; aqui no se decide nada que el motor no haya registrado.
//
// Un beat: { id, mano, tipo, registro, asiento, camara, texto, lineas, minMs, reemplazo, pasos }   (mano es el numero de ronda: asi se llama la unidad de un clip en todas las escenas)
//   tipo      apertura | crupier | jugada | apuesta | revelado | resultado | final
//   asiento   el jugador al que le toca (activo en casi todos; predictor en la apuesta)
//   camara    los asientos cuya carta oculta ve el publico en esa ronda (ver camara.js: 1 de 2 por defecto)
//   reemplazo la carta o la apuesta de ese beat la puso el juego por una respuesta ilegal (se marca; nunca se le atribuye a la IA)
//   pasos     los movimientos de la animacion (vocabulario fijado en el plan, tarea A5):
//     roles {activo, predictor} · crupier {asiento, carta, quedan} · jugar {asiento, carta | null (solo con la camara)} · pregunta {apuesta: {asiento, fichas, lado, todo, maximo, reemplazo}} (la apuesta que se muestra con la carta)
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

// Un comentario que el motor escribio en las partidas del 21 de octubre de 2026 (reglas 2.0.0) y que ya no se dice: con el tope de 6 fichas casi toda apuesta es «el maximo permitido» y repetirlo en cada ronda cansa.
// Es texto editorial (nunca una jugada): las partidas guardadas lo traen, asi que la escena lo omite al leerlas. El motor ya no lo escribe.
const COMENTARIO_VIEJO = /apuesta el máximo permitido\.$/;

// El motor escribe el aviso de ronda doble como comentario, pero es una regla de esa ronda (el encabezado ya la muestra desde el principio) y no adelanta nada:
// se dice al abrir la ronda, con la apertura, y no al final con los comentarios del resultado (cuando ya empieza la siguiente).
const ANUNCIO_DOBLE = /^¡Ronda doble!/;

export function construirLineaDeTiempo(partida, { seed, camara = CAMARA_POR_DEFECTO } = {}) {
  const rondas = Array.isArray(partida?.rondas) ? partida.rondas : [];
  if (!rondas.length) return [];
  const semilla = seed ?? partida.seed;
  const n = Number.isInteger(camara) ? camara : CAMARA_POR_DEFECTO;
  const beats = [];
  // Las cartas con que empezo cada jugador: lo que tiene despues de la primera ronda mas la carta que juega el activo (las partidas con las reglas 1.0.0 empiezan con 0 a 10).
  const primera = rondas[0];
  const inicial = [0, 1].map((s) => (Array.isArray(primera?.mano?.[s]) ? [...primera.mano[s], ...(s === primera.activo ? [primera.carta] : [])].sort((a, b) => a - b) : Array.from({ length: 11 }, (_, k) => k)));

  rondas.forEach((r, i) => {
    const vistas = elegirCamara(semilla, r.ronda, n, 2);
    const visible = vistas.includes(r.activo);
    const lineasDe = (...tipos) => (r.narracion ?? []).filter((l) => tipos.includes(l.tipo) && !COMENTARIO_VIEJO.test(l.texto ?? ''));
    const crear = (tipo, { asiento = r.activo, lineas = [], pasos = [], reemplazo = false } = {}) => {
      const dichas = lineas.map((l) => ({ tipo: l.tipo, texto: nombrar(l.texto, partida.jugadores) }));
      const texto = dichas.map((l) => l.texto).join(' ');
      beats.push({ id: `r${r.ronda}-${beats.length}-${tipo}`, mano: r.ronda, tipo, registro: i, asiento, camara: vistas, texto, lineas: dichas, minMs: duracion(MIN_MS[tipo], texto), reemplazo, pasos });
    };

    // La mano de cada jugador y el mazo del crupier: el registro trae lo que queda DESPUES de la ronda; antes, al activo le faltaba la carta que va a jugar.
    const disponibles = (despues) => [0, 1].map((s) => (despues || s !== r.activo ? [...r.mano[s]] : [...r.mano[s], r.carta].sort((a, b) => a - b)));
    const quedan = (despues) => [0, 1].map((s) => r.crupierQuedan[s].length + (!despues && s === r.activo ? 1 : 0));

    // `manoInicial` son las cartas con que empezo cada jugador (reglas 2.0.0: repartidas al azar, con repetidas): la tira de la mesa tacha lo ya jugado
    const comentarios = lineasDe('comentario');
    const avisoDoble = comentarios.filter((l) => ANUNCIO_DOBLE.test(l.texto)).map((l) => ({ ...l, tipo: 'apertura' }));
    crear('apertura', { lineas: [...lineasDe('apertura'), ...avisoDoble], pasos: [{ tipo: 'roles', activo: r.activo, predictor: r.predictor, doble: r.doble === 2 }, { tipo: 'estado', fichas: r.fichasAntes, disponibles: disponibles(false), crupierQuedan: quedan(false), manoInicial: inicial }] });
    crear('crupier', { lineas: lineasDe('crupier'), pasos: [{ tipo: 'crupier', asiento: r.activo, carta: r.crupier, quedan: r.crupierQuedan[r.activo].length }] });
    // La apuesta del predictor: la caja «X apuesta N fichas a que sera M» aparece cuando el activo juega su carta (ahi es cuando el predictor tiene que adivinar), asi que el paso «pregunta» del beat de la jugada la trae;
    // la voz la dice despues, en el beat de la apuesta. maximo: apuesta lo maximo que permite el tope (reglas 2.0.0), no todas sus fichas.
    const apuestaIlegal = r.invalidas?.[r.predictor] === true;
    const pasoApuesta = { tipo: 'apuesta', asiento: r.predictor, fichas: r.apuesta, lado: r.lado, todo: r.apostoTodo === true && !apuestaIlegal, maximo: r.apostoTodo === true && !apuestaIlegal && r.apuestaMaxima < r.fichasAntes?.[r.predictor] };
    const { tipo: _, ...datosApuesta } = pasoApuesta;
    crear('jugada', { lineas: lineasDe('jugada'), reemplazo: r.invalidas?.[r.activo] === true, pasos: [{ tipo: 'jugar', asiento: r.activo, carta: visible ? r.carta : null }, { tipo: 'pregunta', apuesta: { ...datosApuesta, reemplazo: apuestaIlegal } }] });
    crear('apuesta', { asiento: r.predictor, lineas: lineasDe('apuesta'), reemplazo: apuestaIlegal, pasos: [pasoApuesta] });
    crear('revelado', {
      lineas: lineasDe('revelacion'),
      pasos: [
        { tipo: 'revelar', carta: r.carta },
        { tipo: 'comparar', veredicto: r.veredicto, crupier: r.crupier, carta: r.carta, igual: r.igual === true || r.veredicto === 'igual' }, // igual: la carta es la del crupier (en las reglas 2.0.0 cuenta como menor)
        { tipo: 'sello', sello: r.acierto === true ? 'acierta' : r.acierto === false ? 'falla' : 'igual' },
      ],
    });
    // El resultado: lo que cobra el activo de la banca y lo que pasa con la apuesta (vuelve y gana, se paga a la banca, o solo vuelve si la carta es igual).
    const pasosResultado = [];
    if (r.ganaActivo > 0) pasosResultado.push({ tipo: 'cobra', asiento: r.activo, fichas: r.ganaActivo });
    if (r.veredicto === 'igual') pasosResultado.push({ tipo: 'devuelve', asiento: r.predictor, fichas: r.apuesta });
    else if (r.acierto) pasosResultado.push({ tipo: 'devuelve', asiento: r.predictor, fichas: r.apuesta }, { tipo: 'cobra', asiento: r.predictor, fichas: r.ganaPredictor });
    else pasosResultado.push({ tipo: 'paga', asiento: r.predictor, fichas: r.apuesta });
    pasosResultado.push({ tipo: 'estado', fichas: r.fichas, disponibles: disponibles(true), crupierQuedan: quedan(true), manoInicial: inicial });
    crear('resultado', { lineas: [...lineasDe('resultado'), ...comentarios.filter((l) => !ANUNCIO_DOBLE.test(l.texto))], pasos: pasosResultado });
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

// ---- razon=1: lo que cada IA dijo que penso (el rival nunca lo ve) ----
// La del predictor sale con su apuesta; la del activo, DESPUES del reveal (antes delataria la carta que juega). No toca la linea original ni las jugadas que puso el juego (ahi no penso nadie).
export function conRazones(beats, partida) {
  if (!Array.isArray(beats)) return [];
  const rondas = Array.isArray(partida?.rondas) ? partida.rondas : [];
  return beats.map((b) => {
    const r = rondas[b.registro];
    const de = b.tipo === 'apuesta' ? r?.predictor : b.tipo === 'revelado' ? r?.activo : null;
    const texto = Number.isInteger(de) && r?.invalidas?.[de] !== true ? r?.razones?.[de] : null;
    const razon = typeof texto === 'string' ? texto.trim() : '';
    return razon ? { ...b, razon, minMs: b.minMs + Math.min(6000, 500 + 45 * razon.length) } : b;
  });
}

// ---- Que rondas valen la pena para un clip de redes -----------------------------------------------------------------------------------------
// Cada ronda suma puntos por lo que paso en ella (todo sale del registro y refleja las mismas reglas que los comentarios del motor). Los pesos son editoriales.
const PESOS = { final: 5, 'lo apuesta todo': 4, 'cae de golpe': 3, 'pasa al frente': 3, 'apuesta grande': 2, 'carta igual': 2, 'regala la ronda': 2, 'ronda doble': 1 };

export function puntuarRondas(partida) {
  const rondas = Array.isArray(partida?.rondas) ? partida.rondas : [];
  return rondas.map((r, i) => {
    const motivos = [];
    const predictor = r.predictor, activo = r.activo;
    // «lo apuesta todo» = juega TODAS sus fichas (con el tope de las reglas 2.0.0, apostar el maximo permitido no lo es: casi toda apuesta lo es)
    if (r.apostoTodo && r.invalidas?.[predictor] !== true && !(r.apuestaMaxima < r.fichasAntes?.[predictor])) motivos.push('lo apuesta todo');
    const propia = r.invalidas?.[predictor] !== true; // una apuesta que puso el juego no es audacia de la IA
    if (propia && r.apuesta * 2 >= r.fichasAntes?.[predictor]) motivos.push('apuesta grande');
    if (r.veredicto === 'igual' || r.igual === true) motivos.push('carta igual');
    if (r.doble === 2) motivos.push('ronda doble');
    const manoAntes = [...(r.mano?.[activo] ?? []), r.carta];
    const arriba = manoAntes.filter((c) => c > r.crupier).length, abajo = manoAntes.filter((c) => c < r.crupier).length;
    if (r.invalidas?.[activo] !== true && r.veredicto === 'menor' && arriba > abajo) motivos.push('regala la ronda');
    if (propia && r.acierto === false && r.apuesta * 2 >= r.fichasAntes?.[predictor]) motivos.push('cae de golpe');
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

// Lo que la mesa informa de si misma al detenerse (data-estado): opacidad del sello y de la caja de apuesta, cartas en el escenario, etiquetas de camara puestas, si el titulo de la cabecera quedo cortado, cuantas barras
// muestran su papel (al empezar una ronda las dos: activo y predictor), cuantas pastillas brillan (quien actua ahora: al empezar una ronda ninguna) y si un nombre quedo cortado o una barra desbordada.
export function erroresDeEstado(estado, beat) {
  if (!estado) return ['la escena no informo su estado (data-estado)'];
  const errores = [];
  if (estado.sello > 0.01) errores.push(`sello visible (${estado.sello}) al empezar ${beat.id}: es de la ronda anterior`);
  if (estado.apuesta > 0.01) errores.push(`apuesta visible (${estado.apuesta}) al empezar ${beat.id}: es de la ronda anterior`);
  if (estado.cartas !== 0) errores.push(`quedan ${estado.cartas} cartas en el escenario al empezar ${beat.id}`);
  if (estado.pastillas !== 0) errores.push(`queda una etiqueta de camara de la ronda anterior en ${beat.id}`);
  if (estado.tituloCortado === true) errores.push(`el titulo de la cabecera esta cortado en ${beat.id}: el texto de la ronda le quita lugar`);
  if (estado.papeles !== 2) errores.push(`al empezar ${beat.id} se ven ${estado.papeles} papeles de jugador (activo y predictor): tienen que verse los dos`);
  if (estado.brillos !== 0) errores.push(`queda ${estado.brillos} pastilla(s) brillando al empezar ${beat.id}: es de la ronda anterior (al empezar una ronda nadie actua todavia)`);
  if (estado.nombreCortado === true) errores.push(`el nombre de un jugador esta cortado en ${beat.id}: no cabe junto a su papel y sus fichas`);
  if (estado.barraDesbordada === true) errores.push(`la barra de un jugador se desborda en ${beat.id}: su papel, su nombre y sus fichas no caben`);
  return errores;
}
