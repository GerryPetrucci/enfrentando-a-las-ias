// EL PROMPT de Duda y apuesta. Es parte del contrato: sin acentos ni enies, igual para todas las IAs, y si cambia se cierra la temporada.
// No hay regla oculta: todo lo que importa esta aqui; lo que SI esta oculto (las cartas de los demas hasta que se revelan) el prompt lo dice. No da estrategia.
// Vocabulario suave (decision del 11 de octubre): se habla de "anuncios" y de "dudar", no de mentir. Los numeros salen de las constantes para no desincronizarse.

import { JUGADORES, FICHAS, FICHAS_ESPACIO_MAX, ESPACIOS_MAX, MANOS, ANUNCIOS_MAX, PAGO_DESDE, PAGO_CADA, PUNTOS, MAZO } from './constantes.js';

export const REGLAS = `Eres uno de ${JUGADORES} jugadores en un juego de cartas de anuncios y apuestas. Quien se queda sin fichas de juego queda eliminado.

MATERIALES
Un mazo de ${MAZO.length} cartas: 10 rojas, 10 amarillas, 10 azules, 10 verdes, 10 moradas y 10 arcoiris. Las arcoiris cuentan como CUALQUIER color.
Cada jugador tiene FICHAS DE JUEGO (empiezas con ${FICHAS}; con 0 quedas eliminado) y FICHAS DE ESPACIO (empiezas con ${FICHAS_ESPACIO_MAX}). Tienes tantos espacios para cartas como fichas de espacio mas 1 (empiezas con ${ESPACIOS_MAX}; maximo ${ESPACIOS_MAX}, minimo 1). En cada mano recibes una carta al azar por espacio y solo tu ves las tuyas. Cuantas cartas tiene cada jugador es publico.

UNA MANO
1. ANUNCIO. Abre la mano un jugador (la primera, el Jugador 1; despues, quien perdio la anterior). Anuncia un color (rojo, amarillo, azul, verde o morado) y una cantidad: "hay al menos 7 cartas rojas entre las cartas de TODOS los jugadores" (cuentan las arcoiris). Y apuesta fichas de juego, de espacio o ambas (al menos una).
2. RESPUESTA. Contesta el jugador que sigue en el orden de los asientos: ACEPTAR o DUDAR.
 - ACEPTAR: quien anuncio recupera su apuesta y tu haces tu propio anuncio con una cantidad MAYOR (al menos una carta mas; mismo color u otro) y tu apuesta. Contesta el siguiente.
 - DUDAR: empieza el enfrentamiento entre quien duda y quien hizo el ultimo anuncio.
3. ENFRENTAMIENTO. Quien duda apuesta al menos lo mismo que el anuncio (si no dices cuanto, igualas). Si apuesta mas, quien anuncio decide: IGUALAR (pone las fichas que faltan) o RETIRARSE.
 - Retirarse: pierde lo que habia apostado (lo gana quien duda) y las cartas no se revelan.
 - Con las apuestas iguales se revelan las cartas de TODOS y se cuenta el color anunciado con las arcoiris. Si hay AL MENOS lo anunciado gana quien anuncio; si hay menos, gana quien duda. El ganador conserva sus fichas y se queda con las que puso el perdedor.
4. LIMITES. Maximo ${ANUNCIOS_MAX} anuncios por mano: quien contesta al ultimo debe dudar (tambien si el anuncio ya es igual a todas las cartas en juego). Nunca apuestas mas fichas en total (de juego y de espacio) que las que tienes tu ni que las que tiene quien te contesta. Para igualar solo cuenta cuantas fichas pones, no de que tipo.
Ejemplo: J1 anuncia "al menos 6 rojas" con 1 ficha y J2 duda con 1 ficha; hay 5 rojas: gana J2 y se queda con la ficha de J1.

FICHAS DE ESPACIO
Perder una ficha de espacio es perder un espacio: una carta menos desde la mano siguiente. Ganar una te devuelve un espacio; si ya tienes ${ESPACIOS_MAX}, se vuelve una ficha de juego. Para cambiar una ficha de juego por un espacio mas agrega "comprar_espacio": true a cualquier respuesta tuya: vale desde la mano siguiente, con menos de ${ESPACIOS_MAX} espacios y al menos 2 fichas de juego.

EL FINAL
Al terminar las manos ${PAGO_DESDE}, ${PAGO_DESDE + PAGO_CADA}, ${PAGO_DESDE + 2 * PAGO_CADA}... cada jugador paga una ficha de juego a la banca. La partida termina cuando alguien se queda sin fichas de juego (queda eliminado) o al terminar la mano ${MANOS}; ahi es eliminado quien tiene menos fichas de juego (si empatan, el de menos fichas de espacio; si tambien, nadie). Gana la pieza quien termina con mas fichas de juego, si es el unico (si empatan, el de mas fichas de espacio; si tambien, nadie).

SI TU RESPUESTA NO SIRVE
Si no se entiende o no es legal (accion que no toca ahora, color o cantidad que no valen, apuesta menor que el anuncio), el juego juega por ti un anuncio, una duda o una respuesta al azar y queda anotado como invalida; el historial marca esa jugada con *. Una apuesta de mas se recorta al maximo.

QUE SE VE
Ves tus cartas, las fichas y espacios de todos, los anuncios y apuestas, y el historial de las manos terminadas (con cuantas cartas del color anunciado tenia cada jugador). No ves las cartas de los demas salvo las que se revelan en un enfrentamiento.

TU PUNTAJE
Ganar la pieza ${PUNTOS.pieza}, sobrevivir ${PUNTOS.medio}, ser eliminado ${PUNTOS.eliminado}.`;

export const FORMATO = '{"accion": "anunciar" o "aceptar" o "dudar" o "igualar" o "retirarse" (la vista dice cuales puedes usar), "color": "rojo" o "amarillo" o "azul" o "verde" o "morado" (al anunciar o aceptar), "cantidad": 7 (al anunciar o aceptar), "fichas": 1, "espacios": 0 (tu apuesta, al anunciar, aceptar o dudar), "comprar_espacio": true (opcional), "razon": "una frase"}';
