// Parametros de llamada COMUNES a todas las IAs. Son parte del contrato: se congelan junto con el prompt y cambiarlos entre partidas
// tambien las vuelve incomparables.
//
// Razonamiento (decidido el 9 de octubre de 2026): siempre "medium" en los modelos que lo admiten, nunca el maximo. El
// razonamiento oculto se cobra como salida y en los modelos caros (Claude Sonnet 5.5 razona por defecto en "high") cuesta mucho
// mas sin cambiar lo que se mide. Los modelos que no tienen niveles (DeepSeek V3.2, Llama, Laguna, Ling) usan su valor por
// defecto: lo que admite cada contendiente esta en `razonamiento` de src/modelos.js y se verifica con herramientas/verificar-modelos.mjs.
//
// Nota: Claude Sonnet y Haiku 5.5 y los GPT-6 no aceptan `temperature` (OpenRouter la ignora para ellos); la temperatura 0.7
// solo se aplica de verdad en los modelos que la admiten.

// max_tokens incluye el razonamiento oculto. Subio de 2000 a 4000 el 10 de octubre de 2026: en el ensayo por lote, GPT Luna con
// razonamiento "medium" gasto 1,919-2,000 tokens pensando y 3 de sus 4 jugadas quedaron cortadas (Haiku y Flash-Lite cabian). El
// razonamiento NO se subio para darles espacio: se amplio el limite.
export const PARAMETROS = Object.freeze({ temperatura: 0.7, maxTokens: 4000, razonamiento: 'medium' });

// Cuerpo de una llamada de chat SIN el modelo (el modelo va aparte: en la llamada normal es `model`, en el lote va una vez por lote).
export function cuerpoDeLlamada({ sistema, usuario, maxTokens = PARAMETROS.maxTokens, temperatura = PARAMETROS.temperatura, razonamiento = null }) {
  return {
    max_tokens: maxTokens,
    temperature: temperatura,
    messages: [
      { role: 'system', content: sistema },
      { role: 'user', content: usuario },
    ],
    ...(razonamiento ? { reasoning: { effort: razonamiento } } : {}),
  };
}
