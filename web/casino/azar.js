// Aleatorio con seed para las escenas. Es una COPIA de src/rng.js: el sitio publica solo web/ y data/, asi que una pagina no puede
// importar de src/. src/pruebas/escena/camara.test.js compara las dos secuencias para que no se separen.
// Nunca uses Math.random() en una escena: el mismo archivo tiene que dar siempre el mismo video.

export function crearAzar(seed) {
  let a = seed >>> 0;
  return function azar() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Texto -> seed numerico estable (FNV-1a), igual que seedDesdeTexto de src/rng.js.
export function seedDeTexto(texto) {
  let h = 2166136261;
  for (const c of String(texto)) {
    h ^= c.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const azarDesdeTexto = (texto) => crearAzar(seedDeTexto(texto));
