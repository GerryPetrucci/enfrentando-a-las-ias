// Línea de tiempo del formato «era» (docs/worldbox-grabacion.md): eventos importantes con año de juego, segundos de juego y SEGUNDOS REALES desde que
// se dijo «Listo para grabar». Sirve para cortar y acelerar el video (herramientas/worldbox-cortes.mjs). Es presentación: no entra a las reglas.
export const VERSION_LINEA = 1;
const IMPORTANCIAS = ['alta', 'media', 'baja'];

// Evento del juego (GET /v1/era/estado) -> { tipo, descripcion, importancia } o null si no vale la pena. `nombre(id)` traduce f1/f2 al nombre del modelo.
export function describirEventoJuego(e, nombre = id => id) {
  const quien = id => (id ? nombre(id) : 'una civilización');
  switch (e.tipo) {
    case 'era_iniciada': return { tipo: 'fundacion', descripcion: 'Se funda el mundo y empiezan las dos civilizaciones', importancia: 'alta' };
    case 'muro_quitado': return { tipo: 'muro_cae', descripcion: 'Cae el muro de montaña', importancia: 'alta' };
    case 'guerra_declarada': return e.guerra_civil ? { tipo: 'guerra_civil', descripcion: `Guerra civil dentro de ${quien(e.faccion_a)}`, importancia: 'media' }
      : { tipo: 'guerra', descripcion: `Empieza la guerra entre ${quien(e.faccion_a)} y ${quien(e.faccion_b)}`, importancia: 'alta' };
    case 'guerra_terminada': return { tipo: 'paz', descripcion: 'Termina una guerra', importancia: 'media' };
    case 'reino_nuevo': return { tipo: 'reino_partido', descripcion: `Nace un reino nuevo${e.faccion ? ` dentro de ${quien(e.faccion)}` : ''}`, importancia: 'media' };
    case 'reino_eliminado': return { tipo: 'reino_cae', descripcion: `Cae un reino${e.faccion ? ` de ${quien(e.faccion)}` : ''}`, importancia: 'media' };
    case 'civilizacion_eliminada': return { tipo: 'eliminacion', descripcion: `${quien(e.faccion)} queda eliminada`, importancia: 'alta' };
    case 'ciudad_fundada': return { tipo: 'ciudad_fundada', descripcion: `${quien(e.faccion)} funda una ciudad`, importancia: 'baja' };
    case 'ciudad_destruida': return { tipo: 'ciudad_destruida', descripcion: `Se destruye una ciudad de ${quien(e.faccion)}`, importancia: 'media' };
    case 'ciudad_conquistada': return { tipo: 'ciudad_conquistada', descripcion: `${quien(e.a)} conquista una ciudad de ${quien(e.de)}`, importancia: 'alta' };
    case 'velocidad_cambiada': return { tipo: 'velocidad', descripcion: `El juego pasa de ${e.de} a ${e.a}`, importancia: 'media' };
    default: return null;
  }
}

export function crearLineaTiempo({ ahora = Date.now } = {}) {
  let t0 = null;
  const eventos = [];
  return {
    eventos,
    marcarInicio() { t0 = ahora(); },
    iniciada: () => t0 !== null,
    registrar({ tipo, descripcion, anio = null, t_juego_s = null, importancia = 'media', ...extra }) {
      if (!IMPORTANCIAS.includes(importancia)) throw new Error('importancia invalida');
      const e = { i: eventos.length, anio, t_juego_s, t_real_s: t0 === null ? null : Math.round((ahora() - t0) / 100) / 10, ...(t0 === null ? { previo: true } : {}), tipo, importancia, descripcion, ...extra };
      eventos.push(e);
      return e;
    },
    documento(meta = {}) {
      return { version: VERSION_LINEA, nota: 't_real_s = segundos reales desde «Listo para grabar» (null = ocurrió antes). t_juego_s = segundos de mundo desde la fundación (60 s = 1 año).', ...meta, eventos };
    },
  };
}
