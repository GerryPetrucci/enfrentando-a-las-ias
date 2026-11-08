import { randomUUID } from 'node:crypto';
import { normalizarInfo, normalizarTerminal, normalizarEjecucion, normalizarReinicio, normalizarAvance } from './adaptador.js';
import { construirObservacion } from './observacion.js';
import { ErrorArena, exigir, entero, conTiempo, PROTOCOLO } from './util.js';

export function crearAdaptadorHttp({ url = 'http://127.0.0.1:47600', token, timeoutMs = 5000, reintentos = 1, umbralCircuito = 3, recuperacionMs = 30000, ahora = Date.now } = {}) {
  const base = new URL(url);
  exigir(base.protocol === 'http:' && base.hostname === '127.0.0.1' && base.pathname === '/' && !base.search && !base.hash && !base.username && !base.password, 'solo_loopback');
  exigir(typeof token === 'string' && token.length > 0 && !/[\r\n]/.test(token), 'no_autorizado');
  exigir(entero(timeoutMs, 1, 120000) && entero(reintentos, 0, 3) && entero(umbralCircuito, 1, 100));
  let fallos = 0, abiertoHasta = 0;
  const codigos = new Set(['no_autorizado', 'protocolo_incompatible', 'no_listo', 'solicitud_invalida', 'no_soportado', 'juego_ocupado', 'tiempo_agotado', 'error_interno']);
  // `presentacion`: camara e interfaz para grabar. Sus fallos NO cuentan para el circuito ni se reintentan: la partida no depende de ellas.
  async function pedir(ruta, datos, { presentacion = false } = {}) {
    if (abiertoHasta > ahora()) throw new ErrorArena('circuito_abierto');
    const id = datos === undefined ? null : datos.id_solicitud ?? randomUUID(); // se conserva en los reintentos (idempotencia)
    const cuerpo = datos === undefined ? undefined : JSON.stringify({ ...datos, protocolo: PROTOCOLO, id_solicitud: id });
    for (let intento = 0; intento <= reintentos; intento++) {
      try {
        const x = await conTiempo(async signal => {
          const respuesta = await fetch(new URL(ruta, base), { method: cuerpo ? 'POST' : 'GET', headers: { 'X-Puente-Token': token, 'Content-Type': 'application/json' }, body: cuerpo, signal, redirect: 'error' });
          // Limite del cuerpo tambien durante streaming y dentro del timeout.
          let texto = '', bytes = 0;
          const decoder = new TextDecoder();
          for await (const bloque of respuesta.body) { bytes += bloque.length; exigir(bytes <= 1_000_000, 'respuesta_invalida'); texto += decoder.decode(bloque, { stream: true }); }
          texto += decoder.decode();
          let json; try { json = JSON.parse(texto); } catch { throw new ErrorArena('respuesta_invalida'); }
          exigir(json.protocolo === PROTOCOLO, 'protocolo_incompatible');
          if (!respuesta.ok || json.ok !== true) throw new ErrorArena(codigos.has(json.error?.codigo) ? json.error.codigo : 'error_interno');
          return json;
        }, timeoutMs);
        if (!presentacion) { fallos = 0; abiertoHasta = 0; }
        // El id lo pone el CLIENTE (no el servidor): queda en la respuesta normalizada para cruzar el log con la traza del mod.
        return id ? { ...x, id_solicitud: id } : x;
      } catch (e) {
        const error = e instanceof ErrorArena ? e : new ErrorArena('conexion');
        if (presentacion) throw error;
        if (['no_autorizado', 'protocolo_incompatible', 'solicitud_invalida', 'no_soportado', 'respuesta_invalida'].includes(error.codigo)) throw error;
        fallos++;
        if (fallos >= umbralCircuito) { abiertoHasta = ahora() + recuperacionMs; throw error; }
        if (intento === reintentos) throw error;
      }
    }
  }
  return {
    async info() { return normalizarInfo({ ...await pedir('/v1/info'), origen: 'puente' }); },
    // Devuelve el hash del mundo y la semilla que el puente dice haber usado: el orquestador los registra para auditar.
    async reiniciarEscenario(datos) { return normalizarReinicio(await pedir('/v1/escenario/reiniciar', datos)); },
    async observar(id) { return construirObservacion({ ...await pedir(`/v1/observacion?faccion=${encodeURIComponent(id)}`), origen: 'puente' }).observation; },
    async ejecutar(datos) { return normalizarEjecucion(await pedir('/v1/accion', datos)); },
    async avanzar(datos) { return normalizarAvance(await pedir('/v1/avanzar', datos)); },
    async estadoTerminal() { return normalizarTerminal(await pedir('/v1/estado-terminal')); },
    // Presentacion para grabar video (no son acciones del juego). Solo se llaman si info.capacidades.camara / interfaz son true.
    // camara: {faccion, zoom?} enfoca a una faccion; {liberar: true} suelta la camara. interfaz: {visible} muestra u oculta la interfaz del juego.
    // modo 'limpio' por omision: sin el panel de la unidad enfocada (el modo 'juego' lo muestra y ensucia el video).
    async camara(datos) { await pedir('/v1/camara', datos?.liberar ? datos : { modo: 'limpio', ...datos }, { presentacion: true }); return { hecho: true }; },
    async interfaz(datos) { await pedir('/v1/interfaz', datos, { presentacion: true }); return { hecho: true }; },
    async cerrar() { try { await pedir('/v1/cerrar', {}); return { cerrado: true }; } catch (e) { if (e.codigo === 'no_soportado') return { cerrado: false }; throw e; } },
  };
}
