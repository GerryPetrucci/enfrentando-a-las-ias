import { parentPort, workerData } from 'node:worker_threads';
// Solo se arranca despues de --modelos + --modo=pago y de reservar presupuesto.
if (workerData?.modo !== 'pago') throw new Error('pago_no_autorizado');
try {
  const { llamarModelo, fijarModo, exigirModoPago, CONTENDIENTES } = await import('../modelos.js');
  fijarModo('pago'); exigirModoPago(workerData.modelo);
  const contendiente = Object.values(CONTENDIENTES).find(c => c.modelo === workerData.modelo);
  // El nivel de razonamiento que se APLICA (el del contendiente registrado manda sobre el pedido) viaja de vuelta para la traza.
  const razonamiento = contendiente ? contendiente.razonamiento : workerData.razonamiento;
  const r = await llamarModelo({ ...workerData, razonamiento });
  parentPort.postMessage({ texto: r.texto, uso: r.uso, finishReason: r.finishReason, razonamiento_efectivo: razonamiento ?? null });
} catch (e) {
  parentPort.postMessage({ error: /\b429\b/.test(e.message) ? '429' : 'proveedor' });
}
