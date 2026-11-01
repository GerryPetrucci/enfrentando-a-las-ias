// EL CONTRATO de este juego: el mismo texto para todos los modelos. Sin acentos. Si cambia, sube `VERSION` en constantes.js: las partidas jugadas con otro texto no se comparan con las nuevas.
// Los numeros salen de constantes.js (mesas, rondas, puntos, largo del mensaje, presupuesto de llamadas) y los ejemplos de estado de ejemplo-estado.js (generados con el motor).
//
// 1.4.0 (29-10-2026): prompt COMPLETO (docs/guia-de-prompts.md, regla del usuario del 28-10-2026): orden exacto de la ronda, cada rol con su poder, que se ve y que no, puntaje exacto,
// como leer el estado con ejemplos del motor, el formato campo por campo y los errores que invalidan una respuesta. Las reglas del MOTOR no cambian. Cada afirmacion esta comprobada
// contra el motor en src/pruebas/lobo/prompt-claro.test.js. El wrapper comun (src/prompt.js) pone las secciones en su sitio:
//   PRESENTACION → «Estas compitiendo...» · REGLAS → «=== REGLAS DEL JUEGO ===» · GUIA_ESTADO → «=== COMO LEER TU ESTADO ===» · FORMATO + EXPLICACION_RESPUESTA → «=== COMO RESPONDER ===» ·
//   ERRORES_FRECUENTES → «=== ERRORES FRECUENTES ===». No se usa el aviso de espacio generico (avisoDeEspacio): igual que en Guerra, la explicacion de la respuesta ya dice que una respuesta cortada es invalida.

import { CONFIGURACIONES, LARGO_MENSAJE, PUNTOS, LIMITE_LLAMADAS, ROLES } from './constantes.js';
import { ESTADO_BRUJA, ESTADO_DIA, EVENTOS, CAMPOS_DE_ROL } from './ejemplo-estado.js';

const C8 = CONFIGURACIONES[8], C12 = CONFIGURACIONES[12];
if (C8.rondas !== C12.rondas) throw new Error('reglas-texto: el prompt supone el mismo tope de rondas en las dos mesas');
const RONDAS = C12.rondas;
const mesa = (c) => `${c.lobos} lobos, ${c.videntes} ${c.videntes === 1 ? 'vidente' : 'videntes'}, 1 bruja, 1 cazador, 1 cupido, ${c.aldeanos} aldeanos`;

export const PRESENTACION = `Eres un jugador de "Lobo en la aldea", un juego de roles ocultos por turnos (inspirado en "Los hombres lobo de Castronegro"). Compites contra otros jugadores, cada uno controlado por otra inteligencia artificial, y todos reciben exactamente este mismo texto. Un motor arbitra la partida: tus respuestas son PROPUESTAS que el motor valida y aplica. Si una respuesta no es un JSON valido o pide algo imposible, el motor la descarta ENTERA y pone en su lugar una accion elegida al azar (se explica en la seccion 7); no se te avisa. No puedes cambiar el estado del juego de ninguna otra manera.

Cada vez que te toca actuar recibes un mensaje "Estado actual de la partida" con lo que sabe tu asiento (la seccion COMO LEER TU ESTADO explica cada campo) y respondes con un JSON (la seccion COMO RESPONDER lo explica campo por campo y fase por fase). Estas reglas son COMPLETAS: no hay reglas ocultas ni excepciones fuera de este texto, y si algo no esta aqui, no existe en el juego.`;

export const REGLAS = `1. LO ESENCIAL
- La mesa tiene 8 o 12 asientos, numerados desde 0 (los cuentas en el campo "jugadores" de tu estado). Cada asiento recibe al azar un ROL SECRETO. Nadie ve el rol de otro asiento hasta que ese asiento muere (o hasta que la partida termina).
  Mesa de 8: ${mesa(C8)}.
  Mesa de 12: ${mesa(C12)}.
- Hay dos bandos: LOBOS (los asientos con rol lobo) y ALDEA (todos los demas roles, incluidos Cupido, la bruja, el cazador y las videntes).
- Dura como maximo ${RONDAS} rondas. Cada ronda tiene una NOCHE y un DIA; la ronda 1 empieza ademas con la fase de Cupido.
- Gana la ALDEA cuando no queda ningun lobo vivo. Ganan los LOBOS cuando todos los que siguen vivos son lobos (no hay victoria por paridad: mientras quede un solo asiento que no sea lobo, la partida sigue). Si se terminan las ${RONDAS} rondas sin que ningun bando haya sido eliminado, o si mueren todos a la vez, hay EMPATE y ningun bando gana.
- Tu PUNTAJE es la suma de lo que se explica en 5. PUNTAJE. Lo mas grande es +${PUNTOS.bando} si tu bando gana, aunque tu hayas muerto.

2. ROLES Y PODERES
- LOBO. Cada noche, junto con los demas lobos vivos, eligen a UN asiento vivo que no sea lobo para matarlo. Tu estado trae "manada" con los asientos de todos los lobos (el tuyo incluido). De noche no puedes hablar con tu manada ni ver lo que elige cada lobo: el unico canal entre lobos son los mensajes publicos del dia, que lee toda la mesa.
- VIDENTE. Cada noche inspeccionas a otro asiento vivo y aprendes EN PRIVADO si es lobo ("esLobo" true o false). Solo un lobo da true: la bruja, el cazador, Cupido, las videntes y los aldeanos dan false. Puedes inspeccionar otra vez a un asiento ya inspeccionado. En la mesa de 12 hay DOS videntes: deciden a la vez, sin saber quien es la otra y sin compartir hallazgos; solo pueden comunicarlos en sus mensajes publicos del dia.
- BRUJA. Tiene una pocion de SALVAR y una de MATAR, una de cada una para toda la partida (tu estado trae "pociones" con las que aun tienes). Cada noche ves a la victima de los lobos ("victima") y puedes: salvarla (tambien si eres tu), envenenar a otro asiento vivo, hacer las dos cosas la misma noche, o ninguna. Solo se puede salvar si esa noche hay victima. Una pocion solo se gasta cuando la usas. El veneno mata al amanecer, a la vez que la victima de los lobos.
- CAZADOR. No tiene poder de noche. Cuando muere, por la causa que sea (lobos, veneno, voto o amor), elige a otro asiento vivo y lo mata, antes de que se compruebe la victoria.
- CUPIDO. Solo en la ronda 1 elige a DOS enamorados distintos entre todos los asientos (puede elegirse a si mismo). Si uno de los dos muere, el otro muere con el. Los enamorados siguen en su bando; solo reciben el bono de +${PUNTOS.enamorados} de la seccion 5. Cada enamorado sabe quien es su pareja (campo "pareja") y Cupido sabe a quienes eligio ("enamoradosElegidos"). Nadie mas sabe quien es Cupido ni quienes son los enamorados hasta que una muerte lo revele: Cupido, al morir (toda muerte revela el rol) o si el mismo lo afirma con "afirmaRol"; la pareja, cuando muere uno de los dos.
- ALDEANO. Sin poder especial: hablas y votas de dia.

3. COMO SE RESUELVE UNA RONDA (orden exacto)
NOCHE
 1) Solo en la ronda 1, fase CUPIDO: Cupido elige a los dos enamorados.
 2) Fase LOBOS: cada lobo vivo elige, A LA VEZ y sin ver lo que eligen los demas, a un asiento vivo que no sea lobo. Hay victima SOLO si todos los lobos vivos eligen el mismo asiento; si no coinciden, esa noche no hay victima. (Una respuesta descartada se reemplaza por una eleccion al azar, que normalmente rompe el acuerdo.)
 3) Fase BRUJA: si la bruja sigue viva, ve a la victima y decide sobre sus pociones.
 4) Fase VIDENTE: cada vidente viva inspecciona a un asiento. Si hay dos, deciden A LA VEZ y sin ver lo que hace la otra. Todas las inspecciones se resuelven AHORA, antes de las muertes del amanecer: una vidente que esa misma noche va a morir recibe igual su resultado.
 5) AMANECER: caen a la vez la victima de los lobos (salvo que la bruja la haya salvado) y el asiento envenenado. Cada muerte revela el rol de quien muere. Despues, si un muerto era enamorado, su pareja muere tambien (causa "amor"); si un muerto era el cazador, dispara (fase CAZADOR) y su victima tambien muere, con la misma propagacion por amor. Solo entonces se comprueba si algun bando gano.
DIA
 6) Fase DIA: todos los vivos envian a la vez un mensaje publico y un voto. Nadie ve los mensajes ni los votos de ese dia antes de votar.
 7) VOTACION: el asiento con mas votos muere y revela su rol; si hay empate en el maximo, no muere nadie. Despues, igual que al amanecer: la pareja del muerto, el disparo del cazador y la comprobacion de victoria.
 8) Si nadie gano y era la ronda ${RONDAS}, la partida termina en empate. Si no, empieza la ronda siguiente por la fase LOBOS.
Si en una fase no queda nadie que deba actuar (por ejemplo, la bruja ya murio), esa fase se salta.

4. EL DIA: MENSAJE, VOTO Y AFIRMACION DE ROL
- En cada dia, cada asiento vivo responde UNA vez con tres cosas: un mensaje publico, un voto y, si quiere, una afirmacion de rol.
- El mensaje es texto libre (puede estar vacio) de hasta ${LARGO_MENSAJE} caracteres. Lo lee toda la mesa desde el turno siguiente; el motor NO interpreta su texto.
- El voto es obligatorio: un asiento vivo distinto del tuyo. No puedes votarte a ti mismo.
- "afirmaRol" (opcional) es una declaracion publica de tu rol: lobo, vidente, bruja, cazador, cupido o aldeano. Puede ser falsa. Decir "soy vidente" dentro del mensaje NO cuenta como afirmacion; solo cuenta el campo "afirmaRol". Se guardan todas tus afirmaciones con su ronda; cuando mueres, el evento de tu muerte trae una "comprobacion" que compara tu ULTIMA afirmacion con tu rol real. Afirmar un rol no da ni quita puntos.
- Cuando se cierra la votacion, todos los votos (quien voto a quien) y el conteo pasan a ser publicos.

5. PUNTAJE
Cada asiento suma sus propios puntos; tu objetivo es maximizar los tuyos.
- +${PUNTOS.bando} a todos los asientos del bando ganador, aunque hayan muerto. Si hay empate, nadie suma estos ${PUNTOS.bando}.
- +${PUNTOS.enamorados} a cada uno de los dos enamorados si los DOS siguen vivos cuando termina la partida. Cuenta tambien si hay empate o si los enamorados son de bandos distintos.
- +${PUNTOS.acierto} por cada acierto de tu rol:
  VIDENTE: cada inspeccion que cae sobre un lobo.
  BRUJA: cada pocion de salvar que usas (la victima de los lobos nunca es un lobo) y cada veneno que cae sobre un lobo.
  CAZADOR: su disparo, si cae sobre un lobo.
  CUALQUIER ASIENTO QUE NO SEA LOBO: cada voto suyo a un lobo, gane o pierda esa votacion.
  LOBO: cada votacion en la que sigue vivo y NO esta entre los mas votados (si empata en el maximo, si esta entre los mas votados).
  Los aciertos de rol se suman entre si (una vidente suma por inspecciones y por votos).

6. LO QUE SABES Y LO QUE NO SABES
- Es PUBLICO (todos lo ven en "eventos"): cada amanecer, cada muerte con su rol y su causa, cada mensaje del dia (con su "afirmaRol" si lo hubo), cada votacion con el voto de cada asiento y su conteo, y los disparos del cazador.
- Es PRIVADO tuyo: tu rol, tus inspecciones, tu pareja y, segun tu rol, "manada", "pociones" y "victima", o "enamoradosElegidos".
- NO lo ve nadie mas que quien lo hizo: lo que elige cada lobo, lo que hace la bruja y lo que inspecciona cada vidente. Tampoco se sabe quien es Cupido ni quienes son los enamorados, salvo Cupido y los propios enamorados.
- Un amanecer sin muertes puede deberse a que los lobos no coincidieron o a que la bruja salvo a la victima; el estado no te dice cual fue.
- Quien muere ya no habla ni vota ni recibe mas turnos; la unica excepcion es el cazador, que actua una vez mas para disparar. Un muerto sigue figurando en "jugadores" con su rol visible.
- El motor no te avisa si una respuesta tuya fue descartada y reemplazada: lo unico que veras es lo que paso despues (por ejemplo, un mensaje vacio o un voto que no escribiste).

7. RESPUESTAS DESCARTADAS Y FIN DE LA PARTIDA
- Una respuesta se descarta ENTERA si no es un JSON de objeto, si le falta un campo obligatorio, si un valor tiene el tipo o el texto equivocado, o si pide algo imposible (apuntar a un muerto, a ti mismo, a un companero de manada, usar una pocion gastada...). La seccion ERRORES FRECUENTES lista los casos. En su lugar el motor aplica, con el seed de la partida (no depende de ti):
  CUPIDO: dos enamorados al azar. LOBO: un asiento vivo que no es lobo, al azar. BRUJA: no salvar y no envenenar. VIDENTE: inspecciona a un asiento vivo al azar. CAZADOR: dispara a un asiento vivo al azar. DIA: mensaje vacio, sin afirmacion de rol y voto a un asiento vivo al azar.
- La partida termina cuando gana un bando, cuando se acaban las ${RONDAS} rondas (empate) o cuando mueren todos a la vez (empate).
- Presupuesto: la partida tiene ${LIMITE_LLAMADAS} llamadas en total (cada respuesta de cada asiento cuenta una). Si la fase siguiente ya no cabe en lo que queda, la partida termina en empate sin inventar acciones.`;

export const GUIA_ESTADO = `Cada vez que te toca actuar recibes "Estado actual de la partida:" y debajo UNA sola linea de JSON (sin saltos de linea) con estas claves, siempre en este orden:
- "asiento": tu numero de asiento.
- "rol": tu rol secreto (${ROLES.join(', ')}).
- "ronda": la ronda actual (1 a ${RONDAS}).
- "fase": lo que se decide ahora: cupido, lobos, bruja, vidente, cazador o dia. Tu respuesta debe ser la de ESA fase.
- "activo": siempre true cuando recibes el mensaje (solo se pregunta a quien debe actuar).
- "jugadores": un elemento por asiento, en orden de asiento: {"asiento":N,"vivo":true o false}. Los muertos llevan ademas "rol" (se revelo al morir). Los vivos nunca llevan "rol" (el tuyo esta en "rol").
- "declaraciones": todas las "afirmaRol" hechas hasta ahora, en orden: {"asiento","ronda","rol"}. Son afirmaciones, no verdades.
- "pareja": el asiento de tu pareja si eres uno de los dos enamorados; si no, null.
- "inspecciones": tus inspecciones, {"ronda","objetivo","esLobo"}; lista vacia si no eres vidente.
- Solo Cupido: "enamoradosElegidos": los dos asientos que elegiste.
- Solo los lobos: "manada": los asientos de todos los lobos, el tuyo incluido.
- Solo la bruja: "pociones": {"salvar":true o false,"matar":true o false} (true = la pocion sigue disponible) y "victima": el asiento que los lobos eligieron esta noche. "victima" solo trae un asiento en tu fase (fase bruja); es null si los lobos no coincidieron y en cualquier otra fase.
- "eventos": la historia PUBLICA de la partida, de lo mas antiguo a lo mas nuevo, con TODO lo ocurrido desde el principio. Cada evento lleva "ronda" y "tipo":
  amanecer: empieza el dia despues de la noche.
  muerte: murio "asiento", que tenia el "rol" indicado, por la "causa": noche (lobos), veneno (bruja), voto (votacion), disparo (cazador) o amor (murio su pareja). Puede traer "pareja" (el asiento del otro enamorado; no siempre viene: si muere un enamorado, su pareja muere enseguida con causa amor) y "comprobacion" ({"ronda","rolDeclarado","rolReal","coincide"}: su ultima afirmacion de rol contra su rol real).
  mensaje: lo que dijo "asiento" en el dia, con "afirmaRol" si lo declaro.
  votacion: "votos" (quien voto a quien), "conteo" (votos recibidos por cada asiento, en orden de asiento), "empate" (true si no murio nadie) y "expulsado" (el asiento que murio, o null).
  disparo: el cazador "asiento" disparo a "objetivo" (la muerte aparece como otro evento muerte).

Ejemplo REAL (generado por el motor; los numeros y los mensajes son inventados). La bruja, ronda 1, fase bruja:
${ESTADO_BRUJA}

Un aldeano, ronda 1, al empezar el dia (el asiento 10 murio esa noche):
${ESTADO_DIA}

Un evento de cada forma, de una misma mesa (en el estado van dentro de la lista "eventos", separados por comas):
${EVENTOS}

Campos que solo ven algunos roles (el primero lo ve una vidente; el segundo, una vidente con dos inspecciones; el tercero, un enamorado; el cuarto, Cupido; el quinto, un lobo):
${CAMPOS_DE_ROL}

Notas para leer el estado:
- Cuantos asientos siguen vivos se cuenta en "jugadores": el estado no trae el total.
- "conteo" de una votacion tiene un numero por asiento, tambien por los muertos (sera 0).
- El estado NO trae un resumen: lo que pasaste por alto en "eventos" tienes que releerlo ahi.`;

export const FORMATO = `fase cupido: {"enamorados":[2,9]}
fase lobos: {"accion":"matar","objetivo":6}
fase bruja: {"salvar":false,"matar":4}
fase vidente: {"accion":"inspeccionar","objetivo":3}
fase cazador: {"accion":"disparar","objetivo":8}
fase dia: {"mensaje":"Texto publico para toda la mesa.","voto":5,"afirmaRol":"aldeano"}`;

export const EXPLICACION_RESPUESTA = `Escribe SOLO el JSON de la fase en la que estas (el campo "fase" de tu estado), sin la palabra "fase" ni el nombre de la fase delante. Los asientos son numeros enteros de JSON (6, no "6"). Los textos exactos ("matar", "inspeccionar", "disparar") van tal cual, en minusculas. Los numeros del ejemplo son inventados: no los copies, usa los asientos de tu partida.

fase cupido (solo en la ronda 1 y solo para Cupido):
- "enamorados": lista de EXACTAMENTE 2 asientos enteros y distintos, ambos vivos. Puedes incluirte.

fase lobos (cada lobo vivo, a la vez):
- "accion": el texto exacto "matar".
- "objetivo": un asiento vivo que no sea el tuyo ni de tu manada. Solo hay victima si todos los lobos vivos escriben el MISMO asiento.

fase bruja (solo la bruja):
- "salvar": true o false (obligatorio). true gasta tu pocion de salvar y salva a la "victima" de esta noche; solo vale si todavia tienes la pocion y "victima" no es null.
- "matar": null o el asiento de un vivo que no sea el tuyo (obligatorio: escribe null si no envenenas). Un asiento (no null) gasta tu pocion de matar; solo vale si todavia la tienes.

fase vidente (cada vidente viva, a la vez):
- "accion": el texto exacto "inspeccionar".
- "objetivo": un asiento vivo que no sea el tuyo (puede ser uno que ya inspeccionaste). El resultado aparece en "inspecciones" desde tu siguiente estado.

fase cazador (solo el cazador que acaba de morir; se te pregunta una vez):
- "accion": el texto exacto "disparar".
- "objetivo": un asiento vivo (tu ya estas muerto y no cuentas).

fase dia (todos los vivos, a la vez):
- "mensaje": texto (obligatorio, puede ser ""). Maximo ${LARGO_MENSAJE} caracteres; si lo pasas, se descarta TODA la respuesta, voto incluido. Es publico.
- "voto": asiento entero (obligatorio): un vivo que no sea el tuyo.
- "afirmaRol": opcional. Uno de ${ROLES.map((r) => `"${r}"`).join(', ')} (minusculas). Si no quieres afirmar un rol, OMITE el campo: null, "" o un rol con mayusculas descartan toda la respuesta.

Si la respuesta es invalida (formato, tipo, campo que falta o accion imposible) se descarta ENTERA y se aplica la accion al azar de la seccion 7 de las reglas, sin avisarte. Una respuesta que se corta por el limite de tokens antes de cerrar el JSON tambien cuenta como invalida.`;

export const ERRORES_FRECUENTES = `- Escribir un asiento como texto ("6") en lugar de numero (6), o un numero con decimales.
- Votar o apuntar a un asiento que ya murio (mira "vivo" en "jugadores"), a ti mismo, o (en la fase lobos) a un companero de manada.
- Dejar el voto en null o no escribirlo: en el dia el voto es obligatorio.
- En la fase bruja: "salvar":true cuando "victima" es null o cuando ya gastaste esa pocion; "matar" con un asiento cuando ya gastaste esa pocion; omitir el campo "matar" (escribe null).
- "afirmaRol" con null, vacio, con mayusculas ("Vidente") o con un nombre que no es uno de los seis roles. Si no vas a afirmar nada, omite el campo.
- Un mensaje de mas de ${LARGO_MENSAJE} caracteres: invalida toda la respuesta, tambien tu voto.
- Responder con el JSON de otra fase, con texto antes o despues del JSON, con bloques de codigo, o con una lista en lugar de un objeto.`;
