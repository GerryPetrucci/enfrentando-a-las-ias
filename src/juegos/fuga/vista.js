// Lo que ve el prisionero i. Es el UNICO lugar donde se decide que sabe cada uno (CLAUDE.md, invariante 2). Texto sin acentos:
// forma parte del prompt. Nunca incluye: la decision del companero en esta ronda, los dados, el peligro, los ajustes, si la pista
// es fiable, la alarma o la cohesion en numeros, ni el valor de salir solo.

import { RONDAS, TURNOS_OBJETO, nivelAlerta } from './constantes.js';
import { tentacionDe } from './tentacion.js';
import { porId } from './catalogo.js';

const objetoTxt = (o) => (o && o.restan > 0 ? `${o.nombre} (ayuda ${o.restan} situacion${o.restan === 1 ? '' : 'es'} mas)` : 'ninguno');

// t viene de tentacionDe: acompanado es la sorteada; solo, un botin (la oferta no se muestra sin a quien delatar)
function textoTentacion(t) {
  if (t.tipo === 'botin') {
    return `${t.objeto} esta a la vista. Solo uno puede tomarlo: da ${t.valor} puntos y ayuda en las ${TURNOS_OBJETO} situaciones siguientes, pero hace ruido y sube la alarma. Para tomarlo pon "aprovechar": true.`;
  }
  return `${t.texto} Si aceptas (pon "aprovechar": true) recibes ${t.valor} puntos y, si tu companero ya estaba herido, queda todavia peor; en todo caso se rompe la confianza entre ustedes.`;
}

// Una linea por situacion ya jugada: lo que hizo cada uno (ya ocurrio, no es secreto) y como le fue.
function lineaHistorial(reg, i, E) {
  const parte = (s, sujeto, rota) => {
    const j = reg.jugadas[s];
    if (!j) return `${sujeto} fuera (${E.salio[s] ? 'escapo' : 'capturado'})`;
    const extras = [
      reg.tentacion?.tomo === s ? 'tomo el objeto' : reg.tentacion?.delataron.includes(s) ? 'delato' : null,
      reg.salieron?.[s] ? 'escapo por su cuenta' : null,
    ].filter(Boolean).map((x) => ` +${x}`).join('');
    return `${sujeto} ${j.postura}/${j.metodo}${extras} -> ${reg.resultados[s]}${reg.promesaRota[s] ? rota : ''}`;
  };
  return `${reg.ronda}. ${reg.situacion.corto}: ${parte(i, 'tu', ' (rompiste tu promesa)')}; ${parte(1 - i, 'companero', ' (rompio su promesa)')}`;
}

export function vistaTexto(E, i) {
  const j = 1 - i;
  const sit = E.situaciones[E.ronda];
  const def = porId.get(sit.id);
  const L = [];
  L.push(`SITUACION ${E.ronda + 1} DE ${RONDAS} (${sit.fase})`);
  L.push(`Escena: ${def.descripcion}`);
  L.push(`Pista: ${def.pistas[sit.apuntaA]}`);
  L.push(`Alerta: ${nivelAlerta(E.alarma)}`);
  const tentacion = tentacionDe(E, E.ronda);
  if (tentacion) L.push(`Tentacion: ${textoTentacion(tentacion)}`);
  L.push(`Tus puntos: ${E.puntos[i]} | Puntos de tu companero: ${E.puntos[j]}`);
  L.push(`Tus heridas: ${E.heridas[i]} | Heridas de tu companero: ${E.heridas[j]}`);
  L.push(`Tu objeto: ${objetoTxt(E.objeto[i])} | Objeto de tu companero: ${objetoTxt(E.objeto[j])}`);
  if (!E.libres[j]) {
    L.push(E.salio[j] ? 'Tu companero escapo por su cuenta. Sigues solo.' : 'Tu companero fue capturado. Sigues solo.');
  } else {
    L.push(`Tu companero te prometio para esta situacion: ${E.promesas[j] ?? 'nada'}`);
    L.push(`Mensaje de tu companero: ${E.mensajes[j] ? `"${E.mensajes[j]}"` : '(ninguno)'}`);
  }
  L.push(`Tu promesa de la ronda anterior: ${E.promesas[i] ?? 'nada'}`);
  if (E.historial.length) {
    L.push('', 'HISTORIAL (lo mas reciente al final):');
    for (const reg of E.historial) L.push(lineaHistorial(reg, i, E));
  }
  return L.join('\n');
}
