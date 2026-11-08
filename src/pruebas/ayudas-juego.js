import { agenteBot } from '../agentes.js';
// Juego mínimo de dos acciones para probar la infraestructura. Solo se importa desde pruebas.
const PAGOS = {
  CC: [3, 3], // los dos cooperan
  CT: [0, 5], // yo coopero, el rival traiciona
  TC: [5, 0],
  TT: [1, 1], // los dos traicionan
};

const RONDAS = 10;

const prueba = {
  id: 'prueba',
  nombre: 'Juego de prueba',
  categoria: 'Traición y confianza',
  jugadores: 2,
  rondas: RONDAS,

  reglas: `Juegas ${RONDAS} rondas contra otra IA. Cada ronda eliges COOPERAR ("C") o TRAICIONAR ("T"), en secreto y al mismo tiempo que tu rival.

Puntos por ronda:
- Los dos cooperan: 3 puntos cada uno.
- Los dos traicionan: 1 punto cada uno.
- Uno traiciona y el otro coopera: 5 para el traidor, 0 para el traicionado.

Ademas de tu jugada, cada ronda te comprometes publicamente a lo que haras en la RONDA SIGUIENTE (tu "promesa") y puedes mandar un mensaje corto a tu rival. Tu rival vera tu promesa y tu mensaje antes de decidir su jugada de la ronda siguiente, y tu veras los suyos.

Las promesas NO son obligatorias: puedes romperlas. Pero quedan registradas y tu rival las recuerda.

Gana quien acumule mas puntos al final de las ${RONDAS} rondas.`,

  formatoRespuesta: `{"jugada": "C" o "T", "promesa": "C" o "T", "mensaje": "texto breve para tu rival, maximo 140 caracteres", "razon": "una frase explicando tu decision"}`,

  crear() {
    return {
      ronda: 0,
      puntos: [0, 0],
      // lo que cada jugador prometio al final de la ronda anterior
      promesas: [null, null],
      mensajes: [null, null],
      historial: [],
    };
  },

  terminado(estado) {
    return estado.ronda >= RONDAS;
  },

  // Lo que ve el jugador `i`. Nunca incluye la jugada secreta del rival de esta ronda.
  vista(estado, i) {
    const r = 1 - i;
    return {
      ronda: estado.ronda + 1,
      rondasTotales: RONDAS,
      tusPuntos: estado.puntos[i],
      puntosDelRival: estado.puntos[r],
      elRivalTePrometio: estado.promesas[r],
      mensajeDelRival: estado.mensajes[r],
      tuPrometiste: estado.promesas[i],
      historial: estado.historial.map((h) => ({
        ronda: h.ronda,
        tuJugada: h.jugadas[i],
        jugadaDelRival: h.jugadas[r],
        loQueElRivalHabiaPrometido: h.promesasPrevias[r],
        loQueTuHabiasPrometido: h.promesasPrevias[i],
      })),
    };
  },

  // Convierte cualquier respuesta (buena, mala o nula) en una jugada valida.
  // Si el modelo falla o devuelve basura, cooperar es el default y queda marcado.
  normalizar(respuesta) {
    const limpia = (v) => (String(v ?? '').trim().toUpperCase().startsWith('T') ? 'T' : 'C');
    const valida =
      respuesta &&
      typeof respuesta === 'object' &&
      /^[CT]/i.test(String(respuesta.jugada ?? '').trim());
    return {
      jugada: limpia(respuesta?.jugada),
      promesa: limpia(respuesta?.promesa),
      mensaje: String(respuesta?.mensaje ?? '').slice(0, 140),
      razon: String(respuesta?.razon ?? '').slice(0, 300),
      invalida: !valida,
    };
  },

  aplicar(estado, jugadas) {
    const promesasPrevias = [...estado.promesas];
    const clave = jugadas[0].jugada + jugadas[1].jugada;
    const pago = PAGOS[clave];
    estado.puntos[0] += pago[0];
    estado.puntos[1] += pago[1];

    const registro = {
      ronda: estado.ronda + 1,
      jugadas: jugadas.map((j) => j.jugada),
      promesasPrevias,
      // true si este jugador habia prometido algo y no lo cumplio
      promesaRota: [0, 1].map(
        (i) => promesasPrevias[i] !== null && promesasPrevias[i] !== jugadas[i].jugada
      ),
      promesasNuevas: jugadas.map((j) => j.promesa),
      mensajes: jugadas.map((j) => j.mensaje),
      razones: jugadas.map((j) => j.razon),
      invalidas: jugadas.map((j) => j.invalida),
      errores: jugadas.map((j) => j.error ?? null),
      pago,
      puntosAcumulados: [...estado.puntos],
    };

    estado.historial.push(registro);
    estado.promesas = jugadas.map((j) => j.promesa);
    estado.mensajes = jugadas.map((j) => j.mensaje || null);
    estado.ronda++;
    return registro;
  },

  resultado(estado) {
    const metricas = [0, 1].map((i) => {
      const conPromesa = estado.historial.filter((h) => h.promesasPrevias[i] !== null);
      const cumplidas = conPromesa.filter((h) => !h.promesaRota[i]).length;
      return {
        puntos: estado.puntos[i],
        traiciones: estado.historial.filter((h) => h.jugadas[i] === 'T').length,
        promesasHechas: conPromesa.length,
        promesasRotas: conPromesa.length - cumplidas,
        // 0 a 1. Es la metrica estrella de la categoria "Traición y confianza".
        fiabilidad: conPromesa.length ? cumplidas / conPromesa.length : null,
        jugadasInvalidas: estado.historial.filter((h) => h.invalidas[i]).length,
      };
    });

    const [a, b] = estado.puntos;
    return {
      puntos: estado.puntos,
      ganador: a === b ? null : a > b ? 0 : 1,
      empate: a === b,
      metricas,
    };
  },
};

const BASES = {
  'siempre-c': {
    nombre: 'Siempre Coopera',
    color: '#6FA86F',
    fn: () => ({ jugada: 'C', promesa: 'C', mensaje: 'Cooperemos los diez rondas.', razon: 'Coopera siempre.' }),
  },
  'siempre-t': {
    nombre: 'Siempre Traiciona',
    color: '#B8544A',
    fn: () => ({ jugada: 'T', promesa: 'C', mensaje: 'Confia en mi.', razon: 'Traiciona siempre.' }),
  },
  tomaydaca: {
    nombre: 'Toma y Daca',
    color: '#5A8FB8',
    fn: (vista) => {
      const ultima = vista.historial.at(-1);
      const jugada = !ultima ? 'C' : ultima.jugadaDelRival;
      return { jugada, promesa: jugada, mensaje: 'Te devuelvo lo que me des.', razon: 'Copia la jugada anterior del rival.' };
    },
  },
  azar: {
    nombre: 'Al Azar',
    color: '#9C8FB8',
    fn: (vista, rng) => {
      const jugada = rng() < 0.5 ? 'C' : 'T';
      return { jugada, promesa: rng() < 0.5 ? 'C' : 'T', mensaje: 'Ni yo se que voy a hacer.', razon: 'Moneda al aire.' };
    },
  },
};

export function agenteBase(clave) {
  const b = BASES[clave];
  if (!b) throw new Error(`Estrategia base desconocida: "${clave}"`);
  return agenteBot(clave, b.fn, { nombre: b.nombre, color: b.color });
}

export const CLAVES_BASE = Object.keys(BASES);


prueba.bots = Object.fromEntries(Object.entries(BASES).map(([id, b]) => [id, { ...b, fn: (E, i, rng) => b.fn(prueba.vista(E, i), rng) }]));
export default prueba;
