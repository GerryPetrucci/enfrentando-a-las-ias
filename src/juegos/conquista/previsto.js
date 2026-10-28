// «Disponible al gastar» (28-10-2026): lo que un reino tendra cuando se apliquen SUS ordenes de gasto = el almacen del cierre anterior + la produccion de este turno (y el evento del
// mundo, si toca) - el hambre. La vista se lo da calculado porque esa aritmetica no es el juego y a mano era lo que mas razonamiento gastaba (privado/spec/guerra-prompt-2.3.0.md).
// No se reimplementa ninguna regla: se corren las MISMAS fases del motor (evento, produccion, hambre) sobre una copia del estado, asi que no puede diferir de lo que de verdad pasa
// (src/pruebas/conquista/previsto.test.js lo comprueba contra partidas enteras). Solo mira datos propios del reino i: nada de los almacenes ajenos.

import { nuevoContexto } from './turno/contexto.js';
import { recoleccion, hambre } from './turno/economia.js';
import { eventosDelMundo } from './turno/mundo.js';
import { totalUnidades, pila as pilaDe } from './estado.js';
import { racionesDe } from './unidades.js';
import { RECURSOS, COMIDA } from './constantes.js';

// -> null si el reino cayo; si no { stock, produccion: { recurso: n }, hambre: { necesita, come, faltaComida }, desertan, unidades }
//    stock: lo disponible al gastar · produccion: lo que suma el turno (con el evento) · hambre.necesita: Comida que piden las tropas · hambre.come: la que de verdad se descuenta
//    desertan: unidades que se pierden por falta de Comida · unidades: las que quedaran al empezar tus ordenes.
export function disponibleAlGastar(E, i) {
  if (!E.reinos[i]?.vivo) return null;
  const C = structuredClone(E);
  const ctx = nuevoContexto(C, []);
  const antes = { ...C.reinos[i].stock };
  eventosDelMundo(ctx); // la caravana suma recursos y la peste quita unidades ANTES de producir y comer
  recoleccion(ctx);
  const trasProduccion = { ...C.reinos[i].stock };
  const unidadesAntes = totalUnidades(C, i);
  let raciones = 0;
  for (let r = 0; r < C.mapa.regs.length; r++) raciones += racionesDe(pilaDe(C, r, i));
  const necesita = Math.ceil(raciones / COMIDA.tropasPorRacion);
  hambre(ctx);
  const stock = { ...C.reinos[i].stock };
  const unidades = totalUnidades(C, i);
  return {
    stock,
    produccion: Object.fromEntries(RECURSOS.map((r) => [r, trasProduccion[r] - antes[r]])),
    hambre: { necesita, come: trasProduccion.Comida - stock.Comida, faltaComida: trasProduccion.Comida < necesita },
    desertan: unidadesAntes - unidades,
    unidades,
  };
}
