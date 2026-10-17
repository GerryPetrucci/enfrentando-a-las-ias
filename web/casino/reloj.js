// El reloj de la Subasta de tiempo: el contador empieza a ritmo normal (un segundo de pantalla por cada segundo de reloj), se acelera en el medio y termina a ritmo normal. Una
// apuesta puede ser de 600 s y no se pueden esperar en un video: asi el publico vive el principio y el final de cada subasta en tiempo real y el medio se resume.
//
// Es una funcion PURA del tiempo de pantalla: nunca usa el reloj del equipo, asi que el mismo archivo se ve siempre igual. Las cifras las dijo el usuario (16 de octubre de 2026):
//   - los primeros 3 s y los ultimos 3 s van a ritmo normal (los mismos al inicio y al final);
//   - el tramo del medio dura en pantalla min(medio, clamp(medio / 8, 2, 6)) s, con medio = apuesta - 6 (una apuesta de 30 s: 3 + 3 + 3 = 9 s de video; una de 600 s: 3 + 6 + 3 = 12 s);
//   - el cambio de velocidad es una rampa lineal corta (menos de 0.5 s), sin saltos;
//   - con una apuesta de 8 s o menos todo va a ritmo normal (acelerar no ganaria nada).
//
// Sin DOM ni `window`: lo importan la mesa (navegador) y las pruebas (Node).

export const SEGUNDOS_NORMALES = 3; // al inicio y al final
export const UMBRAL_NORMAL = 8; // una apuesta de este tamano o menos no se acelera
const RAMPA_MAXIMA = 0.45; // segundos que dura el cambio de velocidad

const legible = (x) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : 0);

// La forma del reloj para una apuesta: { acelera, medio (s de reloj del tramo acelerado), duracionMedio (s de pantalla), rampa, velocidad (la maxima, constante en el centro), duracion }.
export function perfilDeReloj(apuestaMax) {
  const a = legible(apuestaMax);
  if (a <= UMBRAL_NORMAL) return { acelera: false, medio: 0, duracionMedio: 0, rampa: 0, velocidad: 1, duracion: a };
  const medio = a - 2 * SEGUNDOS_NORMALES;
  const duracionMedio = Math.min(medio, Math.min(6, Math.max(2, medio / 8)));
  const rampa = Math.min(RAMPA_MAXIMA, duracionMedio / 4);
  // area bajo la velocidad: rampa de subida + tramo constante + rampa de bajada = medio  ->  velocidad = (medio - rampa) / (duracionMedio - rampa)
  const velocidad = (medio - rampa) / (duracionMedio - rampa);
  return { acelera: true, medio, duracionMedio, rampa, velocidad, duracion: 2 * SEGUNDOS_NORMALES + duracionMedio };
}

// Cuanto dura en pantalla el reloj de una apuesta (segundos).
export const duracionDeReloj = (apuestaMax) => perfilDeReloj(apuestaMax).duracion;

// Lo que marca el contador (segundos de reloj) cuando han pasado `t` segundos de pantalla. 0 antes de empezar y la apuesta misma al terminar (nunca se pasa).
export function tiempoDeReloj(t, apuestaMax) {
  const a = legible(apuestaMax);
  const x = legible(t);
  if (!a || !x) return 0;
  const p = perfilDeReloj(a);
  if (!p.acelera) return Math.min(x, a);
  if (x <= SEGUNDOS_NORMALES) return x;
  const { rampa: r, velocidad: V, duracionMedio: dM } = p;
  const u = x - SEGUNDOS_NORMALES; // segundos de pantalla dentro del tramo del medio
  const base = SEGUNDOS_NORMALES;
  const subida = (r * (1 + V)) / 2; // reloj que gana la rampa de subida
  const crucero = V * (dM - 2 * r);
  if (u <= r) return base + u + ((V - 1) * u * u) / (2 * r);
  if (u <= dM - r) return base + subida + V * (u - r);
  if (u <= dM) { const w = u - (dM - r); return base + subida + crucero + V * w - ((V - 1) * w * w) / (2 * r); }
  return Math.min(a, a - SEGUNDOS_NORMALES + (x - (SEGUNDOS_NORMALES + dM)));
}

// El instante de pantalla en que el contador llega a `apuesta` (la inversa de tiempoDeReloj): es cuando se suelta el boton de quien aposto eso.
export function instanteDeCruce(apuesta, apuestaMax) {
  const a = legible(apuestaMax);
  const c = legible(apuesta);
  if (!a || !c) return 0;
  const p = perfilDeReloj(a);
  if (c >= a) return p.duracion;
  if (!p.acelera || c <= SEGUNDOS_NORMALES) return c;
  if (c >= a - SEGUNDOS_NORMALES) return SEGUNDOS_NORMALES + p.duracionMedio + (c - (a - SEGUNDOS_NORMALES));
  const { rampa: r, velocidad: V, duracionMedio: dM } = p;
  const dentro = c - SEGUNDOS_NORMALES; // reloj ganado dentro del tramo del medio
  const subida = (r * (1 + V)) / 2;
  const crucero = V * (dM - 2 * r);
  let u;
  if (dentro <= subida) u = (r * (-1 + Math.sqrt(1 + (2 * (V - 1) * dentro) / r))) / (V - 1); // resuelve (V-1)/(2r) u^2 + u = dentro
  else if (dentro <= subida + crucero) u = r + (dentro - subida) / V;
  else { const resto = dentro - subida - crucero; u = dM - r + (r * (V - Math.sqrt(Math.max(0, V * V - (2 * (V - 1) * resto) / r)))) / (V - 1); } // resuelve V w - (V-1)/(2r) w^2 = resto
  return SEGUNDOS_NORMALES + u;
}
