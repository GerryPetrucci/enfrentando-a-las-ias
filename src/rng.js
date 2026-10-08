// Aleatorio reproducible. Mismo seed = misma partida, siempre.
// Esto es lo que te permite publicar el seed y que cualquiera verifique el resultado.

export function crearRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Convierte un texto en un seed numerico estable (FNV-1a).
export function seedDesdeTexto(texto) {
  let h = 2166136261;
  for (const c of String(texto)) {
    h ^= c.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
