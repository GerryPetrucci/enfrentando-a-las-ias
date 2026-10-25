// EL CONTRATO de este juego: el mismo texto para todos los modelos. Sin acentos. Si cambia, sube `versionReglas` en conquista.js:
// las partidas jugadas con otro texto no se comparan con las nuevas. Los numeros de la Maravilla y de las unidades salen de constantes.js para no desincronizarse.

import { MARAVILLA, UNIDADES, MEJORAS, FORT_INGENIO, TIERRA_AJENA, HEGEMON, EVENTOS, PUNTOS_POSICION } from './constantes.js';

const lista = (costo) => Object.entries(costo).map(([recurso, n]) => `${n} ${recurso}`).join(' + ');
const COSTO_MARAVILLA = lista(MARAVILLA.costo);
const FUERZA = (u) => (u.fuerzaAtaca === u.fuerzaDefiende ? `Fuerza ${u.fuerzaAtaca}.` : `Fuerza ${u.fuerzaAtaca} al atacar y ${u.fuerzaDefiende} al defender.`);
const NOTA_UNIDAD = { J: ' Es el unico que llega a 2 regiones.', I: ' Solo se recluta en una region con cuartel.' };
const TEXTO_UNIDADES = UNIDADES.map((u) => `- ${u.id} ${u.nombre}: ${lista(u.costo)}. ${FUERZA(u)}${NOTA_UNIDAD[u.id] ?? ''}`).join('\n');
const PORCIENTO = (x) => Math.round(x * 100);
const unir = (xs) => `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`;
const PUNTOS = PUNTOS_POSICION.filter((p) => p > 0).map((p) => `${p} al ${PUNTOS_POSICION.indexOf(p) + 1}o`).join(', ');

export const REGLAS = `Objetivo: ser el unico reino triunfante.
Mapa de regiones (R01, R02, ...) con terreno (ll = llanura, bo = bosque, mo = montana) y a veces un recurso. De 2 a 5 reinos, cada uno con una capital. 30 turnos; todos actuan a la vez.

RECURSOS: Comida, Madera, Roca, Hierro, Oro y Caballos. Cada region tuya con recurso da +2 de ese recurso por turno; ademas 1 Comida por cada 2 regiones.

UNIDADES (cada region guarda cuantas hay de cada tipo; empiezas solo con Lanceros):
${TEXTO_UNIDADES}
DOMINIO: cada tipo rinde el DOBLE contra el tipo al que domina: L domina a J, A domina a L, J domina a A e I. Contra una mezcla, el doble cuenta en proporcion a las unidades de cada tipo del rival.

ORDENES (maximo 14 por turno):
- reclutar REGION TIPO N: N unidades en region tuya (si hay cuartel, cuesta la mitad).
- mover DESDE HASTA TIPO N [TIPO N ...] (o "todo": todo menos 1 unidad). Si la region es enemiga, atacas; si es de un aliado con pacto (no su capital), entras de visita. En tu region debe quedar 1 unidad; las de visita pueden irse enteras. Solo los Jinetes llegan a 2 regiones, y la del medio debe ser tuya, libre o de un aliado (nunca de otro reino).
- atacar REGION [TIPO N ... | todo]: atacas donde ya estas, con esas unidades (sin lista, todas), a los reinos sin pacto contigo que tengan unidades ahi. Pelean las que no se movieron este turno. El dueno ataca con toda su guarnicion.
- mejorar TIPO: +${PORCIENTO(MEJORAS.bono)}% de fuerza a todas tus unidades de ese tipo (maximo ${MEJORAS.maximo} niveles). Nivel 1: ${lista(MEJORAS.costo[0])}; nivel 2: ${lista(MEJORAS.costo[1])}. Hace falta un cuartel.
- fortificar REGION: nivel 1: 3 Madera + 2 Roca; 2: 4 Roca + 3 Madera; 3 (muralla): 6 Roca + 3 Hierro. Cada nivel da +50% de defensa.
- mercenarios REGION N: N Lanceros a 2 Oro c/u (maximo 3 por turno).
- regalar RECURSO CANTIDAD REINO: das recursos a otro reino.
- ofrecer REINO RECURSO CANT RECURSO CANT: das lo primero por lo segundo (maximo 10 por lado, 2 por turno); el otro la ve el turno siguiente y la acepta con aceptar REINO. Todo o nada.
- construir REGION EDIFICIO: granja (4 Madera: +2 Comida), mercado (3 Madera + 3 Roca: +2 Oro), cuartel (4 Madera + 3 Roca: reclutar ahi cuesta la mitad, recluta Ingenios y permite mejorar). Uno por region, maximo 3 por tipo; al conquistar la region pasa al conquistador a mitad de efecto.
- construir REGION maravilla (solo en tu capital; solo existe una): ${COSTO_MARAVILLA}. Completar ${MARAVILLA.turnos} turnos de avance gana. Si conquistan esa capital pasa intacta al conquistador y la cuenta se reinicia.CERCO: si un enemigo sin pacto tiene al menos ${MARAVILLA.cerco} unidades en una region vecina de la Maravilla, su cuenta se pausa sin perder el progreso. Al despejar todos los cercos (o pactar), vuelve a sumar; para ganar debe estar libre de cerco al cerrar el turno.
- romper REINO: terminas tu pacto con ese reino. No te obliga a atacar: tus tropas en su territorio pueden irse o atacar.

COMBATE: fuerza = unidades x fuerza x mejoras x dominio. Defensa = fuerza x (1 + 0.5 por nivel de fortaleza), +25% en bosque, +50% en montana; si 1/${Math.round(1 / FORT_INGENIO.mitad)} o mas de los atacantes son Ingenios la fortaleza cuenta la mitad, con 1/${Math.round(1 / FORT_INGENIO.anula)} o mas no cuenta. Gana el lado de mas fuerza y conserva sus unidades x (1 - fuerza del segundo / la suya); los demas se eliminan. Si pierdes tu capital, caes.
HAMBRE: cada 4 unidades comen 1 Comida por turno (Jinetes e Ingenios cuentan doble); si falta, desertan el 10% de cada pila (minimo 1).
AISLAMIENTO: una region tuya sin camino a tu capital (por regiones tuyas, libres o de un aliado con pacto) esta aislada: no produce, no cuenta para la cosecha base y ahi no se recluta, fortifica ni construye; sus unidades siguen comiendo.
DIPLOMACIA: un mensaje publico y hasta 2 privados por turno (maximo 140 caracteres; los privados llegan el turno siguiente, solo al destinatario). Pacto de no agresion: dura 2 turnos y se forma si dos reinos se lo proponen (tu propuesta sigue abierta un turno mas). Atacar a un aliado exige romper el pacto ese turno. En los ultimos 2 turnos no hay alianzas (tus tropas de visita pasan a hostiles).
ALIANZAS: con pacto vigente dejas tropas de visita en regiones de tu aliado (no en su capital). Si atacan esa region, tus tropas defienden con las del dueno, con su fortaleza y terreno; si eres aliado de los dos bandos no participas. Dos aliados que atacan la misma region pelean juntos y se queda con ella quien conserve mas unidades. Si el pacto termina o se rompe, las tropas de visita son hostiles: pueden quedarse sin pelear, irse (mover) o atacar (atacar REGION). Quien pelea en la region de un reino sin pacto con el rinde x${TIERRA_AJENA} (tierra ajena). Las tropas de visita comen de tu Comida.
EQUILIBRIO: el Hegemon (el reino con mas regiones, desde el ${PORCIENTO(HEGEMON.entra)}% de las regiones con dueno hasta que baje del ${PORCIENTO(HEGEMON.sale)}%) recibe el ataque de los demas con +${PORCIENTO(HEGEMON.bonoAtaque - 1)}%. EVENTOS para todos en los turnos ${unir(EVENTOS.turnos)}, anunciados un turno antes (Presagio): Sequia (cosecha base a la mitad ${EVENTOS.sequiaTurnos} turnos), Peste (el reino con mas unidades pierde ${PORCIENTO(EVENTOS.peste)}%), Cosecha (+1 Comida por region) o Caravana (el reino con menos regiones recibe ${lista(EVENTOS.caravana)}).
HONOR (publico, 0 a 10): empiezas en 5. Romper un pacto resta 3; cumplirlo hasta el final suma 1; cada 3 turnos suma 1. Con 2 o menos, mercenarios a 3 Oro y no firmas pactos nuevos.
MEMORIA: cada turno puedes dejar una nota de plan (maximo 250 caracteres) que solo tu ves el turno siguiente.
ORDEN: la produccion y el hambre van antes de tus gastos; tu almacen y "Puedes reclutar hasta" son los de antes.
VICTORIA: gana el unico reino vivo, quien complete la maravilla o, al turno 30, quien controle mas regiones (desempate: unidades, almacen y sorteo). Si los ultimos reinos caen a la vez, acaba ahi y gana el de mas regiones al caer. PUNTOS por posicion final: ${PUNTOS} y 0 al resto.`;

export const FORMATO = `{"ordenes": ["reclutar R03 L4", "mover R07 R12 L3 A2", "construir R03 granja"], "pacto_con": "reino o null", "mensaje": "texto breve", "privados": [{"a": "reino", "texto": "texto breve"}], "nota": "tu plan", "razon": "una frase"}`;
