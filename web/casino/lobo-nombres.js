// Como se llama cada jugador de Lobo en la escena y en la voz. Solo presentacion: no usa roles ni nada privado.
//
// - Si cada modelo ocupa un solo asiento se dice solo el nombre del modelo («Grok»); nunca se lee el numero de asiento.
// - Si el mismo modelo ocupa varios asientos, cada uno lleva una letra por orden de asiento: «Grok A», «Grok B», «Grok C».
// (Decidido por el usuario el 25 de octubre de 2026: con 8 y 12 jugadores se juega con pares y tercias de modelos.)
const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function nombresDeEscena(nombres) {
  const lista = (Array.isArray(nombres) ? nombres : []).map((n) => (typeof n === 'string' && n.trim() ? n.trim() : 'Jugador'));
  const veces = new Map();
  for (const n of lista) veces.set(n, (veces.get(n) ?? 0) + 1);
  const usadas = new Map();
  return lista.map((n) => {
    if (veces.get(n) === 1) return n;
    const k = usadas.get(n) ?? 0;
    usadas.set(n, k + 1);
    return `${n} ${LETRAS[k] ?? k + 1}`;
  });
}

// El numero que se ESCRIBE en pantalla junto al nombre: desde 1 y sin ceros a la izquierda (el motor y el prompt cuentan los asientos desde 0, la pantalla no). Nunca se dice.
export const etiquetaAsiento = (i) => String(i + 1);

// Los modelos citan a los demas por su asiento en sus mensajes, contado desde 0 como dice el prompt: con la palabra («asiento 5», «el jugador 3», «#2», «asientos 2 y 6») o sin ella
// («inspeccionó al 0», «un aldeano (1)», «Lobo 4 eliminado», «entre 3,6,7», «acertó con 4»). Ni la voz ni los subtitulos ni la tarjeta dicen ese numero: se traduce al nombre con el que se
// presenta ese jugador (`nombre(i)`: el modelo, con letra si ocupa varios asientos). Decidido por el usuario el 25 de octubre de 2026. Solo presentacion: el texto de la partida no cambia.
// En una partida de Lobo casi todo numero chico de un mensaje es un asiento, asi que se traduce por omision y se EXCLUYE lo que no lo es: rondas y dias («Ronda 2», «Día 2»), cuentas
// («1 lobo», «2 votos», «en 2 rondas», «quedamos 3»), decimales, horas, porcentajes, enumeraciones («1) ...») y los digitos de un nombre («Phi-4»).
const ARTICULOS = { el: '', los: '', las: '', al: 'a', del: 'de' };
const ARTICULOS_SUELTOS = { el: '', al: 'a', del: 'de' }; // ante un numero sin palabra de asiento solo cuentan estos: «los 3» puede ser una cuenta
const separador = '(?:,|y|e|o|u|\\/|&)';
// con la palabra de asiento: «asiento 5», «el jugador 3», «#2», «asientos 2 y 6»; un numero que no es de la mesa se vuelve «otro jugador»
const REFERENCIA = /(?:\b(el|los|las|al|del)\s+)?(?:asientos?|jugador(?:es|a|as)?|puestos?|seats?|players?|n[uú]meros?|#)\s*(\d{1,2})\b((?:\s*(?:,|y|e|o|u|\/|&)\s*\d{1,2}\b)*)/giu;
// una pareja tras una palabra que la delata: «su pareja es 0-5», «los enamorados 2 y 6», «entre 1-4»
const PAREJA = /(?<![\p{L}])(pareja|enamorad[oa]s?|vinculad[oa]s?|unid[oa]s?|par|entre)(\s+(?:es|son|de|los|las|era|eran)?\s*)(\d{1,2})\s*(?:-|–|\/|\sy\s)\s*(\d{1,2})(?![\p{L}\d%:])/giu;
const PAR_CON_GUION = /(?<![\p{L}\d._/:%-])(\d{1,2})\s*-\s*(\d{1,2})(?![\p{L}\d%:/]|\.\d)/gu; // «0-5» a secas
// un numero (con su articulo, si lo trae) que ni va pegado a letras o cifras ni es un decimal, una hora, un porcentaje o parte de un par «2-1»
const NUMERO_SUELTO = /(?:(?<![\p{L}])(el|al|del)\s+)?(?<![\p{L}\d._/:%-])(\d{1,2})(?![\p{L}\d%/]|:\d|\.\d|-\d)/giu;
const RESTO_DE_LISTA = new RegExp(`^(?:\\s*${separador}\\s*\\d{1,2}\\b)*`, 'iu'); // «y 5» de «entre 3 y 5 votos»: la cuenta se mira al final de la lista
const SEPARADOR_DE_LISTA = new RegExp(`^\\s*${separador}\\s*$`, 'iu');
const ES_CUENTA = /^\s*(?:lobos?|aldeanos?|videntes?|brujas?|cazador(?:es)?|cupidos?|votos?|jugador(?:es)?|vivos?|vivas?|muert[oa]s?|rondas?|noches?|d[ií]as?|mensajes?|veces|vez|puntos?|pts|pociones?|poci[oó]n|inspecci[oó]n|inspecciones|llamadas?|habitantes?|sospechos[oa]s?|personas?|roles?|a favor|en contra|de los|de las|de\s+\d|por ciento)(?![\p{L}])/iu;
const DELANTE_CUENTA = /(?:^|[^\p{L}])(?:rondas?|round|d[ií]as?|day|noches?|night|turnos?|fase|paso|votos?|puntos?|total|conteo|resultado|marcador|quedan?|quedamos|quedar[aá]n?|faltan?|suman?|solo|sólo|apenas|casi|hasta|cada|m[aá]ximo|m[ií]nimo|tras|durante|llevamos|llevan|desde|tope|l[ií]mite)\s*[:=]?\s*$/iu;

const PARTICULA_DELANTE = /(?:^|[^\p{L}])(?:a|de|del|al|el|con|contra|por|en|entre|para|y|e|o|u)\s*$/iu; // «... y a 6)»: el numero es una cita aunque lo cierre un parentesis

const conMayuscula = (palabra, modelo) => (modelo[0] === modelo[0].toUpperCase() ? palabra.charAt(0).toUpperCase() + palabra.slice(1) : palabra);

export function traducirAsientos(texto, nombre, jugadores) {
  const enLaMesa = (d) => { const i = Number(d); return Number.isInteger(i) && i >= 0 && i < jugadores; };
  const cita = (d) => (enLaMesa(d) ? nombre(Number(d)) : 'otro jugador');
  const esCuenta = (todo, desde) => ES_CUENTA.test(todo.slice(desde).replace(RESTO_DE_LISTA, ''));
  const conPalabra = String(texto ?? '').replace(REFERENCIA, (_, articulo, primero, resto) => {
    const delante = articulo === undefined ? '' : ARTICULOS[articulo.toLowerCase()];
    const lista = `${cita(primero)}${resto.replace(/\d{1,2}/g, cita)}`;
    return delante ? `${conMayuscula(delante, articulo)} ${lista}` : lista;
  });
  const dosAsientos = (m, a, b, inicio, todo) => (enLaMesa(a) && enLaMesa(b) && a !== b && !esCuenta(todo, inicio + m.length) ? `${nombre(Number(a))} y ${nombre(Number(b))}` : m);
  const conParejas = conPalabra
    .replace(PAREJA, (m, palabra, union, a, b, inicio, todo) => { const nombres = dosAsientos(m, a, b, inicio, todo); return nombres === m ? m : `${palabra}${union}${nombres}`; })
    .replace(PAR_CON_GUION, (m, a, b, inicio, todo) => (DELANTE_CUENTA.test(todo.slice(0, inicio)) ? m : dosAsientos(m, a, b, inicio, todo)));
  let finDelUltimo = -1, ultimoTraducido = false, traducidos = 0; // el ultimo numero de la mesa que se vio: «3,6,7» y «2 y 5» siguen la suerte del primero
  const salida = conParejas.replace(NUMERO_SUELTO, (m, articulo, d, inicio, todo) => {
    if (!enLaMesa(d)) return m;
    const antes = todo.slice(0, inicio), sigueUnaLista = finDelUltimo >= 0 && SEPARADOR_DE_LISTA.test(todo.slice(finDelUltimo, inicio));
    const traducir = !esCuenta(todo, inicio + m.length)
      && (sigueUnaLista ? ultimoTraducido : articulo !== undefined || !DELANTE_CUENTA.test(antes)) // «quedan 3, 4 y 5» es una cuenta de principio a fin
      && !(todo[inicio + m.length] === ')' && !/\($/.test(antes) && !PARTICULA_DELANTE.test(antes)) // «1) ...» enumera; «(a 0 y a 6)» no
      && !(antes.trim() === '' && /^[.)]/.test(todo.slice(inicio + m.length))); // «1. ...» al empezar tambien
    finDelUltimo = inicio + m.length; ultimoTraducido = traducir;
    if (!traducir) return m;
    traducidos++;
    const contraido = articulo === undefined ? '' : ARTICULOS_SUELTOS[articulo.toLowerCase()];
    return `${contraido ? `${conMayuscula(contraido, articulo)} ` : ''}${nombre(Number(d))}`;
  });
  return traducidos ? salida.replace(/(?<=[\p{L}\d]),(?=\p{L})/gu, ', ') : salida; // «3,6,7» ya son nombres: la coma lleva su espacio
}
