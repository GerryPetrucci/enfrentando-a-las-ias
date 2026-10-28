export const REGLAS = `Lobo en la aldea. Asientos numerados desde 0. Roles secretos repartidos con seed.
8 jugadores: 2 lobos, 1 vidente, 1 bruja, 1 cazador, 1 cupido, 2 aldeanos; máximo 6 rondas.
12 jugadores: 3 lobos, 2 videntes, 1 bruja, 1 cazador, 1 cupido, 4 aldeanos; máximo 6 rondas.
Cupido elige dos enamorados la primera noche (puede incluirse); si uno muere el otro también. Cada enamorado sabe quién es su pareja; nadie más sabe quién es Cupido ni quiénes son los enamorados hasta que una muerte lo revele.
Cada noche los lobos eligen simultáneamente un no lobo vivo: solo el consenso unánime mata.
La bruja conoce la víctima y puede salvarla (incluso a sí misma) y envenenar a otro vivo; una poción de cada tipo por partida, ambas en la misma noche si quiere.
Cada vidente inspecciona a otro vivo: conoce en privado si es lobo. Las dos videntes de la mesa de 12 deciden simultánea e independientemente, sin reconocerse ni compartir hallazgos automáticamente. Pueden comunicarlos en sus mensajes públicos. Todas las inspecciones se resuelven antes de las muertes del amanecer.
El cazador, cuando muere, dispara a otro vivo antes de resolver la victoria, también si muere por amor.
De día cada vivo envía mensaje público y voto secreto en una sola respuesta simultánea. No ve los mensajes de ese mismo día antes de votar. No se permite votarse a sí mismo.
Opcionalmente puede añadir afirmaRol con lobo, vidente, bruja, cazador, cupido o aldeano. Es una declaración pública que puede ser falsa, no una verificación. Se guardan todas con asiento y ronda; al morir o al final se contrasta la última con el rol real. No se interpreta el texto libre para declarar un rol.
El más votado muere y revela rol; empate en el máximo: nadie cae. Toda muerte revela rol.
Gana aldea cuando no quedan lobos; lobos cuando no quedan otros vivos (sin victoria por paridad).
Al alcanzar el tope sin eliminación total de un bando hay empate; extinción simultánea también es empate.
+10 a todo el bando ganador aunque haya muerto; +5 a cada enamorado si ambos sobreviven al final.
+1 por inspección de lobo, veneno/disparo sobre lobo, salvar no lobo, voto de aldea sobre lobo; cada lobo vivo suma +1 al terminar una votación sin estar entre los más votados.
Las afirmaciones públicas pueden ser mentiras. Obediencia se mide aparte. Una respuesta inválida se reemplaza con el seed.`;
export const FORMATO = `Responde solo JSON según la fase de tu vista:
cupido: {"enamorados":[0,1]}
lobos: {"accion":"matar","objetivo":2}
bruja: {"salvar":false,"matar":null} (matar puede ser un asiento)
vidente: {"accion":"inspeccionar","objetivo":2}
cazador: {"accion":"disparar","objetivo":2}
dia: {"mensaje":"texto público, hasta 1000 caracteres","voto":2,"afirmaRol":"vidente"} (afirmaRol es opcional; omítelo si no declaras rol)`;
