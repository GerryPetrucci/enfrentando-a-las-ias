// Cliente de OpenRouter + registro de contendientes.
//
// IMPORTANTE: los IDs de modelo cambian cada pocos meses. Antes de grabar una
// temporada, verifica los vigentes en https://openrouter.ai/models y actualiza
// este archivo. La version exacta se guarda en cada resultado para que el
// marcador siempre diga "con que version se midio".
//
// Verificados el 9 de octubre de 2026 contra el catalogo de OpenRouter: cada IA es la
// version de gama media vigente de su proveedor, y las cinco respondieron una ronda real.
// Los parametros de llamada (temperatura, max_tokens) son iguales para todas y se
// congelan junto con el prompt: cambiarlos a mitad de temporada tambien parte los resultados.

import { cargarEnv } from './env.js';
import { PALETA } from '../web/paleta.js';
import { PARAMETROS, cuerpoDeLlamada } from './parametros.js';
cargarEnv();

// Los colores NO se definen aqui: viven en web/paleta.js, la fuente unica para todos los juegos y paginas.
//
// Dos campos que salen del catalogo de OpenRouter y se comprueban con `node herramientas/verificar-modelos.mjs`:
//   razonamiento  "medium" si el modelo admite ese nivel (se manda siempre, nunca un nivel mayor); null si no tiene niveles
//                 (se usa su valor por defecto). Ver src/parametros.js.
//   lote          true si el modelo tiene variante ":batch" (mitad de precio por la Batch API); false si no.
export const CONTENDIENTES = {
  claude: {
    nombre: 'Claude',
    modelo: 'anthropic/claude-sonnet-5.5',
    color: PALETA.claude.color,
    inicial: 'C',
    razonamiento: 'medium',
    lote: true,
  },
  gpt: {
    nombre: 'GPT',
    modelo: 'openai/gpt-6.1-sol',
    color: PALETA.gpt.color,
    inicial: 'G',
    razonamiento: 'medium',
    lote: true,
  },
  gemini: {
    nombre: 'Gemini',
    modelo: 'google/gemini-3.8-flash',
    color: PALETA.gemini.color,
    inicial: 'M',
    razonamiento: 'medium',
    lote: true,
  },
  llama: {
    nombre: 'Llama',
    modelo: 'meta-llama/llama-4-maverick',
    color: PALETA.llama.color,
    inicial: 'L',
    razonamiento: null,
    lote: false,
  },
  deepseek: {
    nombre: 'DeepSeek',
    // V3.2 y no V4: las V4 razonan sin limite y se cortaban hasta con 2000 tokens (probado el 9 oct 2026).
    modelo: 'deepseek/deepseek-v3.2',
    color: PALETA.deepseek.color,
    inicial: 'D',
    razonamiento: null,
    lote: false,
  },
  // --- Modelos GRATIS: $0 por llamada, no gastan el saldo (solo cuentan para el tope diario de OpenRouter). ---
  // Los 4 que respondieron bien al formato de los juegos en la prueba del 10 de octubre de 2026. Aparecen y
  // desaparecen del catalogo y se saturan: sirven para practicar, no para publicar un torneo serio. (En la prueba de humo del
  // 9 de octubre de 2026 con la Guerra de territorios, Laguna y Ling dieron 1 respuesta util en 40 llamadas.)
  'nemotron-ultra': { nombre: 'Nemotron Ultra', modelo: 'nvidia/nemotron-3-ultra-550b-a55b:free', gratis: true, color: PALETA['nemotron-ultra'].color, inicial: 'U', razonamiento: 'medium', lote: false },
  'nemotron-super': { nombre: 'Nemotron Super', modelo: 'nvidia/nemotron-3-super-120b-a12b:free', gratis: true, color: PALETA['nemotron-super'].color, inicial: 'S', razonamiento: 'medium', lote: false },
  laguna: { nombre: 'Laguna', modelo: 'poolside/laguna-s-2.1:free', gratis: true, color: PALETA.laguna.color, inicial: 'A', razonamiento: null, lote: false },
  // Este no lleva sufijo ":free": su precio en el catalogo era 0 el 10 de octubre de 2026, por eso se marca a mano.
  ling: { nombre: 'Ling', modelo: 'inclusionai/ling-3.1-flash', gratis: true, color: PALETA.ling.color, inicial: 'I', razonamiento: null, lote: false },

  // --- Modelos ECONOMICOS de practica (decidido el 9 de octubre de 2026): la gama baja de cada proveedor, por lote (mitad de
  // precio): unos $0.08 por partida de 4 reinos, contra $0.34 de la gama media por lote. Sustituyen a los gratis para practicar,
  // que se cortaban o recibian errores 429. Sus resultados son de practica (data/pruebas), no de torneo. Comparten el color de
  // la familia de su proveedor (web/paleta.js, campo `familia`): no los juegues en la misma partida que su version de gama media.
  haiku: { nombre: 'Claude Haiku', modelo: 'anthropic/claude-haiku-5.5', color: PALETA.haiku.color, inicial: 'H', razonamiento: 'medium', lote: true, practica: true },
  luna: { nombre: 'GPT Luna', modelo: 'openai/gpt-6-luna', color: PALETA.luna.color, inicial: 'N', razonamiento: 'medium', lote: true, practica: true },
  'flash-lite': { nombre: 'Gemini Flash-Lite', modelo: 'google/gemini-3.5-flash-lite', color: PALETA['flash-lite'].color, inicial: 'F', razonamiento: 'medium', lote: true, practica: true },
};

// ---------- modo de la ejecucion: gratis o pago ----------
// Cada ejecucion elige a mano (--modo=gratis | --modo=pago en src/correr.js). Aqui esta el seguro de verdad:
// sin modo "pago", llamarModelo se niega a llamar a cualquier modelo que gaste credito.
let modoActual = null;
export function fijarModo(modo) {
  if (modo !== 'gratis' && modo !== 'pago') throw new Error(`Modo invalido: "${modo}". Usa "gratis" o "pago".`);
  modoActual = modo;
}
export const obtenerModo = () => modoActual;
export function esGratis(modelo) {
  return String(modelo).endsWith(':free') || Object.values(CONTENDIENTES).some((c) => c.modelo === modelo && c.gratis);
}

// El seguro de verdad: se llama antes de CUALQUIER llamada que pueda gastar credito (la normal y la del lote).
export function exigirModoPago(modelo) {
  if (!esGratis(modelo) && modoActual !== 'pago') {
    throw new Error(`${modelo} gasta credito y esta ejecucion no esta en modo pago (modo: ${modoActual ?? 'sin elegir'}). Usa --modo=pago si quieres gastarlo.`);
  }
}

export const URL_BASE_OPENROUTER = 'https://openrouter.ai/api/v1';
const URL_OPENROUTER = `${URL_BASE_OPENROUTER}/chat/completions`;

export function cabecerasOpenRouter(clave) {
  return {
    Authorization: `Bearer ${clave}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': process.env.SITIO_URL || 'https://enfrentando-a-las-ias.local',
    'X-Title': 'Enfrentando a las IAs',
  };
}

// Mensaje corto y sin datos de la cuenta. Lo que se guarda en data/ es publico: los errores
// quedan dentro de cada partida, y las respuestas de error de OpenRouter pueden traer un user_id.
export function mensajeDeError(json, cuerpo) {
  const crudo = json?.error?.message ?? cuerpo;
  return String(crudo)
    .replace(/"?user_id"?\s*[:=]\s*"?[\w-]+"?/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

export async function llamarModelo({
  modelo,
  sistema,
  usuario,
  // Holgado a proposito: los modelos que razonan gastan tokens antes de contestar y, con 500,
  // varios se quedaban sin espacio y no llegaban a dar su jugada. Los valores comunes viven en src/parametros.js.
  maxTokens = PARAMETROS.maxTokens,
  temperatura = PARAMETROS.temperatura,
  // "medium" o null (valor por defecto del modelo): lo trae el contendiente (CONTENDIENTES[...].razonamiento).
  razonamiento = null,
  reintentos = 2,
}) {
  exigirModoPago(modelo);
  const clave = process.env.OPENROUTER_API_KEY;
  if (!clave) {
    throw new Error('Falta OPENROUTER_API_KEY. Copia .env.example a .env y pon tu llave.');
  }

  let ultimoError;
  for (let intento = 0; intento <= reintentos; intento++) {
    try {
      const respuesta = await fetch(URL_OPENROUTER, {
        method: 'POST',
        headers: cabecerasOpenRouter(clave),
        body: JSON.stringify({ model: modelo, ...cuerpoDeLlamada({ sistema, usuario, maxTokens, temperatura, razonamiento }) }),
      });

      const cuerpo = await respuesta.text();
      let json = null;
      try { json = JSON.parse(cuerpo); } catch { /* el cuerpo no es JSON */ }

      if (!respuesta.ok) {
        throw new Error(`OpenRouter ${respuesta.status}: ${mensajeDeError(json, cuerpo)}`);
      }
      // OpenRouter a veces contesta 200 con un error adentro (el proveedor fallo a media respuesta).
      if (json?.error) throw new Error(`OpenRouter: ${mensajeDeError(json, cuerpo)}`);

      const eleccion = json?.choices?.[0];
      if (eleccion?.finish_reason === 'error') {
        throw new Error('El proveedor interrumpió la respuesta con un error (finish_reason=error).');
      }
      return {
        texto: eleccion?.message?.content ?? '',
        uso: json?.usage ?? null,
        // "length" = el modelo se quedo sin max_tokens (tipico de los que razonan antes de contestar).
        finishReason: eleccion?.finish_reason ?? null,
      };
    } catch (err) {
      ultimoError = err;
      if (intento < reintentos) {
        await new Promise((r) => setTimeout(r, 800 * (intento + 1)));
      }
    }
  }
  throw ultimoError;
}

// Los modelos a veces envuelven el JSON en ```json o lo acompanan de texto.
export function extraerJSON(texto) {
  if (!texto) return null;
  let t = String(texto).trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const inicio = t.indexOf('{');
  const fin = t.lastIndexOf('}');
  if (inicio < 0 || fin <= inicio) return null;
  try {
    return JSON.parse(t.slice(inicio, fin + 1));
  } catch {
    return null;
  }
}
