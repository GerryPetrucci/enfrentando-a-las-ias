// Estrategias de control de El numero solitario. No son IAs: sirven para probar el motor y para medir el juego. Leen el estado COMPLETO,
// nunca lo modifican y devuelven una respuesta cruda como la de una IA. El azar usa solo el rng de su asiento.
// En la fase 1 devuelven { cartas }, en la fase 2 { juega }.

import { disponibles } from './solitario/estado.js';

const razon = 'bot de control';
const dosPrimeras = (lista) => lista.slice(0, 2).sort((a, b) => a - b);

// Las dos cartas mas bajas; juega la mas baja.
export function bajo(E, s) {
  return E.fase === 1 ? { cartas: dosPrimeras(disponibles(E, s)), razon } : { juega: E.parejas[s][0], razon };
}

// Pareja al azar; marca al azar.
export function azar(E, s, rng) {
  const pick = (lista) => lista[Math.floor(rng() * lista.length)];
  if (E.fase === 2) return { juega: pick(E.parejas[s]), razon };
  const d = disponibles(E, s);
  const a = pick(d);
  return { cartas: [a, pick(d.filter((c) => c !== a))], razon };
}

// Pareja de numeros del medio (con un poco de ruido); juega la menor.
export function medio(E, s, rng) {
  if (E.fase === 2) return { juega: E.parejas[s][0], razon };
  const d = disponibles(E, s);
  const ruido = new Map(d.map((c) => [c, Math.abs(c - 4) + rng() * 1.5]));
  return { cartas: dosPrimeras([...d].sort((a, b) => ruido.get(a) - ruido.get(b))), razon };
}

// Lee la mesa. Fase 1: evita los numeros que mas jugaron los rivales (y prefiere los bajos-medios). Fase 2: juega la carta de su pareja
// que menos rivales mostraron; si empatan, la menor.
export function lector(E, s) {
  if (E.fase === 2) {
    const mostrados = (c) => E.parejas.filter((p, t) => t !== s && p && p.includes(c)).length;
    const [a, b] = E.parejas[s];
    return { juega: mostrados(b) < mostrados(a) ? b : a, razon };
  }
  const frecuencia = (c) => E.historial.reduce((n, reg) => n + reg.marcas.filter((m, t) => t !== s && m === c).length, 0);
  const ordenadas = [...disponibles(E, s)].sort((a, b) => frecuencia(a) - frecuencia(b) || Math.abs(a - 3) - Math.abs(b - 3) || a - b);
  return { cartas: dosPrimeras(ordenadas), razon };
}

// Sube con la ronda: apunta a un numero que crece en cada ciclo y juega la menor de su pareja.
export function escalera(E, s) {
  if (E.fase === 2) return { juega: E.parejas[s][0], razon };
  const objetivo = ((E.ronda - 1) % 6) + 2;
  const ordenadas = [...disponibles(E, s)].sort((a, b) => Math.abs(a - objetivo) - Math.abs(b - objetivo) || a - b);
  return { cartas: dosPrimeras(ordenadas), razon };
}

export const BOTS = { bajo, azar, medio, lector, escalera };

// Como se muestran en el marcador y el video (texto publico: lleva acentos si hace falta). Los colores son de control, no de una IA.
export const INFO_BOTS = {
  bajo: { nombre: 'Siempre bajo', color: '#8FA3B8' },
  azar: { nombre: 'Al azar', color: '#9C8FB8' },
  medio: { nombre: 'Medio', color: '#B8A86F' },
  lector: { nombre: 'Lector', color: '#6FB8A0' },
  escalera: { nombre: 'Escalera', color: '#B87F6F' },
};
