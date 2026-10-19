// Los nombres de reino de la Guerra de territorios. Los modelos los ven en su prompt y los usan en sus mensajes y razones («Ámbar propone paz a Azur»); la escena nombra a cada reino con el modelo que lo
// juega, asi que el marcador pone los dos juntos para que el publico entienda de quien se habla. Cada partida guarda el reino de cada asiento (`reinos`: el nombre de color coincide con el color de su IA,
// src/juegos/conquista/nombres.js); una partida vieja sin ese dato usa los nombres por asiento de siempre. Son los mismos de src/juegos/conquista/nombres.js (la web no puede importar de src/:
// src/pruebas/escena/reinos-conq.test.js los ata), con acentos porque es texto publico.

// nombre del motor (sin acento) -> nombre publico, en el orden del motor
export const NOMBRES_PUBLICOS = { Azur: 'Azur', Ambar: 'Ámbar', Violeta: 'Violeta', Rosa: 'Rosa', Marfil: 'Marfil', Iris: 'Iris' };
const POR_ASIENTO = ['Azur', 'Ambar', 'Violeta', 'Rosa', 'Marfil'];

// El reino del asiento k: el que guardo la partida (`reinos`) o, sin el, el de siempre; '' si el asiento no existe (un dato raro nunca rompe el marcador).
export function nombreDeReino(k, reinos) {
  if (!Number.isInteger(k) || k < 0 || k >= POR_ASIENTO.length) return '';
  const guardado = Array.isArray(reinos) && typeof reinos[k] === 'string' && reinos[k] ? reinos[k] : POR_ASIENTO[k];
  return NOMBRES_PUBLICOS[guardado] ?? guardado;
}
