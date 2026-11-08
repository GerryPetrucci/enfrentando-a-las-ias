import { PROMPT_VERSION } from './util.js';
import { PESOS, puntuar } from './puntuacion.js';
import { PERFILES } from './reglas.js';

// Valor de ejemplo (inventado) para la sintaxis de cada parametro, segun su esquema.
function ejemploValor(s) {
  if (s.valores) return s.valores[0];
  if (s.tipo === 'entero') return Math.min(Math.max(s.minimo ?? 1, 0), s.maximo ?? Infinity);
  if (s.tipo === 'numero') return Math.min(Math.max(s.minimo ?? 0.5, 0), s.maximo ?? Infinity);
  if (s.tipo === 'booleano') return true;
  return 'id-inventado'.padEnd(s.minimo ?? 0, 'x').slice(0, s.maximo ?? 200);
}
const ETIQUETA = { poblacion: 'por habitante', recursos: 'por unidad de recurso', objetivos: 'por objetivo', edificios: 'por edificio', salud_media_pct: 'por punto de salud media (de 0 a 100)' };
const UNIDAD_TERRITORIO = { simulado: 'celda', real: 'zona', generico: 'unidad' };
const NO_PUNTUAN = { simulado: 'Ciudades no puntuan directamente.', real: 'Ciudades, objetivos (que en este juego es igual a ciudades), ejercito, comida y rey_vivo no puntuan directamente.', generico: 'Ciudades no puntuan directamente.' };
const num = n => String(n);
// "Puntos = 100 si vives, mas 1 por habitante, ..." generado desde la misma tabla que usa el motor.
function formulaPuntos(pesos, perfil) {
  const terminos = Object.keys(pesos).filter(k => k !== 'supervivencia' && k !== 'penalizacion').map(k => `${num(pesos[k])} ${k === 'territorio' ? `por ${UNIDAD_TERRITORIO[perfil.nombre]} de territorio` : ETIQUETA[k] ?? `por ${k}`}`);
  return `Puntos = ${pesos.supervivencia} si vives, mas ${terminos.join(', mas ')}, menos ${pesos.penalizacion} por infraccion; redondeo a una decimal. ${NO_PUNTUAN[perfil.nombre]} Desempates: mayor poblacion, luego territorio; si siguen iguales comparten puesto.${perfil.victoriaSupervivencia ? ' VICTORIA POR SUPERVIVENCIA: si al terminar queda exactamente un reino vivo, ese reino gana aunque otro tenga mas puntos (los puntos ordenan a los demas); si quedan vivos dos o mas, o ninguno, manda el orden por puntos.' : ''} La eficiencia por dolar y la consistencia entre partidas se informan aparte y no cambian el ganador.`;
}
const EJEMPLO_SIM = { vivo: true, poblacion: 20, territorio: 3, recursos: 20, objetivos: 0 };
const EJEMPLO_REAL = { vivo: true, poblacion: 10, territorio: 12, edificios: 5, recursos: 30, salud_media_pct: 80 };
function ejemploPuntos(perfil) {
  if (perfil.nombre === 'real') return `vivo, poblacion 10, territorio 12, edificios 5, recursos 30, salud_media_pct 80 y sin infracciones da ${puntuar(EJEMPLO_REAL, 0, perfil.pesos)} puntos`;
  return `vivo, poblacion 20, territorio 3, recursos 20, objetivos 0 y sin infracciones da ${puntuar(EJEMPLO_SIM, 0, perfil.pesos)} puntos`;
}

const reglasSimulador = rulesVersion => `Reglas del simulador ${rulesVersion}: 2 a 4 facciones en un mundo compartido discreto, sin distancias ni adyacencia. Mapa: numero fijo de celdas (por defecto 64; se ve en mundo.tamano_mapa), minimo 12. Inicio por faccion: 20 pobladores, 1 ciudad, 3 celdas de territorio, 20 recursos, 0 objetivos. Las celdas iniciales no dependen del asiento. La semilla fija la secuencia de eventos; no hay otro azar.
En el avance cada faccion viva suma recursos = 2*ciudades + territorio + evento, con evento comun a todos elegido uniformemente entre -2, 0, +2 mediante RNG con semilla. Recursos nunca bajan de 0. Luego suma poblacion = ciudades. No hay consumo, hambre, limite de poblacion, terreno oculto ni otros efectos. Los eliminados no producen ni crecen. Atacar solo baja poblacion; si un rival llega a 0 pierde todas sus ciudades y territorio (libera celdas), conserva recursos y objetivos acumulados y no vuelve a actuar. No hay conquista automatica. Fundar aumenta el contador de objetivos en 1. No hay objetivos secretos.`;
const reglasGenerico = `El mundo lo evoluciona el juego real mediante un puente local: el motor de la competencia NO calcula costos, efectos ni produccion, y no tiene reglas propias de recursos o territorio. Cada faccion se describe con los mismos campos que se explican abajo; que significan exactamente poblacion, ciudades, territorio, recursos y objetivos lo define el puente, y esa definicion no se te presenta mas alla de este texto. No hay informacion adicional sobre el funcionamiento interno del juego, y los resultados de una accion pueden diferir de lo que supones. Solo existen las acciones de la lista siguiente: el puente declara que estan implementadas y verificadas. No hay otras.`;
// Configuracion EFECTIVA del escenario (la que confirma el puente, no los valores por omision del perfil). Sin ella se usa el perfil.
function configEfectiva(perfil, config) {
  const p = perfil.partida, c = config ?? {};
  return { especies: c.especies?.length ? c.especies : [p.especie], unidadesIniciales: c.unidadesIniciales ?? p.unidadesIniciales, velocidad: c.velocidad ?? p.velocidad,
    plantilla: c.plantilla ?? p.plantilla, tamano: c.tamano ?? null, ancho: c.ancho ?? null, alto: c.alto ?? null };
}
function reglasReal(perfil, { turnos, segundosPorTurno, puntosPorTurno, maxAcciones, config }) {
  const p = configEfectiva(perfil, config);
  const especies = p.especies.length === 1 ? `todas empiezan con la misma especie (${p.especies[0]})` : `empiezan con especies distintas (${p.especies.join(', ')}); cada reino muestra la suya en el campo especie`;
  const mapa = p.ancho && p.alto ? `Mapa: plantilla ${p.plantilla}${p.tamano ? `, tamano ${p.tamano}` : ''}, ${p.ancho} por ${p.alto} casillas. ` : '';
  return `Reglas del juego real ${perfil.rules_version}: esto es el juego WorldBox 0.51.2 en ejecucion, no un simulador. Cada partida genera un mapa NUEVO (el juego no repite mapas ni aunque se repita la semilla): el terreno inicial de las facciones no es identico, aunque ${especies}, 1 ciudad y ${p.unidadesIniciales} habitantes. ${mapa}Que significa cada campo lo define el juego; el motor solo lo lee.
Tiempo: cada turno el juego avanza ${segundosPorTurno} segundos de juego (velocidad ${p.velocidad}). La partida dura ${turnos} turnos (${turnos * segundosPorTurno} segundos de juego) o hasta que quede un solo reino vivo. Un reino queda eliminado cuando su poblacion llega a 0.
Entre turnos el juego esta pausado; tus acciones se aplican con el juego pausado y sus efectos se desarrollan mientras corre el siguiente avance. La poblacion, el territorio, los edificios, los recursos y la comida de TODOS los reinos cambian por si solos durante el avance, segun la simulacion de WorldBox; el motor no los controla ni los predice. En las mediciones previas, sin ninguna guerra no se elimino ningun reino en 1200 segundos de juego. Mientras dos reinos estan en guerra, sus unidades pelean en el mapa.
Presupuesto del turno: como maximo ${maxAcciones} acciones y ${puntosPorTurno} puntos de accion; cada accion cuesta los puntos que indica su linea. Una orden puede ser aceptada por el reglamento y aun asi no cambiar nada en el juego: eso lo dice el resultado (no se te muestra durante la partida): ejecutada = el juego hizo lo pedido (para poderes significa que las gotas se crearon, NO que ya causaran dano), sin_efecto = el juego la acepto pero no cambio nada (por ejemplo donar recursos sin almacen, o ninguna unidad a la que afectar), rechazada = el reglamento o el juego la descartaron (cuesta una infraccion). Ejecutada y sin_efecto gastan puntos y activan cooldown; solo ejecutada cuenta para los topes y limites de la partida (veces, unidades, poderes, recursos donados); rechazada no gasta nada.`;
}

export function construirPrompt({ observation, acciones, maxAcciones = 3, puntosPorTurno = maxAcciones, turnos = 20, segundosPorTurno = 1, orden = [], rulesVersion, turno, perfil, restricciones, cooldownsPropios, config }) {
  const simulado = observation.origen === 'simulado';
  perfil ??= simulado ? PERFILES.simulado : PERFILES.generico;
  rulesVersion ??= perfil.rules_version;
  const real = perfil.nombre === 'real';
  const pesos = perfil.pesos ?? PESOS;
  const sistema = `prompt_version=${PROMPT_VERSION}; rules_version=${rulesVersion}.
Eres una faccion en una competencia de supervivencia y expansion. El motor valida cada orden; nunca ejecuta codigo ni comandos libres. ${simulado ? 'Este mundo es SIMULADO: NO es WorldBox.' : 'Este mundo proviene de un puente local de WorldBox. Solo se permiten las capacidades verificadas que el puente anuncia.'}
Objetivo: maximizar puntos al terminar ${turnos} turnos estrategicos o al quedar como maximo una faccion viva. Una faccion con poblacion 0 queda eliminada. Las partidas interrumpidas por presupuesto, tokens, tiempo o puente se reportan como incompletas, con su ultimo estado confirmado.
${formulaPuntos(pesos, perfil)}
Ejemplo calculado por la funcion del motor con estos valores: ${ejemploPuntos(perfil)}.
Orden de cada turno:
1. Se congela una observacion por faccion ANTES de cualquier accion; todas muestran los mismos campos de todas las facciones. No ves decisiones actuales de los demas ni sus respuestas privadas.
2. Cada faccion propone de 1 a ${maxAcciones} acciones. Hay ${puntosPorTurno} puntos de accion por turno, independientes del numero de acciones. No se acumulan.
3. Las facciones ejecutan en orden rotado entre turnos y partidas; dentro de cada faccion se respeta el orden del array. Las condiciones se revalidan al ejecutar: un rival anterior puede ocupar territorio o eliminar tu faccion. No se decide de nuevo.
4. Una accion rechazada no gasta recursos ni puntos ni activa cooldown; cuesta una infraccion (-${pesos.penalizacion} puntos) y ocupa su espacio; las acciones siguientes del array se siguen evaluando. Una accion inventada o fuera de la lista se sustituye por esperar y tambien cuesta una infraccion. Una respuesta con JSON roto, campos invalidos, mas acciones de las permitidas o cortada por longitud pierde la decision completa: se ejecuta esperar y cuenta UNA infraccion; no se te pide corregir la jugada. Si el fallo es tecnico y no tuyo (el proveedor no contesta, tiempo agotado, limite de peticiones), tambien pierdes la decision y se ejecuta esperar, pero SIN infraccion. Los reintentos tecnicos de la pasarela son limitados y se registran.
5. Tras todas las acciones se avanza el juego${real ? ` ${segundosPorTurno} segundos` : ' una unidad de simulacion'}, se reinician puntos de accion y se comprueba supervivencia y limite de turnos. No se llama al modelo por tick. Si se agota el presupuesto, los tokens o el tiempo de la competencia, la partida se detiene y se reporta incompleta, sin infraccion para nadie.
${simulado ? reglasSimulador(rulesVersion) : real ? reglasReal(perfil, { turnos, segundosPorTurno, puntosPorTurno, maxAcciones, config }) : reglasGenerico}
Acciones habilitadas (todas requieren action y parameters, incluso si parameters es {}):
${acciones.map(a => `- ${a.nombre}: ${a.descripcion} Sintaxis: ${JSON.stringify({ action: a.nombre, parameters: Object.fromEntries(Object.entries(a.parametros).map(([k, s]) => [k, ejemploValor(s)])) })}. Esquema exacto de parametros: ${JSON.stringify(a.parametros)}. Puntos: ${a.puntos}. Cooldown: ${a.cooldown} turnos completos posteriores; si se ejecuta en T, vuelve a estar disponible en T+${a.cooldown + 1}.${a.desde_turno !== undefined ? ` Solo desde el turno ${a.desde_turno}.` : ''}${a.max_por_partida !== undefined ? ` Maximo ${a.max_por_partida} vez por faccion y partida.` : ''}${a.acumulado ? (a.acumulado.efecto ? ` Tope por faccion y partida: ${a.acumulado.maximo} unidades que el juego confirme como ${a.acumulado.efecto} (todo o nada: se crean todas las pedidas o ninguna).` : ` Suma maxima de ${a.acumulado.parametro} por faccion y partida: ${a.acumulado.maximo}.`) : ''}${a.tope_grupo ? ` Tope compartido (grupo ${a.tope_grupo.grupo}): ${a.tope_grupo.maximo} ordenes ejecutadas por faccion y partida entre todas las acciones del grupo.` : ''}`).join('\n')}
Un cooldown 0 permite repetir la accion en el MISMO turno, mientras queden espacios y puntos. Un cooldown positivo impide repetirla hasta el turno indicado. La accion esperar tiene cooldown 0, cuesta 0 puntos y no cambia nada.
Errores frecuentes: accion no habilitada, campos extra o faltantes, numero enviado como texto, cantidad fraccionaria o fuera del rango, cooldown activo, puntos insuficientes, mas de ${maxAcciones} acciones${simulado ? ', recursos insuficientes, territorio libre insuficiente, fundar sin una celda propia sin ciudad, atacar a ti mismo/a un eliminado o sin 5 pobladores' : real ? ', objetivo que no es un id de rival de la lista rivales (o eres tu mismo, o ya esta eliminado), declarar guerra antes del turno 6 o por segunda vez o a quien ya esta en guerra contigo, pedir paz sin guerra o con una guerra de menos de 30 segundos de juego, pasar el tope de unidades creadas, de poderes (10) o de recursos donados (100)' : ', condiciones que el juego rechaza (el puente revalida cada orden)'}. No se ajustan cantidades automaticamente ni se ejecutan parcialmente. No recibes aviso de una orden rechazada: solo se guarda en el reporte.
Como leer el JSON de usuario, en su orden:
turn_number: turno estrategico que vas a decidir (desde 1); orden: ids en orden de ejecucion.
observation.origen: simulado o puente; turno_juego: turnos ya avanzados; tiempo_juego_s: segundos de juego ya avanzados desde el inicio de la partida.
faccion: tu faccion. rivales: todas las otras facciones por id. Cada una tiene id (identificador), vivo (booleano), ${real ? 'especie, ' : ''}poblacion (personas), ciudades (cantidad), territorio (${real ? 'zonas de 8 por 8 casillas que controla el reino' : 'celdas'}), recursos (${real ? 'madera + piedra + oro + metales comunes guardados en sus ciudades, ahora' : 'saldo disponible ahora'}), objetivos (${real ? 'igual a ciudades; no aporta informacion nueva' : 'logros acumulados'}), ${real ? 'ejercito (guerreros), edificios (cantidad), comida (total almacenada), salud_media_pct (salud media de sus unidades, de 0 a 100), rey_vivo (booleano), cooldowns (siempre {} en el juego real: tus cooldowns estan en estado_orquestador), ' : 'cooldowns (accion: primer turno en que vuelve a estar disponible; ausencia equivale a disponible), '}${real ? 'y solo en tu faccion, unidades_creadas y unidades_creables_restantes (segun el tope del juego, que es mayor que el del reglamento). ' : ''}Todos son datos actuales, NO proyecciones de produccion ni del gasto futuro.
mundo.tamano_mapa: ${real ? 'zonas totales del mapa' : 'celdas totales'}; mundo.libres: ${real ? 'zonas con suelo y sin ciudad' : 'celdas sin propietario'}. No recibes RNG interno, futuros eventos, razonamiento de rivales, historial ni mensajes de errores anteriores. Los errores y las penalizaciones se guardan en el reporte; no se agregan al estado observado.${simulado ? '' : `
estado_orquestador (lo lleva el motor, solo de tu faccion): puntos_por_turno y max_acciones del turno; cooldowns (accion: primer turno en que vuelve a estar disponible; ausencia equivale a disponible); restricciones (por accion con limites: desde_turno; usadas y maximo de veces por partida; acumulado y maximo_acumulado; grupo, usadas_grupo y maximo_grupo para topes compartidos).`}
Responde SOLO un objeto JSON. Ejemplo con valores INVENTADOS de formato; NO copies estos valores ni ids:
{"actions":[{"action":"esperar","parameters":{}}],"reasoning_summary":"Descripcion breve inventada de una decision."}
Campos obligatorios, sin campos extra: actions es un array de 1 a ${maxAcciones} objetos; cada objeto tiene action (cadena del catalogo) y parameters (objeto con exactamente los parametros de esa accion, tipos y rangos indicados). reasoning_summary es una cadena de 0 a 240 caracteres con una breve justificacion, nunca razonamiento privado extenso. No uses Markdown ni texto fuera del JSON.`;
  const usuario = { turn_number: turno ?? observation.turno_juego + 1, orden, observation };
  if (!simulado) usuario.estado_orquestador = { puntos_por_turno: puntosPorTurno, max_acciones: maxAcciones, cooldowns: cooldownsPropios ?? {}, restricciones: restricciones ?? {} };
  return { sistema: sistema.normalize('NFD').replace(/[̀-ͯ]/g, ''), usuario: JSON.stringify(usuario), prompt_version: PROMPT_VERSION, rules_version: rulesVersion };
}
