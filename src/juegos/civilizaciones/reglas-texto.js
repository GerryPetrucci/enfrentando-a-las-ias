// EL CONTRATO de la Carrera de civilizaciones: el texto de reglas que lee la IA (igual para todas, sin acentos). Se GENERA de constantes.js para que ninguna cifra quede
// distinta en el texto y en el motor; cambiarlo sube `versionReglas` (src/juegos/civilizaciones.js). Presupuesto: entrada <= TOPE_TOKENS_ENTRADA (spec 7): cualquier regla
// que se agregue obliga a recortar otra cosa o a pedir subir el tope.

import {
  TURNOS, POBLACION_INICIAL, REGIONES_INICIALES, COLONIZAR, ESPACIO, HAMBRE, RASGOS, RAMAS, TECNOLOGIAS, COSTO_TECNOLOGIA, TECNOLOGIAS_PARA_ERA,
  COSTO_EDIFICIO, INVASIONES, GUARDIAS, TRIBUTO_POR_FUERZA, INVASION, ESTABILIDAD, CADA_EVENTO, MARAVILLAS, MARAVILLA_DEVUELTA, INDICE, COMERCIO, MAX_ORDENES, LIMITES_TEXTO,
  PRODUCE_OFICIO, OFICIOS, BONO_RECURSO_REGION, TEC, SITIOS, INDICE_MAXIMO, DIFUSION,
} from './constantes.js';
import { describir } from './efectos.js';

const pc = (v) => Math.round(v * 100);
const o = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} o ${xs.at(-1)}`);
const lista = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`);
const miles = (n) => (n >= 1000 ? `${Math.floor(n / 1000)},${String(n % 1000).padStart(3, '0')}` : String(n));
const costoTexto = (costo) => Object.entries(costo).map(([r, n]) => `${n} ${r}`).join(' + ');

const rasgos = RASGOS.map((r) => `${r.id} (${describir(r.efectos)})`).join(' | ');

function lineaDeRama(rama) {
  const items = TECNOLOGIAS.filter((t) => t.rama === rama.id).map((t) => {
    const partes = [...t.edificios.map((e) => `${e.id}: ${describir(e.efectos)}`), describir(t.efectos)].filter(Boolean);
    return `${t.era} ${t.nombre}${partes.length ? ` (${partes.join('; ')})` : ''}`;
  });
  return `- ${rama.nombre}: ${items.join(' | ')}`;
}

const maravillas = MARAVILLAS.map((m) => `${m.nombre} (${TEC[m.tec].nombre}; ${costoTexto(m.costo)}: ${describir(m.efectos)})`).join(' | ');
const oficios = OFICIOS.map((o) => `${o.replace(/(es|s)$/, '')} ${PRODUCE_OFICIO[o][1]} ${PRODUCE_OFICIO[o][0]}`);
const eventos = [1, 2, 3].map((k) => k * CADA_EVENTO).join(', ');
const hierroMineros = TECNOLOGIAS.find((t) => t.efectos.some((e) => e.t === 'mineroHierro')).nombre;

export const REGLAS = `Objetivo: llevar tu civilizacion lo mas lejos posible en ${TURNOS} turnos. No hay guerra entre ustedes: cada una vive en un mundo identico (mismo mapa, eventos y dados). Gana quien tenga mas INDICE DE AVANCE al terminar el turno ${TURNOS}.

MUNDO: regiones (R01, R02, ...) con terreno (ll = llanura, bo = bosque, mo = montana) y a veces un recurso. Cada region tuya produce sola: ll +1 Comida, bo +1 Madera, mo +1 Roca; un recurso da +${BONO_RECURSO_REGION} de ese recurso (Caballos da Oro). Empiezas con tu capital y ${REGIONES_INICIALES - 1} vecinas. colonizar REGION (vecina libre, maximo ${COLONIZAR.porTurno} por turno): ${COLONIZAR.Comida} Comida + ${COLONIZAR.Madera} Madera por cada region que ya tienes.
FUNDACION (solo el turno 1, campo "fundacion"): nombre (maximo ${LIMITES_TEXTO.nombre} caracteres), lema (maximo ${LIMITES_TEXTO.lema}), sitio de tu capital (${o(Array.from({ length: SITIOS }, (_, i) => String(i + 1)))} de los que se ofrecen) y 2 RASGOS: ${rasgos}.

GENTE: empiezas con ${POBLACION_INICIAL} de Poblacion; cada una come 1 Comida por turno. Si sobra Comida y hay espacio, crece +1 por turno (espacio = ${ESPACIO.base} + ${ESPACIO.porRegion} por region + edificios). Si falta Comida: Comida 0, pierdes el ${pc(HAMBRE.perdida)}% de la gente y la Estabilidad baja ${-HAMBRE.estabilidad}.
TRABAJO: asignar granjeros G lenadores L mineros M mercaderes C sabios S artistas A (decenas que suman 100; se mantiene hasta que lo cambies). Cada persona produce: ${oficios[0]}, ${oficios[1]}, ${oficios[2]} (+1 Hierro desde ${hierroMineros}), ${oficios[3]}, ${oficios[4]}, ${oficios[5]}. Los bonos se suman y se redondea al entero mas cercano; lo recien construido produce desde el turno siguiente. La Ciencia se gasta en investigar (lo que sobra se guarda sin perdida); la Cultura se acumula.

TECNOLOGIAS: ${RAMAS.length} ramas x ${COSTO_TECNOLOGIA.length} eras. investigar TEC (1 proyecto; 2 desde Escritura). Costo en Ciencia por era: ${COSTO_TECNOLOGIA.join(', ')}; si el rival ya la conocia al cerrar el turno anterior cuesta ${pc(1 - DIFUSION.num / DIFUSION.den)}% menos. Cada una pide la anterior de su rama. ERA: empiezas en la 1; pasas a la E+1 al conocer ${TECNOLOGIAS_PARA_ERA} tecnologias de la era E, y solo investigas de tu era o anteriores.
${RAMAS.map(lineaDeRama).join('\n')}
EDIFICIOS: construir REGION EDIFICIO (uno por region; reemplaza al anterior). Costo = (${COSTO_EDIFICIO.Madera} Madera + ${COSTO_EDIFICIO.Roca} Roca) x era del edificio, y desde la era ${COSTO_EDIFICIO.hierroDesdeEra} suma (era - ${COSTO_EDIFICIO.hierroDesdeEra - 1}) Hierro. Cada tipo cuenta una sola vez y su bono vale para toda tu civilizacion; de las murallas vale solo la mejor.

DILEMAS DE ERA: al entrar a cada era de la 2 a la 6 eliges UNO de tres con dilema N (si no, el 1); el turno que entras te los muestran.
ESTABILIDAD (0 a 100) = ${ESTABILIDAD.base} + ${ESTABILIDAD.porEdificioEspiritu} por cada edificio de Espiritu + Cultura producida este turno / ${ESTABILIDAD.culturaPorPunto} - ${ESTABILIDAD.porRegionDeMas} por cada region sobre ${ESTABILIDAD.regionesLibres} - ${-HAMBRE.estabilidad} si hay hambre, mas lo que traigan eventos y dilemas. Bajo ${ESTABILIDAD.bajo}: produces -${pc(ESTABILIDAD.penalizacionProduccion)}%. Bajo ${ESTABILIDAD.critica}: cada turno hay ${pc(ESTABILIDAD.probSecesion)}% de perder una region. En 0: COLAPSO (pierdes ${pc(ESTABILIDAD.colapsoGente)}% de la gente y ${ESTABILIDAD.colapsoRegiones} regiones; vuelve a ${ESTABILIDAD.colapsoTras}).
EVENTOS: cada ${CADA_EVENTO} turnos (${eventos}, ...) pasa un evento mundial igual para los dos; se anuncia un turno antes (PRESAGIO) con sus opciones, salvo los repentinos. responder N (o responder CLAVE N) elige la opcion; sin respuesta vale la PREDETERMINADA. Se aplica una vez, al empezar el turno y antes de producir; si no puedes pagarla, se aplica su alternativa gratuita (la vista escribe la orden exacta).
INVASIONES en los turnos ${lista(INVASIONES.map((i) => i.turno))}, con fuerza ${lista(INVASIONES.map((i) => i.fuerza))}: responder invasion 1 resiste; responder invasion 2 paga el tributo completo (${TRIBUTO_POR_FUERZA} Oro por punto de fuerza; sin Oro suficiente se resuelve como resistir). Tu defensa = Guardias x fuerza (1; x1.5 con Disciplina o Metalurgia; x3 con Ejercito profesional) x (1 + bonos de muralla). Si defensa >= fuerza la repeles (+${INVASION.repelida.cultura} Cultura); si >= la mitad te saquean (pierdes ${pc(INVASION.saqueo.oro)}% de Oro y Comida); si no, ademas pierdes una region y ${pc(INVASION.derrota.gente)}% de la gente. reclutar N: N Guardias (${GUARDIAS.Comida} Comida + ${GUARDIAS.Hierro} Hierro c/u, maximo ${GUARDIAS.maxPorTurno} por turno; comen 1 Comida, no producen ni cuentan como Poblacion).

MARAVILLAS (${MARAVILLAS.length} en el mundo): invertir MARAVILLA RECURSO CANTIDAD (entera, hasta lo pendiente) las va pagando. Quien junte primero el costo la construye (su bono y +${INDICE.maravillas.porMaravilla} al Indice; si las dos la completan el mismo turno, gana la de mas Estabilidad al cerrar el turno anterior); la otra pierde lo invertido, salvo ${pc(MARAVILLA_DEVUELTA)}% que se le devuelve en Oro. ${maravillas}.
COMERCIO Y PALABRAS: regalar RECURSO CANTIDAD (llega al final de las ordenes; no financia este turno) | ofrecer RECURSO CANT RECURSO CANT (maximo ${COMERCIO.maxPorLado} por lado, ${COMERCIO.ofertasPorTurno} por turno; el rival la ve el turno siguiente y solo entonces la acepta con aceptar N; luego caduca) | un mensaje publico por turno (maximo ${LIMITES_TEXTO.mensaje} caracteres).

ORDENES (maximo ${MAX_ORDENES} por turno; basta con 3 a 6): asignar, investigar, construir, colonizar, reclutar, invertir, dilema, responder, regalar, ofrecer, aceptar. Una orden que no puedes pagar o no existe se descarta; el resto se aplica.
INDICE DE AVANCE (${INDICE_MAXIMO}): Tecnologia ${INDICE.tecnologia.puntos} (cada tecnologia vale su era; las ${TECNOLOGIAS.length} = ${INDICE.tecnologia.puntos}) | Cultura ${INDICE.cultura.puntos} (${INDICE.cultura.referencia} acumuladas = ${INDICE.cultura.puntos}) | Poblacion ${INDICE.poblacion.puntos} (${INDICE.poblacion.referencia} = ${INDICE.poblacion.puntos}) | Economia ${INDICE.economia.puntos} (${miles(INDICE.economia.referencia)} de recursos producidos en total = ${INDICE.economia.puntos}) | Maravillas ${INDICE.maravillas.puntos} (${INDICE.maravillas.porMaravilla} cada una) | Estabilidad ${INDICE.estabilidad.puntos} (promedio de la partida). Se compara en los turnos ${lista(INDICE.publicado)}; vale el ${TURNOS}. Desempate: tecnologias, luego sorteo.
MEMORIA: una nota de plan por turno (maximo ${LIMITES_TEXTO.nota} caracteres); solo tu la ves el turno siguiente.`;

// El formato exacto de la respuesta (lo ve la IA junto a las reglas).
export const FORMATO = JSON.stringify({
  fundacion: { nombre: '...', lema: '...', sitio: 2, rasgos: ['eruditos', 'constructores'] },
  ordenes: ['asignar granjeros 30 lenadores 10 mineros 10 mercaderes 20 sabios 20 artistas 10', 'construir R03 granero', 'invertir piramide Roca 8'],
  mensaje: 'texto breve', nota: 'tu plan', razon: 'una frase',
});
