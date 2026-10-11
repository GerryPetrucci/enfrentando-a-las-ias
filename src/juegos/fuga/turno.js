// Una ronda de La Fuga. Muta el estado y devuelve el registro (lo que se guarda en los datos y lo que lee el reproductor).
// Orden de las cosas: 1) fallo y dado de cada uno con el estado al EMPEZAR la ronda, 2) tentaciones, 3) consecuencias,
// 4) alarma, 5) promesas y cohesion, 6) estadisticas, 7) narracion, final y registro.
// Salida anticipada: quien se separa y pasa la situacion sin que lo capturen puede escapar de inmediato (probabilidad oculta
// segun la fase); deja la partida y el otro sigue solo.

import { RONDAS, PUNTOS, TURNOS_OBJETO, ALARMA_MAX, COHESION_MAX, SALIDA_ANTICIPADA, nivelAlerta } from './constantes.js';
import { porId } from './catalogo.js';
import { probFallo } from './riesgo.js';
import { tentacionDe } from './tentacion.js';
import { normalizarRespuesta } from './ordenes.js';
import { narrarRonda } from './narracion.js';

const LARGO_CRUDO = 400; // caracteres de la respuesta cruda que se guardan cuando una respuesta fue invalida
const acotar = (v, min, max) => Math.max(min, Math.min(max, v));

// Cierra la partida y suma los puntos finales. Final de cada prisionero:
//   conjunto    los dos siguen libres al final            (escapeConjunto)
//   solo        sigue libre y capturaron a su companero   (escapeSolo)
//   abandonado  sigue libre y su companero escapo antes   (escapeAbandonado: cobra mas, compensa el abandono)
//   anticipada  escapo por su cuenta a mitad de camino    (escapeSolo)
//   capturado   0
function cerrar(E) {
  const libres = E.libres.filter(Boolean).length;
  E.finales = [0, 1].map((i) => {
    if (E.salio[i]) return 'anticipada';
    if (!E.libres[i]) return 'capturado';
    if (libres === 2) return 'conjunto';
    return E.salio[1 - i] ? 'abandonado' : 'solo';
  });
  // Los extras (botin y delacion) solo cuentan si escapas: quien es capturado se queda en 0 en total.
  const perdidos = E.finales.map((f, i) => (f === 'capturado' ? E.puntos[i] : 0));
  perdidos.forEach((p, i) => { E.puntos[i] -= p; });
  E.perdidos = perdidos;
  const valor = { conjunto: PUNTOS.escapeConjunto, solo: PUNTOS.escapeSolo, abandonado: PUNTOS.escapeAbandonado, anticipada: PUNTOS.escapeSolo, capturado: 0 };
  const bono = E.finales.map((f) => valor[f]);
  bono.forEach((b, i) => { E.puntos[i] += b; });
  E.fin = true;
  return { finales: [...E.finales], bono, perdidos };
}

// respuestas[i]: respuesta normalizada (con `error` y `crudo` si los puso la arena) o null para un prisionero capturado.
export function aplicarTurno(E, respuestas) {
  const r = E.ronda;
  const sit = E.situaciones[r];
  const def = porId.get(sit.id);
  const J = [0, 1].map((i) => (E.libres[i] ? (respuestas[i] ?? normalizarRespuesta(null)) : null));
  const dos = J[0] !== null && J[1] !== null;
  const alarmaAntes = E.alarma, cohesionAntes = E.cohesion;
  const heridasAntes = [...E.heridas];
  const promesasPrevias = [...E.promesas];

  // 1) fallo y dado de cada prisionero. Falla con 0 heridas = tropieza; con 1 o mas = cae.
  const fallos = [null, null], resultados = [null, null];
  for (const i of [0, 1]) {
    if (!J[i]) continue;
    fallos[i] = probFallo(sit, J, i, E);
    resultados[i] = E.dados[r][i] >= fallos[i] ? 'limpio' : heridasAntes[i] === 0 ? 'tropezo' : 'cayo';
  }

  // 2) tentacion (la de quien va acompanado o la de quien va solo, ver tentacion.js): botin (solo uno; si lo piden los dos, el
  // dado mas bajo) u oferta del guardia (solo con los dos en juego)
  const tent = tentacionDe(E, r);
  const puntosGanados = [0, 0];
  let tentacion = null;
  if (tent) {
    const quieren = [0, 1].filter((i) => J[i]?.aprovechar);
    tentacion = { tipo: tent.tipo, tomo: null, delataron: [], ...(tent.objeto ? { objeto: tent.objeto } : {}) };
    if (tent.tipo === 'botin' && quieren.length) {
      tentacion.tomo = quieren.length === 1 ? quieren[0] : (E.dados[r][0] <= E.dados[r][1] ? 0 : 1);
      puntosGanados[tentacion.tomo] += tent.valor;
    } else if (tent.tipo === 'oferta' && dos) {
      tentacion.delataron = quieren;
      for (const d of quieren) puntosGanados[d] += tent.valor;
    }
  }

  // salida anticipada: se separo, no lo capturaron en esta situacion y el dado oculto de la fase alcanza
  const salen = [0, 1].map((i) => dos && J[i].postura === 'separarse' && resultados[i] !== 'cayo' && E.salidas[r][i] < SALIDA_ANTICIPADA[sit.fase]);

  // 3) consecuencias: heridas, capturas, salidas y objeto (lo viejo se descuenta y despues se entrega el nuevo)
  for (const i of [0, 1]) {
    if (resultados[i] === 'tropezo') E.heridas[i]++;
    if (resultados[i] === 'cayo') E.libres[i] = false;
    if (salen[i]) { E.salio[i] = true; E.libres[i] = false; }
  }
  // la delacion solo agrava al delatado si ya venia herido (a uno sano no lo deja a un fallo de la captura); la confianza cae igual
  for (const d of tentacion?.delataron ?? []) if (heridasAntes[1 - d] > 0) E.heridas[1 - d]++;
  for (const i of [0, 1]) if (E.objeto[i] && E.objeto[i].restan > 0) E.objeto[i].restan--;
  if (tentacion?.tomo != null) E.objeto[tentacion.tomo] = { nombre: tentacion.objeto, restan: TURNOS_OBJETO };

  // 4) alarma: sube con tropiezos, caidas, fuerza, esperar y botin; si no paso nada de eso, baja uno
  const usa = (m) => J.some((j) => j?.metodo === m);
  const ruido = resultados.filter((x) => x === 'tropezo' || x === 'cayo').length
    + (usa('fuerza') ? 1 : 0) + (usa('esperar') ? 1 : 0) + (tentacion?.tomo != null ? 1 : 0);
  E.alarma = acotar(E.alarma + (ruido > 0 ? ruido : -1), 0, ALARMA_MAX);

  // 5) promesas y cohesion (la cohesion solo cambia si los dos seguian libres)
  const promesaRota = [0, 1].map((i) => dos && promesasPrevias[i] !== null && promesasPrevias[i] !== J[i].postura);
  if (dos) {
    const separa = J.some((j) => j.postura === 'separarse');
    const delata = (tentacion?.delataron.length ?? 0) > 0;
    const rotas = promesaRota.filter(Boolean).length;
    const cambio = (separa ? -2 : 0) + (delata ? -3 : 0) - rotas + (!separa && !delata && rotas === 0 ? 1 : 0);
    E.cohesion = acotar(E.cohesion + cambio, -COHESION_MAX, COHESION_MAX);
  }
  E.promesas = J.map((j) => j?.promesa ?? null);
  E.mensajes = J.map((j) => j?.mensaje || null);

  // 6) estadisticas y puntos
  for (const i of [0, 1]) {
    if (!J[i]) continue;
    const st = E.stats[i], j = J[i];
    if (j.invalida) st.invalidas++;
    if (dos) {
      if (j.postura === 'ayudar') st.ayudas++;
      if (j.postura === 'sacrificarse') st.sacrificios++;
      if (j.postura === 'separarse') st.separaciones++;
      if (promesasPrevias[i] !== null) {
        st.promesasHechas++;
        if (promesaRota[i]) st.promesasRotas++;
      }
    }
    if (tentacion?.tomo === i) st.botines++;
    if (tentacion?.delataron.includes(i)) st.delaciones++;
  }
  [0, 1].forEach((i) => { E.puntos[i] += puntosGanados[i]; });

  // 7) narracion, final y registro
  E.ronda++;
  const narracion = narrarRonda({ E, num: r + 1, sit, def, jugadas: J, fallos, resultados, tentacion, salen, alarmaAntes, cohesionAntes });
  const final = E.ronda >= RONDAS || (!E.libres[0] && !E.libres[1]) ? cerrar(E) : null;

  const registro = {
    ronda: r + 1,
    situacion: { id: sit.id, fase: sit.fase, titulo: def.titulo, corto: def.corto },
    jugadas: J.map((j) => (j ? { postura: j.postura, metodo: j.metodo, aprovechar: j.aprovechar } : null)),
    promesasPrevias,
    promesaRota,
    promesasNuevas: [...E.promesas],
    mensajes: [...E.mensajes],
    razones: J.map((j) => j?.razon || null),
    invalidas: J.map((j) => (j ? j.invalida : null)),
    errores: [0, 1].map((i) => respuestas[i]?.error ?? null),
    crudos: [0, 1].map((i) => (respuestas[i]?.invalida && typeof respuestas[i].crudo === 'string' ? respuestas[i].crudo.slice(0, LARGO_CRUDO) : null)),
    resultados,
    puntosGanados,
    puntosAcumulados: [...E.puntos],
    salieron: salen, // true: escapo por su cuenta en esta situacion
    alerta: nivelAlerta(E.alarma),
    tentacion,
    narracion,
    // Lo que las IAs nunca ven (la vista no lo toca) y el publico si: el reproductor lo muestra tal cual.
    oculto: {
      peligro: sit.peligro, ajuste: sit.ajuste, mejorMetodo: def.mejor, pistaFiable: sit.pistaFiable, pistaApuntaA: sit.apuntaA,
      fallo: fallos, dados: [...E.dados[r]], alarma: E.alarma, cohesion: E.cohesion,
      salida: { prob: SALIDA_ANTICIPADA[sit.fase], dados: [...E.salidas[r]] },
    },
    final,
  };
  E.historial.push(registro);
  return registro;
}
