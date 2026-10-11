// EL PROMPT de Mayor o menor. Es parte del contrato: sin acentos ni enies, igual para todas las IAs, y si cambia se cierra la temporada.
// No hay regla oculta: todo lo que importa esta aqui; lo que SI esta oculto (lo que el rival decide a la vez y el orden del crupier) el prompt lo dice.
// Los numeros salen de las constantes para no desincronizarse.

import { RONDAS, FICHAS, PUNTOS } from './constantes.js';

export const REGLAS = `Eres uno de 2 jugadores en un duelo de cartas y apuestas. Se juegan ${RONDAS} rondas. Cada jugador empieza con ${FICHAS} fichas y con 11 cartas numeradas del 0 al 10. El crupier tiene dos mazos de 9 cartas (del 1 al 9), uno para cada jugador.

LOS PAPELES
En las rondas impares el Jugador 1 es el jugador activo y el Jugador 2 es el predictor; en las pares es al reves. Cada jugador es activo 9 veces. En cada ronda, el crupier saca la siguiente carta de SU mazo: el mazo del jugador activo (cada carta de un mazo sale una sola vez).

COMO ES UNA RONDA (el activo y el predictor deciden a la vez y en secreto)
1. El crupier revela su carta. Los dos la ven.
2. El JUGADOR ACTIVO elige una de sus cartas para jugarla boca abajo. El PREDICTOR, sin ver esa carta, apuesta fichas a que sera MAYOR o MENOR que la del crupier.
3. Se revela la carta del activo.
- Si la carta del activo es mayor que la del crupier, el activo gana tantas fichas como la diferencia (por ejemplo, crupier 5 y carta 8: gana 3 fichas). Si es menor o igual, no gana nada.
- Si el predictor acierta, recupera su apuesta y gana otras tantas fichas. Si falla, pierde lo que aposto. Si la carta del activo es igual a la del crupier, la apuesta se devuelve.
- Las fichas que se ganan salen de la banca, no del rival; las que se pierden vuelven a la banca.
- La carta jugada y la del crupier se retiran para siempre.

LA APUESTA
Apuestas un numero entero de fichas, de 1 hasta las que tengas. No puedes apostar 0. Si pides mas fichas de las que tienes, apuestas todas.

SI TU RESPUESTA NO SIRVE
Si tu respuesta no se entiende o no es legal (una carta que no tienes, una apuesta de 0 o con decimales, un lado que no sea "mayor" o "menor"), el juego juega por ti: si eres el activo, una carta tuya al azar; si eres el predictor, una apuesta de 1 ficha a un lado sorteado. Queda anotado como respuesta invalida y el historial marca esa jugada con [reemplazo].

QUE SE VE Y QUE NO
Ves las fichas de los dos, las cartas que te quedan y las que le quedan a tu rival, las cartas del crupier que ya salieron de los dos mazos y todo lo que paso en las rondas anteriores. No ves lo que tu rival decide en la misma ronda que tu (la carta del activo y la apuesta del predictor), ni el orden en que saldran las cartas del crupier.

EL FINAL
La partida termina despues de la ronda ${RONDAS}, o antes, si alguien se queda sin fichas. Gana quien tenga mas fichas; si tienen las mismas, es empate.

TU PUNTAJE
Ganar ${PUNTOS.gana}, empatar ${PUNTOS.empata}, perder ${PUNTOS.pierde}.`;

export const FORMATO = '{"carta": numero del 0 al 10 que juegas (solo si eres el jugador activo), "lado": "mayor" o "menor" (solo si eres el predictor), "fichas": numero entero de fichas que apuestas, de 1 en adelante (solo si eres el predictor), "razon": "una frase explicando tu decision"}';
