// Lo que ve el jugador i. Es el UNICO lugar donde se decide que sabe cada uno (CLAUDE.md, invariante 2). Texto sin acentos: forma parte del
// prompt. El secreto de este juego es el banco de los demas y cuanto apostaron: aqui solo se lee el banco, las apuestas y las fichas PROPIAS,
// mas lo publico (las fichas de todos y quien gano cada subasta). Una prueba de no interferencia cambia lo ajeno y exige la misma vista.

import { JUGADORES, SUBASTAS, segundos } from './constantes.js';

const asientos = [...Array(JUGADORES).keys()];
const dec = (decimas) => segundos(decimas).toFixed(1);

export function vistaTexto(E, i) {
  const restan = SUBASTAS - E.subasta;
  const L = [];
  L.push(`SUBASTA ${E.subasta} DE ${SUBASTAS} (${restan === 0 ? 'es la ultima' : `despues de esta quedan ${restan}`})`);
  L.push(`Tu banco: ${dec(E.bancos[i])} segundos`);
  L.push(`Tus fichas: ${E.fichas[i]}`);
  L.push('', 'FICHAS DE TODOS (solo se anuncia quien gana cada subasta):');
  L.push(asientos.map((s) => `Jugador ${s + 1}${s === i ? ' (tu)' : ''}: ${E.fichas[s]}`).join(' | '));
  if (E.historial.length) {
    L.push('', 'HISTORIAL (tu apuesta es la tuya; la de los demas no se sabe):');
    for (const h of E.historial) {
      const mia = E.apuestas[i].find((a) => a.subasta === h.subasta);
      L.push(`S${h.subasta}: ${h.ganador === null ? 'nadie gana' : `gana J${h.ganador + 1}`}${mia ? ` | tu apuesta ${dec(mia.decimas)}` : ''}`);
    }
  }
  L.push('', 'AHORA: responde "apuesta" con los segundos que mantienes (0 para retirarte; si pides mas de lo que tienes, apuestas todo tu banco), y "razon".');
  return L.join('\n');
}
