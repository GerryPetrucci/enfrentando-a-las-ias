// Adaptador de revisión local. No participa en grabaciones ni decide reglas.
export async function reconstruirHasta(mesas, beats, indice, mudo) {
  const hasta = Math.max(0, Math.min(beats.length - 1, Math.trunc(Number(indice) || 0)));
  for (const mesa of mesas) {
    const sonido = mesa.sfx;
    mesa.sfx = mudo; mesa.rapido = true;
    try { for (let i = 0; i <= hasta; i++) await mesa.ejecutar(beats[i], 1); }
    finally { mesa.rapido = false; mesa.sfx = sonido; }
  }
  return hasta;
}

export function instalarRevision({ estado, comando }, ventana = window) {
  if (ventana.parent === ventana || new URLSearchParams(ventana.location.search).get('revision') !== '1') return () => {};
  let origen = null, pendiente = Promise.resolve();
  const sesion = new URLSearchParams(ventana.location.search).get('revisionId') ?? '';
  const publicar = () => { if (origen) ventana.parent.postMessage({ tipo:'revision-estado', sesion, estado:estado() }, origen); };
  ventana.addEventListener('message', (e) => {
    if (e.source !== ventana.parent || e.data?.tipo !== 'revision-comando') return;
    if ((e.data.sesion ?? '') !== sesion) return;
    let url; try { url = new URL(e.origin); } catch { return; }
    if (url.protocol !== 'http:' || !['127.0.0.1','localhost'].includes(url.hostname)) return;
    origen = e.origin;
    pendiente = pendiente.then(async () => {
      await comando(e.data.accion, e.data.valor); publicar();
    }).catch((e) => { ventana.parent.postMessage({tipo:'revision-error',sesion,error:e.message},origen); });
  });
  // El padre puede pedir estado antes de que termine de cargar la partida.
  try { const url = new URL(ventana.document.referrer); if (url.protocol === 'http:' && ['127.0.0.1','localhost'].includes(url.hostname)) origen = url.origin; } catch { /* pedir estado por el canal validado */ }
  publicar(); return publicar;
}
