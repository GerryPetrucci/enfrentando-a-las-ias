// Parametros de llamada COMUNES a todas las IAs. Son parte del contrato: se congelan junto con el prompt y cambiarlos entre partidas
// tambien las vuelve incomparables.
//
// Razonamiento (decidido el 9 de octubre de 2026): siempre "medium" en los modelos que lo admiten, nunca el maximo. El
// razonamiento oculto se cobra como salida y en los modelos caros (Claude Sonnet 5.5 razona por defecto en "high") cuesta mucho
// mas sin cambiar lo que se mide. Los modelos que no tienen niveles (DeepSeek V3.2, Llama, Laguna, Ling) usan su valor por
// defecto: lo que admite cada contendiente esta en `razonamiento` de src/modelos.js y se verifica con herramientas/verificar-modelos.mjs.
// Excepcion (25 de octubre de 2026): GLM 5.3 y Kimi K3.1 no ofrecen "medium" y su defecto es "max"; con "max" gastaron los 4000 tokens pensando
// y no contestaron. Como la regla es "nunca un nivel mayor que medium", usan "low" (el mas alto que no pasa de medium); ver razonamientoDe en
// herramientas/prueba-de-humo-modelos.mjs.
//
// Nota: Claude Sonnet y Haiku 5.5 y los GPT-6 no aceptan `temperature` (OpenRouter la ignora para ellos); la temperatura 0.7
// solo se aplica de verdad en los modelos que la admiten.

// max_tokens incluye el razonamiento oculto. Subio de 2000 a 4000 el 10 de octubre de 2026: en el ensayo por lote, GPT Luna con
// razonamiento "medium" gasto 1,919-2,000 tokens pensando y 3 de sus 4 jugadas quedaron cortadas (Haiku y Flash-Lite cabian). El
// razonamiento NO se subio para darles espacio: se amplio el limite.
// Subio de 4000 a 8000 el 26 de octubre de 2026, por orden del usuario («calidad antes que cantidad»: prefiere gastar mas credito y entregar la partida
// completa): con 4000, 10 de las 12 llamadas invalidas de las ultimas partidas eran respuestas cortadas por max_tokens (Haiku 6 de 25 en Guerra, todas del
// turno 18 al 24; GPT Luna 2; MiniMax 2 en Lobo) y el juego las reemplazaba por «pasa el turno». Es un tope, no un gasto: solo se cobra lo que cada llamada usa.
// Subio de 8000 a 16000 el 28 de octubre de 2026 (decision delegada por el usuario, con el mismo criterio «calidad antes que cantidad»): con el prompt COMPLETO de Guerra 2.3.0
// (docs/guia-de-prompts.md) los modelos usan lo que se les explica y razonan mas: Haiku paso de 2 577 a ~5 300 tokens de salida mediana y con 8000 se corto en 3 a 7 de cada 30 turnos
// reales; con 16000, en 0 de 30 (privado/spec/guerra-prompt-2.3.0.md). Sigue siendo un tope: solo se cobra lo que cada llamada usa (Haiku, ~$0.003 por turno).
// Las series guardadas antes llevan su propio `parametros` (4000 u 8000).
export const PARAMETROS = Object.freeze({ temperatura: 0.7, maxTokens: 16000, razonamiento: 'medium' });

// Cuerpo de una llamada de chat SIN el modelo (el modelo va aparte: en la llamada normal es `model`, en el lote va una vez por lote).
// `cachearSistema` (28 de octubre de 2026): Anthropic y Google solo guardan en cache el prefijo si la peticion lo marca (OpenAI, DeepSeek y GLM cachean solos). Es metadatos
// de la peticion: el TEXTO que recibe el modelo es el mismo, asi que no cambia el contrato ni el prompt. El sistema es identico en todas las llamadas de una partida.
export function cuerpoDeLlamada({ sistema, usuario, maxTokens = PARAMETROS.maxTokens, temperatura = PARAMETROS.temperatura, razonamiento = null, cachearSistema = false }) {
  return {
    max_tokens: maxTokens,
    temperature: temperatura,
    messages: [
      { role: 'system', content: cachearSistema ? [{ type: 'text', text: sistema, cache_control: { type: 'ephemeral' } }] : sistema },
      { role: 'user', content: usuario },
    ],
    ...(razonamiento ? { reasoning: { effort: razonamiento } } : {}),
  };
}
