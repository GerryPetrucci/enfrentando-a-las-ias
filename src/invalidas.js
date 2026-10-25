// Las llamadas INVALIDAS de una partida guardada: que modelo, en que turno, por que y con que texto. Cada juego guarda esos datos donde le toca (Lobo en
// `privado.acciones`, la Guerra en `respuestas`, La Fuga y Duda y apuesta en `crudos`); aqui se leen todos igual, para analizarlas siempre del mismo modo.
// Una llamada es invalida si el motor la marco asi (`invalidas`, `invalida`) o si la API fallo (`errores`: respuesta cortada por max_tokens, sin JSON, red...).
// Puro: lo usan src/correr.js (resumen al terminar cada corrida) y herramientas/analizar-invalidas.mjs (detalle de cualquier resultado guardado).

export function llamadasInvalidasDe(partida) {
  const salida = [];
  (partida?.rondas ?? []).forEach((r, k) => {
    const turno = r.turno ?? k + 1;
    (partida.jugadores ?? []).forEach((j, i) => {
      const accion = r.privado?.acciones?.find((a) => a.asiento === i) ?? null; // Lobo
      const respuesta = r.respuestas?.[i] ?? null; // Guerra
      const error = r.errores?.[i] || null;
      const invalida = r.invalidas?.[i] === true || accion?.invalida === true || respuesta?.invalida === true || !!error;
      if (!invalida) return;
      salida.push({
        turno, ronda: r.ronda ?? null, fase: r.fase ?? null, asiento: i, id: j.id, nombre: j.nombre, modelo: j.modelo ?? null,
        motivo: accion?.motivo ?? respuesta?.motivo ?? null,
        error,
        crudo: accion?.crudo ?? respuesta?.crudo ?? r.crudos?.[i] ?? null,
      });
    });
  });
  return salida;
}

// Lo que dice una llamada invalida en una frase: el motivo del motor, o el error de la API, o que no quedo registrado.
export const causaDe = (c) => c.motivo ?? c.error ?? 'sin motivo registrado';

// Resumen por modelo: [{ id, nombre, invalidas, llamadas, causas: [{ causa, veces }] }], de mas a menos invalidas. `usoPorJugador[i].llamadas` da el total de cada uno.
export function resumenPorModelo(partida) {
  const por = new Map();
  for (const c of llamadasInvalidasDe(partida)) {
    const f = por.get(c.asiento) ?? { id: c.id, nombre: c.nombre, asiento: c.asiento, invalidas: 0, llamadas: partida.usoPorJugador?.[c.asiento]?.llamadas ?? null, causas: new Map() };
    f.invalidas++;
    f.causas.set(causaDe(c), (f.causas.get(causaDe(c)) ?? 0) + 1);
    por.set(c.asiento, f);
  }
  return [...por.values()]
    .map((f) => ({ ...f, causas: [...f.causas].map(([causa, veces]) => ({ causa, veces })).sort((a, b) => b.veces - a.veces) }))
    .sort((a, b) => b.invalidas - a.invalidas || a.asiento - b.asiento);
}
