// Un turno de Triple dado. Hay dos tipos y los dos mutan el estado y devuelven el registro (lo que se guarda en los datos y lee el reproductor):
//   PREDICCION (antes de lanzar los dados): cada jugador elige en secreto una tarjeta que no haya usado. En la ronda 4 solo queda una por jugador: el juego la pone sin
//   preguntar (turno sin llamadas). Despues "se lanzan" los dados (ya estan sorteados en crearEstado; la vista solo los muestra desde aqui).
//   ENFRENTAMIENTO (3 por ronda): todos eligen a la vez tres dados que no hayan gastado; se comparan las combinaciones (categoria, numeros, dado blanco que sobra) y se
//   reparten 6 / 3 / 1 / 0 puntos, con el promedio de las posiciones en los empates. Tras el tercero se cierra la ronda: se revelan las tarjetas y se premian (ZERO da 40;
//   las demas duplican; fallar no resta). Tras la ronda 4 se cierra la partida: pieza al mas alto en solitario, eliminado el mas bajo en solitario.
// Una respuesta ilegal se reemplaza por una legal con el azar sorteado en crearEstado (E.azar) y queda marcada invalida.
// TODOS los puntos son enteros en DOCEAVOS; solo el registro publico los convierte a decimales (aPuntos).

import { JUGADORES, RONDAS, ENFRENTAMIENTOS, TARJETAS, IDS_BLANCOS } from './constantes.js';
import { normalizarRespuesta } from './ordenes.js';
import { disponibles, valorDe } from './estado.js';
import { evaluarCombinacion, repartirPuntos, premioRonda, distanciaARango, aPuntos } from './combinaciones.js';
import { narrarLanzamiento, narrarEnfrentamiento, narrarCierreRonda } from './narracion.js';

const LARGO_CRUDO = 400; // caracteres de la respuesta cruda que se guardan cuando una respuesta fue invalida
const asientos = [...Array(JUGADORES).keys()];
const vacio = () => Array(JUGADORES).fill(null);
const dec = (xs) => xs.map(aPuntos);

function contar(E, s, motivo) {
  const st = E.stats[s];
  st.respuestas++;
  if (motivo) st.invalidas++;
  else st.validas++;
}

// Campos que comparten los dos registros. preguntados = false en el turno sin llamadas (invalidas es null para todos).
function comunes(preguntados, respuestas, motivos) {
  return {
    razones: asientos.map((s) => respuestas[s]?.razon || null),
    invalidas: asientos.map((s) => (preguntados ? motivos[s] !== null : null)),
    motivos,
    errores: asientos.map((s) => respuestas[s]?.error ?? null),
    crudos: asientos.map((s) => (motivos[s] && typeof respuestas[s]?.crudo === 'string' ? respuestas[s].crudo.slice(0, LARGO_CRUDO) : null)),
  };
}

// Por que una respuesta no sirve en la prediccion (null si sirve). Solo importa el campo de esta fase.
function motivoTarjeta(resp, disp) {
  if (resp.motivo?.includes('sin respuesta')) return 'sin respuesta legible';
  if (resp.motivo?.includes('tarjeta mal')) return 'tarjeta mal formada';
  if (resp.tarjeta === null) return 'sin tarjeta';
  return disp.includes(resp.tarjeta) ? null : 'tarjeta ya usada';
}

function motivoDados(resp, disp) {
  if (resp.motivo?.includes('sin respuesta')) return 'sin respuesta legible';
  if (resp.motivo?.includes('dados mal')) return 'dados mal formados';
  if (resp.dados === null) return 'sin dados';
  if (resp.dados.length !== 3) return 'no son tres dados';
  return resp.dados.every((d) => disp.includes(d)) ? null : 'dado no disponible';
}

// Tres dados distintos de los disponibles, a partir de tres numeros sorteados de antemano.
function dadosAlAzar(disp, [u1, u2, u3]) {
  const pool = [...disp];
  return [u1, u2, u3].map((u) => pool.splice(Math.floor(u * pool.length), 1)[0]);
}

function turnoPrediccion(E, respuestas) {
  const r = E.ronda;
  const forzada = r === RONDAS;
  const motivos = vacio(), tarjetas = vacio();
  for (const s of asientos) {
    const disp = TARJETAS.filter((t) => !E.tarjetasUsadas[s].includes(t));
    if (forzada) { // solo queda una tarjeta: no se pregunta, no se cuenta como respuesta
      tarjetas[s] = disp[0];
      E.eligio[s] = false;
      continue;
    }
    const resp = respuestas[s] ?? normalizarRespuesta(null);
    motivos[s] = motivoTarjeta(resp, disp);
    tarjetas[s] = motivos[s] ? disp[Math.floor(E.azar.tarjeta[r - 1][s] * disp.length)] : resp.tarjeta;
    E.eligio[s] = motivos[s] === null;
    contar(E, s, motivos[s]);
  }
  E.tarjetaActual = tarjetas;
  E.fase = 'jugada';
  E.enfrentamiento = 1;
  const blancos = E.dados[r - 1].map((d) => [...d.blancos]);
  return {
    fase: 'prediccion', ronda: r, enfrentamiento: 0, forzada,
    lanzamiento: { blancos },
    ...comunes(!forzada, respuestas, motivos),
    // lo que las IAs nunca ven y el publico si, despues: las tarjetas (hasta el cierre de la ronda) y los dados ocultos
    oculto: { tarjetas: [...tarjetas], rojos: E.dados[r - 1].map((d) => d.rojo), azules: E.dados[r - 1].map((d) => d.azul) },
    final: null,
    narracion: narrarLanzamiento({ E, ronda: r, forzada, blancos }),
  };
}

// Cierra la partida: pieza para el de mas puntos (si es unico), eliminado el de menos (si es unico). Los puntos son docenos.
export function cerrarPartida(E) {
  const max = Math.max(...E.puntos), min = Math.min(...E.puntos);
  const arriba = asientos.filter((s) => E.puntos[s] === max);
  const abajo = asientos.filter((s) => E.puntos[s] === min);
  const pieza = arriba.length === 1 ? arriba[0] : null;
  const eliminado = abajo.length === 1 ? abajo[0] : null;
  for (const s of asientos) E.puesto[s] = s === pieza ? 'pieza' : s === eliminado ? 'eliminado' : 'medio';
  E.final = {
    pieza,
    eliminado,
    criterioPieza: pieza !== null ? 'puntos' : 'sin pieza',
    criterioEliminado: eliminado !== null ? 'puntos' : 'sin eliminado',
    ranking: [...asientos].sort((a, b) => E.puntos[b] - E.puntos[a] || a - b),
  };
  E.fin = true;
  return E.final;
}

// Tras el tercer enfrentamiento: revela y premia las tarjetas, anota las usadas y prepara la ronda siguiente (o cierra la partida).
function cerrarRonda(E) {
  const r = E.ronda;
  const tarjetas = [...E.tarjetaActual];
  const totalesD = [...E.puntosRonda];
  const premios = asientos.map((s) => premioRonda(tarjetas[s], totalesD[s]));
  const distancias = asientos.map((s) => (premios[s].acierto ? 0 : distanciaARango(tarjetas[s], totalesD[s])));
  for (const s of asientos) {
    E.puntos[s] += premios[s].puntos;
    E.puntosBase[s] += totalesD[s];
    E.rondaPuntos[s].push(premios[s].puntos);
    E.tarjetasUsadas[s].push(tarjetas[s]);
    if (E.eligio[s]) { // una tarjeta de reemplazo o la forzada de la ronda 4 no la eligio la IA
      const st = E.stats[s];
      st.predicciones++;
      if (premios[s].acierto) {
        st.aciertos++;
        if (tarjetas[s] === 'ZERO') st.ceros++;
      }
    }
  }
  const aciertos = premios.map((p) => p.acierto), puntosD = premios.map((p) => p.puntos);
  // una tarjeta de reemplazo la puso el juego; la de la ronda 4 tampoco la eligio nadie pero no es un reemplazo (solo quedaba una)
  const reemplazadas = E.eligio.map((e) => !e && r !== RONDAS);
  E.historial.push({ tipo: 'cierre', ronda: r, tarjetas, totales: totalesD, aciertos, puntos: puntosD, reemplazadas });
  const narracion = narrarCierreRonda({ tarjetas, totalesD, aciertos, puntosD, distancias });
  const publico = { tarjetas, totales: dec(totalesD), aciertos, puntos: dec(puntosD), acumulados: dec(E.puntos) };
  let final = null;
  if (r === RONDAS) {
    final = cerrarPartida(E);
  } else {
    E.ronda++;
    E.fase = 'prediccion';
    E.enfrentamiento = 0;
    E.tarjetaActual = vacio();
    E.eligio = Array(JUGADORES).fill(false);
    E.gastados = asientos.map(() => ({ blancos: [], rojo: false, azul: false }));
    E.puntosRonda = Array(JUGADORES).fill(0);
  }
  return { publico, narracion, final };
}

function turnoEnfrentamiento(E, respuestas) {
  const r = E.ronda, k = E.enfrentamiento;
  const motivos = vacio(), ids = vacio(), combos = [], entradas = [];
  for (const s of asientos) {
    const disp = disponibles(E, s);
    const resp = respuestas[s] ?? normalizarRespuesta(null);
    motivos[s] = motivoDados(resp, disp);
    ids[s] = motivos[s] ? dadosAlAzar(disp, E.azar.dados[r - 1][k - 1][s]) : resp.dados;
    contar(E, s, motivos[s]);
    const valores = ids[s].map((id) => valorDe(E, s, id));
    const { categoria, clave } = evaluarCombinacion(valores);
    // desempate: el dado BLANCO mas alto que le sobra despues de esta jugada (los ocultos sin usar no cuentan); 0 si no le queda ninguno
    const sobran = IDS_BLANCOS.filter((id) => !E.gastados[s].blancos.includes(id) && !ids[s].includes(id));
    entradas.push({ clave, desempate: sobran.length ? Math.max(...sobran.map((id) => valorDe(E, s, id))) : 0 });
    combos.push({ dados: [...ids[s]], valores, categoria, ocultos: ids[s].filter((id) => !IDS_BLANCOS.includes(id)) });
  }
  const rep = repartirPuntos(entradas);
  for (const s of asientos) {
    const g = E.gastados[s];
    for (const id of ids[s]) {
      if (id === 'rojo') g.rojo = true;
      else if (id === 'azul') g.azul = true;
      else g.blancos.push(id);
    }
    E.puntosRonda[s] += rep.puntos[s];
    E.stats[s].puntosDeDados += rep.puntos[s];
    if (motivos[s] === null) E.stats[s].ocultosUsados += combos[s].ocultos.length; // un oculto de reemplazo no mide a la IA
  }
  const reemplazadas = motivos.map((m) => m !== null); // jugadas que puso el juego por una respuesta ilegal (publico: el historial las marca)
  E.historial.push({
    tipo: 'enfrentamiento', ronda: r, enfrentamiento: k,
    combos: combos.map((c) => ({ dados: c.dados, valores: c.valores, categoria: c.categoria })), puntos: [...rep.puntos], reemplazadas,
  });
  const puntosRonda = dec(E.puntosRonda); // antes de que el cierre los reinicie
  let narracion = narrarEnfrentamiento({ E, ronda: r, k, combos, puntosD: rep.puntos, puesto: rep.puesto, porDesempate: rep.porDesempate, reemplazadas });
  let cierre = null, final = null;
  if (k === ENFRENTAMIENTOS) {
    const c = cerrarRonda(E);
    cierre = c.publico;
    final = c.final;
    narracion = [...narracion, ...c.narracion];
  } else {
    E.enfrentamiento++;
  }
  return {
    fase: 'jugada', ronda: r, enfrentamiento: k,
    combos,
    puntos: dec(rep.puntos), puesto: rep.puesto, porDesempate: rep.porDesempate, puntosRonda,
    cierre,
    ...comunes(true, respuestas, motivos),
    oculto: { rojos: E.dados[r - 1].map((d) => d.rojo), azules: E.dados[r - 1].map((d) => d.azul) },
    final,
    narracion,
  };
}

// respuestas[s]: respuesta normalizada (con `error` y `crudo` si los puso la arena) o null.
export function aplicarTurno(E, respuestas) {
  if (E.fin) throw new Error('La partida ya termino.');
  return E.fase === 'prediccion' ? turnoPrediccion(E, respuestas) : turnoEnfrentamiento(E, respuestas);
}
