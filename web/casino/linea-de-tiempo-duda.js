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
//     contar {color, cantidad, cuentas, real} · sello {sello: farol | cumplido | justo | retirada}
//     fichas {de, a, ganado, pierde}   las fichas que RECIBE el ganador (ganado) y lo que pierde el otro (pierde)
//     pago {} · compra {asiento} · compraFallida {asiento} · estado {fichas, fichasEspacio} · final {final}
//
// Sin DOM ni `window`: lo importan la escena (navegador) y las pruebas (Node).

import { elegirCamara, CAMARA_POR_DEFECTO } from './camara.js';

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
function pasosDeDesenlace(r) {
  const res = r.resolucion;
  const fichas = { tipo: 'fichas', de: res.perdedor, a: res.ganador, ganado: res.ganado ?? res.movidas, pierde: res.movidas };
  if (res.tipo === 'retirada') return [{ tipo: 'sello', sello: 'retirada' }, fichas];
  const visibles = r.oculto?.cartas ?? [];
  const sello = res.ganador === res.predictor ? (res.real === res.cantidad ? 'justo' : 'cumplido') : 'farol';
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

    for (let i = desde; i < hasta; i++) {
      const r = rondas[i];
      const resto = (r.narracion ?? []).filter((l) => !(i === desde && l.tipo === 'apertura'));
      const accion = r.resolucion ? 1 : resto.length;
      crear(TIPO_DE_ACCION[r.accion] ?? 'anuncio', i, { asiento: r.asiento, lineas: resto.slice(0, accion), pasos: pasosDeAccion(r), reemplazo: r.invalidas?.[r.asiento] === true });
      if (!r.resolucion) continue;
      const desenlace = lineasDeDesenlace(r, resto);
      crear(r.resolucion.tipo === 'recuento' ? 'revelado' : 'retirada', i, { asiento: r.resolucion.ganador, lineas: resto.slice(1, 1 + desenlace), pasos: pasosDeDesenlace(r) });
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
  let antes = null; // el lider de fichas al empezar la mano
  for (let desde = 0; desde < rondas.length;) {
    let hasta = desde;
    while (hasta < rondas.length && rondas[hasta].mano === rondas[desde].mano) hasta++;
    const registros = rondas.slice(desde, hasta);
    const cierre = registros.at(-1);
    const res = registros.find((r) => r.resolucion)?.resolucion;
    const motivos = [];
    if (res?.tipo === 'recuento' && res.ganador === res.dudador) motivos.push('farol descubierto');
    if (res?.tipo === 'recuento' && res.ganador === res.predictor && res.real === res.cantidad) motivos.push('justo');
    if (res?.tipo === 'retirada') motivos.push('retirada tras subida');
    if (res && res.ganado && res.ganado.fichas + res.ganado.espacios >= 3) motivos.push('apuesta grande');
    if (registros.length >= 5) motivos.push('mano larga');
    const despues = Array.isArray(cierre.fichas) ? lider(cierre.fichas) : null;
    if (antes !== null && despues !== null && antes !== despues) motivos.push('pasa al frente');
    if (cierre.final?.eliminados?.length) motivos.push('eliminación');
    antes = despues ?? antes;
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
