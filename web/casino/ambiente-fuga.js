// Presentación de hechos YA registrados. No decide rutas ni recalcula reglas.
export const LUGARES_PIXEL = {
  'r1-celda': 'bloque', 'r2-mantenimiento': 'servicio', 'r2-control': 'control', 'r2-galeria': 'galeria',
  'r3-ductos': 'servicio', 'r3-taller': 'servicio', 'r3-archivo': 'archivo', 'r3-pasillo': 'galeria',
  'r4-servicio': 'patio', 'r4-patio': 'patio', 'r5-almacen': 'almacen', 'r5-control': 'control', 'r5-patrulla': 'patio',
  'r6-desague': 'tunel', 'r6-reja': 'muro', 'r6-porton': 'vehiculos', 'r7-foso': 'foso', 'r7-puerta': 'vehiculos',
  'r8-alcantarilla': 'tunel', 'r8-muro': 'muro', 'r8-vehiculos': 'vehiculos', 'r9-exterior': 'exterior',
};
const CLASICOS = { celda: 'bloque', panel: 'servicio', lavanderia: 'servicio', cocina: 'servicio', enfermeria: 'archivo', ronda: 'control', camara: 'galeria', escalera: 'galeria', patio: 'patio', perros: 'patio', taller: 'almacen', reja: 'muro', turno: 'control', foco: 'patio', zanja: 'foso', basura: 'vehiculos', muro: 'muro', alambre: 'muro', reflectores: 'patio', alcantarilla: 'tunel', vehiculos: 'vehiculos', foso: 'foso', final: 'control', camioneta: 'vehiculos' };
export function ambientesDePartida(partida) {
  const memoria = new Map();
  return (partida?.rondas ?? []).map((r) => {
    const nodo = r.situacion?.rama, familia = LUGARES_PIXEL[nodo] ?? CLASICOS[r.situacion?.id] ?? ({ interior: 'galeria', patio: 'patio', perimetro: 'exterior' }[r.situacion?.fase]);
    const estado = (despues) => {
      if (!familia) return null;
      const activos = [...memoria.values()].filter((h) => h.ronda <= r.ronda && h.hasta >= r.ronda);
      const tiene = (tipo) => activos.some((h) => h.tipo === tipo);
      const equipo = [0, 1].map((actor) => {
        const suyos = [...memoria.values()].filter((h) => h.actor === actor && h.ronda <= r.ronda);
        const credencial = suyos.find((h) => h.tipo === 'credencial');
        const cuerda = suyos.find((h) => h.tipo === 'cuerda');
        return {
          credencialHasta: credencial?.hasta ?? null,
          credencial: !credencial ? null : suyos.some((h) => h.tipo === 'credencial_detectada') ? 'detectada' : credencial.hasta < r.ronda ? 'caducada' : 'vigente',
          cuerda: !cuerda ? null : suyos.some((h) => h.tipo === 'cuerda_gastada') ? 'usada' : cuerda.hasta < r.ronda ? 'caducada' : 'disponible',
        };
      });
      return { familia, nodo, lugar: r.trama?.lugar ?? r.situacion?.titulo ?? 'Situación registrada', ronda: r.ronda, causal: !!r.trama,
        fase: r.situacion.fase, equipo,
        puerta: tiene('puerta_forzada'), borrado: tiene('rastro_borrado'),
        patrulla: despues && (r.trama?.eventos ?? []).some((e) => e.tipo === 'consecuencia' && e.causa === 'puerta_forzada'),
      };
    };
    const antes = estado(false);
    for (const e of r.trama?.eventos ?? []) if (e.visibilidad === 'publica' && e.tipo !== 'consecuencia' && typeof e.id === 'string' && !memoria.has(e.id)) memoria.set(e.id, { ...e });
    return { antes, despues: estado(true) };
  });
}

export function rotuloAmbiente(a, asiento = null) {
  if (a.causal === false) return { clase: 'normal', texto: 'Registro clásico', detalle: 'Escenario de la situación' };
  if (a.patrulla) return { clase: 'patrulla', texto: 'Patrulla alertada', detalle: 'Encontraron la puerta forzada' };
  const equipo = a.equipo?.[asiento];
  if (equipo?.credencial) return {
    clase: equipo.credencial === 'vigente' ? 'borrado' : 'rastro',
    texto: `Credencial ${equipo.credencial}`,
    detalle: equipo.credencial === 'vigente' ? `Personal · hasta el tramo ${equipo.credencialHasta}` : 'Ya no facilita los controles',
  };
  if (equipo?.cuerda) return {
    clase: equipo.cuerda === 'disponible' ? 'borrado' : 'normal',
    texto: `Cuerda ${equipo.cuerda}`,
    detalle: equipo.cuerda === 'disponible' ? 'Personal · un solo uso' : 'Quedó atrás en el recorrido',
  };
  if (a.borrado) return { clase: 'borrado', texto: 'Rastro borrado', detalle: 'La puerta ya no los delata' };
  if (a.puerta) return { clase: 'rastro', texto: 'Rastro sin borrar', detalle: a.familia === 'bloque' ? 'Puerta forzada' : 'Desde el bloque de celdas' };
  return { clase: 'normal', texto: 'Acceso en observación', detalle: 'Sin rastro de puerta forzada' };
}
