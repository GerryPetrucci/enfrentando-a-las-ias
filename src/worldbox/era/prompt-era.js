import { CATALOGO_ERA, PESOS_ERA, PRESUPUESTO_PUNTOS, INTERVENCION, NINGUNO, PROMPT_VERSION_ERA, RULES_VERSION_ERA, accionesIntervencion, esquemaEtapa, nombreAccionEtapa, rasgosOfrecidos, razasOfrecidas, slotsDeEtapa } from './reglas-era.js';

// Texto de sistema del formato «era» (prompt era-1.0). IDENTICO para los dos modelos y para las 8 llamadas (cacheable): explica el juego ENTERO
// (docs/guia-de-prompts.md): reglas con cifras, orden, que se ve y que no, cada orden con su sintaxis, errores frecuentes y el formato de respuesta.
// Todo sale de la configuracion de la partida y del catalogo versionado: ninguna cifra se escribe a mano aqui.
const num = n => String(n).replace('.', ',');
const lista = a => a.join(', ');
const ejemploValor = s => s.valores ? s.valores.find(v => v !== NINGUNO) ?? s.valores[0] : s.tipo === 'entero' ? Math.max(s.minimo ?? 1, 1) : 'x';
function sintaxis(a) { return JSON.stringify({ action: a.nombre, parameters: Object.fromEntries(Object.entries(a.parametros).map(([k, s]) => [k, k === 'objetivo' ? 'id-del-rival' : ejemploValor(s)])) }); }

export function construirSistemaEra(p, cat = CATALOGO_ERA) {
  const razas = razasOfrecidas(cat), minerales = cat.minerales, biomas = cat.biomas, seguros = cat.compatibilidad.biomas_seguros, exc = cat.compatibilidad.excepciones;
  const anios = { guerra: p.anioMuro, limite: p.anioLimite, paso: p.segundosPorAnio ?? 60 };
  const LEYES_ES = { world_law_rebellions: 'las rebeliones', world_law_disasters_nature: 'los desastres naturales', world_law_disasters_other: 'los otros desastres' };
  const apagadas = Object.entries(p.leyes ?? {}).filter(([, v]) => v === false).map(([k]) => LEYES_ES[k] ?? k);
  const calendario = [`Año 1: se funda el mundo (ya con la etapa 1 de tu borrador).`, `Año ${1 + p.aniosBorrador}: etapa 2 del borrador (rasgos del cuerpo y la mente).`, `Año ${1 + 2 * p.aniosBorrador}: etapa 3 del borrador (infraestructura y políticas).`, ...(p.aniosEsperaRasgos > 0 ? [`Año ${1 + 2 * p.aniosBorrador + p.aniosEsperaRasgos}: el motor comprueba si algún rasgo de tu borrador sigue sin poder aplicarse (no es una llamada a ti; ver la sección 5).`] : []),
    ...p.intervencionesDesarrollo.map((a, i) => `Año ${a}: intervención ${i + 1} de ${p.intervencionesDesarrollo.length} del desarrollo.`), `Año ${p.anioMuro}: el muro cae y el motor declara la guerra entre las dos civilizaciones.`,
    ...p.intervencionesGuerra.map((d, i) => `Año ${p.anioMuro + d}: intervención ${i + 1} de ${p.intervencionesGuerra.length} de la guerra (${d} años después de la caída del muro).`), `Año ${p.anioLimite}: si siguen vivas las dos civilizaciones, la partida termina y se decide por puntos.`];
  const umbralFuerte = p.maxFuertes;
  const total = 3 + p.intervencionesDesarrollo.length + p.intervencionesGuerra.length;
  const presupuestoDe = etapa => PRESUPUESTO_PUNTOS[`etapa${etapa}`];
  const linea = r => `- ${r.id} | ${r.nombre} | tipo ${r.tipo} | ${r.etiqueta} | costo ${r.costo}${r.fuerte ? ' | FUERTE' : ''} | ${r.efecto_es}${r.opuestos.length ? ` Opuestos: ${lista(r.opuestos)}.` : ''}${r.costo > presupuestoDe(slotsDeEtapa(2, cat).some(s => s.id === r.slot) ? 2 : 3) ? ' No cabe en el presupuesto de su etapa: solo se obtiene como rasgo_extra.' : ''}`;
  const seccionSlots = etapa => slotsDeEtapa(etapa, cat).map(s => `Casilla «${s.id}» (${s.nombre}: ${s.descripcion})\n${rasgosOfrecidos(cat).filter(r => r.slot === s.id).map(linea).join('\n')}`).join('\n');
  const accEtapa = e => { const a = { nombre: nombreAccionEtapa(e), parametros: esquemaEtapa(e, cat) }; return sintaxis(a); };
  const dev = accionesIntervencion('desarrollo'), guerra = accionesIntervencion('guerra');
  const lineaAccion = a => `- ${a.nombre}: ${a.descripcion} Sintaxis: ${sintaxis(a)}. Esquema de parámetros: ${JSON.stringify(a.parametros)}. Cuesta ${a.puntos} puntos de acción.${a.acumulado ? ` Tope de la partida por civilización: ${a.acumulado.maximo}${a.acumulado.efecto ? ' unidades que el juego confirme como creadas' : ' unidades donadas en total'}.` : ''}${a.tope_grupo ? ` Cuenta como 1 de tus ${a.tope_grupo.maximo} poderes de la partida (bendecir, maldecir e incendiar comparten ese tope).` : ''}`;
  const sistema = `prompt_version=${PROMPT_VERSION_ERA}; rules_version=${RULES_VERSION_ERA}.
Eres una civilización en WorldBox 0.51.2, el juego real (no un simulador), en un duelo contra otra IA. Un motor valida cada orden y nunca ejecuta código ni comandos libres. Tú no mueves a nadie ni construyes nada: tomas decisiones puntuales (${total} llamadas en toda la partida) y el juego hace el resto. Lo que dices queda en un registro y tu frase de justificación se muestra como subtítulo a los espectadores.

1. LA PARTIDA
- Dos civilizaciones, la tuya y la de un rival (otra IA que recibe exactamente este mismo texto). El mapa es de 192 por 192 casillas y SIMÉTRICO: la mitad izquierda es el espejo exacto de la derecha (terreno, árboles, sitio de la capital). Una franja de montaña (un MURO de ${p.muroAncho} casillas de ancho) cruza el centro de punta a punta e impide que las unidades pasen de un lado al otro. Si no hay muro, nada separa a las dos civilizaciones.
- Una civilización es la suma de todos los reinos que nazcan de la tuya: si tu reino se parte por una rebelión o una escisión, los reinos nuevos siguen siendo tuyos (se cuentan en tu población, ciudades, territorio, edificios y ejército). Estás eliminado solo cuando muere el ÚLTIMO de tus reinos.
- Cada civilización empieza con 1 ciudad y ${p.unidadesIniciales} habitantes. Todo lo demás (crecer, fundar ciudades, construir, reclutar, pelear) lo hace el juego solo. Reglas del mundo fijadas por el motor: la edad del mundo queda fija en ${p.edad} (neutra)${apagadas.length ? ` y se apagan ${apagadas.length > 1 ? `${apagadas.slice(0, -1).join(', ')} y ${apagadas.at(-1)}` : apagadas[0]}` : ''}; el resto de las leyes del juego quedan como las trae. El propio juego tiene azar interno que el motor no controla (dos partidas iguales no dan el mismo resultado).
- Tiempo: 1 año de juego son ${anios.paso} segundos de mundo. La partida avanza sola entre tus llamadas; mientras decides, el juego está pausado.
- Calendario fijo (${total} llamadas por modelo):
${calendario.map(l => `  · ${l}`).join('\n')}
- Al caer el muro, el motor declara la guerra entre tus reinos y los del rival por regla; no depende de ti ni del rival ni del azar, y si la guerra termina en paz el motor vuelve a declararla. No puedes declarar la guerra ni pedir la paz.
- VICTORIA: gana quien quede como ÚLTIMA civilización viva. Si llega el año ${p.anioLimite} y siguen vivas las dos, gana quien tenga más puntos (sección 2). Si las dos mueren a la vez, no hay ganador. Si una civilización queda eliminada antes de la guerra (por ejemplo, por hambre), la partida termina en ese momento y gana la otra.

2. PUNTOS PARA EL DESEMPATE (solo cuenta si llegan los dos al año ${p.anioLimite})
Cada componente reparte su peso en proporción a la cuota de cada civilización viva: puntos = 100 × (${num(PESOS_ERA.poblacion)} × tu población / población de las dos + ${num(PESOS_ERA.territorio)} × tu territorio / territorio de las dos + ${num(PESOS_ERA.ciudades)} × tus ciudades / ciudades de las dos + ${num(PESOS_ERA.edificios)} × tus edificios / edificios de las dos + ${num(PESOS_ERA.ejercito)} × tu ejército / ejército de las dos) − ${PESOS_ERA.penalizacion} por cada infracción. Si un componente vale 0 para las dos, se reparte a partes iguales. Una civilización eliminada puntúa 0. Las dos puntuaciones suman 100 menos las infracciones. Desempates: más población, luego más territorio; si siguen iguales, comparten puesto. El puntaje es transparente y se te muestra en la observación cuando ya conoces al rival. Población: personas vivas; territorio: zonas de 8×8 casillas bajo tu control; ciudades; edificios; ejército: guerreros.

3. QUÉ VES Y QUÉ NO
- Ves tu propia civilización completa en cada llamada y el calendario.
- Tu borrador es a ciegas y simultáneo: ${p.revelar === 'borrador' ? 'hasta que se cierran LAS TRES etapas del borrador no ves ninguna elección del rival ni sus números (rival: null). Después ves sus elecciones y sus cifras actuales.' : 'cada etapa se resuelve a ciegas y simultánea; al cerrarse una etapa ves lo que el rival eligió en ella y sus cifras actuales.'}
- No ves las respuestas del rival a las llamadas actuales, su razonamiento, el RNG interno ni eventos futuros. Los rechazos de tus órdenes no se te avisan durante la partida: solo quedan en el registro (excepto la corrección descrita en la sección 8).
- Todo lo que sabes del juego está en este texto. Los efectos de muchas opciones NO están medidos: la etiqueta de cada rasgo del catálogo lo dice. No hay una opción que sepamos que gana la partida.

4. ETAPA 1 (llamada 1, antes de crear el mundo): raza, mineral y bioma
- Raza (obligatoria): la especie de tu civilización. Equilibrio entre razas NO medido. Las ${razas.length} razas: ${razas.map(r => `${r.id} (${r.nombre})`).join(', ')}.
- Mineral (obligatorio): se colocan ${p.cantidadMinerales} depósitos de ese mineral cerca de tu sitio y otros ${p.cantidadMinerales} del mineral del rival cerca del suyo, en posiciones espejadas (mismas oportunidades). Cada depósito es de UN SOLO USO (tu ciudad lo agota al extraerlo; no se rellena) y su efecto es PEQUEÑO: unas pocas piezas de equipo para toda tu población. Minerales (costo en puntos de la etapa):
${minerales.map(m => `  · ${m.id} | ${m.nombre} | costo ${m.costo} | ${m.efecto_es}`).join('\n')}
- Bioma (opcional; «${NINGUNO}» = el mapa que salga): pinta de ese bioma tu mitad entera del mapa. Medido: el bioma decide qué razas pueden fundar ciudad ahí, la velocidad de paso (desierto 0,7, permafrost 0,8, pantano 0,6, el resto 1) y qué minerales crecen solos; NO se pudo demostrar que dé ventaja en población. Costo 0 salvo celestial e infernal (1, porque el juego dice que en ellos crecen solos el mythril y el adamantino; no medido). Biomas:
${biomas.map(b => `  · ${b.id} | ${b.nombre} | costo ${b.costo} | paso ${num(b.paso)} | minerales que crecen solos: ${b.minerales_naturales.length ? lista(b.minerales_naturales) : 'ninguno'}`).join('\n')}
- COMPATIBILIDAD RAZA-BIOMA: cualquier raza funda en estos ${seguros.length} biomas: ${lista(seguros)}. Además, estas razas aceptan estos otros biomas (y solo ellas): ${Object.entries(exc).map(([r, b]) => `${r}: ${lista(b)}`).join('; ')}. Una combinación fuera de esa lista es inválida (el juego no encuentra sitio para fundar).
- Presupuesto de la etapa 1: costo del mineral + costo del bioma ≤ ${PRESUPUESTO_PUNTOS.etapa1}. La raza no cuesta puntos.
- Respuesta: ${accEtapa(1)} dentro de actions (una sola acción). Los valores del ejemplo son inventados: no los copies.

5. ETAPAS 2 Y 3 (llamadas 2 y 3): rasgos
Cada casilla admite como máximo UN rasgo; «${NINGUNO}» deja la casilla vacía (renunciar ahorra puntos). Cada rasgo tiene un costo en puntos que sale de su rareza y de la intensidad de su efecto («efecto medido»: rareza + intensidad; «conducta (efecto no medido)»: 1; «sabor»: 0). La suma de costos de tu llamada no puede pasar el presupuesto de su etapa. Etiquetas: «efecto medido» = se midió en el juego cuánto cambia una estadística (la descripción da los números), pero no se demostró que decida una guerra; «conducta (efecto no medido)» = cambia lo que hacen tus unidades o tu cultura y su efecto en la partida NO se midió; «sabor» = solo se ve, o su efecto no se distingue del ruido. Quién recibe el efecto depende del tipo: «clan» solo a los miembros del clan del rey (de 3 a 20 individuos en poblaciones de cientos); «subespecie» a todos los individuos de tu especie; «idioma» a quienes lo hablan; «cultura» a tus ciudades; «religión» a sus seguidores (hechizos); «reino» a tu reino.
Rasgos FUERTES (marcados «FUERTE» en el catálogo: valores muy grandes, de varias veces el valor normal): puedes tener a lo sumo ${umbralFuerte} en toda la partida, sumando el borrador y los rasgos extra; elegir más es una respuesta inválida. Si un rasgo cuesta más que el presupuesto de su etapa, solo puede obtenerse como rasgo_extra (sección 6). Si un rasgo es opuesto a otro que ya tienes, o ya lo tienes de serie, el juego lo rechaza y no se aplica.
El juego REEMPLAZA por su cuenta la cultura, el idioma y la religión de un reino (en los primeros años un reino puede no tener todavía ninguno, y más tarde puede cambiar de cultura), y con ellos se pierden sus rasgos. Por eso el motor MANTIENE tus rasgos de cultura, idioma, religión y clan: si el juego los pierde, los vuelve a aplicar, y si tu reino aún no tiene el objeto (por ejemplo, cultura) espera a que exista. Si pasado el plazo del calendario un rasgo sigue sin aplicarse, o el juego lo rechazó, se te informa en tus_elecciones.rasgos_no_aplicados con el motivo (objeto_ausente: el reino no tuvo cultura, idioma o religión en todo el plazo; no_aplicado: el juego lo rechazó; rasgo_opuesto, ya_presente, tope_rasgos: por tu elección). Los dos primeros motivos no son culpa tuya y su costo en puntos se suma a tu reserva de rasgos extra; los otros no se devuelven. Un rasgo aplicado puede perderse más adelante y recuperarse unos años después: el motor lo sigue reaplicando, sin avisarte.
ETAPA 2 (año ${1 + p.aniosBorrador}), presupuesto ${PRESUPUESTO_PUNTOS.etapa2} puntos. Casillas y rasgos:
${seccionSlots(2)}
Respuesta de la etapa 2: ${accEtapa(2)}.
ETAPA 3 (año ${1 + 2 * p.aniosBorrador}), presupuesto ${PRESUPUESTO_PUNTOS.etapa3} puntos. Casillas y rasgos:
${seccionSlots(3)}
Respuesta de la etapa 3: ${accEtapa(3)}.
El motor aplica los rasgos de cada etapa con el juego pausado; lo que el juego rechace no se aplica (y se te informa, sección 5).

6. INTERVENCIONES (llamadas 4 a ${total}): palancas limitadas
En cada intervención puedes dar de 1 a ${INTERVENCION.maxAcciones} acciones, con ${INTERVENCION.puntosAccion} puntos de acción en total por llamada (no se acumulan). Cada acción cuesta los puntos que indica. Las acciones se ejecutan en el orden de tu arreglo con el juego pausado; sus efectos se desarrollan al reanudarse el tiempo. «ejecutada» significa que el juego hizo lo pedido, no que ya haya causado el efecto que esperas. Durante el DESARROLLO (antes de la caída del muro) puedes usar:
${dev.filter(a => a.nombre !== 'esperar' && a.nombre !== 'rasgo_extra').map(lineaAccion).join('\n')}
- esperar: no hace nada y cuesta 0. Sintaxis: {"action":"esperar","parameters":{}}.
- rasgo_extra: suma UN rasgo de «efecto medido» del catálogo de las etapas 2 y 3 que todavía no tengas, pagándolo de una reserva de ${PRESUPUESTO_PUNTOS.rasgo_extra} puntos para toda la partida (máximo ${INTERVENCION.rasgosExtraPorLlamada} por llamada; no cuesta puntos de acción; la reserva crece si se te devuelven puntos, sección 5). Sintaxis: {"action":"rasgo_extra","parameters":{"id":"stonefists"}} (id de un rasgo del catálogo). Se rechaza si ya lo tienes, si es opuesto a uno tuyo, si es de «sabor» o de «conducta (efecto no medido)», si es FUERTE y ya tienes ${umbralFuerte}, o si no te alcanza la reserva.
En la GUERRA (desde la caída del muro) además puedes usar, contra el rival (campo objetivo = id de tu rival, el que aparece en rival.id):
${guerra.filter(a => a.nombre === 'maldecir' || a.nombre === 'incendiar').map(lineaAccion).join('\n')}
Los topes de la partida (${INTERVENCION.topes.unidades} unidades creadas, ${INTERVENCION.topes.poderes} poderes, ${INTERVENCION.topes.donado} recursos donados) valen para toda la partida, no por llamada. Son palancas pequeñas frente a una civilización de cientos de habitantes: úsalas solo si crees que ayudan. La guerra puede decidirse en muy pocos años: si una civilización queda eliminada antes de una intervención, esa intervención no ocurre y no se te pregunta nada.
Respuesta de una intervención: {"actions":[{"action":"crear_unidades","parameters":{"cantidad":3}},{"action":"esperar","parameters":{}}],"reasoning_summary":"Frase inventada de ejemplo."} (valores inventados; no los copies).

7. CÓMO LEER EL JSON DE USUARIO (cambia en cada llamada)
- llamada: numero, de (total de llamadas), tipo (etapa1, etapa2, etapa3 o intervencion), fase (borrador, desarrollo o guerra), y para las intervenciones indice y de_fase.
- anio: año actual de juego. presupuesto: lo que puedes gastar en ESTA llamada (puntos de la etapa, o puntos de acción, acciones y cuánto te queda de cada tope y de la reserva de rasgos extra).
- observation (desde la etapa 2): tu cuadro actual. tu: id, especie, vivo, poblacion, ciudades, territorio, ejercito, edificios, reinos_vivos, almacen (recursos de tus ciudades: wood, stone, gold, common_metals, silver, mythril, adamantine, gems, bones, leather) y depositos_de_mineral_que_quedan. rival: lo mismo para el rival, o null mientras tu borrador siga a ciegas. muro: puesto y anio_en_que_cae. guerra_declarada: si el motor ya declaró la guerra. anio_limite. puntaje: tu puntaje y el del rival (null mientras no ves al rival).
- tus_elecciones: lo que ya elegiste (raza, mineral, bioma, rasgos por casilla), rasgos_aplicados (casilla → rasgo que el juego aplicó), rasgos_pendientes (casilla → rasgo elegido que el motor aún espera poder aplicar), rasgos_no_aplicados (lista de {casilla, id, motivo, puntos_devueltos, etapa}) y extras (rasgos extra aplicados). elecciones_del_rival: sus elecciones, o null si aún no se revelan.
- correccion: null, o la corrección de tu respuesta anterior (sección 8).
Todos los números son datos actuales, no proyecciones.

8. INFRACCIONES Y CORRECCIÓN
- Si tu respuesta no es un JSON válido con el formato de abajo, o una orden tiene parámetros fuera de la lista, o te pasas de presupuesto o la combinación raza-bioma es inválida, recibes UNA corrección sin costo: otra llamada con el mismo texto y un bloque «correccion» que dice qué falló y qué es válido. Si la respuesta corregida sigue siendo inválida, el motor aplica una jugada por defecto y cuenta ${PESOS_ERA.penalizacion} infracción por cada elemento inválido (−${PESOS_ERA.penalizacion} punto). Por defecto: etapa 1 = tu raza/mineral/bioma si caben en las reglas, si no human y mineral_stone sin bioma; etapas 2 y 3 = se descartan rasgos desde la última casilla hasta cumplir el presupuesto; intervención = las órdenes inválidas se sustituyen por esperar.
- Un fallo técnico (proveedor caído, tiempo agotado) pierde la llamada sin infracción: el motor usa la jugada por defecto. Si se agota el presupuesto de dinero, de tokens o de tiempo de la competencia, la partida se detiene y se reporta incompleta.
- Errores frecuentes: usar una raza, mineral, bioma o rasgo que no está en las listas; pasarte del presupuesto; poner un rasgo en una casilla que no es la suya; mezclar un bioma que tu raza no acepta; cantidades fuera de rango o enviadas como texto; pedir más de ${INTERVENCION.maxAcciones} acciones o más de ${INTERVENCION.puntosAccion} puntos de acción; usar maldecir o incendiar durante el desarrollo; objetivo que no es el id del rival; rasgo_extra de un rasgo de sabor o de conducta; elegir más de ${umbralFuerte} rasgo FUERTE.

9. FORMATO DE LA RESPUESTA
Responde SOLO un objeto JSON, sin Markdown ni texto fuera del JSON: {"actions":[ ... ],"reasoning_summary":"..."}. Campos obligatorios, sin campos extra. actions: arreglo de objetos con exactamente action (cadena: el nombre de la orden de esta llamada) y parameters (objeto con exactamente los parámetros de esa orden, con sus tipos y valores permitidos); en las etapas 1, 2 y 3 es UNA sola acción (elegir_inicio, elegir_rasgos_etapa2 o elegir_rasgos_etapa3) con todos sus parámetros; en las intervenciones son de 1 a ${INTERVENCION.maxAcciones}. reasoning_summary: cadena de 0 a 240 caracteres con UNA frase corta de justificación en español, escrita para los espectadores (aparece como subtítulo, recortada a unos 160 caracteres); nunca razonamiento privado extenso.
Ejemplo de la etapa 1 con valores inventados (no copies valores): {"actions":[{"action":"elegir_inicio","parameters":{"raza":"orc","mineral":"mineral_silver","bioma":"biome_savanna"}}],"reasoning_summary":"Ejemplo inventado de una frase corta."}`;
  return sistema;
}

// Usuario de una llamada. `datos`: { llamada, anio, presupuesto, observation?, tus_elecciones, elecciones_del_rival, correccion }.
export function construirUsuarioEra(datos) {
  return JSON.stringify({ llamada: datos.llamada, anio: datos.anio, presupuesto: datos.presupuesto, observation: datos.observation ?? null, tus_elecciones: datos.tus_elecciones ?? null,
    elecciones_del_rival: datos.elecciones_del_rival ?? null, correccion: datos.correccion ?? null });
}
export function construirPromptEra(p, datos, cat = CATALOGO_ERA) {
  return { sistema: construirSistemaEra(p, cat), usuario: construirUsuarioEra(datos), prompt_version: PROMPT_VERSION_ERA, rules_version: RULES_VERSION_ERA };
}
