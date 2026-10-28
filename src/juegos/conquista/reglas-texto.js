// EL CONTRATO de este juego: el mismo texto para todos los modelos. Sin acentos. Si cambia, sube `versionReglas` en conquista.js:
// las partidas jugadas con otro texto no se comparan con las nuevas. Los numeros salen de constantes.js y los ejemplos de calculo se hacen con las funciones del motor
// (batalla.js, unidades.js) para que el texto no se desincronice ni lleve aritmetica a mano.
//
// 2.3.0 (28-10-2026): prompt COMPLETO (docs/guia-de-prompts.md, regla del usuario «de nada sirve un prompt escaso»): orden exacto del turno, cada orden con su sintaxis, combate con
// ejemplo, como leer el estado y el formato de respuesta campo por campo. Spec y comprobaciones contra el motor: privado/spec/guerra-prompt-2.3.0.md y
// src/pruebas/conquista/prompt-claro.test.js. El wrapper comun (src/prompt.js) pone las secciones en su sitio:
//   PRESENTACION → «Estas compitiendo...» · REGLAS → «=== REGLAS DEL JUEGO ===» · GUIA_ESTADO → «=== COMO LEER TU ESTADO ===» · FORMATO + EXPLICACION_RESPUESTA → «=== COMO RESPONDER ===» ·
//   ERRORES_FRECUENTES → «=== ERRORES FRECUENTES ===». El aviso de espacio (avisoDeEspacio) NO se uso: con el prompt completo GLM Flash paso de 21 cortes en 30 turnos reales a 0 sin el.

import {
  TURNOS, MAX_ORDENES, MAX_PRIVADOS, LARGO_MENSAJE, LARGO_NOTA, LARGO_RAZON, RECURSOS, ALMACEN_INICIAL, TROPAS_CAPITAL, TROPAS_VECINA, TERRENO, FORTALEZA, UNIDADES, DOMINIO,
  MEJORAS, FORT_INGENIO, TIERRA_AJENA, HEGEMON, EVENTOS, CUARTEL, MERCENARIOS, EDIFICIOS, MAX_EDIFICIOS_POR_TIPO, MARAVILLA, HONOR, PACTO_TURNOS, COMIDA, PUNTOS_POSICION,
} from './constantes.js';
import { costoDePila, fuerzaDeMiembro } from './unidades.js';
import { resolverBatalla, fuerzasDeBandos } from './batalla.js';
import { FRAGMENTO_DE_ESTADO } from './ejemplo-estado.js';

const lista = (costo) => Object.entries(costo).map(([recurso, n]) => `${n} ${recurso}`).join(' + ');
const x1 = (n) => n.toFixed(1);
const PORCIENTO = (x) => Math.round(x * 100);
const U = Object.fromEntries(UNIDADES.map((u) => [u.id, u]));
const PUNTOS = PUNTOS_POSICION.filter((p) => p > 0).map((p, i) => `${p} al ${i + 1}o`).join(', ');
const COSTO_MARAVILLA = Object.values(MARAVILLA.costo).every((n) => n === MARAVILLA.costo.Comida) ? `${MARAVILLA.costo.Comida} de CADA uno de los seis recursos` : lista(MARAVILLA.costo);

// ---- Ejemplo de hambre (calculado) ----
const EJ_HAMBRE = { L: 18, J: 4 };
const racionesEj = EJ_HAMBRE.L * U.L.racion + EJ_HAMBRE.J * U.J.racion;
const comidaEj = Math.ceil(racionesEj / COMIDA.tropasPorRacion);

// ---- Ejemplo de combate (calculado con el motor): defiende 6 L + 4 A en bosque con fortaleza 1; ataca la menor pila L + A (A = L/2) que gana con razon >= 1.4 ----
const DEFENSA_EJ = [6, 4, 0, 0];
function ejemploDeCombate() {
  for (let l = 8; l <= 60; l += 2) {
    const ataque = [l, l / 2, 0, 0];
    const bandos = [
      { miembros: [{ k: 0, pila: ataque, mejoras: [0, 0, 0, 0], mod: TIERRA_AJENA }], defensor: false, ataca: true },
      { miembros: [{ k: 1, pila: DEFENSA_EJ, mejoras: [0, 0, 0, 0], mod: 1 }], defensor: true, ataca: false },
    ];
    const [fa, fd] = fuerzasDeBandos(bandos, { terr: 'bo', fort: 1 });
    if (fa / fd >= 1.4) {
      const res = resolverBatalla(bandos, { terr: 'bo', fort: 1, dueno: 1 });
      return {
        ataque, fa, fd, supervivientes: res.supervivientes[0].pila, fraccion: res.fraccion,
        baseL: ataque[0] * U.L.fuerzaAtaca, baseA: ataque[1] * U.A.fuerzaAtaca, domA: 1 + (DOMINIO - 1) * (DEFENSA_EJ[0] / (DEFENSA_EJ[0] + DEFENSA_EJ[1])),
        defL: DEFENSA_EJ[0] * U.L.fuerzaDefiende, defA: DEFENSA_EJ[1] * U.A.fuerzaDefiende, domDefA: 1 + (DOMINIO - 1) * (ataque[0] / (ataque[0] + ataque[1])),
      };
    }
  }
  throw new Error('reglas-texto: sin ejemplo de combate');
}
const EC = ejemploDeCombate();
const fuerzaAtaqueSinMod = fuerzaDeMiembro(EC.ataque, [0, 0, 0, 0], DEFENSA_EJ, true, 1);
const fuerzaDefensaSinMul = fuerzaDeMiembro(DEFENSA_EJ, [0, 0, 0, 0], EC.ataque, false, 1);

// ---- Ejemplo de reclutar con cuartel (calculado) ----
const EJ_RECLUTA = [5, 3, 0, 0];
const costoSin = costoDePila(EJ_RECLUTA, 1), costoCon = costoDePila(EJ_RECLUTA, CUARTEL.entero);

// ---- La primera region del estado de ejemplo, explicada con sus propios datos: "R01 ll+Comida: 3 6 8" ----
const PRIMERA_REGION = (() => {
  const linea = FRAGMENTO_DE_ESTADO.split('\n')[1];
  const [, nombre, terreno, recurso, vecinas] = /^(R\d+) (\w+)(?:\+(\w+))?: ([\d ]+)$/.exec(linea);
  const TERRENOS = { ll: 'llanura', bo: 'bosque', mo: 'montana' };
  const vecinos = vecinas.trim().split(' ').map((n) => `R${n.padStart(2, '0')}`);
  return { linea, explicacion: `region ${Number(nombre.slice(1))}, ${TERRENOS[terreno]}${recurso ? `, con ${recurso}` : ''}, vecina de ${vecinos.slice(0, -1).join(', ')} y ${vecinos.at(-1)}` };
})();

export const PRESENTACION = `Eres el gobernante de un reino en "Guerra de territorios", un juego de estrategia por turnos. Compites contra otros reinos, cada uno controlado por otra inteligencia artificial, y todos reciben exactamente este mismo texto. Un motor arbitra la partida: tus respuestas son PROPUESTAS que el motor valida y aplica; una orden que no se puede cumplir se descarta sin avisarte y las demas siguen. No puedes cambiar el estado del juego de ninguna otra manera.

Cada turno recibes un mensaje "Estado actual de la partida" con lo que sabe tu reino (la seccion COMO LEER TU ESTADO explica cada linea) y respondes con un JSON (la seccion COMO RESPONDER lo explica campo por campo). Estas reglas son COMPLETAS: no hay reglas ocultas ni excepciones fuera de este texto, y si algo no esta aqui, no existe en el juego.`;

export const REGLAS = `1. LO ESENCIAL
- Hay de 2 a 5 reinos sobre un mapa de regiones (R01, R02, ...). Cada reino empieza con una CAPITAL (${TROPAS_CAPITAL} Lanceros y fortaleza nivel 1) y unas regiones vecinas (${TROPAS_VECINA} Lanceros cada una). Todos empiezan con ${RECURSOS.map((r) => `${ALMACEN_INICIAL[r]} ${r}`).join(', ')} y Honor ${HONOR.inicial}.
- Dura ${TURNOS} turnos. Todos los reinos deciden A LA VEZ: nadie ve lo que hacen los demas antes de decidir.
- Con los recursos de tus regiones reclutas tropas, construyes y comercias; con las tropas conquistas regiones; con los pactos te proteges de algunos vecinos.
- Ganas si eres el unico reino vivo, si completas la Maravilla o si, al terminar el turno ${TURNOS}, estas en primer lugar (mas regiones).
- Tu PUNTAJE depende de tu posicion final: ${PUNTOS} y 0 al resto. Caer (que tomen tu capital) te deja por debajo de todos los reinos que siguen vivos.

2. COMO SE RESUELVE UN TURNO (orden exacto)
Todos los reinos envian sus ordenes a la vez y el motor las aplica en este orden:
 1) Evento del mundo, si toca (se anuncia un turno antes: Presagio).
 2) Produccion: cada reino recibe los recursos de sus regiones.
 3) Honor (+${HONOR.cumplido} cada ${HONOR.cadaTurnos} turnos) y fin de los pactos que vencen.
 4) Hambre: tus tropas comen; si falta Comida, desertan.
 5) Ordenes de gasto, reino por reino y en el orden en que las escribiste: reclutar, mercenarios, fortificar, mejorar, construir, regalar, ofrecer.
 6) Llegan los regalos y se ejecutan los "aceptar".
 7) Rupturas de pacto ("romper").
 8) Movimientos: todos los "mover" salen a la vez; despues los "atacar" donde ya estabas; despues se resuelve cada region con llegadas o ataques.
 9) Pactos nuevos, mensajes y notas.
 10) Cuenta de la Maravilla, victoria y cierre del turno.
Lo que conviene recordar de este orden:
- Tu estado trae dos almacenes: "Tu almacen" (el del CIERRE del turno anterior) y "Disponible al gastar" (ya con la produccion y el hambre de este turno aplicadas). Tus ordenes de gasto se pagan de este ultimo, que ya viene calculado: no tienes que calcular la produccion ni el hambre.
- Lo que reclutas, fortificas o construyes existe AL INSTANTE (las tropas nuevas pueden mover y pelear ese mismo turno); las tropas nuevas empiezan a comer el turno siguiente.
- Las tropas que salen de una region dejan de defenderla antes de que lleguen los atacantes.

3. RECURSOS Y PRODUCCION
Seis recursos: ${RECURSOS.join(', ')}. No hay limite de almacenamiento. Cada turno, antes de gastar, produces:
- +2 del recurso de cada region tuya que lo tenga (el mapa lo marca: "R03 bo+Comida" = region 3, bosque, con Comida).
- Cosecha base: 1 Comida por cada ${COMIDA.regionesPorCosecha} regiones tuyas, redondeado hacia abajo (7 regiones dan 3).
- Granja: +2 Comida. Mercado: +2 Oro. Un edificio danado produce la mitad (1).
- Las regiones AISLADAS (ver AISLAMIENTO) no producen nada y no cuentan para la cosecha base.

4. UNIDADES, DOMINIO Y HAMBRE
Cuatro tipos de unidad. Cada region guarda cuantas hay de cada tipo, y se escriben con una letra: L4 = 4 Lanceros, L5A3 = 5 Lanceros y 3 Arqueros.
${UNIDADES.map((u) => `- ${u.id} ${u.nombre}: cuesta ${lista(u.costo)}. Fuerza ${u.fuerzaAtaca === u.fuerzaDefiende ? u.fuerzaAtaca : `${u.fuerzaAtaca} al atacar y ${u.fuerzaDefiende} al defender`}. Come ${u.racion} racion${u.racion > 1 ? 'es' : ''}.${u.id === 'L' ? ' Es la unica con la que empiezas.' : ''}${u.id === 'J' ? ' Es la unica que llega a 2 regiones de distancia.' : ''}${u.id === 'I' ? ' Solo se recluta en una region con cuartel; sirve contra fortalezas.' : ''}`).join('\n')}
DOMINIO: cada tipo rinde el DOBLE contra el tipo al que domina: L domina a J, A domina a L, J domina a A y a I, I no domina a ninguno. Contra una mezcla el doble cuenta en proporcion: si el rival tiene la mitad de Jinetes y la mitad de Lanceros, tus Lanceros rinden x1.5 (1 + 0.5), no x2. El dominio es de un solo lado: que tus Lanceros dominen a los Jinetes no hace que los Jinetes rindan menos contra ellos.
HAMBRE (paso 4 del turno): cada ${COMIDA.tropasPorRacion} raciones comen 1 Comida, redondeando hacia arriba; cuentan TODAS tus unidades, tambien las que estan de visita. Ejemplo: ${EJ_HAMBRE.L} Lanceros + ${EJ_HAMBRE.J} Jinetes = ${EJ_HAMBRE.L}x1 + ${EJ_HAMBRE.J}x2 = ${racionesEj} raciones = ${comidaEj} Comida por turno. Si no alcanza la Comida, pierdes TODA la que tengas y en cada region donde tengas tropas desertan el ${PORCIENTO(COMIDA.deserta)}% (redondeado, minimo 1; empezando por los Lanceros); en una region tuya nunca deserta la ultima unidad.

5. ORDENES (campo "ordenes" de tu JSON)
Es una lista de textos. Solo se aplican las primeras ${MAX_ORDENES}; las demas se ignoran. Mayusculas, minusculas y acentos no importan. Una region se escribe R07 (o r7). Las unidades se escriben con letra y cantidad (L4, A2) o con nombre ("4 lanceros"); si hay varios tipos van separados por espacio (L3 A2). Las cantidades son enteros de 1 a 9999.
Las ordenes de gasto se aplican en el orden en que las escribes y cada una es TODO O NADA: si no alcanzan los recursos o no se cumple una condicion, esa orden se descarta y el juego sigue con la siguiente. Escribe primero lo mas importante.

GASTO (se aplican en el paso 5):
- reclutar REGION TIPO N [TIPO N ...]   ej: reclutar R07 L4 A2
  Crea tropas en una region TUYA y no aislada. Pagas la suma de los costos (se redondea hacia arriba una sola vez por recurso). En una region con cuartel pagas la mitad (tres cuartos si el cuartel esta danado): ${EJ_RECLUTA[0]} Lanceros + ${EJ_RECLUTA[1]} Arqueros cuestan ${lista(costoSin)}, y con cuartel ${lista(costoCon)}. Los Ingenios solo se reclutan donde hay cuartel.
- mercenarios REGION N   ej: mercenarios R07 2
  N Lanceros al instante en una region tuya no aislada, a ${MERCENARIOS.costo} Oro cada uno (${MERCENARIOS.costoDeshonrado} si estas deshonrado). Maximo ${MERCENARIOS.maximoPorTurno} por turno sumando todas tus ordenes.
- fortificar REGION   ej: fortificar R05
  Sube un nivel la fortaleza de una region tuya no aislada (maximo 3). Nivel 1: ${lista(FORTALEZA[1])}. Nivel 2: ${lista(FORTALEZA[2])}. Nivel 3 (muralla): ${lista(FORTALEZA[3])}. Cada nivel da +${PORCIENTO(0.5)}% de defensa a esa region.
- mejorar TIPO   ej: mejorar A
  Mejora para siempre a TODAS tus unidades de ese tipo, en cualquier region: +${PORCIENTO(MEJORAS.bono)}% de fuerza por nivel, ataque y defensa. Maximo ${MEJORAS.maximo} niveles por tipo. Nivel 1: ${lista(MEJORAS.costo[0])}. Nivel 2: ${lista(MEJORAS.costo[1])}. Necesitas tener un cuartel tuyo no aislado.
- construir REGION EDIFICIO   ej: construir R07 cuartel
  Region tuya no aislada y sin edificio; maximo ${MAX_EDIFICIOS_POR_TIPO} de cada tipo por reino. Granja (${lista(EDIFICIOS.granja.costo)}): +2 Comida por turno. Mercado (${lista(EDIFICIOS.mercado.costo)}): +2 Oro por turno. Cuartel (${lista(EDIFICIOS.cuartel.costo)}): reclutar ahi cuesta la mitad, es el unico lugar donde se reclutan Ingenios y es necesario para "mejorar". Un edificio que conquistas pasa a ti danado (la mitad de efecto), o se destruye si ya tienes ${MAX_EDIFICIOS_POR_TIPO} de ese tipo.
- construir REGION maravilla   (solo en tu capital; ver MARAVILLA)
- regalar RECURSO CANTIDAD REINO   ej: regalar Oro 3 Marfil
  Das recursos a otro reino. Se descuentan ya y le llegan al final de la fase de gasto.
- ofrecer REINO RECURSO CANT RECURSO CANT   ej: ofrecer Marfil Oro 3 Madera 4
  Propones al otro reino: "te doy 3 Oro y tu me das 4 Madera". Recursos distintos, maximo 10 por lado, maximo 2 ofertas por turno, y debes tener lo que ofreces al escribirla. El otro la ve el turno siguiente en "Ofertas recibidas" y solo ese turno puede aceptarla con la orden de abajo. Una oferta nueva al mismo reino reemplaza a la anterior.
- aceptar REINO   ej: aceptar Marfil
  Aceptas la oferta que ese reino te hizo (esta en tu lista de "Ofertas recibidas"). Todo o nada: si a alguno de los dos ya no le alcanza lo pactado, no se hace.

DIPLOMACIA:
- romper REINO   ej: romper Iris
  Terminas ahora el pacto que tienes con ese reino. Pierdes ${HONOR.rotura} de Honor. No te obliga a atacar. Se aplica antes de los movimientos, asi que puedes atacarlo ese mismo turno.

TROPAS (se aplican en el paso 8; detalle en MOVER Y ATACAR):
- mover DESDE HASTA TIPO N [TIPO N ...]   ej: mover R07 R12 L3 A2   o   mover R07 R12 todo
- atacar REGION [TIPO N ... | todo]   ej: atacar R14   o   atacar R14 L2

6. MOVER Y ATACAR
- "mover DESDE HASTA ..." lleva tropas a una region VECINA (un solo destino por orden; para repartir tropas escribe varias ordenes). Si el destino es tuyo, las refuerzas. Si esta libre (sin dueno) o es de un reino sin pacto contigo, entras: si hay defensores, es un ataque. Si es de un aliado con pacto, entras de visita (no se puede entrar en su capital).
- En una region tuya SIEMPRE debe quedar al menos 1 unidad. "todo" mueve todas menos 1 (se queda 1 unidad del primer tipo que tengas, en el orden L, A, J, I). Tropas de visita (las tuyas en region ajena) pueden irse enteras.
- Solo los Jinetes llegan a una region a 2 pasos (y esa orden solo puede llevar Jinetes); la region del medio debe ser tuya, libre o de un aliado: nunca de otro reino.
- Todos los movimientos son simultaneos y salen primero. Lo que sale ya no defiende su region de origen.
- "atacar REGION" sirve para pelear DONDE YA ESTAS contra reinos sin pacto contigo que tengan unidades ahi: por ejemplo, tus tropas de visita cuyo pacto vencio o se rompio, o tropas enemigas que entraron en tu region. Pelean las unidades que NO se movieron este turno. Si la region es tuya, peleas con toda tu guarnicion y escribes solo "atacar R07"; si estas de visita, puedes elegir unidades ("atacar R14 L2") o ir con todas. Una orden de atacar por region y turno.
- Para atacar una region vecina enemiga no uses "atacar": usa "mover" hacia ella.

7. COMBATE
Hay combate en una region cuando llegan tropas que no son del dueno ni de un aliado suyo, o cuando alguien ordena "atacar" donde ya esta. Pelean contra los reinos sin pacto con el atacante que tengan unidades ahi (el dueno, con todas las suyas). Los reinos con pacto entre si pelean del mismo lado. Tropas enemigas que simplemente estan en la misma region sin que nadie ataque no pelean.
FUERZA de un lado = suma sobre sus unidades de: cantidad x fuerza del tipo (la de ataque si ataca, la de defensa si defiende) x (1 + ${MEJORAS.bono} por nivel de mejora) x dominio contra la mezcla del rival. Despues se multiplica por:
- TIERRA AJENA: x${TIERRA_AJENA} para quien pelea en una region cuyo dueno es OTRO reino sin pacto con el. No aplica en regiones libres ni de un aliado, ni al dueno en su propia region.
- HEGEMON: quien pelea en una region del Hegemon (ver EQUILIBRIO) sin pacto con el lo hace ademas con x${HEGEMON.bonoAtaque}.
- Solo el lado que DEFIENDE (el dueno y sus aliados) recibe ademas: fortaleza x(1 + 0.5 por nivel) y terreno (llanura x${TERRENO.ll}, bosque x${TERRENO.bo}, montana x${TERRENO.mo}). Contra atacantes con 1/${Math.round(1 / FORT_INGENIO.mitad)} o mas de Ingenios la fortaleza cuenta la mitad; con 1/${Math.round(1 / FORT_INGENIO.anula)} o mas, no cuenta.
El dueno defiende con TODAS las unidades que tiene en la region. Los atacantes pelean con las que mandaron.
RESULTADO: gana el lado con mas fuerza. El perdedor desaparece entero. El ganador conserva de cada tipo de unidad piso(cantidad x (1 - fuerza del perdedor / fuerza del ganador)), pero siempre al menos 1 unidad (y 1 del dueno si el ganador es su lado). En otras palabras: si ganas con razon 2 (el doble de fuerza) conservas la mitad de tus unidades; con razon 1.2 apenas un sexto.
- EMPATE exacto de fuerzas: el dueno se queda con 1 unidad y los atacantes desaparecen; si el dueno no peleaba, desaparecen todos y la region queda libre.
- Si coinciden 3 o mas lados, pelean los dos mas fuertes y los demas desaparecen.
- Si atacantes ganan, la region pasa al que tenga mas unidades de ese lado; su fortaleza baja 1 nivel y los edificios pasan danados (o se destruyen, ver construir).
- Si pierdes tu CAPITAL caes: todas tus unidades desaparecen (tambien las de visita), tus recursos pasan a quien la tomo y tus regiones quedan libres.
EJEMPLO (calculado): atacas con ${EC.ataque[0]} Lanceros y ${EC.ataque[1]} Arqueros una region enemiga de bosque con fortaleza 1 y una guarnicion de ${DEFENSA_EJ[0]} Lanceros y ${DEFENSA_EJ[1]} Arqueros, sin mejoras ni pactos.
 Tu fuerza: Lanceros ${EC.ataque[0]}x1 = ${x1(EC.baseL)}; Arqueros ${EC.ataque[1]}x2 = ${x1(EC.baseA)} y como dominan a los Lanceros y ${DEFENSA_EJ[0]} de las ${DEFENSA_EJ[0] + DEFENSA_EJ[1]} unidades rivales son Lanceros, rinden x${EC.domA.toFixed(2)} (${x1(EC.baseA * EC.domA)}). Suma ${x1(fuerzaAtaqueSinMod)}; por tierra ajena x${TIERRA_AJENA} = ${x1(EC.fa)}.
 Su fuerza: Lanceros ${x1(EC.defL)}, Arqueros ${DEFENSA_EJ[1]}x2 = ${x1(EC.defA)} x${EC.domDefA.toFixed(2)} (dominan a tus Lanceros) = ${x1(EC.defA * EC.domDefA)}. Suma ${x1(fuerzaDefensaSinMul)}; por fortaleza 1 x1.5 y bosque x${TERRENO.bo} = ${x1(EC.fd)}.
 Razon ${(EC.fa / EC.fd).toFixed(2)}: ganas. Conservas ${PORCIENTO(EC.fraccion)}% de cada tipo (${EC.supervivientes[0]} Lanceros y ${EC.supervivientes[1]} Arqueros), la guarnicion desaparece y la region es tuya con la fortaleza en nivel 0.

8. REGIONES: TERRENO, EDIFICIOS Y AISLAMIENTO
- TERRENO: ll = llanura, bo = bosque, mo = montana (ver COMBATE). Una region puede tener un recurso (+2 por turno al dueno).
- FORTALEZA: nivel 0 a 3, se ve como f1, f2, f3 en tu estado. Las capitales empiezan en f1.
- EDIFICIOS: una region tiene como mucho uno: g = granja, m = mercado, c = cuartel. Un guion (g-) indica que esta danado.
- AISLAMIENTO: una region tuya queda AISLADA si no hay camino hasta tu capital pasando solo por regiones tuyas, libres o de un aliado con pacto. Una region aislada no produce, no cuenta para la cosecha base y en ella no se recluta, fortifica ni construye; sus unidades siguen comiendo. Tu estado lista tus regiones aisladas.

9. PACTOS, HONOR, MENSAJES Y COMERCIO
- PACTO DE NO AGRESION: se firma al final del turno si dos reinos se lo proponen entre si (campo "pacto_con"). Tu propuesta sigue abierta un turno mas: si hoy propones a Marfil y Marfil te propone manana, se firma manana. Dura ${PACTO_TURNOS} turnos (el estado dice "hasta el turno N", incluido) y se puede renovar en su ultimo turno. No hay pactos si la partida es de 2 reinos, ni con un reino deshonrado, ni desde el turno ${TURNOS - 1}: en los ultimos 2 turnos los pactos terminan y las tropas de visita pasan a hostiles.
- Con pacto: no se pueden atacar; entran de visita en las regiones del otro (no en su capital); si atacan la region donde tienes tropas de visita, tus tropas defienden junto con las del dueno, con su fortaleza y su terreno (si eres aliado de los dos bandos no participas); y no hay "tierra ajena" entre ustedes. Dos aliados que atacan la misma region pelean juntos y se queda con ella quien conserve mas unidades. Atacar a un aliado exige "romper" antes.
- Si un pacto termina o se rompe, las tropas de visita quedan donde estaban y son hostiles: pueden quedarse sin pelear, irse (mover) o atacar (atacar REGION).
- HONOR (publico, 0 a ${HONOR.maximo}): empiezas en ${HONOR.inicial}. Romper un pacto resta ${HONOR.rotura}; cumplir un pacto hasta el final suma ${HONOR.cumplido}; cada ${HONOR.cadaTurnos} turnos suma ${HONOR.cumplido}. Con ${HONOR.deshonrado} o menos estas deshonrado: mercenarios a ${MERCENARIOS.costoDeshonrado} Oro y no puedes firmar pactos nuevos.
- MENSAJES: un mensaje PUBLICO (lo ven todos el turno siguiente) y hasta ${MAX_PRIVADOS} PRIVADOS a reinos distintos (solo los ve su destinatario el turno siguiente), de maximo ${LARGO_MENSAJE} caracteres. No son promesas: nada obliga a nadie a cumplirlas.
- NOTA: cada turno puedes dejar una nota de plan (maximo ${LARGO_NOTA} caracteres) que solo TU ves el turno siguiente. Si no escribes "nota", se conserva la anterior; si la dejas vacia (""), se borra.
- Ves el HONOR de todos y, por el resumen del turno anterior, los pactos y rupturas que ocurrieron; NO ves los almacenes, las mejoras, las notas, los privados ni las ofertas de los demas.

10. EQUILIBRIO Y EVENTOS
- HEGEMON: el reino con mas regiones, cuando tiene al menos el ${PORCIENTO(HEGEMON.entra)}% de las regiones con dueno y es el unico en la punta; lo deja de ser si baja del ${PORCIENTO(HEGEMON.sale)}% o si otro reino lo supera (un empate en la punta no se lo quita). Los demas lo atacan con +${PORCIENTO(HEGEMON.bonoAtaque - 1)}% de fuerza.
- EVENTOS: en los turnos ${EVENTOS.turnos.join(', ')} ocurre uno para todos, anunciado un turno antes (Presagio). Nunca se repite el mismo tipo dos veces seguidas.
  Sequia: la cosecha base (la de 1 Comida por 2 regiones) baja a la mitad ${EVENTOS.sequiaTurnos} turnos.
  Peste: el reino con mas unidades pierde el ${PORCIENTO(EVENTOS.peste)}% (si empatan, todos los empatados).
  Cosecha: +1 Comida por cada region tuya no aislada, ese turno.
  Caravana: el reino con menos regiones recibe ${lista(EVENTOS.caravana)} (si empatan, todos los empatados).

11. MARAVILLA
Solo existe UNA en toda la partida y solo se puede construir en tu capital: "construir R07 maravilla" (con el numero de tu capital). Cuesta ${COSTO_MARAVILLA}, que pagas de golpe en ese turno.
- Desde el turno siguiente se cuenta: ${MARAVILLA.obra} turnos de obra y luego ${MARAVILLA.enPie} de pie; al completar los ${MARAVILLA.turnos} turnos GANAS la partida. Si la construyes en el turno t, ganas al cerrar el turno t+${MARAVILLA.turnos}. Tu estado muestra cuantos turnos faltan.
- CERCO: si un reino sin pacto contigo tiene al menos ${MARAVILLA.cerco} unidades en una region vecina a la Maravilla, la cuenta se PAUSA (no se pierde lo avanzado); para ganar la Maravilla debe estar libre de cerco al cerrar el turno. Se reanuda al despejar el cerco o al pactar con ese reino.
- Si la region de la Maravilla cae en manos enemigas, la Maravilla pasa al conquistador y la cuenta vuelve a cero.

12. FIN DE LA PARTIDA Y PUNTOS
- Gana el unico reino vivo, quien complete la Maravilla o, al terminar el turno ${TURNOS}, quien controle mas regiones. Desempates: mas unidades (todas, tambien las de visita), luego mas recursos en el almacen (suma de los seis) y por ultimo un sorteo.
- Si los ultimos reinos caen en el mismo turno, la partida acaba ahi y gana el que mas regiones tenia al caer.
- Puntos por posicion final: ${PUNTOS} y 0 al resto. Los reinos vivos quedan por encima de los caidos; entre los caidos queda mejor el que cayo mas tarde.`;

export const GUIA_ESTADO = `Cada turno recibes un texto con estas lineas, en este orden (algunas solo aparecen cuando hay algo que decir). Los numeros del ejemplo son inventados.
${FRAGMENTO_DE_ESTADO}

- MAPA: una linea por region. "${PRIMERA_REGION.linea}" = ${PRIMERA_REGION.explicacion} (los numeros de la derecha son regiones vecinas: 3 = R03). El mapa no cambia en toda la partida ni es distinto para cada reino.
- "Turno N de ${TURNOS}. Eres X": tu reino, cuantos reinos y regiones hay y quienes siguen vivos. Los nombres de reino son los que usas en "pacto_con", "privados", "regalar", "ofrecer", "aceptar" y "romper".
- Capitales y Honor de todos los reinos.
- Maravilla: si existe, de quien es, donde esta y cuantos turnos faltan (y si esta pausada por cerco).
- Tu almacen: tus recursos al cierre del turno anterior y tus niveles de mejora por tipo (L0 A0 J0 I0).
- Disponible al gastar: lo que tendras cuando se apliquen tus ordenes de gasto, ya con la produccion de este turno (y el evento, si toca) y el hambre de tus tropas. Entre parentesis, el desglose: cuanto produces y cuanta Comida comen. Si la Comida no alcanza, lo dice (FALTA COMIDA) y cuantas unidades desertarian. Es exacto: lo calcula el motor con las mismas reglas.
- "Puedes reclutar hasta": cuantas unidades de CADA tipo alcanzan con "Disponible al gastar", cada tipo por separado (no se suman). Es solo una ayuda. Si tienes un cuartel, otra linea con su precio (tambien Ingenios).
- Pactos vigentes (con la fecha hasta la que valen) y tu propuesta abierta, si la hay.
- Tus tropas de visita (las tuyas en region ajena; "hostiles" si ya no hay pacto) y Tus regiones aisladas.
- Hegemon, Evento de este turno y Presagio del siguiente.
- Tu nota del turno anterior, y lo que recibiste: Ofertas (puedes aceptarlas), Privados, Mensajes publicos y Regalos. Todo eso es del turno anterior.
- OCUPACION: quien tiene cada region y que hay en ella, un reino por linea. "R05(L9A2,f1,c)" = region 5 con 9 Lanceros y 2 Arqueros, fortaleza 1 y cuartel. "+Marfil L2" dentro de una region = 2 Lanceros de Marfil de visita ahi. "(cayo)" = reino eliminado. Lo que no aparece no tiene dueno.
- FRENTES: tus mejores ataques y tus mayores amenazas, calculados con la MISMA formula de combate de estas reglas (dominio, tierra ajena, Hegemon, fortaleza y terreno). Una linea "R14 Azur desde R07 R09: ataque 9.4 vs defensa 7.1 (x1.32)" dice: si mandas desde R07 y R09 todo lo que puedes mover (todas las unidades menos 1 por region), tu fuerza seria 9.4 contra una defensa de 7.1; "x1.32" es la razon (mayor que 1 ganarias). "en sitio" = tus tropas de visita que ya estan en esa region. "amenazada por" es lo mismo al reves: con lo que ese reino puede mandar contra una region tuya. Los numeros ya estan calculados: no hace falta que los recalcules. Solo ignoran las mejoras del rival (no las ves) y lo que cualquiera haga este mismo turno (reclutas, refuerzos, movimientos). Muestra hasta 5 ataques y 3 amenazas, de mayor a menor razon.
- "Sucedio el turno anterior": el resumen publico (conquistas, pactos, rupturas, caidas, eventos).`;

// El ejemplo de FORMATO: valores inventados (el wrapper lo presenta como ejemplo y EXPLICACION_RESPUESTA explica cada campo).
export const FORMATO = `{
  "ordenes": [
    "reclutar R07 L4 A2",
    "construir R07 cuartel",
    "mover R07 R14 L6 A3",
    "fortificar R05",
    "ofrecer Marfil Oro 3 Madera 4"
  ],
  "pacto_con": "Marfil",
  "mensaje": "Propongo paz: yo no cruzo vuestra frontera este turno.",
  "privados": [{"a": "Marfil", "texto": "Renovemos el pacto. Te ofrezco Oro por Madera."}],
  "nota": "Plan: tomar R14 en dos turnos y mantener la paz con Marfil.",
  "razon": "R14 tiene poca defensa y yo puedo mandar el doble de fuerza."
}`;

export const EXPLICACION_RESPUESTA = `Si tu respuesta no es un objeto JSON valido pierdes el turno entero. No copies los numeros de region, los reinos, las cantidades ni los textos del ejemplo: escribe los de tu situacion.
Que significa cada campo (todos son opcionales; sin "ordenes" tu reino no hace nada ese turno):
- "ordenes"   lista de textos   Las ordenes del turno, como se explica en ORDENES (maximo ${MAX_ORDENES}; sin ninguna, una lista vacia []). Cada orden es un texto: verbo + datos.
- "pacto_con" texto o null      Nombre del reino con quien quieres un pacto (el pacto se firma si el tambien te lo propone; ver PACTOS). null o "" = no propones nada.
- "mensaje"   texto             Tu mensaje PUBLICO: lo ven todos los reinos el turno siguiente. Maximo ${LARGO_MENSAJE} caracteres. "" = no dices nada.
- "privados"  lista de objetos  Hasta ${MAX_PRIVADOS} mensajes privados a reinos DISTINTOS. Cada uno es {"a": nombre del reino, "texto": mensaje de maximo ${LARGO_MENSAJE} caracteres}; solo el destinatario lo ve, el turno siguiente.
- "nota"      texto             Tu plan para el turno siguiente (maximo ${LARGO_NOTA} caracteres); solo tu lo ves. Si no la escribes se conserva la anterior; "" la borra.
- "razon"     texto             Una frase (maximo ${LARGO_RAZON} caracteres) que explica tu jugada. No cambia el juego.`;

export const ERRORES_FRECUENTES = `- Escribir cualquier cosa fuera del JSON (explicaciones, markdown, comentarios) o un JSON roto: pierdes el turno entero.
- Gastar mas de lo que hay en "Disponible al gastar", o mas de lo que queda despues de tus ordenes anteriores de la lista: cada orden de gasto se descarta si, en su turno de la lista, ya no alcanza.
- Dejar una region tuya sin tropas: en tu region debe quedar siempre 1 unidad.
- Mover tropas a una region que no es vecina (salvo Jinetes), cruzar territorio de otro reino, o entrar en la capital de un aliado.
- Atacar a un aliado sin "romper" antes, o usar "atacar" para una region vecina (es "mover").
- Reclutar, fortificar o construir en una region aislada, o en una que ya no es tuya; reclutar Ingenios sin cuartel; construir donde ya hay un edificio.
- Escribir un reino o una region que no existe (los nombres de reino son los del estado), o mas de ${MAX_ORDENES} ordenes.`;
