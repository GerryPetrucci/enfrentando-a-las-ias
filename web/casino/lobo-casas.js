import { REPARTOS_PUBLICOS } from './lobo-repartos-publicos.js';
import { crearAzar, seedDeTexto } from './azar.js';
export function mezclarCasas(jugadores, seed) {
  const reparto = REPARTOS_PUBLICOS[jugadores];
  if (!reparto) throw new Error('No existe reparto público para esa mesa.');
  const casas = [...reparto];
  // Dominio y RNG exclusivos de ambientación. No usa roles, nombres ni orden
  // de asientos reales; no comparte el shuffle de crearEstado.
  const azar = crearAzar(seedDeTexto(`lobo:casas-publicas:v1:${jugadores}:${seed}`));
  for (let i = casas.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [casas[i], casas[j]] = [casas[j], casas[i]];
  }
  return casas;
}
