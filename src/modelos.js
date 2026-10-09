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
cargarEnv();

export const CONTENDIENTES = {
  claude: {
    nombre: 'Claude',
    modelo: 'anthropic/claude-sonnet-5.5',
    color: '#D4753E',
    inicial: 'C',
  },
  gpt: {
    nombre: 'GPT',
    modelo: 'openai/gpt-6.1-sol',
    color: '#2E9E83',
    inicial: 'G',
  },
  gemini: {
    nombre: 'Gemini',
    modelo: 'google/gemini-3.8-flash',
    color: '#4A7FD4',
    inicial: 'M',
  },
  llama: {
    nombre: 'Llama',
    modelo: 'meta-llama/llama-4-maverick',
    color: '#8B5FBF',
    inicial: 'L',
  },
  deepseek: {
    nombre: 'DeepSeek',
    // V3.2 y no V4: las V4 razonan sin limite y se cortaban hasta con 2000 tokens (probado el 9 oct 2026).
    modelo: 'deepseek/deepseek-v3.2',
    color: '#C94F6D',
    inicial: 'D',
  },
};

const URL_OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions';

// Mensaje corto y sin datos de la cuenta. Lo que se guarda en data/ es publico: los errores
// quedan dentro de cada partida, y las respuestas de error de OpenRouter pueden traer un user_id.
function mensajeDeError(json, cuerpo) {
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
  // varios se quedaban sin espacio y no llegaban a dar su jugada.
  maxTokens = 2000,
  temperatura = 0.7,
  reintentos = 2,
}) {
  const clave = process.env.OPENROUTER_API_KEY;
  if (!clave) {
    throw new Error('Falta OPENROUTER_API_KEY. Copia .env.example a .env y pon tu llave.');
  }

  let ultimoError;
  for (let intento = 0; intento <= reintentos; intento++) {
    try {
      const respuesta = await fetch(URL_OPENROUTER, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${clave}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.SITIO_URL || 'https://enfrentando-a-las-ias.local',
          'X-Title': 'Enfrentando a las IAs',
        },
        body: JSON.stringify({
          model: modelo,
          max_tokens: maxTokens,
          temperature: temperatura,
          messages: [
            { role: 'system', content: sistema },
            { role: 'user', content: usuario },
          ],
        }),
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
