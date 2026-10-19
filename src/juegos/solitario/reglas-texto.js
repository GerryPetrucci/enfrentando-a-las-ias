// EL PROMPT de El numero solitario. Es parte del contrato: sin acentos ni enies, igual para todas las IAs, y si cambia sube la version de reglas del juego
// (las partidas anteriores no se comparan con las nuevas). No hay regla oculta: todo lo que importa esta aqui. Los numeros salen de las constantes para no desincronizarse.

import { JUGADORES, RONDAS, RONDAS_POR_CICLO, CARTAS, CORTES, FINALISTAS, PUESTO_PUNTOS } from './constantes.js';

export const REGLAS = `Eres uno de ${JUGADORES} jugadores en un juego de cartas con eliminacion. Cada jugador tiene su propio mazo de ${CARTAS.length} cartas, numeradas del 1 al ${CARTAS.length}. La partida tiene ${RONDAS} rondas, en dos ciclos de ${RONDAS_POR_CICLO}.

COMO ES UNA RONDA (todos deciden a la vez y en secreto)
Fase 1, elegir pareja: eliges dos cartas distintas de las que tienes disponibles. Respondes con "cartas": [a, b].
Despues se revelan las parejas de todos: ves las dos cartas de cada rival, pero no cual jugara.
Fase 2, marcar: marcas cual de tus dos cartas juegas de verdad. Respondes con "juega": n, donde n es una de tus dos cartas. Nadie ve la marca de otro antes de que todos decidan.
Se revelan las marcas. Si dos o mas jugadores juegan el mismo numero, todas esas cartas se anulan. Entre las cartas que quedan, gana la ronda el numero mas bajo que aparece una sola vez. Si ningun numero queda solo, nadie gana la ronda.

QUE SE GANA
El ganador de la ronda recibe tantos puntos como el numero de su carta y una ficha de victoria. Nadie mas suma puntos en esa ronda.

TUS CARTAS
La carta que juegas se descarta. La otra carta de tu pareja queda bloqueada en la ronda siguiente (no puedes elegirla) y despues vuelve a tu mano. Al terminar la ronda ${RONDAS_POR_CICLO} todos reciben un mazo nuevo de ${CARTAS.length} cartas.

CORTES Y FINAL
Al final de las rondas ${CORTES[0]} y ${CORTES[1]}, el jugador con mas puntos acumulados queda a salvo y sale de la partida. Quedan ${FINALISTAS} jugadores para las rondas ${RONDAS_POR_CICLO + 1} a ${RONDAS}.
Al final de la ronda ${RONDAS}, entre los ${FINALISTAS} que quedan, el que tiene mas puntos gana la pieza, el que tiene menos es eliminado y el de en medio sobrevive.
Desempates: mas fichas de victoria; si siguen iguales, quien gano una ronda mas tarde; si aun asi, un sorteo.

TU PUNTAJE
Depende de tu puesto final: ganar la pieza ${PUESTO_PUNTOS.pieza}, quedar a salvo en un corte ${PUESTO_PUNTOS.salvo}, sobrevivir en el medio ${PUESTO_PUNTOS.medio}, ser eliminado ${PUESTO_PUNTOS.eliminado}.`;

export const FORMATO = `{"cartas": [a, b], "juega": n, "razon": "una frase explicando tu decision"}
En la fase 1 llena "cartas" (dos cartas distintas disponibles) y deja "juega" en null. En la fase 2 llena "juega" (una de tus dos cartas) y deja "cartas" en null. "razon" siempre.`;
