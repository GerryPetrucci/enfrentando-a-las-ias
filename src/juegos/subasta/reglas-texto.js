// EL PROMPT de Subasta de tiempo. Es parte del contrato: sin acentos ni enies, igual para todas las IAs, y si cambia se cierra la temporada.
// No hay regla oculta: todo lo que importa esta aqui; lo que SI esta oculto (el banco y las apuestas de los demas) el prompt lo dice.
// Los numeros salen de las constantes para no desincronizarse.

import { JUGADORES, SUBASTAS, BANCO, PUESTO_PUNTOS, segundos } from './constantes.js';

export const REGLAS = `Eres uno de ${JUGADORES} jugadores en una subasta de tiempo con eliminacion. Cada jugador tiene su propio banco de ${segundos(BANCO).toFixed(1)} segundos (10 minutos). Se juegan ${SUBASTAS} subastas.

COMO ES UNA SUBASTA (todos deciden a la vez y en secreto)
Cada jugador responde cuantos segundos mantiene su apuesta en esa subasta, con una decima de segundo de precision. Responder 0 es retirarte: no gastas nada.
TODAS las apuestas se pagan: los segundos que apuestas salen de tu banco, ganes o pierdas. El tiempo gastado no se devuelve.
Gana la subasta quien apuesta mas segundos y recibe una ficha de victoria. Si dos o mas jugadores empatan exactamente en la apuesta mas alta, la subasta se anula: nadie recibe la ficha y ellos igual pierden el tiempo que apostaron. Si todos se retiran, nadie gana.
Si pides mas segundos de los que te quedan, apuestas todo tu banco. Quien agota su banco ya no puede apostar en las subastas siguientes.

QUE SE VE Y QUE NO
Ves tu banco, tus fichas, las fichas de todos y quien gano cada subasta. No ves el banco de los demas, ni cuanto apostaron, ni quien participo: solo se anuncia quien gana.

EL FINAL
Despues de la subasta ${SUBASTAS} (o antes, si ya nadie tiene tiempo): el que tiene mas fichas gana la pieza y el que tiene menos fichas es eliminado.
Si hay empate en el primer lugar, gana la pieza quien conserve mas tiempo; si tambien empatan en tiempo, nadie la obtiene.
Si hay empate en el ultimo lugar, se elimina a quien conserve menos tiempo; si tambien empatan en tiempo, nadie es eliminado.

TU PUNTAJE
Depende de tu puesto final: ganar la pieza ${PUESTO_PUNTOS.pieza}, sobrevivir ${PUESTO_PUNTOS.medio}, ser eliminado ${PUESTO_PUNTOS.eliminado}.`;

export const FORMATO = '{"apuesta": segundos que mantienes (un numero con hasta una decima; 0 para retirarte), "razon": "una frase explicando tu decision"}';
