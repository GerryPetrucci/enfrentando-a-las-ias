// Cliente de OpenRouter + registro de contendientes.
//
// IMPORTANTE: los IDs de modelo cambian cada pocos meses. Antes de grabar una
// temporada, verifica los vigentes en https://openrouter.ai/models y actualiza
// este archivo. La version exacta se guarda en cada resultado para que el
// marcador siempre diga "con que version se midio".

import { cargarEnv } from './env.js';
cargarEnv();

export const CONTENDIENTES = {
  claude: {
    nombre: 'Claude',
    modelo: 'anthropic/claude-sonnet-4.5',
    color: '#D4753E',
    inicial: 'C',
  },
  gpt: {
    nombre: 'GPT',
    modelo: 'openai/gpt-4.1',
    color: '#2E9E83',
    inicial: 'G',
  },
  gemini: {
    nombre: 'Gemini',
    modelo: 'google/gemini-2.5-pro',
    color: '#4A7FD4',
    inicial: 'M',
  },
  llama: {
    nombre: 'Llama',
    modelo: 'meta-llama/llama-3.3-70b-instruct',
    color: '#8B5FBF',
    inicial: 'L',
  },
  deepseek: {
    nombre: 'DeepSeek',
    modelo: 'deepseek/deepseek-chat',
    color: '#C94F6D',
    inicial: 'D',
  },
};

const URL_OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions';

export async function llamarModelo({
  modelo,
  sistema,
  usuario,
  maxTokens = 500,
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

      if (!respuesta.ok) {
        const cuerpo = await respuesta.text();
        throw new Error(`OpenRouter ${respuesta.status}: ${cuerpo.slice(0, 300)}`);
      }

      const json = await respuesta.json();
      return {
        texto: json.choices?.[0]?.message?.content ?? '',
        uso: json.usage ?? null,
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
