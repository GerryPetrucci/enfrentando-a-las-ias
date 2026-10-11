// EL PROMPT de Triple dado. Es parte del contrato: sin acentos ni enies, igual para todas las IAs, y si cambia se cierra la temporada.
// No hay regla oculta: todo lo que importa esta aqui; lo que SI esta oculto (el valor de los dados ocultos ajenos, las elecciones simultaneas y las
// tarjetas en curso) el prompt lo dice. Los numeros salen de las constantes para no desincronizarse.

import { JUGADORES, RONDAS, ENFRENTAMIENTOS, PUNTOS, PREMIO_ZERO } from './constantes.js';

export const REGLAS = `Eres uno de ${JUGADORES} jugadores en un juego de dados con eliminacion. Se juegan ${RONDAS} rondas. En cada ronda cada jugador tiene 11 dados de seis caras: 9 BLANCOS (todos ven su valor) y 2 OCULTOS, uno ROJO y uno AZUL (solo tu ves su valor). Los dados se lanzan de nuevo en cada ronda. Cada jugador tiene 4 tarjetas de prediccion: ZERO, MIN, MORE y MAX.

COMO ES UNA RONDA
1. PREDICCION. Antes de lanzar los dados, cada jugador elige en secreto una de sus tarjetas. Cada tarjeta se usa UNA sola vez en toda la partida (hay 4 tarjetas y ${RONDAS} rondas): en la ronda ${RONDAS} te queda una sola y se pone sola, sin preguntarte.
2. Se lanzan los dados. Los blancos de todos quedan a la vista.
3. ${ENFRENTAMIENTOS} ENFRENTAMIENTOS. En cada uno, todos eligen a la vez TRES dados distintos de los que aun no han gastado (blancos tuyos, el rojo y/o el azul) y forman una combinacion. Un dado usado no vuelve a la ronda: en una ronda usas 9 de tus 11 dados. Los demas ven que usaste un dado oculto, pero no su valor hasta que se revelan todas las combinaciones.
4. Al final de la ronda se revelan las tarjetas y se premian.

COMBINACIONES (de mejor a peor)
1. Triple: tres dados iguales (5-5-5). 2. Escalera: tres numeros consecutivos (3-4-5; el 6 y el 1 no son consecutivos). 3. Doble: dos dados iguales (4-4-2). 4. Sencillo: tres distintos sin escalera (1-3-6).
Dentro de una categoria gana el numero mayor: escalera 4-5-6 supera a 3-4-5; doble 5-5-3 supera a 5-5-2 (primero la pareja, luego el dado suelto); un sencillo se compara del dado mas alto al mas bajo (6-5-2 supera a 6-3-1).
Si dos combinaciones son iguales, gana quien tenga el dado BLANCO de mayor valor entre los que le quedan sin gastar despues de esta jugada (los ocultos sin usar no cuentan; si no te queda ningun blanco, vale 0). Si tampoco hay diferencia, empatan.

PUNTOS DE UN ENFRENTAMIENTO
1.o lugar 6, 2.o 3, 3.o 1, 4.o 0. Los empatados se reparten por igual los puntos de las posiciones que ocupan: dos empatados en el primer lugar reciben (6 + 3) / 2 = 4.5 cada uno.

TARJETAS (se comparan con la suma de tus puntos de los ${ENFRENTAMIENTOS} enfrentamientos de la ronda)
ZERO: aciertas si sumaste exactamente 0; recibes ${PREMIO_ZERO} puntos en lugar de los de la ronda.
MIN: mas de 0 y menos de 7. MORE: de 7 a menos de 11. MAX: 11 o mas. Si aciertas MIN, MORE o MAX, tus puntos de la ronda se duplican (MORE con 9 puntos da 18). Si fallas, conservas los puntos que sumaste.

SI TU RESPUESTA NO SIRVE
Si tu respuesta no se entiende o no es legal (una tarjeta que no existe o que ya usaste; dados que no son tres, repetidos, que no tienes o que ya gastaste), el juego juega por ti: una tarjeta tuya al azar, o tres dados al azar de los que te quedan. Queda anotado como respuesta invalida y el historial marca esa jugada con [reemplazo].

QUE SE VE Y QUE NO
Ves los dados blancos de todos y cuales han gastado, cuantos ocultos le quedan a cada rival y de que color, las combinaciones ya reveladas, los puntos de todos y las tarjetas de las rondas cerradas. No ves el valor de los dados ocultos de los demas que no se han usado, lo que eligen los demas en el mismo enfrentamiento, ni las tarjetas de la ronda en curso.

EL FINAL
Despues de la ronda ${RONDAS} se suman los puntos de todas las rondas. El que tiene mas puntos, si es el unico, gana la pieza; el que tiene menos, si es el unico, es eliminado. Si hay empate arriba nadie recibe la pieza; si hay empate abajo nadie es eliminado.

TU PUNTAJE
Ganar la pieza ${PUNTOS.pieza}, sobrevivir ${PUNTOS.medio}, ser eliminado ${PUNTOS.eliminado}.`;

export const FORMATO = '{"tarjeta": "ZERO" o "MIN" o "MORE" o "MAX" (solo al predecir), "dados": ["b3", "b7", "rojo"] (solo en un enfrentamiento: tres identificadores distintos de dados tuyos que no hayas gastado), "razon": "una frase explicando tu decision"}';
