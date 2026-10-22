// EL CONTRATO de este juego: el mismo texto para todos los modelos. Sin acentos. Si cambia, sube `versionReglas` en conquista.js:
// las partidas jugadas con otro texto no se comparan con las nuevas. Los numeros de la Maravilla y de las unidades salen de constantes.js para no desincronizarse.

import { MARAVILLA, UNIDADES, MEJORAS, FORT_INGENIO } from './constantes.js';

const lista = (costo) => Object.entries(costo).map(([recurso, n]) => `${n} ${recurso}`).join(' + ');
const COSTO_MARAVILLA = lista(MARAVILLA.costo);
const FUERZA = (u) => (u.fuerzaAtaca === u.fuerzaDefiende ? `Fuerza ${u.fuerzaAtaca}.` : `Fuerza ${u.fuerzaAtaca} al atacar y ${u.fuerzaDefiende} al defender.`);
const NOTA_UNIDAD = { J: ' Es el unico que llega a 2 regiones.', I: ' Solo se recluta en una region con cuartel.' };
const TEXTO_UNIDADES = UNIDADES.map((u) => `- ${u.id} ${u.nombre}: ${lista(u.costo)}. ${FUERZA(u)}${NOTA_UNIDAD[u.id] ?? ''}`).join('\n');
const PORCIENTO = (x) => Math.round(x * 100);

export const REGLAS = `Objetivo: ser el unico reino triunfante.
Mapa de regiones (R01, R02, ...) con terreno (ll = llanura, bo = bosque, mo = montana) y a veces un recurso. De 2 a 5 reinos, cada uno con una capital. 30 turnos; todos actuan a la vez.

RECURSOS: Comida, Madera, Roca, Hierro, Oro y Caballos. Cada region tuya con recurso da +2 de ese recurso por turno; ademas 1 Comida por cada 2 regiones.

UNIDADES (cada region guarda cuantas hay de cada tipo; empiezas solo con Lanceros):
${TEXTO_UNIDADES}
DOMINIO: cada tipo rinde el DOBLE contra el tipo al que domina: L domina a J, A domina a L, J domina a A e I. Contra una mezcla, el doble cuenta en proporcion a las unidades de cada tipo del rival.

ORDENES (maximo 14 por turno):
- reclutar REGION TIPO N: N unidades en region tuya (si hay cuartel, cuesta la mitad).
- mover DESDE HASTA TIPO N [TIPO N ...] (o "todo", que lleva todo menos 1 unidad): por ejemplo mover R07 R12 L4 A2. Si la region es enemiga, atacas. Siempre debe quedar 1 unidad en la region de origen. Solo los Jinetes llegan a 2 regiones, y la del medio debe ser tuya, libre o de un aliado: nunca de otro reino.
- mejorar TIPO: +${PORCIENTO(MEJORAS.bono)}% de fuerza a todas tus unidades de ese tipo (maximo ${MEJORAS.maximo} niveles). Nivel 1: ${lista(MEJORAS.costo[0])}; nivel 2: ${lista(MEJORAS.costo[1])}. Hace falta un cuartel.
- fortificar REGION: nivel 1: 3 Madera + 2 Roca; 2: 4 Roca + 3 Madera; 3 (muralla): 6 Roca + 3 Hierro. Cada nivel da +50% de defensa.
- mercenarios REGION N: N Lanceros a 2 Oro c/u (maximo 3 por turno).
- regalar RECURSO CANTIDAD REINO: das recursos a otro reino.
- ofrecer REINO RECURSO CANT RECURSO CANT: das lo primero por lo segundo (maximo 10 por lado, 2 por turno); el otro la ve el turno siguiente y la acepta con: aceptar REINO. Todo o nada.
- construir REGION EDIFICIO: granja (4 Madera: +2 Comida), mercado (3 Madera + 3 Roca: +2 Oro), cuartel (4 Madera + 3 Roca: reclutar ahi cuesta la mitad, recluta Ingenios y permite mejorar). Uno por region, maximo 3 por tipo; si conquistan la region, pasa al conquistador a mitad de efecto.
- construir REGION maravilla (solo en tu capital; solo existe una): ${COSTO_MARAVILLA}. Quien la conserve ${MARAVILLA.turnos} turnos seguidos gana. Si conquistan esa capital pasa intacta al conquistador y la cuenta se reinicia.
- romper REINO: rompes tu pacto y puedes atacarlo este turno.

COMBATE: tu fuerza = suma de unidades x fuerza x mejoras x dominio. Defensa = tu fuerza x (1 + 0.5 por nivel de fortaleza), +25% en bosque o +50% en montana. Si 1/${Math.round(1 / FORT_INGENIO.mitad)} o mas de los atacantes son Ingenios, la fortaleza cuenta la mitad; con 1/${Math.round(1 / FORT_INGENIO.anula)} o mas, no cuenta. Gana el lado con mas fuerza y conserva sus unidades x (1 - fuerza del segundo / la suya); los demas se eliminan. Si pierdes tu capital, caes.
HAMBRE: cada 4 unidades comen 1 Comida por turno (Jinetes e Ingenios cuentan doble); si falta, desertan el 10%.
DIPLOMACIA: un mensaje publico y hasta 2 privados por turno (maximo 140 caracteres; los privados llegan el turno siguiente, solo al destinatario). Pacto de no agresion: dura 2 turnos y se forma si dos reinos se lo proponen (tu propuesta queda abierta un turno mas). Atacar a un aliado exige romper el pacto ese turno. En los ultimos 2 turnos no hay alianzas.
HONOR (publico, 0 a 10): empiezas en 5. Romper un pacto resta 3; cumplirlo hasta el final suma 1; cada 3 turnos suma 1. Con 2 o menos, mercenarios a 3 Oro y no firmas pactos nuevos.
MEMORIA: cada turno puedes dejar una nota de plan (maximo 250 caracteres); solo tu la ves, el turno siguiente.
VICTORIA: gana el unico reino vivo, quien complete la maravilla o, al turno 30, quien controle mas regiones (desempate: unidades).`;

export const FORMATO = `{"ordenes": ["reclutar R03 L4", "mover R07 R12 L3 A2", "construir R03 granja"], "pacto_con": "reino o null", "mensaje": "texto breve", "privados": [{"a": "reino", "texto": "texto breve"}], "nota": "tu plan", "razon": "una frase"}`;
