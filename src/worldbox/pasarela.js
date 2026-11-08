import { randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { crearLimitador } from '../limitador.js';
import { PARAMETROS } from '../parametros.js';
import { validarRespuesta } from './contrato-acciones.js';
import { conTiempo, entero, exigir, ErrorArena } from './util.js';

// No importa modelos.js en bots/pruebas: ese modulo carga .env al importarse.
export function llamarReal(opciones) {
  exigir(opciones.modo === 'pago', 'pago_no_autorizado');
  return new Promise((resolve, reject) => {
    const { signal, ...datos } = opciones;
    const worker = new Worker(new URL('./trabajador-modelo.js', import.meta.url), { workerData: datos });
    const abortar = () => { worker.terminate(); reject(new ErrorArena('tiempo_agotado')); };
    signal?.addEventListener('abort', abortar, { once: true });
    const limpiar = () => signal?.removeEventListener('abort', abortar);
    worker.once('message', r => { limpiar(); worker.terminate(); r.error ? reject(new ErrorArena(r.error)) : resolve(r); });
    worker.once('error', () => { limpiar(); reject(new ErrorArena('proveedor')); });
    worker.once('exit', () => { limpiar(); reject(new ErrorArena('proveedor')); });
    if (signal?.aborted) abortar();
  });
}

export function crearPasarela({ llamar = llamarReal, modo, presupuesto = 0, presupuestoModelo = presupuesto, tarifas = {},
  maxTokens = PARAMETROS.maxTokens, timeoutMs = 30000, reintentos = 1, umbralCircuito = 3, recuperacionMs = 30000,
  limitador = crearLimitador({ porMinuto: 20 }), ahora = Date.now } = {}) {
  exigir(Number.isFinite(presupuesto) && presupuesto >= 0 && Number.isFinite(presupuestoModelo) && presupuestoModelo >= 0);
  exigir(entero(maxTokens, 1, PARAMETROS.maxTokens) && entero(timeoutMs, 1, 120000) && entero(reintentos, 0, 3) && entero(umbralCircuito, 1, 100));
  if (llamar === llamarReal) exigir(modo === 'pago', 'pago_no_autorizado');
  let total = 0;
  const modelos = new Map(), circuitos = new Map();
  return {
    configuracion: { maxTokens, temperatura: PARAMETROS.temperatura, timeoutMs, reintentos, umbralCircuito, recuperacionMs, presupuesto, presupuestoModelo, tarifas: structuredClone(tarifas) },
    consumo: () => ({ total, modelos: Object.fromEntries(modelos) }),
    async decidir({ modelo, sistema, usuario, maxAcciones = 3, razonamiento = null, limiteMs = timeoutMs, limiteTokens = Infinity }) {
      const inicio = ahora(), tarifa = tarifas[modelo];
      const resultado = { texto: '', respuesta: null, request_id: randomUUID(), latency_ms: 0, input_tokens: 0, output_tokens: 0,
        cost: 0, cost_source: 'reportado', error_type: null, retry_count: 0, intentos: [] };
      const terminar = codigo => ({ ...resultado, error_type: codigo, latency_ms: Math.max(0, ahora() - inicio) });
      if (!tarifa || ![tarifa.entrada, tarifa.salida].every(v => Number.isFinite(v) && v >= 0)) return terminar('tarifa_requerida');
      if ((circuitos.get(modelo)?.hasta ?? 0) > ahora()) return terminar('circuito_abierto');
      // Bytes UTF-8 es una cota conservadora de tokens de texto, mas envoltura del chat.
      const entradaMax = Buffer.byteLength(sistema + usuario, 'utf8') + 256;
      const reserva = (entradaMax * tarifa.entrada + maxTokens * tarifa.salida) / 1e6;
      const plazo = inicio + Math.min(limiteMs, timeoutMs);
      for (let intento = 0; intento <= reintentos; intento++) {
        if (resultado.input_tokens + resultado.output_tokens + entradaMax + maxTokens > limiteTokens) return terminar('limite_tokens');
        if (total + reserva > presupuesto + 1e-12 || (modelos.get(modelo) ?? 0) + reserva > presupuestoModelo + 1e-12) return terminar('presupuesto');
        if (ahora() >= plazo) return terminar('tiempo_agotado');
        try { await conTiempo(() => limitador.esperar(), Math.max(1, plazo - ahora())); }
        catch { return terminar('tiempo_agotado'); }
        if (ahora() >= plazo) return terminar('tiempo_agotado');
        // Reservar ANTES de invocar, incluso si hay decisiones concurrentes.
        if (total + reserva > presupuesto + 1e-12 || (modelos.get(modelo) ?? 0) + reserva > presupuestoModelo + 1e-12) return terminar('presupuesto');
        total += reserva; modelos.set(modelo, (modelos.get(modelo) ?? 0) + reserva);
        let r, error = null, tipo = 'tecnico', costo = reserva, fuente = 'estimado', input = entradaMax, output = maxTokens, textoIntento = '';
        const requestId = randomUUID();
        try {
          r = await conTiempo(signal => llamar({ modelo, sistema, usuario, maxTokens, razonamiento, reintentos: 0, modo, signal, request_id: requestId }), Math.max(1, plazo - ahora()));
          const uso = r.uso ?? {};
          input = entero(uso.prompt_tokens, 0, 1e9) ? uso.prompt_tokens : entradaMax;
          output = entero(uso.completion_tokens, 0, 1e9) ? uso.completion_tokens : maxTokens;
          if (Number.isFinite(uso.cost) && uso.cost >= 0) { costo = uso.cost; fuente = 'reportado'; }
          else costo = (input * tarifa.entrada + output * tarifa.salida) / 1e6;
          resultado.texto = typeof r.texto === 'string' ? r.texto.slice(0, 100000) : '';
          textoIntento = resultado.texto.slice(0, 20000);
          // Un fallo del PROVEEDOR a media respuesta es tecnico. Todo lo demas que falle es CONTENIDO del modelo
          // (cortado por longitud, vacio, JSON roto, esquema de respuesta incorrecto): se pierde la decision y NO se reintenta.
          if (r.finishReason === 'error') { error = 'proveedor'; tipo = 'tecnico'; }
          else if (r.finishReason === 'length' || !resultado.texto) { error = 'respuesta_incompleta'; tipo = 'contenido'; }
          else {
            const v = validarRespuesta(resultado.texto, { maxAcciones });
            if (!v.ok) { error = v.error; tipo = 'contenido'; }
            else resultado.respuesta = v;
          }
        } catch (e) {
          error = e.codigo === 'tiempo_agotado' ? 'tiempo_agotado' : e.codigo === '429' || e.status === 429 || /\b429\b/.test(e.message) ? '429' : 'proveedor';
        }
        total += costo - reserva; modelos.set(modelo, modelos.get(modelo) + costo - reserva);
        resultado.input_tokens += input; resultado.output_tokens += output; resultado.cost += costo;
        if (fuente === 'estimado') resultado.cost_source = fuente;
        resultado.retry_count = intento;
        const efectivo = typeof r?.razonamiento_efectivo === 'string' ? r.razonamiento_efectivo.slice(0, 30) : null;
        if (efectivo) resultado.razonamiento_efectivo = efectivo;
        // La traza privada guarda el texto de CADA intento (acotado): permite explicar por que se perdio una decision.
        resultado.intentos.push({ request_id: requestId, input_tokens: input, output_tokens: output, cost: costo, cost_source: fuente, error_type: error, tipo_error: error ? tipo : null, texto: textoIntento, razonamiento_efectivo: efectivo });
        if (total > presupuesto + 1e-12 || modelos.get(modelo) > presupuestoModelo + 1e-12) return terminar('presupuesto_excedido');
        if (!error) { circuitos.delete(modelo); return terminar(null); }
        // El proveedor SI contesto: un fallo de contenido ni se reintenta ni cuenta para el circuito.
        if (tipo === 'contenido') { circuitos.delete(modelo); return terminar(error); }
        const fallos = (circuitos.get(modelo)?.fallos ?? 0) + 1;
        circuitos.set(modelo, { fallos, hasta: fallos >= umbralCircuito ? ahora() + recuperacionMs : 0 });
        // Un timeout puede seguir cobrandose remotamente: no duplicar la solicitud.
        if (error === 'tiempo_agotado' || fallos >= umbralCircuito || intento === reintentos) return terminar(error);
      }
    },
  };
}
