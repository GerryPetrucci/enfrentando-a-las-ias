// Cliente de la Batch API de OpenRouter: manda varias peticiones juntas a MITAD de precio y las recoge cuando terminan
// (en las pruebas de OpenRouter la mediana fue de 7 minutos y el 90% terminaba en menos de una hora; el maximo es 24 horas).
// Documentacion: https://openrouter.ai/docs/batch-quickstart
//
// Lo que hay que saber:
//   - Un lote es de UN solo modelo (el id base, sin ":batch"; OpenRouter elige la variante de lote). Sin variante de lote, 400.
//   - El orden de los campos importa: endpoint, model y despues requests (si requests va primero, 400). JSON.stringify respeta
//     el orden en que se arma el objeto.
//   - Los resultados llegan EN la respuesta del lote cuando termina (results[], cada uno con `response` o `error`). El uso de
//     tokens y el costo vienen por LOTE, no por peticion: `repartirUso` los reparte.
//   - No hay llave de idempotencia: enviar dos veces cobra dos veces. Por eso enviar NO se reintenta nunca; consultar si.
//   - Como cualquier llamada que gasta credito, pasa por exigirModoPago (el seguro de src/modelos.js).

import { URL_BASE_OPENROUTER, cabecerasOpenRouter, mensajeDeError, exigirModoPago } from './modelos.js';

const TERMINALES = new Set(['completed', 'failed', 'expired', 'cancelled']);
export const esTerminal = (estado) => TERMINALES.has(estado);

export function crearClienteLote({
  clave = process.env.OPENROUTER_API_KEY,
  fetchFn = (...a) => globalThis.fetch(...a),
  pausa = (ms) => new Promise((r) => setTimeout(r, ms)),
  ahora = () => Date.now(),
  base = URL_BASE_OPENROUTER,
} = {}) {
  const exigirLlave = () => {
    if (!clave) throw new Error('Falta OPENROUTER_API_KEY. Copia .env.example a .env y pon tu llave.');
  };

  async function pedir(metodo, ruta, cuerpo) {
    const respuesta = await fetchFn(`${base}${ruta}`, { method: metodo, headers: cabecerasOpenRouter(clave), ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}) });
    const texto = await respuesta.text();
    let json = null;
    try { json = JSON.parse(texto); } catch { /* el cuerpo no es JSON */ }
    if (!respuesta.ok) {
      const error = new Error(`OpenRouter ${respuesta.status}: ${mensajeDeError(json, texto)}`);
      error.status = respuesta.status;
      throw error;
    }
    return json;
  }

  // Leer es seguro: se reintentan los errores de red, de limite (429) y del servidor (5xx), hasta 3 intentos.
  async function leer(ruta) {
    let ultimo;
    for (let intento = 1; intento <= 3; intento++) {
      try {
        return await pedir('GET', ruta);
      } catch (err) {
        ultimo = err;
        const reintentable = err.status === undefined || err.status === 429 || err.status >= 500;
        if (!reintentable || intento === 3) throw err;
        await pausa(2000 * intento);
      }
    }
    throw ultimo;
  }

  return {
    // modelo: id base (por ejemplo "anthropic/claude-haiku-5.5"). peticiones: [{ id, cuerpo }] con el cuerpo de cuerpoDeLlamada().
    async enviar({ modelo, peticiones }) {
      exigirModoPago(modelo);
      exigirLlave();
      const lote = await pedir('POST', '/batches', {
        endpoint: '/v1/chat/completions',
        model: modelo,
        requests: peticiones.map((p) => ({ custom_id: p.id, body: p.cuerpo })),
      });
      if (!lote?.id) throw new Error('OpenRouter acepto el lote pero no devolvio su id.');
      return lote;
    },

    consultar(id) {
      exigirLlave();
      return leer(`/batches/${id}`);
    },

    // Consulta cada `cadaMs` hasta un estado final y lo devuelve (completed, failed, expired o cancelled).
    // Un lote recien creado puede dar 404 unos instantes aunque exista (visto el 10 de octubre de 2026: los 3 lotes del ensayo
    // dieron 404 al primer sondeo y 20 s despues estaban in_progress). Durante `graciaMs` se sigue sondeando; pasado ese margen
    // el 404 es real (id equivocado) y se lanza. Abandonar un lote ya enviado pierde sus resultados pero se cobra igual.
    async esperar(id, { cadaMs = 15000, maxMs = 25 * 3600 * 1000, graciaMs = 2 * 60 * 1000, alCambiar = () => {} } = {}) {
      const inicio = ahora();
      let anterior;
      for (;;) {
        let lote;
        try {
          lote = await this.consultar(id);
        } catch (err) {
          if (err.status === 404 && ahora() - inicio < graciaMs) { await pausa(cadaMs); continue; }
          throw err;
        }
        if (lote.status !== anterior) { alCambiar(lote.status, lote); anterior = lote.status; }
        if (esTerminal(lote.status)) return lote;
        if (ahora() - inicio >= maxMs) throw new Error(`se acabo la espera del lote ${id} (${Math.round(maxMs / 60000)} min); sigue en OpenRouter`);
        await pausa(cadaMs);
      }
    },

    async credito() {
      exigirLlave();
      const j = await leer('/credits');
      const total = Number(j?.data?.total_credits ?? 0), usado = Number(j?.data?.total_usage ?? 0);
      return { total, usado, restante: total - usado };
    },
  };
}

// results[] de un lote terminado -> Map(custom_id -> { texto, finishReason } | { error })
export function leerResultados(lote) {
  const mapa = new Map();
  for (const item of lote?.results ?? []) {
    if (item.error) {
      mapa.set(item.custom_id, { error: mensajeDeError(item.error.message ? { error: item.error } : null, JSON.stringify(item.error)) });
      continue;
    }
    const estado = item.response?.status_code ?? 200;
    const cuerpo = item.response?.body ?? item.response;
    if (estado !== 200) {
      mapa.set(item.custom_id, { error: `HTTP ${estado}: ${mensajeDeError(cuerpo, JSON.stringify(cuerpo))}` });
      continue;
    }
    const eleccion = cuerpo?.choices?.[0];
    if (eleccion?.finish_reason === 'error') {
      mapa.set(item.custom_id, { error: 'El proveedor interrumpió la respuesta con un error (finish_reason=error).' });
      continue;
    }
    mapa.set(item.custom_id, { texto: eleccion?.message?.content ?? '', finishReason: eleccion?.finish_reason ?? null });
  }
  return mapa;
}

// El uso y el costo vienen por lote; se reparten en partes iguales entre las peticiones que se cobraron (aproximacion).
export function repartirUso(lote) {
  const n = lote?.request_counts?.completed ?? 0;
  const u = lote?.usage;
  if (!n || !u) return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, costo: 0 };
  return {
    prompt_tokens: Math.round((u.prompt_tokens ?? 0) / n),
    completion_tokens: Math.round((u.completion_tokens ?? 0) / n),
    total_tokens: Math.round((u.total_tokens ?? 0) / n),
    costo: +((u.cost ?? 0) / n).toFixed(9),
  };
}
