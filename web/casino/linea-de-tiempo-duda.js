// Linea de tiempo de la escena de Duda y apuesta: convierte los registros guardados de una partida en BEATS, lo que se ve y se dice
// en orden. La escena (navegador) los ejecuta; aqui no se decide nada que el motor no haya registrado.
//
// Un beat: { id, mano, tipo, registro, asiento, camara, texto, lineas, minMs, reemplazo, pasos }
//   tipo      apertura | reparto | anuncio | acepta | duda | defensa | revelado | retirada | cierre | final
//   registro  indice del registro de partida.rondas del que sale (apertura y reparto: el primero de la mano)
//   asiento   el jugador que actua (en revelado y retirada, el que gana); null si no aplica
//   camara    los asientos cuyas cartas ve el publico antes del recuento (ver camara.js)
//   lineas    la narracion guardada de ese momento, ya con los nombres; texto = esas lineas unidas (lo que dice la voz)
//   minMs     cuanto dura sin voz (lo que tarda la animacion o en leerse); con voz dura lo que dure el audio (la escena lo decide)
//   reemplazo la jugada la puso el juego por una respuesta ilegal (la escena la marca; las jugadas no se retocan)
//   pasos     los movimientos de la animacion, que la escena ejecuta sin decidir nada:
//     repartir {asiento, indice, color|null}   (color solo para los asientos de la camara: de los demas, null hasta el recuento)
//     apuesta {asiento, fichas, espacios} · anuncio {asiento, color, cantidad} · duda {asiento} · iguala {asiento} · pliega {asiento}
//     revelar {cartas, brillan}   todas las cartas de la mano y cuales cuentan para el color anunciado
//     contar {color, cantidad, cuentas, real} · sello {sello: farol | incumplido | cumplido | justo | retirada}   (incumplido: el anuncio lo puso el juego, no hubo farol de nadie)
//     fichas {de, a, ganado, pierde}   las fichas que RECIBE el ganador (ganado) y lo que pierde el otro (pierde)
//     pago {} · compra {asiento} · compraFallida {asiento} · estado {fichas, fichasEspacio} · final {final}
//
// Sin DOM ni `window`: lo importan la escena (navegador) y las pruebas (Node).

import { elegirCamara, CAMARA_POR_DEFECTO } from './camara.js';

export const MANOS_TOPE = 16; // el tope de manos del motor (MANOS en src/juegos/dudaapuesta/constantes.js): una prueba los compara
const ASIENTOS = [0, 1, 2, 3];
const ARCOIRIS = 'arcoiris'; // cuenta como cualquier color

// Duracion minima sin voz de cada tipo de beat, en milisegundos: lo que tarda su animacion.
export const MIN_MS = { apertura: 1800, reparto: 2200, anuncio: 2200, acepta: 2200, duda: 1800, defensa: 1500, revelado: 4200, retirada: 2600, cierre: 1200, final: 4000 };
const duracion = (tipo, texto) => Math.max(MIN_MS[tipo], texto ? 500 + 60 * texto.length : 0); // 60 ms por letra: lo que tarda una voz en decirlo

// {0}..{3} -> los nombres de las IAs de esa partida. Igual que resolverNombres del motor (la web no puede importar de src/).
export const nombrar = (texto, jugadores) => String(texto).replace(/\{([0-3])\}/g, (_, k) => jugadores?.[k]?.nombre ?? `Jugador ${Number(k) + 1}`);

const TIPO_DE_ACCION = { anunciar: 'anuncio', aceptar: 'acepta', dudar: 'duda', igualar: 'defensa', retirarse: 'defensa' };

function pasosDeAccion(r) {
  const pasos = [];
  if (r.apuesta && (r.accion === 'anunciar' || r.accion === 'aceptar' || r.accion === 'dudar')) pasos.push({ tipo: 'apuesta', asiento: r.asiento, ...r.apuesta });
  if (r.anuncio && (r.accion === 'anunciar' || r.accion === 'aceptar')) pasos.push({ tipo: 'anuncio', asiento: r.asiento, ...r.anuncio });
  if (r.accion === 'dudar') pasos.push({ tipo: 'duda', asiento: r.asiento });
  if (r.accion === 'igualar') pasos.push({ tipo: 'iguala', asiento: r.asiento });
  if (r.accion === 'retirarse') pasos.push({ tipo: 'pliega', asiento: r.asiento });
  return pasos;
}

// Cuantas de las lineas guardadas tras la accion son el desenlace (el resto es el cierre de la mano). El motor cuenta el recuento siempre en
// tres lineas (revelado, ganancia, comentario) y la retirada en una o dos: el comentario falta si la retirada la puso el juego por una respuesta ilegal.
function lineasDeDesenlace(r, resto) {
  if (r.resolucion.tipo === 'recuento') return 3;
  return 1 + (resto[2]?.tipo === 'comentario' && r.invalidas?.[r.asiento] !== true ? 1 : 0);
}

// oculto.cartas ya trae solo las cartas que cada jugador tenia en juego en ese momento (tantas como sus espacios, 1 a 5), antes de mover las fichas de la mano.
// Que jugadas de la mano las puso el juego por una respuesta ilegal: el ultimo anuncio y la duda (como hace la narracion del motor). Si el anuncio lo puso el juego,
// no se le puede atribuir a ninguna IA que fuera un farol.
function reemplazosDeMano(registros) {
  const ultimoAnuncio = [...registros].reverse().find((r) => r.accion === 'anunciar' || r.accion === 'aceptar');
  const duda = registros.find((r) => r.accion === 'dudar');
  return { anuncio: ultimoAnuncio?.invalidas?.[ultimoAnuncio.asiento] === true, duda: duda?.invalidas?.[duda.asiento] === true };
}

function pasosDeDesenlace(r, reemplazos) {
  const res = r.resolucion;
  const fichas = { tipo: 'fichas', de: res.perdedor, a: res.ganador, ganado: res.ganado ?? res.movidas, pierde: res.movidas };
  if (res.tipo === 'retirada') return [{ tipo: 'sello', sello: 'retirada' }, fichas];
  const visibles = r.oculto?.cartas ?? [];
  const sello = res.ganador === res.predictor ? (res.real === res.cantidad ? 'justo' : 'cumplido') : (reemplazos.anuncio ? 'incumplido' : 'farol');
  return [
    { tipo: 'revelar', cartas: visibles, brillan: visibles.map((fila) => fila.map((c) => c === res.color || c === ARCOIRIS)) },
    { tipo: 'contar', color: res.color, cantidad: res.cantidad, cuentas: res.cuentas, real: res.real },
    { tipo: 'sello', sello },
    fichas,
  ];
}

export function construirLineaDeTiempo(partida, { seed, camara = CAMARA_POR_DEFECTO } = {}) {
  const rondas = Array.isArray(partida?.rondas) ? partida.rondas : [];
  if (!rondas.length) return [];
  const semilla = seed ?? partida.seed;
  const nombres = (t) => nombrar(t, partida.jugadores);
  const beats = [];

  for (let desde = 0; desde < rondas.length;) {
    const primero = rondas[desde];
    const mano = primero.mano;
    let hasta = desde;
    while (hasta < rondas.length && rondas[hasta].mano === mano) hasta++;
    const vistas = elegirCamara(semilla, mano, camara);
    const cartas = primero.oculto?.cartas ?? [];

    const crear = (tipo, registro, { asiento = null, lineas = [], pasos = [], reemplazo = false } = {}) => {
      const dichas = lineas.map((l) => ({ tipo: l.tipo, texto: nombres(l.texto) }));
      const texto = dichas.map((l) => l.texto).join(' ');
      beats.push({ id: `m${mano}-${beats.length}-${tipo}`, mano, tipo, registro, asiento, camara: vistas, texto, lineas: dichas, minMs: duracion(tipo, texto), reemplazo, pasos });
    };

    const apertura = (primero.narracion ?? []).filter((l) => l.tipo === 'apertura');
    crear('apertura', desde, { lineas: apertura.length ? apertura : [{ tipo: 'apertura', texto: `Mano ${mano}.` }] });
    crear('reparto', desde, {
      pasos: Array.from({ length: 5 }, (_, k) => ASIENTOS.filter((s) => k < (cartas[s]?.length ?? 0)).map((s) => ({
        tipo: 'repartir', asiento: s, indice: k, color: vistas.includes(s) ? cartas[s][k] : null,
      }))).flat(),
    });

    const reemplazos = reemplazosDeMano(rondas.slice(desde, hasta));
    // Un comentario dicho en medio de la mano puede adelantar si el anuncio era cierto (p. ej. "no se cumplia, pero lo acepta"): la camara oculta existe para que el
    // espectador especule hasta el recuento, asi que esos comentarios esperan al desenlace de su mano. Si la partida se corta antes, nunca se dicen.
    const aplazadas = [];
    let ultimoAnuncio = null; // el ultimo anuncio de la mano y lo que apostaron con el: al aceptarlo, su dueno recupera esa apuesta
    for (let i = desde; i < hasta; i++) {
      const r = rondas[i];
      const resto = (r.narracion ?? []).filter((l) => !(i === desde && l.tipo === 'apertura'));
      const accion = r.resolucion ? 1 : resto.length;
      const delMomento = resto.slice(0, accion);
      aplazadas.push(...delMomento.filter((l) => l.tipo === 'comentario'));
      const recupera = r.accion === 'aceptar' && ultimoAnuncio ? [{ tipo: 'recupera', asiento: ultimoAnuncio.asiento, ...ultimoAnuncio.apuesta }] : [];
      if ((r.accion === 'anunciar' || r.accion === 'aceptar') && r.apuesta) ultimoAnuncio = { asiento: r.asiento, apuesta: r.apuesta };
      crear(TIPO_DE_ACCION[r.accion] ?? 'anuncio', i, { asiento: r.asiento, lineas: delMomento.filter((l) => l.tipo !== 'comentario'), pasos: [...recupera, ...pasosDeAccion(r)], reemplazo: r.invalidas?.[r.asiento] === true });
      if (!r.resolucion) continue;
      const desenlace = lineasDeDesenlace(r, resto);
      crear(r.resolucion.tipo === 'recuento' ? 'revelado' : 'retirada', i, { asiento: r.resolucion.ganador, lineas: [...resto.slice(1, 1 + desenlace), ...aplazadas.splice(0)], pasos: pasosDeDesenlace(r, reemplazos) });
      if (!r.finMano) continue;
      crear('cierre', i, {
        lineas: resto.slice(1 + desenlace),
        pasos: [
          ...(r.pago ? [{ tipo: 'pago' }] : []),
          ...(r.compras ?? []).map((asiento) => ({ tipo: 'compra', asiento })),
          ...(r.comprasFallidas ?? []).map((asiento) => ({ tipo: 'compraFallida', asiento })),
          { tipo: 'estado', fichas: r.fichas, fichasEspacio: r.fichasEspacio },
        ],
      });
    }
    desde = hasta;
  }

  // El final solo existe si la partida termino: una partida cortada se reproduce hasta donde llego, sin final inventado.
  const ultimo = rondas.at(-1);
  if (partida.truncada !== true && Array.isArray(partida.epilogo) && partida.epilogo.length) {
    const lineas = partida.epilogo.map((l) => ({ tipo: l.tipo, texto: nombres(l.texto) }));
    const texto = lineas.map((l) => l.texto).join(' ');
    beats.push({ id: `final-${beats.length}`, mano: ultimo.mano, tipo: 'final', registro: rondas.length - 1, asiento: ultimo.final?.pieza ?? null, camara: [], texto, lineas, minMs: duracion('final', texto), reemplazo: false, pasos: [{ tipo: 'final', final: ultimo.final ?? null }] });
  }
  return beats;
}

// Con razon=1 cada jugada de una IA muestra lo que dijo que penso (campo `razon`) y el beat dura lo que tarda en leerse (45 ms por letra, como mucho 6 s mas).
// No toca la linea original ni las jugadas que puso el juego por una respuesta ilegal (ahi no penso nadie).
const TIPOS_DE_JUGADA = ['anuncio', 'acepta', 'duda', 'defensa'];
export function conRazones(beats, partida) {
  if (!Array.isArray(beats)) return [];
  const rondas = Array.isArray(partida?.rondas) ? partida.rondas : [];
  return beats.map((b) => {
    const texto = TIPOS_DE_JUGADA.includes(b.tipo) && !b.reemplazo ? rondas[b.registro]?.razones?.[b.asiento] : null;
    const razon = typeof texto === 'string' ? texto.trim() : '';
    return razon ? { ...b, razon, minMs: b.minMs + Math.min(6000, 500 + 45 * razon.length) } : b;
  });
}

// ---- Que manos valen la pena para un clip de redes -------------------------------------------------------------------------------------
// Cada mano suma puntos por lo que paso en ella (todo sale de los registros). Los pesos son una decision editorial: se ajustan aqui.
const PESOS = { 'eliminación': 8, justo: 4, 'farol descubierto': 3, 'retirada tras subida': 3, 'pasa al frente': 2, 'mano larga': 2, 'apuesta grande': 2 };
const lider = (fichas) => {
  const max = Math.max(...fichas);
  const quienes = fichas.flatMap((f, s) => (f === max ? [s] : []));
  return quienes.length === 1 ? quienes[0] : null;
};

export function puntuarManos(partida) {
  const rondas = Array.isArray(partida?.rondas) ? partida.rondas : [];
  const manos = [];
  for (let desde = 0; desde < rondas.length;) {
    let hasta = desde;
    while (hasta < rondas.length && rondas[hasta].mano === rondas[desde].mano) hasta++;
    const registros = rondas.slice(desde, hasta);
    const cierre = registros.at(-1);
    const res = registros.find((r) => r.resolucion)?.resolucion;
    const motivos = [];
    if (res?.tipo === 'recuento' && res.ganador === res.dudador && !reemplazosDeMano(registros).anuncio) motivos.push('farol descubierto');
    if (res?.tipo === 'recuento' && res.ganador === res.predictor && res.real === res.cantidad) motivos.push('justo');
    if (res?.tipo === 'retirada') motivos.push('retirada tras subida');
    const ganado = res?.ganado ?? res?.movidas; // los registros viejos solo traen lo que puso el perdedor
    if (ganado && ganado.fichas + ganado.espacios >= 3) motivos.push('apuesta grande');
    if (registros.length >= 5) motivos.push('mano larga');
    // como el motor: el lider unico de fichas al empezar la mano (el primer registro todavia no movio nada) contra el de despues de cerrarla; un empate no es lider
    const antes = Array.isArray(registros[0].fichas) ? lider(registros[0].fichas) : null;
    const despues = Array.isArray(cierre.fichas) ? lider(cierre.fichas) : null;
    if (antes !== null && despues !== null && antes !== despues) motivos.push('pasa al frente');
    if (cierre.final?.eliminados?.length) motivos.push('eliminación');
    manos.push({ mano: registros[0].mano, puntos: motivos.reduce((a, m) => a + PESOS[m], 0), motivos, registros: [desde, hasta - 1] });
    desde = hasta;
  }
  return manos;
}

// Las n manos con mas puntos (empata la mas temprana), de mayor a menor.
export function mejoresManos(partida, n) {
  if (!Number.isInteger(n) || n < 1) return [];
  return puntuarManos(partida).sort((a, b) => b.puntos - a.puntos || a.mano - b.mano).slice(0, n);
}

// ---- Para la herramienta de capturas (herramientas/capturar-escena.mjs): comprobar que la escena no arrastra nada de una mano a la siguiente ----

// El reparto de cada mano desde la segunda (hasta `max` manos): en ese momento no debe quedar nada visible de la mano anterior.
export function beatsDeEstado(beats, max = 6) {
  if (!Array.isArray(beats)) return [];
  const manos = [...new Set(beats.map((b) => b.mano))].slice(1, 1 + max);
  return manos.map((m) => beats.findIndex((b) => b.mano === m && b.tipo === 'reparto')).filter((i) => i >= 0);
}

// Lo que la escena informa de si misma al detenerse (data-estado): opacidad del sello y del anuncio, pastillas de camara y medallas puestas.
export function erroresDeEstado(estado, beat) {
  if (!estado) return ['la escena no informo su estado (data-estado)'];
  const errores = [];
  if (estado.sello > 0.01) errores.push(`sello visible (${estado.sello}) al repartir ${beat.id}: es de la mano anterior`);
  if (estado.anuncio > 0.01) errores.push(`anuncio visible (${estado.anuncio}) al repartir ${beat.id}: es de la mano anterior`);
  const camara = beat.camara?.length ?? 0;
  if (estado.pastillas !== camara) errores.push(`hay ${estado.pastillas} pastillas de camara en ${beat.id} y la camara de esa mano tiene ${camara}`);
  if (estado.medallas !== 0) errores.push(`queda ${estado.medallas} medalla de una partida anterior en ${beat.id}`);
  return errores;
}
