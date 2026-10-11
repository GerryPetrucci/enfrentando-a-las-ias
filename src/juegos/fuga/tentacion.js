// La tentacion efectiva de una situacion. Acompanado es la que sorteo estado.js. Solo (su companero fue capturado o ya escapo
// por su cuenta) sale mucho mas botin: es la compensacion de quedarse atras (enmienda del 10 de octubre de 2026). La oferta del
// guardia no tiene sentido sin a quien contarle, asi que en solitario se vuelve un botin. Es una funcion pura: usa los numeros
// sorteados de antemano en el estado (botinSolo) y no toca el rng.

import { porId } from './catalogo.js';
import { PUNTOS, P_BOTIN_SOLO, OBJETOS_SOLO } from './constantes.js';

// true si queda exactamente un prisionero en juego (no capturado y que no haya escapado)
export const esSolo = (E) => E.libres.filter(Boolean).length === 1;

// null | { tipo: 'botin', valor, objeto } | { tipo: 'oferta', valor, texto }
export function tentacionDe(E, r) {
  const sit = E.situaciones[r];
  const def = porId.get(sit.id);
  if (!def.tentacion) return null; // el catalogo no admite tentacion en esta situacion
  if (!esSolo(E)) {
    if (!sit.tentacion) return null;
    return sit.tentacion.tipo === 'botin'
      ? { tipo: 'botin', valor: sit.tentacion.valor, objeto: def.tentacion.objeto }
      : { tipo: 'oferta', valor: sit.tentacion.valor, texto: def.tentacion.texto };
  }
  const [aparece, cual] = E.botinSolo[r];
  if (aparece >= P_BOTIN_SOLO) return null;
  const objeto = def.tentacion.tipo === 'botin' ? def.tentacion.objeto : OBJETOS_SOLO[Math.floor(cual * OBJETOS_SOLO.length)];
  return { tipo: 'botin', valor: PUNTOS.botin, objeto };
}
