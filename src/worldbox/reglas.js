import { PESOS, PESOS_REAL } from './puntuacion.js';

// Perfiles de reglas versionados. Cambiar una cifra aqui es cambiar el reglamento: sube la version y docs/worldbox-reglas.md.
//   simulado : Auge de reinos sobre el simulador (docs/worldbox.md). Su catalogo vive en catalogo-acciones.json.
//   real     : Auge de reinos sobre el WorldBox REAL (docs/worldbox-reglas.md). Lista CERRADA de acciones: solo las de esta
//              tabla, y solo si el puente las anuncia verificadas con EXACTAMENTE este esquema de parametros.
//   generico : cualquier puente de prueba: todo lo que anuncie con verificada:true, 1 punto y cooldown 0 salvo que anuncie otra cosa.
const objetivo = { tipo: 'cadena', minimo: 1, maximo: 40 };
const entero = (minimo, maximo) => ({ tipo: 'entero', minimo, maximo });
// Acciones hostiles (guerra y poderes contra un rival): no antes del turno 6. Medido: sin puerta, 6 gotas hostiles eliminan a un reino de 4 habitantes en 5-7 turnos.
const DESDE_HOSTIL = 6;
const PODERES = Object.freeze({ grupo: 'poderes', maximo: 10 }); // bendecir, maldecir e incendiar comparten 10 poderes por faccion y partida
const NOTA_MEDICIONES = 'Las cifras salen de mediciones en vivo (privado/revisiones/W5-entrega.md, privado/revisiones/W6-entrega.md).';

export const ACCIONES_REAL = Object.freeze({
  crear_unidades: { puntos: 2, cooldown: 1, parametros: { cantidad: entero(1, 5) }, acumulado: { parametro: 'cantidad', maximo: 10, efecto: 'creadas' },
    texto: 'Crea de 1 a 5 adultos de tu especie junto a tu ciudad inicial y los une a ella; la poblacion sube de inmediato y se mantiene. Es todo o nada: si no hay sitio libre para TODAS las unidades pedidas se rechaza (sin_espacio) y no se crea ninguna. Tope del reglamento: 10 unidades creadas en total por faccion y partida; solo descuentan las unidades que el juego confirma como creadas en cada orden.' },
  bendecir: { puntos: 1, cooldown: 1, parametros: { gotas: entero(1, 3) }, tope_grupo: PODERES,
    texto: 'Suelta de 1 a 3 gotas de bendicion sobre unidades tuyas que aun no tienen el rasgo blessed (mas salud maxima). La gota cae y aterriza unos segundos de juego despues: el cambio se ve en observaciones posteriores y puede alcanzar a unidades vecinas. Cuenta como 1 de tus 10 poderes por partida (bendecir, maldecir e incendiar comparten ese tope).' },
  maldecir: { puntos: 2, cooldown: 2, desde_turno: DESDE_HOSTIL, parametros: { objetivo, gotas: entero(1, 3) }, tope_grupo: PODERES,
    texto: 'Suelta de 1 a 3 gotas de maldicion sobre unidades del rival cuyo id va en objetivo (campo id de un elemento de rivales; estado cursed: pierden salud). Efecto diferido como bendecir. Cuenta como 1 de tus 10 poderes por partida. Se rechaza contra ti mismo o contra un rival eliminado.' },
  incendiar: { puntos: 2, cooldown: 2, desde_turno: DESDE_HOSTIL, parametros: { objetivo, gotas: entero(1, 3) }, tope_grupo: PODERES,
    texto: 'Suelta de 1 a 3 gotas de fuego sobre unidades del rival cuyo id va en objetivo (campo id de un elemento de rivales; estado burning: pierden salud). Efecto diferido como bendecir. Cuenta como 1 de tus 10 poderes por partida. Se rechaza contra ti mismo o contra un rival eliminado.' },
  donar_recursos: { puntos: 1, cooldown: 0, parametros: { recurso: { tipo: 'cadena', minimo: 0, maximo: 13, valores: ['wood', 'stone', 'gold', 'common_metals'] }, cantidad: entero(1, 10) }, acumulado: { parametro: 'cantidad', maximo: 100 },
    texto: 'Agrega de 1 a 10 unidades del recurso elegido al almacen de tu ciudad. Si tu ciudad aun no tiene almacen, el resultado es sin_efecto y no se agrega nada. Tope de 100 unidades donadas en total por faccion y partida.' },
  declarar_guerra: { puntos: 3, cooldown: 5, desde_turno: DESDE_HOSTIL, max_por_partida: 1, parametros: { objetivo },
    texto: 'Declara guerra normal al rival cuyo id va en objetivo (campo id de un elemento de rivales; vivo y sin guerra abierta contigo). Mientras dura la guerra las unidades de ambos reinos pelean en el mapa. Solo se puede declarar desde el turno 6 y una sola vez por faccion y partida.' },
  pedir_paz: { puntos: 1, cooldown: 0, parametros: { objetivo },
    texto: 'Termina la guerra con el rival cuyo id va en objetivo (campo id de un elemento de rivales). El juego la rechaza si no hay guerra o si lleva menos de 30 segundos de juego. Es unilateral: no hace falta que el rival acepte.' },
});

// uge-real-1.0.0 (anterior) clasificaba solo por puntos; 1.1.0 hace ganar al unico superviviente (hallazgo R1-3). Los logs 1.0.0 se reconstruyen con su propia regla.
export const PERFILES = Object.freeze({
  simulado: { nombre: 'simulado', rules_version: 'auge-simulado-1.0.0', victoriaSupervivencia: false, pesos: PESOS, acciones: null,
    partida: { facciones: 2, especie: null, turnos: 20, segundosPorTurno: 1, maxAcciones: 3, puntosPorTurno: null, tamanoMapa: 64, velocidad: null, plantilla: null, unidadesIniciales: null, umbralSitio: null, intentosMapa: 1, maxTiempoMs: 300000, timeoutMs: 30000 } },
  real: { nombre: 'real', rules_version: 'auge-real-1.1.0', victoriaSupervivencia: true, pesos: PESOS_REAL, acciones: ACCIONES_REAL, nota: NOTA_MEDICIONES,
    partida: { facciones: 2, especie: 'human', turnos: 24, segundosPorTurno: 50, maxAcciones: 3, puntosPorTurno: 4, tamanoMapa: 192, velocidad: 'x10', plantilla: 'continent', unidadesIniciales: 4, umbralSitio: 30, intentosMapa: 10, maxTiempoMs: 3_600_000, timeoutMs: 60000 } },
  generico: { nombre: 'generico', rules_version: 'puente-observacion-1.0.0', victoriaSupervivencia: false, pesos: PESOS, acciones: null,
    partida: { facciones: 2, especie: null, turnos: 20, segundosPorTurno: 1, maxAcciones: 3, puntosPorTurno: null, tamanoMapa: 64, velocidad: null, plantilla: null, unidadesIniciales: null, umbralSitio: null, intentosMapa: 1, maxTiempoMs: 300000, timeoutMs: 30000 } },
});
export const NOMBRES_PERFIL = Object.keys(PERFILES);
export const perfilPorOrigen = origen => origen === 'simulado' ? PERFILES.simulado : PERFILES.real;
