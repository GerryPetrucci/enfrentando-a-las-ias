// Linea de tiempo de la escena de Subasta de tiempo: convierte los registros guardados de una partida (uno por subasta) en BEATS, lo que se ve y se dice en orden. La mesa
// (mesa-subasta.js) los ejecuta; aqui no se decide nada que el motor no haya registrado y el reloj sale de reloj.js (funcion pura del tiempo de pantalla).
//
// Un beat: { id, mano, tipo, registro, asiento, camara, texto, lineas, minMs, reemplazo, pasos }   (mano es el numero de subasta: asi se llama la unidad de un clip en todas las escenas)
//   tipo      apertura | reloj | apuestas | resultado | final
//   camara    siempre vacia: aqui no hay camara oculta (el publico ve los bancos desde el principio; lo que descubre es cuanto aguanta cada quien)
//   reemplazo alguna respuesta de ese beat la puso el juego por una respuesta ilegible (la narracion del motor ya dice "no responde bien: se cuenta como retirada")
//   pasos     los movimientos de la animacion (vocabulario fijado en el plan, tarea 2):
//     estado {bancos[], fichas[], ganadas[]} (ganadas: una casilla por subasta, 19: el asiento que la gano, -1 si se anulo o nadie aposto, null si aun no se juega)
//     oprimir {asientos} (los que participan: quien ya no tiene banco no) · retirar {asiento, motivo: 'se retira' | 'sin tiempo' | 'ilegible'}
//     correr {orden: [{asiento, apuesta, todo}], max, duracionS} (de la apuesta mas chica a la mas grande; las de 0 no corren)
//     ganar {asiento, apuesta} · ficha {asiento} · anular {asientos[], apuesta} (empate en lo mas alto) · nadie {} (todos se retiran) · pagar {pagos[], bancos[]} · final {final}
//
// Nada de lo que apostaron aparece antes del beat del reloj. Las lineas de las apuestas se dicen DESPUES del reloj (no adelantan nada) y los comentarios del motor, al final del
// resultado. El reloj es mudo: el contador y los clics hablan solos.
// Sin DOM ni `window`: lo importan la mesa (navegador), el generador de voz y las pruebas (Node).

import { nombrar, duracion } from './linea-comun.js';
import { duracionDeReloj } from './reloj.js';

export const RONDAS_TOPE = 19; // el tope de subastas del motor (RONDAS en src/juegos/subasta/constantes.js): una prueba los compara
export const JUGADORES_TOPE = 5;
export const CAMARA_POR_DEFECTO = 0;
export const BANCO_S = 600; // el banco inicial de cada IA, en segundos (una prueba lo compara con el del motor)
export const MIN_MS = { apertura: 1800, reloj: 400, apuestas: 2400, resultado: 3000, final: 5000 }; // el reloj dura lo que dure su contador mas este margen

const SEATS = [0, 1, 2, 3, 4];
const decima = (x) => Math.round(x * 10) / 10;

export function construirLineaDeTiempo(partida) {
  const rondas = Array.isArray(partida?.rondas) ? partida.rondas : [];
  if (!rondas.length) return [];
  const beats = [];
  let fichas = [0, 0, 0, 0, 0]; // las de antes de la subasta en curso
  let ganadas = Array(RONDAS_TOPE).fill(null);

  rondas.forEach((r, i) => {
    const apuestas = SEATS.map((s) => r.oculto?.apuestas?.[s] ?? null); // null = ya no tiene banco, no participa
    const bancos = SEATS.map((s) => r.oculto?.bancos?.[s] ?? 0); // despues de pagar
    const ilegibles = SEATS.map((s) => r.invalidas?.[s] === true);
    const lineasDe = (...tipos) => (r.narracion ?? []).filter((l) => tipos.includes(l.tipo));
    const crear = (tipo, { lineas = [], pasos = [], reemplazo = false, asiento = null, minMs = null } = {}) => {
      const dichas = lineas.map((l) => ({ tipo: l.tipo, texto: nombrar(l.texto, partida.jugadores) }));
      const texto = dichas.map((l) => l.texto).join(' ');
      beats.push({ id: `r${r.subasta}-${beats.length}-${tipo}`, mano: r.subasta, tipo, registro: i, asiento, camara: [], texto, lineas: dichas, minMs: minMs ?? duracion(MIN_MS[tipo], texto), reemplazo, pasos });
    };
    const algunaIlegible = ilegibles.some(Boolean);
    const participan = SEATS.filter((s) => apuestas[s] !== null);
    const orden = SEATS.flatMap((s) => (apuestas[s] > 0 ? [{ asiento: s, apuesta: apuestas[s], todo: r.oculto?.todoElBanco?.[s] === true }] : [])).sort((a, b) => a.apuesta - b.apuesta || a.asiento - b.asiento);
    const max = orden.length ? orden.at(-1).apuesta : 0;

    crear('apertura', {
      lineas: lineasDe('apertura'),
      pasos: [{ tipo: 'estado', bancos: bancos.map((b, s) => decima(b + (apuestas[s] ?? 0))), fichas: [...fichas], ganadas: [...ganadas] }, { tipo: 'oprimir', asientos: participan }],
    });
    crear('reloj', {
      reemplazo: algunaIlegible, minMs: max > 0 ? Math.round(duracionDeReloj(max) * 1000) + MIN_MS.reloj : 1400,
      pasos: [
        ...SEATS.flatMap((s) => (apuestas[s] === null ? [{ tipo: 'retirar', asiento: s, motivo: 'sin tiempo' }] : ilegibles[s] ? [{ tipo: 'retirar', asiento: s, motivo: 'ilegible' }] : apuestas[s] === 0 ? [{ tipo: 'retirar', asiento: s, motivo: 'se retira' }] : [])),
        { tipo: 'correr', orden, max, duracionS: duracionDeReloj(max) },
      ],
    });
    crear('apuestas', { lineas: lineasDe('apuesta'), reemplazo: algunaIlegible });
    const resultado = r.ganador !== null && r.ganador !== undefined
      ? [{ tipo: 'ganar', asiento: r.ganador, apuesta: apuestas[r.ganador], todo: r.oculto?.todoElBanco?.[r.ganador] === true }, { tipo: 'ficha', asiento: r.ganador }]
      : r.sinGanador === 'empate' ? [{ tipo: 'anular', asientos: r.oculto?.empatados ?? [], apuesta: max }] : [{ tipo: 'nadie' }];
    fichas = [...r.fichas];
    ganadas = ganadas.map((x, k) => (k === r.subasta - 1 ? (r.ganador ?? -1) : x));
    crear('resultado', {
      asiento: r.ganador ?? null, lineas: [...lineasDe('resultado'), ...lineasDe('comentario')],
      pasos: [...resultado, { tipo: 'pagar', pagos: apuestas.map((a) => a ?? 0), bancos }, { tipo: 'estado', bancos, fichas: [...fichas], ganadas: [...ganadas] }],
    });
  });

  // El final solo existe si la partida termino: una partida cortada se reproduce hasta donde llego, sin final inventado.
  const ultimo = rondas.at(-1);
  if (partida.truncada !== true && Array.isArray(partida.epilogo) && partida.epilogo.length) {
    const lineas = partida.epilogo.map((l) => ({ tipo: l.tipo, texto: nombrar(l.texto, partida.jugadores) }));
    const texto = lineas.map((l) => l.texto).join(' ');
    beats.push({ id: `final-${beats.length}`, mano: ultimo.subasta, tipo: 'final', registro: rondas.length - 1, asiento: ultimo.final?.pieza ?? null, camara: [], texto, lineas, minMs: duracion(MIN_MS.final, texto), reemplazo: false, pasos: [{ tipo: 'final', final: ultimo.final ?? null }] });
  }
  return beats;
}

// El cierre de la final: la pieza para quien tiene mas fichas y eliminado quien tiene menos; un empate total deja a nadie.
export function textoDeFinal(final, nombre) {
  if (!final) return { grande: '', detalle: '' };
  return {
    grande: Number.isInteger(final.pieza) ? `${nombre(final.pieza)} gana la pieza` : 'Nadie gana la pieza',
    detalle: Number.isInteger(final.eliminado) ? `${nombre(final.eliminado)} queda eliminado` : 'Nadie queda eliminado',
  };
}

// Los textos de la fila de cada IA mientras corre el contador. Al arrancar NO se dice nada de cuanto apuesta (el banco de antes es publico: "todo su banco" delataria la apuesta desde el
// segundo cero); eso se dice solo al soltar el boton o al ganar, cuando el contador ya paso por esa apuesta.
const decimaTexto = (x) => (Number.isFinite(x) ? x.toFixed(1) : '0.0');
export const textoDeArranque = () => 'Aguanta…';
export function textoDeSoltar(o) { const { apuesta, todo } = o ?? {}; return `Soltó a ${decimaTexto(apuesta)} s${todo === true ? ' · ¡todo!' : ''}`; }
export function textoDeGanar(apuesta, todo) { return `Gana con ${decimaTexto(apuesta)} s${todo === true ? ' · ¡todo!' : ''}`; }

// ---- Que subastas valen la pena para un clip de redes -----------------------------------------------------------------------------------------
// Cada subasta suma puntos por lo que paso en ella (todo sale del registro y refleja las mismas condiciones que los comentarios del motor). Los pesos son editoriales.
const PESOS = { final: 5, 'sin tiempo': 4, 'mitad del banco': 3, 'se adelanta en fichas': 3, empate: 3, 'casi nada': 2 };

export function puntuarRondas(partida) {
  const rondas = Array.isArray(partida?.rondas) ? partida.rondas : [];
  let fichasAntes = [0, 0, 0, 0, 0];
  return rondas.map((r, i) => {
    const motivos = [];
    const apuestas = SEATS.map((s) => r.oculto?.apuestas?.[s] ?? null);
    const bancos = SEATS.map((s) => r.oculto?.bancos?.[s] ?? 0);
    const jugaron = SEATS.filter((s) => apuestas[s] !== null);
    if (r.sinGanador === 'empate') motivos.push('empate');
    if (r.ganador !== null && r.ganador !== undefined) {
      const tope = Math.max(...fichasAntes);
      const arriba = fichasAntes.filter((f) => f === tope).length;
      const ahoraSolo = r.fichas.every((f, t) => t === r.ganador || f < r.fichas[r.ganador]);
      if (tope > 0 && arriba > 1 && fichasAntes[r.ganador] === tope && ahoraSolo) motivos.push('se adelanta en fichas');
      if (apuestas[r.ganador] <= 1 && jugaron.every((s) => s === r.ganador || apuestas[s] === 0)) motivos.push('casi nada');
    }
    if (jugaron.some((s) => apuestas[s] > BANCO_S / 2)) motivos.push('mitad del banco');
    if (jugaron.some((s) => apuestas[s] > 0 && bancos[s] === 0)) motivos.push('sin tiempo');
    if (r.final) motivos.push('final');
    fichasAntes = [...r.fichas];
    return { ronda: r.subasta, puntos: motivos.reduce((t, m) => t + PESOS[m], 0), motivos, registros: [i, i] };
  });
}

// Las n subastas con mas puntos (empata la mas temprana), de mayor a menor.
export function mejoresRondas(partida, n) {
  if (!Number.isInteger(n) || n < 1) return [];
  return puntuarRondas(partida).sort((a, b) => b.puntos - a.puntos || a.ronda - b.ronda).slice(0, n);
}

// ---- Para la herramienta de capturas: comprobar que la escena no arrastra nada de una subasta a la siguiente ----------------------------------

// El comienzo de cada subasta desde la segunda (hasta `max` subastas): en ese momento no debe quedar nada visible de la anterior.
export function beatsDeEstado(beats, max = 6) {
  if (!Array.isArray(beats)) return [];
  const subastas = [...new Set(beats.map((b) => b.mano))].slice(1, 1 + max);
  return subastas.map((m) => beats.findIndex((b) => b.mano === m && b.tipo === 'apertura')).filter((i) => i >= 0);
}

// Lo que la mesa informa de si misma al detenerse (data-estado): botones sueltos o ganadores, sellos, brillo del ganador, el numero del contador y el panel del final.
export function erroresDeEstado(estado, beat) {
  if (!estado) return ['la escena no informo su estado (data-estado)'];
  const errores = [];
  if (estado.botones !== 0) errores.push(`quedan ${estado.botones} botones sueltos o ganadores al empezar ${beat.id}: todos tienen que estar oprimidos`);
  if (estado.sellos !== 0) errores.push(`quedan ${estado.sellos} sellos visibles al empezar ${beat.id}: son de la subasta anterior`);
  if (estado.premio !== 0) errores.push(`premio visible (${estado.premio}) al empezar ${beat.id}: es de la subasta anterior`);
  if (estado.contador !== 0) errores.push(`el contador marca ${estado.contador} al empezar ${beat.id}: tiene que estar en cero`);
  if (estado.panel > 0.01) errores.push(`panel visible (${estado.panel}) al empezar ${beat.id}: es del final anterior`);
  return errores;
}
