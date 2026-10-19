// EL CONTRATO de este juego: el mismo texto para todos los modelos. Sin acentos. Si cambia, sube `versionReglas` en conquista.js:
// las partidas jugadas con otro texto no se comparan con las nuevas. La Maravilla lee sus numeros de constantes.js para no desincronizarse.

import { MARAVILLA } from './constantes.js';

const COSTO_MARAVILLA = Object.entries(MARAVILLA.costo).map(([recurso, n]) => `${n} ${recurso}`).join(' + ');

export const REGLAS = `Objetivo: ser el unico reino triunfante.
Mapa de regiones (R01, R02, ...) con terreno (ll = llanura, bo = bosque, mo = montana) y a veces un recurso. De 2 a 5 reinos, cada uno con una capital. 30 turnos; todos actuan a la vez.

RECURSOS: Comida, Madera, Roca, Hierro, Oro y Caballos. Cada region tuya con recurso da +2 de ese recurso por turno; ademas 1 Comida por cada 2 regiones.

ORDENES (maximo 12 por turno):
- reclutar REGION N: N tropas en region tuya (1 Comida c/u).
- mover DESDE HASTA N: N tropas a region vecina (si es enemiga, atacas). Con Caballos (1 por 3 tropas) llegas a 2 regiones.
- fortificar REGION: nivel 1: 3 Madera + 2 Roca; 2: 4 Roca + 3 Madera; 3 (muralla): 6 Roca + 3 Hierro. Cada nivel da +50% de defensa.
- armar: +25% de ataque (4 Hierro + 2 Madera; maximo 2 veces).
- mercenarios REGION N: N tropas a 2 Oro c/u (maximo 3 por turno).
- regalar RECURSO CANTIDAD REINO: das recursos a otro reino.
- ofrecer REINO RECURSO CANT RECURSO CANT: das lo primero por lo segundo (maximo 10 por lado, 2 por turno); el otro la ve el turno siguiente y la acepta con: aceptar REINO. Todo o nada.
- construir REGION EDIFICIO: granja (4 Madera: +2 Comida), mercado (3 Madera + 3 Roca: +2 Oro), cuartel (4 Madera + 3 Roca: reclutar ahi cuesta la mitad). Uno por region, maximo 3 por tipo; si conquistan la region, pasa al conquistador a mitad de efecto.
- construir REGION maravilla (solo en tu capital; solo existe una): ${COSTO_MARAVILLA}. Quien la conserve ${MARAVILLA.turnos} turnos seguidos gana. Si conquistan esa capital pasa intacta al conquistador y la cuenta se reinicia.
- romper REINO: rompes tu pacto y puedes atacarlo este turno.

COMBATE: gana el lado con mas fuerza y conserva tropas x (1 - fuerza del segundo / la suya); los demas se eliminan. Ataque = tropas x armas. Defensa = tropas x (1 + 0.5 por nivel de fortaleza), +25% en bosque o +50% en montana. Si pierdes tu capital, caes.
HAMBRE: cada 4 tropas comen 1 Comida por turno; si falta, desertan el 10%.
DIPLOMACIA: un mensaje publico y hasta 2 privados por turno (maximo 140 caracteres; los privados llegan el turno siguiente, solo al destinatario). Pacto de no agresion: dura 2 turnos y se forma si dos reinos se lo proponen (tu propuesta queda abierta un turno mas). Atacar a un aliado exige romper el pacto ese turno. En los ultimos 2 turnos no hay alianzas.
HONOR (publico, 0 a 10): empiezas en 5. Romper un pacto resta 3; cumplirlo hasta el final suma 1; cada 3 turnos suma 1. Con 2 o menos, mercenarios a 3 Oro y no firmas pactos nuevos.
MEMORIA: cada turno puedes dejar una nota de plan (maximo 250 caracteres); solo tu la ves, el turno siguiente.
VICTORIA: gana el unico reino vivo, quien complete la maravilla o, al turno 30, quien controle mas regiones (desempate: tropas).`;

export const FORMATO = `{"ordenes": ["reclutar R03 4", "mover R07 R12 5", "construir R03 granja"], "pacto_con": "reino o null", "mensaje": "texto breve", "privados": [{"a": "reino", "texto": "texto breve"}], "nota": "tu plan", "razon": "una frase"}`;
