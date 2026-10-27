// Constantes de la Carrera de civilizaciones (spec 1.2.0: privado/spec/civilizaciones-diseno.md). Ninguna cifra se repite a mano en otro archivo:
// el texto de reglas (reglas-texto.js), la vista, el motor, los bots y las pruebas importan de aqui.
//
// Cada EFECTO es un elemento de una lista ordenada { t: tipo, ... }. De esa misma lista salen el calculo del motor (economia.js) y la frase que lee la IA
// (texto-efectos.js), asi que cambiar un bono aqui cambia las dos cosas a la vez.

export const TURNOS = 30;
export const REGIONES = 26;               // mapa de 2 reinos (src/mapa.js)
export const JUGADORES = 2;
export const SITIOS = 3;                  // sitios de capital que se ofrecen

export const RECURSOS_ALMACEN = ['Comida', 'Madera', 'Roca', 'Hierro', 'Oro'];
export const RECURSOS = [...RECURSOS_ALMACEN, 'Ciencia', 'Cultura'];
export const ALMACEN_INICIAL = { Comida: 20, Madera: 10, Roca: 6, Hierro: 0, Oro: 6 };
export const POBLACION_INICIAL = 10;

// ---- Gente y oficios ----
export const OFICIOS = ['granjeros', 'lenadores', 'mineros', 'mercaderes', 'sabios', 'artistas'];
export const PRODUCE_OFICIO = { granjeros: ['Comida', 3], lenadores: ['Madera', 2], mineros: ['Roca', 2], mercaderes: ['Oro', 2], sabios: ['Ciencia', 2], artistas: ['Cultura', 2] };
export const REPARTO_INICIAL = [40, 20, 10, 10, 20, 0];
export const ESPACIO = { base: 6, porRegion: 3 };
export const HAMBRE = { perdida: 0.10, estabilidad: -10 };

// ---- Terreno y regiones ----
export const TERRENO = { ll: 'Comida', bo: 'Madera', mo: 'Roca' };       // +1 del recurso del terreno
export const BONO_RECURSO_REGION = 2;                                       // un recurso en la region da +2 (Caballos da Oro)
export const COLONIZAR = { Comida: 2, Madera: 2, porTurno: 2 };            // por cada region que ya tienes
export const REGIONES_INICIALES = 3;                                        // la capital y sus 2 vecinas mas cercanas (4 con pioneros)

// ---- Efectos: lista ordenada de { t, ... } (ver economia.js y texto-efectos.js) ----
const pct = (rec, v) => ({ t: 'pct', rec: Array.isArray(rec) ? rec : [rec], v });
const plano = (rec, v) => ({ t: 'plano', rec, v });
const espacio = (v) => ({ t: 'espacio', v });
const estab = (v) => ({ t: 'estabilidad', v });
const todo = (v) => ({ t: 'pct', rec: 'todo', v });
const muralla = (v, corto = true) => ({ t: 'muralla', v, corto });

// ---- Rasgos (2 de 8 en la fundacion) ----
export const RASGOS = [
  { id: 'agricultores', efectos: [pct('Comida', 0.20), pct('Ciencia', -0.15)] },
  { id: 'forjadores', efectos: [pct(['Roca', 'Hierro'], 0.20), pct('Cultura', -0.15)] },
  { id: 'eruditos', efectos: [pct('Ciencia', 0.20), pct('Oro', -0.15)] },
  { id: 'comerciantes', efectos: [pct('Oro', 0.20), { t: 'defensaPct', v: -0.15 }] },
  { id: 'devotos', efectos: [pct('Cultura', 0.20), estab(5), pct('Ciencia', -0.15)] },
  { id: 'guerreros', efectos: [{ t: 'baratoGuardias' }, { t: 'defensaPct', v: 0.30 }, pct('Oro', -0.15)] },
  { id: 'constructores', efectos: [{ t: 'edificiosCosto', v: -0.20 }, pct('Comida', -0.10)] },
  { id: 'pioneros', efectos: [{ t: 'colonizarCosto', v: -0.30 }, { t: 'regionInicial', v: 1 }, estab(-5)] },
];

// ---- Tecnologias: 6 ramas x 6 eras ----
export const RAMAS = [
  { id: 'T', nombre: 'TIERRA' }, { id: 'M', nombre: 'METAL' }, { id: 'C', nombre: 'COMERCIO' },
  { id: 'S', nombre: 'SABER' }, { id: 'E', nombre: 'ESPIRITU' }, { id: 'D', nombre: 'DEFENSA' },
];
export const ERAS = 6;
// Ciencia por era. La spec 1.2.0 partia de 10-19-32-48-70-96 (calibrada en el simulador abstracto de la revision, que no pagaba edificios ni colonias); con el motor real y los
// bots de la capa 1 (200 mundos) esa escalera dejaba al expansionista en 14 tecnologias y al equilibrado en 23, fuera de los rangos 15-36 y 24-28 de la spec 9.3. Bajada un 10 %.
export const COSTO_TECNOLOGIA = [9, 17, 29, 43, 63, 86];
export const DIFUSION = { num: 7, den: 10 };                                 // si el rival ya la conocia al cierre anterior: ceil(costo x 7 / 10)
export const TECNOLOGIAS_PARA_ERA = 4;                                       // se pasa a la era E+1 al conocer 4 de las 6 de la era E
export const PROYECTOS = { base: 1, conEscritura: 2 };

// edificios: { id, era, efectos } ; efectos: bonos de la tecnologia misma (sin edificio)
const T = (id, rama, era, nombre, edificios = [], efectos = []) => ({ id, rama, era, nombre, edificios, efectos });
const ed = (id, efectos) => ({ id, efectos });
export const TECNOLOGIAS = [
  T('T1', 'T', 1, 'Cultivo', [ed('granero', [pct('Comida', 0.20), espacio(2)])]),
  T('T2', 'T', 2, 'Riego', [ed('acueducto', [espacio(4)])]),
  T('T3', 'T', 3, 'Rotacion', [], [pct('Comida', 0.15)]),
  T('T4', 'T', 4, 'Arado pesado', [], [pct('Comida', 0.20)]),
  T('T5', 'T', 5, 'Medicina', [ed('hospital', [{ t: 'crecimiento', v: 1 }, { t: 'peste' }])]),
  T('T6', 'T', 6, 'Mecanizacion', [], [pct('Comida', 0.30)]),
  T('M1', 'M', 1, 'Herramientas', [ed('aserradero', [pct('Madera', 0.25)]), ed('cantera', [pct('Roca', 0.25)])]),
  T('M2', 'M', 2, 'Fundicion', [ed('mina', [pct('Hierro', 0.25)])], [{ t: 'mineroHierro', v: 1, oculto: true }]),
  T('M3', 'M', 3, 'Forja', [], [pct(['Roca', 'Hierro'], 0.25)]),
  T('M4', 'M', 4, 'Ingenieria', [ed('taller', [pct(['Madera', 'Roca', 'Hierro'], 0.20)])]),
  T('M5', 'M', 5, 'Metalurgia', [ed('arsenal', [{ t: 'guardias', v: 1.5 }])]),
  T('M6', 'M', 6, 'Vapor', [ed('fabrica', [pct(['Madera', 'Roca', 'Hierro'], 0.40), estab(-5)])]),
  T('C1', 'C', 1, 'Trueque', [ed('mercado', [pct('Oro', 0.25)])]),
  T('C2', 'C', 2, 'Navegacion', [ed('puerto', [plano('Oro', 2), plano('Comida', 1)])]),
  T('C3', 'C', 3, 'Moneda', [], [pct('Oro', 0.20)]),
  T('C4', 'C', 4, 'Gremios', [ed('gremio', [pct('Oro', 0.15), pct('Cultura', 0.10)])]),
  T('C5', 'C', 5, 'Ultramar', [], [pct('Oro', 0.25)]),
  T('C6', 'C', 6, 'Banca', [ed('banco', [pct('Oro', 0.30)])]),
  T('S1', 'S', 1, 'Calendario', [], [{ t: 'planoRegion', rec: 'Ciencia', v: 1 }]),
  T('S2', 'S', 2, 'Escritura', [ed('biblioteca', [pct('Ciencia', 0.25)])], [{ t: 'proyectos', v: PROYECTOS.conEscritura }]),
  T('S3', 'S', 3, 'Filosofia', [ed('academia', [pct('Ciencia', 0.25)])]),
  T('S4', 'S', 4, 'Universidad', [ed('universidad', [pct('Ciencia', 0.30)])]),
  T('S5', 'S', 5, 'Imprenta', [ed('imprenta', [pct(['Ciencia', 'Cultura'], 0.20)])]),
  T('S6', 'S', 6, 'Metodo cientifico', [ed('laboratorio', [pct('Ciencia', 0.35)])]),
  T('E1', 'E', 1, 'Ritos', [ed('templo', [estab(5), pct('Cultura', 0.10)])]),
  T('E2', 'E', 2, 'Leyes', [], [estab(5)]),
  T('E3', 'E', 3, 'Ciudadania', [ed('anfiteatro', [estab(5), pct('Cultura', 0.25)])]),
  T('E4', 'E', 4, 'Teologia', [ed('catedral', [estab(5), pct('Cultura', 0.30)])]),
  T('E5', 'E', 5, 'Humanismo', [ed('museo', [estab(5), pct('Cultura', 0.30)])]),
  T('E6', 'E', 6, 'Constitucion', [ed('parlamento', [estab(5), pct('Cultura', 0.20)])]),
  T('D1', 'D', 1, 'Empalizada', [ed('muralla de madera', [muralla(0.25, false)])]),
  T('D2', 'D', 2, 'Murallas', [ed('muralla', [muralla(0.50)])]),
  T('D3', 'D', 3, 'Disciplina', [], [{ t: 'guardias', v: 1.5 }]),
  T('D4', 'D', 4, 'Castillos', [ed('fortaleza', [muralla(1.00)])]),
  T('D5', 'D', 5, 'Bastiones', [], [muralla(1.50)]),
  T('D6', 'D', 6, 'Ejercito profesional', [], [{ t: 'guardias', v: 3 }]),
];
export const ESPIRITU_RAMA = 'E';

// Los 26 tipos de edificio salen de las tecnologias. Un edificio se construye en una region; su bono vale para toda la civilizacion, una sola vez por tipo.
export const EDIFICIOS = TECNOLOGIAS.flatMap((t) => t.edificios.map((e) => ({ id: e.id, tec: t.id, era: t.era, rama: t.rama, efectos: e.efectos })));
export const COSTO_EDIFICIO = { Madera: 3, Roca: 2, hierroDesdeEra: 3 };   // (3 Madera + 2 Roca) x era; desde la era 3, ademas (era - 2) Hierro

// ---- Dilemas de era (eras 2 a 6): 3 opciones permanentes; sin respuesta rige la 1 ----
const D = (n, nombre, ...efectos) => ({ n, nombre, efectos });
export const DILEMAS = {
  2: { titulo: 'Orden social', opciones: [
    D(1, 'Jefaturas guerreras', { t: 'baratoGuardias' }, { t: 'defensaPct', v: 0.20 }, pct('Cultura', -0.10)),
    D(2, 'Consejo de ancianos', estab(5), pct('Cultura', 0.10), pct('Oro', -0.10)),
    D(3, 'Gremios de artesanos', pct(['Madera', 'Roca'], 0.15), pct('Comida', -0.10)),
  ] },
  3: { titulo: 'Ley y trabajo', opciones: [
    D(1, 'Esclavitud', pct(['Comida', 'Roca'], 0.25), estab(-10)),
    D(2, 'Ciudadania', estab(5), pct('Ciencia', 0.15), pct('Roca', -0.10)),
    D(3, 'Servicio militar', { t: 'defensaPct', v: 0.30 }, { t: 'hierroMina', v: 1 }, pct('Comida', -0.10)),
  ] },
  4: { titulo: 'Poder', opciones: [
    D(1, 'Feudalismo', { t: 'defensaPct', v: 0.20 }, pct('Comida', 0.15), pct('Ciencia', -0.15)),
    D(2, 'Monasterios', pct('Cultura', 0.20), pct('Ciencia', 0.10), pct('Oro', -0.15)),
    D(3, 'Ciudades libres', pct('Oro', 0.20), estab(-5)),
  ] },
  5: { titulo: 'Saber', opciones: [
    D(1, 'Mecenazgo', pct(['Ciencia', 'Cultura'], 0.20), pct('Oro', -0.20)),
    D(2, 'Colonias', { t: 'regionGratis', v: 1 }, pct('Oro', 0.15), estab(-5)),
    D(3, 'Absolutismo', pct(['Madera', 'Roca', 'Hierro'], 0.20), estab(-10)),
  ] },
  6: { titulo: 'Economia', opciones: [
    D(1, 'Capitalismo', pct('Oro', 0.25), estab(-10)),
    D(2, 'Reformas sociales', estab(10), { t: 'crecimiento', v: 1 }, pct('Oro', -0.10)),
    D(3, 'Estado planificador', todo(0.20), pct('Ciencia', -0.15)),
  ] },
};

// ---- Estabilidad, secesion y colapso (3.8) ----
export const ESTABILIDAD = {
  base: 50, porEdificioEspiritu: 5, culturaPorPunto: 5, regionesLibres: 6, porRegionDeMas: 2,
  bajo: 40, penalizacionProduccion: 0.20, critica: 20, probSecesion: 0.5, colapsoTras: 30, colapsoGente: 0.25, colapsoRegiones: 2,
};

// ---- Invasiones y Guardias (3.11) ----
export const INVASIONES = [{ turno: 8, fuerza: 6 }, { turno: 14, fuerza: 14 }, { turno: 20, fuerza: 26 }, { turno: 26, fuerza: 44 }];
export const GUARDIAS = { Comida: 1, Hierro: 1, maxPorTurno: 40 };
export const TRIBUTO_POR_FUERZA = 2;
export const INVASION = { repelida: { cultura: 5 }, saqueo: { comida: 0.25, oro: 0.25 }, derrota: { gente: 0.10 } };

// ---- Eventos del mundo (3.10): uno cada 3 turnos; la opcion 1 es la predeterminada; FALLBACK = opcion gratuita a la que cae una opcion que no se puede pagar ----
export const CADA_EVENTO = 3;
const EV = (id, nombre, repentino, opciones, fallback = {}) => ({ id, nombre, repentino, opciones, fallback });
export const EVENTOS = [
  EV('sequia', 'Sequia', false, ['pozos', 'racionar', 'migrar'], { 1: 2 }),
  EV('peste', 'Peste', false, ['cuarentena', 'plegarias', 'nada'], { 1: 2 }),
  EV('terremoto', 'Terremoto', true, ['reconstruir', 'abandonar'], { 1: 'perder' }),
  EV('inundacion', 'Inundacion fertil', false, ['sembrar', 'ignorar'], { 1: 2 }),
  EV('genio', 'Genio', false, ['un sabio', 'una artista', 'un ingeniero']),
  EV('yacimiento', 'Yacimiento', false, ['explotar', 'vender']),
  EV('revuelta', 'Revuelta de campesinos', false, ['reprimir', 'concesiones', 'tolerar'], { 1: 'concesiones o tolerar', 2: 3 }),
  EV('mercader', 'Mercader extranjero', false, ['comprar', 'vender', 'ignorar'], { 1: 3, 2: 3 }),
  EV('incendio', 'Incendio', true, ['apagarlo', 'dejarlo'], { 1: 2 }),
  EV('cometa', 'Cometa', false, ['buen augurio', 'ignorarlo']),
  EV('exodo', 'Exodo', false, ['acoger', 'cerrar fronteras']),
];
export const PESTE_DESDE_TURNO = 9;

// Parametros de los eventos (spec 3.10). Los porcentajes de perdida se
// redondean hacia arriba; duraciones incluyen el turno del evento.
export const CRISIS = {
  sequia: { madera: 6, golpe: -0.40, conPozos: -0.20, turnos: 2, estabilidad: -5, migracion: 0.10 },
  peste: { oro: 6, cuarentena: 0.08, hospitalCuarentena: 0.04, plegarias: 0.15, hospitalPlegarias: 0.07, cultura: 10, estabilidad: -10 },
  inundacion: { madera: 4, comida: 0.50, turnos: 3 },
  genio: { ciencia: 15, cultura: 15, descuento: -0.30 },
  yacimiento: { hierro: 8, roca: 4, oro: 12 },
  revuelta: { guardias: 3, oro: 8, estabilidad: 5 },
  mercader: { oroComprar: 8, maderaComprar: 8, rocaComprar: 4, maderaVender: 8, oroVender: 10 },
  incendio: { oro: 4, perdida: 0.30, apagado: 0.10 },
  cometa: { probBueno: 0.5, cultura: 10, estabilidad: 5 },
  exodo: { gente: 3, umbral: 60, estabilidad: -3 },
};

// ---- Maravillas (3.12): 6, unicas en el mundo ----
const M = (id, nombre, tec, costo, ...efectos) => ({ id, nombre, tec, costo, efectos });
export const MARAVILLAS = [
  M('piramide', 'Piramide', 'E1', { Roca: 30, Madera: 20 }, espacio(6), estab(5)),
  M('biblioteca mayor', 'Biblioteca mayor', 'S2', { Madera: 25, Roca: 25, Oro: 15 }, pct('Ciencia', 0.25)),
  M('faro', 'Faro', 'C2', { Madera: 30, Roca: 20, Oro: 20 }, pct('Oro', 0.25)),
  M('catedral mayor', 'Catedral mayor', 'E4', { Roca: 40, Madera: 30, Oro: 30 }, pct('Cultura', 0.30), estab(10)),
  M('observatorio', 'Observatorio', 'S5', { Roca: 40, Hierro: 30, Oro: 40 }, pct('Ciencia', 0.25)),
  M('palacio de cristal', 'Palacio de cristal', 'M6', { Roca: 60, Hierro: 40, Oro: 60 }, todo(0.20)),
];
export const MARAVILLA_DEVUELTA = 0.5;                // la que pierde la carrera recupera el 50 % de lo invertido, en Oro (1 por unidad)

// ---- Indice de Avance (3.13) ----
export const INDICE = {
  tecnologia: { puntos: 40, referencia: 126 },        // suma de las eras de las 36 tecnologias
  cultura: { puntos: 15, referencia: 300 },
  poblacion: { puntos: 10, referencia: 80 },
  economia: { puntos: 10, referencia: 3000 },        // 1,500 saturaba el pilar en el 100 % de las partidas de los tres bots (spec 9.3: ningun pilar al 98 % con el equilibrado)
  maravillas: { puntos: 15, porMaravilla: 2.5 },
  estabilidad: { puntos: 10 },
  publicado: [10, 20, 30],
};
export const INDICE_MAXIMO = INDICE.tecnologia.puntos + INDICE.cultura.puntos + INDICE.poblacion.puntos + INDICE.economia.puntos + INDICE.maravillas.puntos + INDICE.estabilidad.puntos;

// ---- Comercio y palabras (3.14) ----
export const COMERCIO = { maxPorLado: 10, ofertasPorTurno: 2 };

// ---- Ordenes y textos (6) ----
export const MAX_ORDENES = 12;
export const MAX_CANTIDAD = 1000000;
export const LIMITES_TEXTO = { nombre: 24, lema: 60, mensaje: 140, nota: 250, razon: 160 };
export const NOMBRE_FALLBACK = ['Civilizacion A', 'Civilizacion B'];
export const RASGOS_FALLBACK = ['agricultores', 'forjadores'];
export const PUNTOS = { ganador: 3, empate: 1, perdedor: 0 };

// Presupuesto del prompt (spec 7): chars / 1.97 en el peor caso.
export const TOPE_TOKENS_ENTRADA = 6000;
export const CARACTERES_POR_TOKEN = 1.97;

// ---- Busquedas por id ----
const porId = (lista) => Object.fromEntries(lista.map((x) => [x.id, x]));
export const TEC = porId(TECNOLOGIAS);
export const EDIFICIO = porId(EDIFICIOS);
export const RASGO = porId(RASGOS);
export const MARAVILLA = porId(MARAVILLAS);
export const EVENTO = porId(EVENTOS);
