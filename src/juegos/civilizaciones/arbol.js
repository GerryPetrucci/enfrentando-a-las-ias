// Contrato arbol-1: hitos historicos y condiciones compuestas, sin costos ni efectos.
// Modulo preparatorio; el motor 1.5.0 conserva su catalogo hasta la migracion.
export const VERSION_ARBOL = 'arbol-1';

export function progreso(requisito, hitos) {
  if (typeof requisito === 'string') {
    return { cumple: hitos.has(requisito), nodo: requisito };
  }
  const opciones = requisito.opciones.map((r) => progreso(r, hitos));
  const completadas = opciones.filter((r) => r.cumple).length;
  return { cumple: completadas >= requisito.minimo,
    completadas, necesarias: requisito.minimo, opciones };
}

// Rechaza referencias, umbrales y ciclos invalidos antes de usar un catalogo.
// Un ciclo se rechaza incluso si una alternativa permitiria esquivarlo:
// las temporadas son grafos aciclicos, no sistemas de puntos fijos.
export function validarArbol(nodos) {
  if (!Array.isArray(nodos) || nodos.length === 0) throw new Error('catalogo vacio');
  const porId = new Map();
  for (const n of nodos) {
    if (!n || typeof n.id !== 'string' || !n.id.trim() || porId.has(n.id)) {
      throw new Error('id invalido o duplicado');
    }
    porId.set(n.id, n);
  }
  const enlaces = new Map();
  for (const n of nodos) {
    const referencias = [];
    const recorrer = (r) => {
      if (typeof r === 'string') {
        if (!porId.has(r)) throw new Error(`referencia desconocida: ${r}`);
        referencias.push(r);
        return;
      }
      if (!r || !Array.isArray(r.opciones) || !Number.isInteger(r.minimo)
        || r.minimo < 0 || r.minimo > r.opciones.length
        || (r.opciones.length > 0 && r.minimo === 0)) {
        throw new Error(`umbral invalido: ${n.id}`);
      }
      // Una opcion duplicada no puede contar como dos ramas.
      const claves = r.opciones.map(clave);
      if (new Set(claves).size !== claves.length) throw new Error(`opcion duplicada: ${n.id}`);
      r.opciones.forEach(recorrer);
    };
    recorrer(n.requiere);
    enlaces.set(n.id, referencias);
  }
  const visitados = new Set(), activos = new Set();
  const visitar = (id) => {
    if (activos.has(id)) throw new Error(`ciclo: ${id}`);
    if (visitados.has(id)) return;
    activos.add(id);
    enlaces.get(id).forEach(visitar);
    activos.delete(id);
    visitados.add(id);
  };
  nodos.forEach((n) => visitar(n.id));
  return true;
}

function clave(r) {
  if (typeof r === 'string') return JSON.stringify(r);
  if (!r || !Array.isArray(r.opciones)) throw new Error('requisito invalido');
  return JSON.stringify([r.minimo, r.opciones.map(clave).sort()]);
}

// Solo elegibilidad por dependencias; pagar y ejecutar sigue siendo del motor.
export function opcionesDelArbol(nodos, hitos) {
  validarArbol(nodos);
  const conocidos = new Set(hitos);
  return nodos.filter((n) => !conocidos.has(n.id)).map((n) => ({
    id: n.id, ...progreso(n.requiere, conocidos),
  }));
}
