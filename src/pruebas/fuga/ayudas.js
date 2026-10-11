// Ayudas compartidas por las pruebas de La Fuga. No es un archivo de pruebas.
import { crearRng } from '../../rng.js';
import { crearEstado } from '../../juegos/fuga/estado.js';
import { normalizarRespuesta } from '../../juegos/fuga/ordenes.js';
import { porId } from '../../juegos/fuga/catalogo.js';
import { K, METODOS_DE_SITUACION } from '../../juegos/fuga/constantes.js';

export const nuevoEstado = (seed = 7) => crearEstado(crearRng(seed));

// respuesta cruda de una IA, neutra salvo lo que se cambie
export const resp = (extra = {}) => ({ postura: 'avanzar', metodo: 'sigilo', aprovechar: false, promesa: null, mensaje: '', razon: '', ...extra });
// la misma respuesta, ya normalizada (lo que recibe aplicarTurno)
export const jug = (extra = {}) => normalizarRespuesta(resp(extra));

// una situacion fija del catalogo, con peligro conocido y sin azar
export function situacion(idDef, { peligro = 0.2, tentacion = null, fiable = true } = {}) {
  const def = porId.get(idDef);
  const normal = METODOS_DE_SITUACION.find((m) => m !== def.mejor && m !== def.malo);
  return {
    id: idDef,
    fase: def.fase,
    peligro,
    ajuste: { [def.mejor]: K.ajusteMejor, [def.malo]: K.ajusteMalo, [normal]: K.ajusteNormal, esperar: K.esperar },
    pistaFiable: fiable,
    apuntaA: fiable ? def.mejor : def.malo,
    tentacion,
  };
}

// pone una situacion fija como la actual del estado y la devuelve
export function forzar(E, idDef, opciones) {
  E.situaciones[E.ronda] = situacion(idDef, opciones);
  return E.situaciones[E.ronda];
}

// fija los dados de la situacion actual (numeros altos = nadie falla; muy bajos = fallan los dos)
export const dadosFijos = (E, a, b) => { E.dados[E.ronda] = [a, b]; };
